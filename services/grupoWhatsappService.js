const { GrupoWhatsapp } = require('../Models/GrupoWhatsappModel');
const { Op } = require('sequelize');
const { getEmpresaId } = require('../context/tenantContext');

const CACHE_TTL = 30000;
const cacheByEmpresa = new Map();

function getBucket() {
  const eid = getEmpresaId();
  if (!cacheByEmpresa.has(eid)) {
    cacheByEmpresa.set(eid, { cacheGrupos: null, cacheTimestamp: null });
  }
  return cacheByEmpresa.get(eid);
}

async function sincronizarGrupos(client) {
  const eid = getEmpresaId();
  console.log(`🔄 Sincronização de grupos (empresa ${eid})...`);

  try {
    const chats = await client.getChats();
    const grupos = chats.filter((chat) => chat.isGroup);

    console.log(`📋 Encontrados ${grupos.length} grupos`);

    let novos = 0;
    let atualizados = 0;
    let linksObtidos = 0;
    let linksManuais = 0;

    for (const grupo of grupos) {
      const grupoId = grupo.id._serialized;
      const nome = grupo.name;
      const participantes = grupo.participants?.length || 0;

      const grupoExistente = await GrupoWhatsapp.findOne({ where: { grupoId, empresaId: eid } });
      const linkExistente = grupoExistente?.linkConvite;

      let linkConvite = null;
      try {
        const inviteCode = await grupo.getInviteCode();
        if (inviteCode) {
          linkConvite = `https://chat.whatsapp.com/${inviteCode}`;
          linksObtidos++;
          console.log(`🔗 Link obtido automaticamente: ${nome}`);
        }
      } catch (e) {
        // não é admin
      }

      const linkFinal = linkConvite || linkExistente;
      if (!linkConvite && linkExistente) {
        linksManuais++;
      }

      if (!grupoExistente) {
        await GrupoWhatsapp.create({
          empresaId: eid,
          grupoId,
          nome,
          participantes,
          linkConvite: linkFinal,
          ultimaSincronizacao: new Date()
        });
        novos++;
        console.log(`➕ Novo grupo: ${nome} ${linkFinal ? '✅' : '⚠️ sem link'}`);
      } else {
        await grupoExistente.update({
          nome,
          participantes,
          linkConvite: linkFinal,
          ultimaSincronizacao: new Date()
        });
        atualizados++;
      }
    }

    const bucket = getBucket();
    bucket.cacheTimestamp = null;

    console.log(`\n✅ Sincronização concluída (empresa ${eid}):`);
    console.log(`   📊 Total: ${grupos.length} grupos | ➕ Novos: ${novos} | 🔄 Atualizados: ${atualizados}`);

    return {
      total: grupos.length,
      novos,
      atualizados,
      linksObtidos,
      linksManuais
    };
  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message);
    throw error;
  }
}

async function listarGrupos(filtros = {}) {
  const eid = getEmpresaId();
  const where = { empresaId: eid };

  if (filtros.ativo !== undefined) {
    where.ativo = filtros.ativo;
  }

  if (filtros.tipo) {
    where.tipo = filtros.tipo;
  }

  if (filtros.bairro) {
    where.bairro = { [Op.like]: `%${filtros.bairro}%` };
  }

  return GrupoWhatsapp.findAll({
    where,
    order: [['nome', 'ASC']]
  });
}

async function getGruposAtivos() {
  const agora = Date.now();
  const bucket = getBucket();
  const eid = getEmpresaId();

  if (bucket.cacheGrupos && bucket.cacheTimestamp && (agora - bucket.cacheTimestamp) < CACHE_TTL) {
    return bucket.cacheGrupos;
  }

  bucket.cacheGrupos = await GrupoWhatsapp.findAll({
    where: { ativo: true, empresaId: eid },
    order: [['bairro', 'ASC']]
  });

  bucket.cacheTimestamp = agora;
  return bucket.cacheGrupos;
}

async function getGrupoPorBairro(bairro) {
  const eid = getEmpresaId();
  const bairroLower = bairro.toLowerCase().trim();

  console.log(`🔍 [DEBUG] Buscando grupo para bairro: "${bairro}" (empresa ${eid})`);

  const grupo = await GrupoWhatsapp.findOne({
    where: {
      empresaId: eid,
      ativo: true,
      bairro: { [Op.like]: `%${bairroLower}%` }
    }
  });

  if (grupo) {
    return {
      encontrado: true,
      bairro: grupo.bairro,
      link: grupo.linkConvite,
      grupoId: grupo.grupoId,
      tipo: 'especifico'
    };
  }

  const grupoGeral = await GrupoWhatsapp.findOne({
    where: {
      empresaId: eid,
      ativo: true,
      isGrupoGeral: true
    }
  });

  if (grupoGeral) {
    return {
      encontrado: false,
      bairro: 'Geral',
      link: grupoGeral.linkConvite,
      grupoId: grupoGeral.grupoId,
      nome: grupoGeral.nome,
      tipo: 'geral'
    };
  }

  return {
    encontrado: false,
    erro: 'Nenhum grupo configurado'
  };
}

async function atualizarGrupo(grupoId, dados) {
  const eid = getEmpresaId();
  const grupo = await GrupoWhatsapp.findOne({ where: { grupoId, empresaId: eid } });

  if (!grupo) {
    throw new Error(`Grupo ${grupoId} não encontrado`);
  }

  await grupo.update(dados);

  const bucket = getBucket();
  bucket.cacheTimestamp = null;

  return grupo;
}

async function ativarGrupo(grupoId, bairro = null, isGrupoGeral = false) {
  return atualizarGrupo(grupoId, {
    ativo: true,
    bairro,
    isGrupoGeral,
    tipo: 'campanha'
  });
}

async function desativarGrupo(grupoId) {
  return atualizarGrupo(grupoId, {
    ativo: false,
    isGrupoGeral: false
  });
}

async function definirGrupoGeral(grupoId) {
  const eid = getEmpresaId();
  await GrupoWhatsapp.update(
    { isGrupoGeral: false },
    { where: { isGrupoGeral: true, empresaId: eid } }
  );

  return atualizarGrupo(grupoId, {
    ativo: true,
    isGrupoGeral: true,
    tipo: 'campanha'
  });
}

async function isGrupoCampanha(grupoId) {
  const eid = getEmpresaId();
  const grupo = await GrupoWhatsapp.findOne({
    where: {
      grupoId,
      empresaId: eid,
      ativo: true,
      tipo: 'campanha'
    }
  });

  if (grupo) {
    return { valido: true, bairro: grupo.bairro || 'Geral' };
  }

  return { valido: false };
}

async function getEstatisticas() {
  const eid = getEmpresaId();
  const base = { empresaId: eid };
  const total = await GrupoWhatsapp.count({ where: base });
  const ativos = await GrupoWhatsapp.count({ where: { ...base, ativo: true } });
  const campanha = await GrupoWhatsapp.count({ where: { ...base, tipo: 'campanha', ativo: true } });
  const totalParticipantes = await GrupoWhatsapp.sum('participantes', { where: { ...base, ativo: true } });

  return {
    total,
    ativos,
    campanha,
    totalParticipantes: totalParticipantes || 0
  };
}

function invalidarCache() {
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  bucket.cacheGrupos = null;
}

module.exports = {
  sincronizarGrupos,
  listarGrupos,
  getGruposAtivos,
  getGrupoPorBairro,
  atualizarGrupo,
  ativarGrupo,
  desativarGrupo,
  definirGrupoGeral,
  isGrupoCampanha,
  getEstatisticas,
  invalidarCache
};
