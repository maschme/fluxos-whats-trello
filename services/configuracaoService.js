const { Configuracao } = require('../Models/ConfiguracaoModel');
const { getEmpresaId } = require('../context/tenantContext');

const CACHE_TTL = 60000;
const cacheByEmpresa = new Map();

function getBucket() {
  const eid = getEmpresaId();
  if (!cacheByEmpresa.has(eid)) {
    cacheByEmpresa.set(eid, { cacheConfig: {}, cacheTimestamp: null });
  }
  return cacheByEmpresa.get(eid);
}

async function carregarConfiguracoes() {
  const agora = Date.now();
  const bucket = getBucket();

  if (bucket.cacheTimestamp && (agora - bucket.cacheTimestamp) < CACHE_TTL) {
    return bucket.cacheConfig;
  }

  const eid = getEmpresaId();
  const configs = await Configuracao.findAll({ where: { empresaId: eid } });
  bucket.cacheConfig = {};

  for (const config of configs) {
    let valor = config.valor;

    switch (config.tipo) {
      case 'boolean':
        valor = valor === 'true';
        break;
      case 'number':
        valor = Number(valor);
        break;
      case 'json':
        try {
          valor = JSON.parse(valor);
        } catch (e) {
          valor = null;
        }
        break;
    }

    bucket.cacheConfig[config.chave] = {
      valor,
      tipo: config.tipo,
      categoria: config.categoria,
      descricao: config.descricao
    };
  }

  bucket.cacheTimestamp = agora;
  console.log(`📦 Configurações carregadas do banco (empresa ${eid})`);
  return bucket.cacheConfig;
}

async function getConfiguracao(chave) {
  const configs = await carregarConfiguracoes();
  return configs[chave]?.valor ?? null;
}

async function getConfiguracoesPorCategoria(categoria) {
  const configs = await carregarConfiguracoes();
  const resultado = {};

  for (const [chave, dados] of Object.entries(configs)) {
    if (dados.categoria === categoria) {
      resultado[chave] = dados;
    }
  }

  return resultado;
}

async function setConfiguracao(chave, valor) {
  const eid = getEmpresaId();
  const config = await Configuracao.findOne({ where: { chave, empresaId: eid } });

  if (!config) {
    throw new Error(`Configuração "${chave}" não encontrada`);
  }

  let valorString;
  if (config.tipo === 'json') {
    valorString = JSON.stringify(valor);
  } else {
    valorString = String(valor);
  }

  await config.update({ valor: valorString });

  const bucket = getBucket();
  bucket.cacheTimestamp = null;

  console.log(`⚙️ Configuração "${chave}" atualizada para: ${valorString}`);
  return getConfiguracao(chave);
}

async function criarConfiguracao(dados) {
  const eid = getEmpresaId();
  const { chave, valor, tipo = 'string', categoria = 'geral', descricao = '' } = dados;

  let valorString;
  if (tipo === 'json') {
    valorString = JSON.stringify(valor);
  } else {
    valorString = String(valor);
  }

  const config = await Configuracao.create({
    empresaId: eid,
    chave,
    valor: valorString,
    tipo,
    categoria,
    descricao
  });

  const bucket = getBucket();
  bucket.cacheTimestamp = null;

  return config;
}

async function listarConfiguracoes() {
  return carregarConfiguracoes();
}

async function listarCategorias() {
  const eid = getEmpresaId();
  const configs = await Configuracao.findAll({
    where: { empresaId: eid },
    attributes: ['categoria'],
    group: ['categoria']
  });
  return configs.map((c) => c.categoria);
}

function invalidarCache() {
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
}

module.exports = {
  carregarConfiguracoes,
  getConfiguracao,
  getConfiguracoesPorCategoria,
  setConfiguracao,
  criarConfiguracao,
  listarConfiguracoes,
  listarCategorias,
  invalidarCache
};
