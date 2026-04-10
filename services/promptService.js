const { Prompt } = require('../Models/PromptModel');
const { getEmpresaId } = require('../context/tenantContext');

const CACHE_TTL = 60000;
const cacheByEmpresa = new Map();

function getBucket() {
  const eid = getEmpresaId();
  if (!cacheByEmpresa.has(eid)) {
    cacheByEmpresa.set(eid, { cachePrompts: {}, cacheTimestamp: null });
  }
  return cacheByEmpresa.get(eid);
}

async function carregarPrompts() {
  const eid = getEmpresaId();
  const prompts = await Prompt.findAll({ where: { ativo: true, empresaId: eid } });
  const bucket = getBucket();
  bucket.cachePrompts = {};
  prompts.forEach((p) => {
    bucket.cachePrompts[p.nome] = p;
  });
  bucket.cacheTimestamp = Date.now();
  console.log(`📝 ${prompts.length} prompts carregados (empresa ${eid})`);
  return bucket.cachePrompts;
}

async function getPrompt(nome, variaveis = {}) {
  const agora = Date.now();
  const bucket = getBucket();

  if (!bucket.cacheTimestamp || (agora - bucket.cacheTimestamp) > CACHE_TTL) {
    await carregarPrompts();
  }

  const prompt = bucket.cachePrompts[nome];
  if (!prompt) {
    console.warn(`⚠️ Prompt "${nome}" não encontrado`);
    return null;
  }

  let conteudo = prompt.conteudo;
  for (const [key, value] of Object.entries(variaveis)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    conteudo = conteudo.replace(regex, value);
  }

  return conteudo;
}

async function listarPrompts(filtros = {}) {
  const eid = getEmpresaId();
  const where = { empresaId: eid };

  if (filtros.tipo) where.tipo = filtros.tipo;
  if (filtros.ativo !== undefined) where.ativo = filtros.ativo;

  return Prompt.findAll({
    where,
    order: [['tipo', 'ASC'], ['nome', 'ASC']]
  });
}

async function getPromptPorId(id) {
  const eid = getEmpresaId();
  return Prompt.findOne({ where: { id, empresaId: eid } });
}

async function criarPrompt(dados) {
  const eid = getEmpresaId();
  const prompt = await Prompt.create({ ...dados, empresaId: eid });
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return prompt;
}

async function atualizarPrompt(id, dados) {
  const prompt = await getPromptPorId(id);
  if (!prompt) throw new Error('Prompt não encontrado');

  if (dados.conteudo && dados.conteudo !== prompt.conteudo) {
    dados.versao = prompt.versao + 1;
  }

  await prompt.update(dados);
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return prompt;
}

async function deletarPrompt(id) {
  const prompt = await getPromptPorId(id);
  if (!prompt) throw new Error('Prompt não encontrado');

  await prompt.destroy();
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return true;
}

async function duplicarPrompt(id, novoNome) {
  const original = await getPromptPorId(id);
  if (!original) throw new Error('Prompt não encontrado');

  const eid = getEmpresaId();
  return Prompt.create({
    empresaId: eid,
    nome: novoNome,
    descricao: `Cópia de: ${original.descricao || original.nome}`,
    tipo: original.tipo,
    conteudo: original.conteudo,
    variaveis: original.variaveis,
    ativo: false,
    versao: 1
  });
}

function invalidarCache() {
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  bucket.cachePrompts = {};
}

module.exports = {
  carregarPrompts,
  getPrompt,
  listarPrompts,
  getPromptPorId,
  criarPrompt,
  atualizarPrompt,
  deletarPrompt,
  duplicarPrompt,
  invalidarCache
};
