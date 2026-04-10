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

function valorPadrao(nomeArquivo) {
  if (nomeArquivo === 'grupos_whatsapp') {
    return {
      grupos: [],
      grupo_geral: { link: '', grupoId: '', nome: 'Geral' },
      todosGruposIds: []
    };
  }
  return {};
}

/**
 * Lê JSON de dados por empresa (arquivos/empresas/{EMPRESA_ID}/).
 * Se não existir, usa arquivos/{nome}.json na raiz (legado) para qualquer empresa.
 * Se ainda assim não existir, retorna objeto vazio (ou estrutura mínima para grupos_whatsapp) e avisa no log — não derruba o processo.
 */
function lerJson(nomeArquivo) {
  const eid = getEmpresaId();
  const tenantPath = caminhoTenant(nomeArquivo);
  let filePath = null;

  if (fs.existsSync(tenantPath)) {
    filePath = tenantPath;
  } else {
    const legado = caminhoLegadoRaiz(nomeArquivo);
    if (fs.existsSync(legado)) {
      filePath = legado;
    }
  }

  if (!filePath) {
    console.warn(
      `[lerJson] Arquivo não encontrado: "${nomeArquivo}.json" (empresa ${eid}). ` +
        `Crie em arquivos/empresas/${eid}/ ou arquivos/. Usando padrão vazio.`
    );
    return valorPadrao(nomeArquivo);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[lerJson] Erro ao ler "${filePath}": ${e.message}. Usando padrão vazio.`);
    return valorPadrao(nomeArquivo);
  }
}

module.exports = { lerJson };
