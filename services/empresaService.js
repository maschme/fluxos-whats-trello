'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Empresa } = require('../Models/EmpresaModel');
const { Usuario } = require('../Models/UsuarioModel');
const { Configuracao } = require('../Models/ConfiguracaoModel');
const { Gatilho } = require('../Models/GatilhoModel');
const { Prompt } = require('../Models/PromptModel');
const { ProvedorIA } = require('../Models/ProvedorIAModel');
const { RequisicaoExterna } = require('../Models/RequisicaoExternaModel');
const { Fluxo } = require('../Models/FluxoModel');
const { setupAssociations } = require('../database/associations');
const { sequelize } = require('../database/connection');

function slugify(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 78) || 'empresa';
}

async function listarEmpresas() {
  return Empresa.findAll({ order: [['nome', 'ASC']] });
}

async function criarEmpresaComAdmin(body) {
  setupAssociations();
  const nome = String(body.nome || '').trim();
  const adminEmail = String(body.adminEmail || '').trim().toLowerCase();
  const adminPassword = body.adminPassword;
  if (!nome) throw new Error('Nome da empresa é obrigatório');
  if (!adminEmail || !adminPassword) throw new Error('adminEmail e adminPassword são obrigatórios');

  let slug = body.slug ? String(body.slug).trim().toLowerCase() : slugify(nome);
  const existsSlug = await Empresa.findOne({ where: { slug } });
  if (existsSlug) slug = `${slug}-${Date.now().toString(36)}`;

  const emailTaken = await Usuario.findOne({ where: { email: adminEmail } });
  if (emailTaken) throw new Error('Este e-mail já está cadastrado');

  const empresa = await Empresa.create({ nome, slug, ativo: body.ativo !== false });
  const passwordHash = await bcrypt.hash(String(adminPassword), 10);
  const usuario = await Usuario.create({
    empresaId: empresa.id,
    email: adminEmail,
    passwordHash,
    nome: (body.adminNome && String(body.adminNome).trim()) || 'Administrador',
    role: 'empresa_admin',
    ativo: true
  });

  return { empresa, usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome } };
}

async function listarUsuariosEmpresa(empresaId) {
  setupAssociations();
  return Usuario.findAll({
    where: { empresaId },
    attributes: { exclude: ['passwordHash'] },
    order: [['email', 'ASC']]
  });
}

async function criarUsuarioNaEmpresa(empresaId, body) {
  setupAssociations();
  const email = String(body.email || '').trim().toLowerCase();
  const password = body.password;
  if (!email || !password) throw new Error('email e password são obrigatórios');
  const emp = await Empresa.findByPk(empresaId);
  if (!emp) throw new Error('Empresa não encontrada');
  const taken = await Usuario.findOne({ where: { email } });
  if (taken) throw new Error('E-mail já cadastrado');
  const passwordHash = await bcrypt.hash(String(password), 10);
  return Usuario.create({
    empresaId,
    email,
    passwordHash,
    nome: (body.nome && String(body.nome).trim()) || null,
    role: 'empresa_admin',
    ativo: true
  });
}

/**
 * Copia configuração padrão de uma empresa origem para outra (novo tenant).
 */
async function clonarConfiguracaoEmpresa(origemId, destinoId) {
  if (origemId === destinoId) throw new Error('Origem e destino não podem ser iguais');

  const [configs, gatilhos, prompts, provedores, reqs, fluxos] = await Promise.all([
    Configuracao.findAll({ where: { empresaId: origemId } }),
    Gatilho.findAll({ where: { empresaId: origemId } }),
    Prompt.findAll({ where: { empresaId: origemId } }),
    ProvedorIA.findAll({ where: { empresaId: origemId } }),
    RequisicaoExterna.findAll({ where: { empresaId: origemId } }),
    Fluxo.findAll({ where: { empresaId: origemId } })
  ]);

  for (const c of configs) {
    const row = c.toJSON();
    delete row.id;
    delete row.createdAt;
    delete row.updatedAt;
    row.empresaId = destinoId;
    await Configuracao.findOrCreate({
      where: { empresaId: destinoId, chave: c.chave },
      defaults: row
    });
  }

  for (const g of gatilhos) {
    const row = g.toJSON();
    delete row.id;
    delete row.createdAt;
    delete row.updatedAt;
    row.empresaId = destinoId;
    await Gatilho.findOrCreate({
      where: { empresaId: destinoId, nome: g.nome },
      defaults: row
    });
  }

  for (const p of prompts) {
    const row = p.toJSON();
    delete row.id;
    delete row.createdAt;
    delete row.updatedAt;
    row.empresaId = destinoId;
    await Prompt.findOrCreate({
      where: { empresaId: destinoId, nome: p.nome },
      defaults: row
    });
  }

  for (const pr of provedores) {
    const row = pr.toJSON();
    delete row.id;
    delete row.createdAt;
    delete row.updatedAt;
    row.empresaId = destinoId;
    if (row.isPrincipal) row.isPrincipal = false;
    await ProvedorIA.findOrCreate({
      where: { empresaId: destinoId, nome: pr.nome },
      defaults: row
    });
  }

  const principalOrigem = provedores.find((x) => x.isPrincipal);
  if (principalOrigem) {
    const clonePrincipal = await ProvedorIA.findOne({
      where: { empresaId: destinoId, nome: principalOrigem.nome }
    });
    if (clonePrincipal) {
      await ProvedorIA.update({ isPrincipal: false }, { where: { empresaId: destinoId } });
      await clonePrincipal.update({ isPrincipal: true });
    }
  }

  for (const r of reqs) {
    const row = r.toJSON();
    delete row.id;
    delete row.createdAt;
    delete row.updatedAt;
    row.empresaId = destinoId;
    await RequisicaoExterna.findOrCreate({
      where: { empresaId: destinoId, tipo: r.tipo },
      defaults: row
    });
  }

  for (const f of fluxos) {
    const row = f.toJSON();
    delete row.id;
    row.empresaId = destinoId;
    row.ativo = false;
    delete row.createdAt;
    delete row.updatedAt;
    await Fluxo.create(row);
  }

  try {
    await sequelize.query(
      `INSERT INTO metas (nome, descricao, ativo, empresa_id)
       SELECT m.nome, m.descricao, m.ativo, :destino
       FROM metas m
       WHERE m.empresa_id = :origem`,
      { replacements: { destino: destinoId, origem: origemId } }
    );
  } catch (e) {
    console.warn('⚠️ Clonar metas (SQL):', e.message);
  }

  try {
    const baseArq = path.join(__dirname, '..', 'arquivos', 'empresas');
    const srcDir = path.join(baseArq, String(origemId));
    const dstDir = path.join(baseArq, String(destinoId));
    if (fs.existsSync(srcDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        const srcFile = path.join(srcDir, f);
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, path.join(dstDir, f));
        }
      }
      console.log(`📁 Arquivos JSON clonados: empresas/${origemId} → empresas/${destinoId}`);
    }
  } catch (e) {
    console.warn('⚠️ Clonar pasta de arquivos:', e.message);
  }

  return {
    configs: configs.length,
    gatilhos: gatilhos.length,
    prompts: prompts.length,
    provedores: provedores.length,
    requisicoes: reqs.length,
    fluxos: fluxos.length
  };
}

module.exports = {
  listarEmpresas,
  criarEmpresaComAdmin,
  listarUsuariosEmpresa,
  criarUsuarioNaEmpresa,
  clonarConfiguracaoEmpresa,
  slugify
};
