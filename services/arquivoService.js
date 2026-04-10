const fs = require('fs');
const path = require('path');
const { getEmpresaId } = require('../context/tenantContext');

const DIR_ROOT = path.join(__dirname, '..', 'arquivos');
const SUB_EMPRESAS = 'empresas';

function empresaDir(eid) {
  return path.join(DIR_ROOT, SUB_EMPRESAS, String(eid));
}

function metaPathParaEmpresa(eid) {
  return path.join(empresaDir(eid), '_meta.json');
}

function ensureDirRoot() {
  if (!fs.existsSync(DIR_ROOT)) {
    fs.mkdirSync(DIR_ROOT, { recursive: true });
  }
}

/** Migra JSON da raiz antiga (arquivos/*.json) para arquivos/empresas/1/ uma vez, se a pasta da empresa 1 ainda estiver vazia. */
function migrarLegadoEmpresa1(eid) {
  if (eid !== 1) return;
  ensureDirRoot();
  const sub = empresaDir(1);
  if (!fs.existsSync(sub)) {
    fs.mkdirSync(sub, { recursive: true });
  }
  const jaTemDados = fs.readdirSync(sub).some(
    (f) => f.endsWith('.json') && f !== '_meta.json'
  );
  if (jaTemDados) return;

  let copiados = 0;
  for (const f of fs.readdirSync(DIR_ROOT)) {
    const full = path.join(DIR_ROOT, f);
    if (!f.endsWith('.json') || f === '_meta.json') continue;
    if (!fs.statSync(full).isFile()) continue;
    fs.copyFileSync(full, path.join(sub, f));
    copiados++;
  }
  const rootMeta = path.join(DIR_ROOT, '_meta.json');
  const subMeta = path.join(sub, '_meta.json');
  if (copiados > 0 && fs.existsSync(rootMeta) && !fs.existsSync(subMeta)) {
    fs.copyFileSync(rootMeta, subMeta);
  }
  if (copiados > 0) {
    console.log(`📁 Migração: ${copiados} arquivo(s) JSON da raiz → arquivos/empresas/1/`);
  }
}

function ensureEmpresaDir(eid) {
  migrarLegadoEmpresa1(eid);
  const d = empresaDir(eid);
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
  return d;
}

function lerMeta(eid) {
  ensureEmpresaDir(eid);
  const mp = metaPathParaEmpresa(eid);
  if (!fs.existsSync(mp)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(mp, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function salvarMeta(eid, meta) {
  ensureEmpresaDir(eid);
  fs.writeFileSync(metaPathParaEmpresa(eid), JSON.stringify(meta, null, 2), 'utf-8');
}

function nomeSeguro(nome) {
  return (nome || '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'arquivo';
}

function resolveEid(empresaIdOverride) {
  if (empresaIdOverride != null && empresaIdOverride !== '' && !Number.isNaN(Number(empresaIdOverride))) {
    return Number(empresaIdOverride);
  }
  return getEmpresaId();
}

function caminhoArquivo(nome, eid) {
  const id = eid != null ? eid : getEmpresaId();
  const base = nomeSeguro(nome);
  return path.join(empresaDir(id), `${base}.json`);
}

function listar(empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  ensureEmpresaDir(eid);
  const meta = lerMeta(eid);
  const dir = empresaDir(eid);
  const arquivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== '_meta.json')
    .map((f) => {
      const nome = f.replace('.json', '');
      const filePath = path.join(dir, f);
      const stat = fs.statSync(filePath);
      const m = meta[nome] || {};
      return {
        nome,
        tamanho: stat.size,
        atualizado: stat.mtime,
        instrucaoProcessamento: m.instrucaoProcessamento || '',
        formatoRetorno: m.formatoRetorno || ''
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return arquivos;
}

function getConteudo(nome, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  ensureEmpresaDir(eid);
  const filePath = caminhoArquivo(nome, eid);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getConteudoRaw(nome, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  ensureEmpresaDir(eid);
  const filePath = caminhoArquivo(nome, eid);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function getMeta(nome, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  const meta = lerMeta(eid);
  const key = nomeSeguro(nome);
  return meta[key] || { instrucaoProcessamento: '', formatoRetorno: '' };
}

function criar(nome, conteudo, meta = {}, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  ensureEmpresaDir(eid);
  const base = nomeSeguro(nome);
  const filePath = path.join(empresaDir(eid), `${base}.json`);

  if (fs.existsSync(filePath)) {
    throw new Error(`Arquivo "${base}" já existe`);
  }

  const str = typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2);
  fs.writeFileSync(filePath, str, 'utf-8');

  if (meta.instrucaoProcessamento !== undefined || meta.formatoRetorno !== undefined) {
    const m = lerMeta(eid);
    m[base] = {
      instrucaoProcessamento: meta.instrucaoProcessamento || '',
      formatoRetorno: meta.formatoRetorno || ''
    };
    salvarMeta(eid, m);
  }

  return { nome: base, path: filePath };
}

function atualizar(nome, conteudo, meta = null, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  const filePath = caminhoArquivo(nome, eid);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo "${nome}" não encontrado`);
  }

  if (conteudo !== undefined) {
    const str = typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2);
    fs.writeFileSync(filePath, str, 'utf-8');
  }

  if (meta !== null && meta !== undefined) {
    const m = lerMeta(eid);
    const base = nomeSeguro(nome);
    m[base] = {
      instrucaoProcessamento:
        meta.instrucaoProcessamento !== undefined
          ? meta.instrucaoProcessamento
          : (m[base]?.instrucaoProcessamento || ''),
      formatoRetorno:
        meta.formatoRetorno !== undefined ? meta.formatoRetorno : (m[base]?.formatoRetorno || '')
    };
    salvarMeta(eid, m);
  }

  return { nome: nomeSeguro(nome) };
}

function atualizarMeta(nome, meta, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  const m = lerMeta(eid);
  const base = nomeSeguro(nome);
  m[base] = {
    instrucaoProcessamento:
      meta.instrucaoProcessamento !== undefined
        ? meta.instrucaoProcessamento
        : (m[base]?.instrucaoProcessamento || ''),
    formatoRetorno:
      meta.formatoRetorno !== undefined ? meta.formatoRetorno : (m[base]?.formatoRetorno || '')
  };
  salvarMeta(eid, m);
  return m[base];
}

function deletar(nome, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  const filePath = caminhoArquivo(nome, eid);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo "${nome}" não encontrado`);
  }
  fs.unlinkSync(filePath);
  const m = lerMeta(eid);
  const base = nomeSeguro(nome);
  delete m[base];
  salvarMeta(eid, m);
  return true;
}

function existe(nome, empresaIdOverride) {
  const eid = resolveEid(empresaIdOverride);
  return fs.existsSync(caminhoArquivo(nome, eid));
}

module.exports = {
  listar,
  getConteudo,
  getConteudoRaw,
  getMeta,
  criar,
  atualizar,
  atualizarMeta,
  deletar,
  existe,
  nomeSeguro,
  lerMeta,
  DIR_ROOT,
  empresaDir
};
