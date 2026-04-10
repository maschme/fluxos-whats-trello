const { Op } = require('sequelize');
const { Fluxo } = require('../Models/FluxoModel');
const { getEmpresaId } = require('../context/tenantContext');

const CACHE_TTL = 60000;
const cacheByEmpresa = new Map();

function getBucket() {
  const eid = getEmpresaId();
  if (!cacheByEmpresa.has(eid)) {
    cacheByEmpresa.set(eid, { cacheFluxos: {}, cacheTimestamp: null });
  }
  return cacheByEmpresa.get(eid);
}

async function carregarFluxos() {
  const eid = getEmpresaId();
  const fluxos = await Fluxo.findAll({
    where: { ativo: true, tipo: { [Op.ne]: 'automacao' }, empresaId: eid }
  });
  const bucket = getBucket();
  bucket.cacheFluxos = {};
  fluxos.forEach((f) => {
    bucket.cacheFluxos[f.id] = f;

    if (f.gatilho) {
      if (f.gatilho.tipo === 'mensagem_exata') {
        bucket.cacheFluxos[`msg:${f.gatilho.valor.toLowerCase()}`] = f;
      } else if (f.gatilho.tipo === 'palavra_chave') {
        f.gatilho.palavras?.forEach((p) => {
          bucket.cacheFluxos[`kw:${p.toLowerCase()}`] = f;
        });
      }
    }
  });
  bucket.cacheTimestamp = Date.now();
  console.log(`🔀 ${fluxos.length} fluxos carregados (empresa ${eid})`);
  return bucket.cacheFluxos;
}

async function buscarFluxoPorGatilho(mensagem) {
  const agora = Date.now();
  const bucket = getBucket();
  if (!bucket.cacheTimestamp || (agora - bucket.cacheTimestamp) > CACHE_TTL) {
    await carregarFluxos();
  }

  const msgLower = mensagem.toLowerCase().trim();

  if (bucket.cacheFluxos[`msg:${msgLower}`]) {
    return bucket.cacheFluxos[`msg:${msgLower}`];
  }

  for (const [key, fluxo] of Object.entries(bucket.cacheFluxos)) {
    if (key.startsWith('kw:') && msgLower.includes(key.replace('kw:', ''))) {
      return fluxo;
    }
  }

  return null;
}

async function listarFluxos(filtros = {}) {
  const eid = getEmpresaId();
  const where = { empresaId: eid };
  if (filtros.tipo) where.tipo = filtros.tipo;
  if (filtros.ativo !== undefined) where.ativo = filtros.ativo;

  return Fluxo.findAll({
    where,
    order: [['updatedAt', 'DESC']]
  });
}

/** Usado pelo webhook público do Trello (sem contexto de tenant). */
async function listarAutomacoesAtivasPorEmpresaId(empresaId) {
  const eid = Number(empresaId);
  if (Number.isNaN(eid)) return [];
  return Fluxo.findAll({
    where: { empresaId: eid, tipo: 'automacao', ativo: true },
    order: [['id', 'ASC']]
  });
}

async function getFluxoPorId(id) {
  const eid = getEmpresaId();
  return Fluxo.findOne({ where: { id, empresaId: eid } });
}

async function criarFluxo(dados) {
  const eid = getEmpresaId();
  const fluxo = await Fluxo.create({
    empresaId: eid,
    nome: dados.nome || 'Novo Fluxo',
    descricao: dados.descricao,
    tipo: dados.tipo || 'campanha',
    gatilho: dados.gatilho,
    nodes: dados.nodes || [],
    edges: dados.edges || [],
    viewport: dados.viewport || { x: 0, y: 0, zoom: 1 },
    ativo: false,
    versao: 1
  });

  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return fluxo;
}

async function atualizarFluxo(id, dados) {
  const fluxo = await getFluxoPorId(id);
  if (!fluxo) throw new Error('Fluxo não encontrado');

  if (dados.nodes || dados.edges) {
    dados.versao = fluxo.versao + 1;
  }

  await fluxo.update(dados);
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return fluxo;
}

async function deletarFluxo(id) {
  const fluxo = await getFluxoPorId(id);
  if (!fluxo) throw new Error('Fluxo não encontrado');

  await fluxo.destroy();
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return true;
}

async function duplicarFluxo(id, novoNome) {
  const original = await getFluxoPorId(id);
  if (!original) throw new Error('Fluxo não encontrado');

  const eid = getEmpresaId();
  return Fluxo.create({
    empresaId: eid,
    nome: novoNome || `${original.nome} (cópia)`,
    descricao: original.descricao,
    tipo: original.tipo,
    gatilho: original.gatilho,
    nodes: original.nodes,
    edges: original.edges,
    viewport: original.viewport,
    ativo: false,
    versao: 1
  });
}

async function ativarFluxo(id) {
  const fluxo = await getFluxoPorId(id);
  if (!fluxo) throw new Error('Fluxo não encontrado');

  await fluxo.update({ ativo: true });
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return fluxo;
}

async function desativarFluxo(id) {
  const fluxo = await getFluxoPorId(id);
  if (!fluxo) throw new Error('Fluxo não encontrado');

  await fluxo.update({ ativo: false });
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  return fluxo;
}

function invalidarCache() {
  const bucket = getBucket();
  bucket.cacheTimestamp = null;
  bucket.cacheFluxos = {};
}

const EXPORT_SCHEMA_VERSION = 1;
const TIPOS_FLUXO = ['atendimento', 'campanha', 'automacao', 'suporte'];

function montarPayloadExport(fluxo) {
  if (!fluxo) return null;
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    nome: fluxo.nome,
    tipo: fluxo.tipo || 'campanha',
    descricao: fluxo.descricao || null,
    gatilho: fluxo.gatilho || null,
    nodes: fluxo.nodes || [],
    edges: fluxo.edges || [],
    viewport: fluxo.viewport || { x: 100, y: 100, zoom: 1 }
  };
}

async function exportarFluxoJson(id) {
  const fluxo = await getFluxoPorId(id);
  if (!fluxo) return null;
  return montarPayloadExport(fluxo);
}

function normalizarImportPayload(body) {
  if (!body || typeof body !== 'object') throw new Error('JSON inválido');
  if (body.schemaVersion !== undefined && body.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error(`Versão do export não suportada (esperado ${EXPORT_SCHEMA_VERSION})`);
  }
  if (!Array.isArray(body.nodes)) throw new Error('JSON inválido: "nodes" deve ser um array');
  const edges = Array.isArray(body.edges) ? body.edges : [];
  let tipo = body.tipo || 'campanha';
  if (!TIPOS_FLUXO.includes(tipo)) tipo = 'campanha';
  const viewport =
    body.viewport && typeof body.viewport === 'object'
      ? body.viewport
      : { x: 100, y: 100, zoom: 1 };
  return {
    nome: body.nome || 'Fluxo importado',
    descricao: body.descricao,
    tipo,
    gatilho: body.gatilho != null ? body.gatilho : null,
    nodes: body.nodes,
    edges,
    viewport
  };
}

async function importarFluxoDeExport(body) {
  const raw = { ...(body || {}) };
  const novoNome = raw.novoNome;
  delete raw.novoNome;
  const dados = normalizarImportPayload(raw);
  if (novoNome && String(novoNome).trim()) dados.nome = String(novoNome).trim();
  return criarFluxo(dados);
}

module.exports = {
  carregarFluxos,
  buscarFluxoPorGatilho,
  listarFluxos,
  listarAutomacoesAtivasPorEmpresaId,
  getFluxoPorId,
  criarFluxo,
  atualizarFluxo,
  deletarFluxo,
  duplicarFluxo,
  ativarFluxo,
  desativarFluxo,
  invalidarCache,
  exportarFluxoJson,
  importarFluxoDeExport,
  montarPayloadExport,
  EXPORT_SCHEMA_VERSION
};
