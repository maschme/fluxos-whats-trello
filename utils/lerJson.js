const fs = require('fs');
const path = require('path');
const { getEmpresaId } = require('../context/tenantContext');

function caminhoTenant(nomeArquivo) {
  const eid = getEmpresaId();
  return path.join(__dirname, '..', 'arquivos', 'empresas', String(eid), `${nomeArquivo}.json`);
}

function caminhoLegadoRaiz(nomeArquivo) {
  return path.join(__dirname, '..', 'arquivos', `${nomeArquivo}.json`);
}

/**
 * Lê JSON de dados por empresa (arquivos/empresas/{EMPRESA_ID}/).
 * Empresa 1: se não existir na pasta da empresa, tenta a raiz antiga arquivos/*.json (compatibilidade).
 */
function lerJson(nomeArquivo) {
  const tenantPath = caminhoTenant(nomeArquivo);
  let filePath = tenantPath;
  if (!fs.existsSync(filePath)) {
    const eid = getEmpresaId();
    if (eid === 1) {
      const legado = caminhoLegadoRaiz(nomeArquivo);
      if (fs.existsSync(legado)) {
        filePath = legado;
      }
    }
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

module.exports = { lerJson };
