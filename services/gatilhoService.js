const { Gatilho } = require('../Models/GatilhoModel');
const { getEmpresaId } = require('../context/tenantContext');

const CACHE_TTL = 60000;
const cacheByEmpresa = new Map();

function getBucket() {
  const eid = getEmpresaId();
  if (!cacheByEmpresa.has(eid)) {
    cacheByEmpresa.set(eid, { cacheGatilhos: null, cacheTimestamp: null });
  }
  return cacheByEmpresa.get(eid);
}

async function carregarGatilhos() {
  const agora = Date.now();
  const bucket = getBucket();
  const eid = getEmpresaId();

  if (bucket.cacheGatilhos && bucket.cacheTimestamp && (agora - bucket.cacheTimestamp) < CACHE_TTL) {
    return bucket.cacheGatilhos;
  }

  bucket.cacheGatilhos = await Gatilho.findAll({
    where: { ativo: true, empresaId: eid },
    order: [['prioridade', 'DESC']]
  });

  bucket.cacheTimestamp = agora;
  console.log(`📦 ${bucket.cacheGatilhos.length} gatilhos carregados (empresa ${eid})`);
  return bucket.cacheGatilhos;
}

async function verificarGatilho(texto) {
  const gatilhos = await carregarGatilhos();
  const textoLower = texto.toLowerCase().trim();

  for (const gatilho of gatilhos) {
    if (gatilho.mensagemExata && texto.trim() === gatilho.mensagemExata) {
      return {
        tipo: gatilho.nome,
        gatilho: {
          id: gatilho.id,
          nome: gatilho.nome,
          tipo: gatilho.tipo,
          configuracoes: gatilho.configuracoes
        }
      };
    }

    const palavrasChave = gatilho.palavrasChave || [];
    const encontrou = palavrasChave.some((palavra) => textoLower.includes(palavra.toLowerCase()));

    if (encontrou) {
      return {
        tipo: gatilho.nome,
        gatilho: {
          id: gatilho.id,
          nome: gatilho.nome,
          tipo: gatilho.tipo,
          configuracoes: gatilho.configuracoes
        }
      };
    }
  }

  return null;
}

async function listarGatilhos() {
  const eid = getEmpresaId();
  return Gatilho.findAll({
    where: { empresaId: eid },
    order: [['prioridade', 'DESC'], ['nome', 'ASC']]
  });
}

async function criarGatilho(dados) {
  const eid = getEmpresaId();
  const gatilho = await Gatilho.create({ ...dados, empresaId: eid });
  invalidarCache();
  return gatilho;
}

async function atualizarGatilho(id, dados) {
  const eid = getEmpresaId();
  const gatilho = await Gatilho.findOne({ where: { id, empresaId: eid } });

  if (!gatilho) {
    throw new Error(`Gatilho ${id} não encontrado`);
  }

  await gatilho.update(dados);
  invalidarCache();
  return gatilho;
}

async function ativarGatilho(id) {
  return atualizarGatilho(id, { ativo: true });
}

async function desativarGatilho(id) {
  return atualizarGatilho(id, { ativo: false });
}

async function deletarGatilho(id) {
  const eid = getEmpresaId();
  const gatilho = await Gatilho.findOne({ where: { id, empresaId: eid } });

  if (!gatilho) {
    throw new Error(`Gatilho ${id} não encontrado`);
  }

  await gatilho.destroy();
  invalidarCache();
  return true;
}

function invalidarCache() {
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  bucket.cacheGatilhos = null;
}

module.exports = {
  carregarGatilhos,
  verificarGatilho,
  listarGatilhos,
  criarGatilho,
  atualizarGatilho,
  ativarGatilho,
  desativarGatilho,
  deletarGatilho,
  invalidarCache
};
