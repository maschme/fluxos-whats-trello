const { ProvedorIA } = require('../Models/ProvedorIAModel');
const axios = require('axios');
const OpenAI = require('openai');
const { getEmpresaId } = require('../context/tenantContext');

const stateByEmpresa = new Map();

function getState() {
  const eid = getEmpresaId();
  if (!stateByEmpresa.has(eid)) {
    stateByEmpresa.set(eid, {
      cacheProvedores: {},
      clientesIA: {},
      provedorPrincipal: null
    });
  }
  return stateByEmpresa.get(eid);
}

async function carregarProvedores() {
  const eid = getEmpresaId();
  const provedores = await ProvedorIA.findAll({ where: { ativo: true, empresaId: eid } });
  const st = getState();
  st.cacheProvedores = {};
  st.clientesIA = {};
  st.provedorPrincipal = null;

  for (const p of provedores) {
    st.cacheProvedores[p.nome] = p;

    if (['openai', 'alibaba', 'openrouter'].includes(p.tipo)) {
      st.clientesIA[p.nome] = new OpenAI({
        apiKey: p.apiKey,
        baseURL: p.baseUrl
      });
    }

    if (p.isPrincipal) {
      st.provedorPrincipal = p;
    }
  }

  console.log(`🤖 ${provedores.length} provedores de IA carregados (empresa ${eid})`);
  return st.cacheProvedores;
}

async function getProvedorPrincipal() {
  const st = getState();
  if (!st.provedorPrincipal) {
    await carregarProvedores();
  }
  return st.provedorPrincipal;
}

async function enviarParaIA(mensagens, provedorNome = null, modelo = null) {
  const st = getState();
  let provedor = provedorNome ? st.cacheProvedores[provedorNome] : st.provedorPrincipal;

  if (!provedor) {
    await carregarProvedores();
    provedor = provedorNome ? st.cacheProvedores[provedorNome] : st.provedorPrincipal;
  }

  if (!provedor) {
    throw new Error('Nenhum provedor de IA configurado');
  }

  const modeloFinal = modelo || provedor.modeloPadrao;
  const cliente = st.clientesIA[provedor.nome];

  try {
    const start = Date.now();

    if (cliente) {
      const completion = await cliente.chat.completions.create({
        model: modeloFinal,
        messages: mensagens,
        ...provedor.configuracoes
      });

      const duration = Date.now() - start;
      const usage = completion.usage;

      console.log({
        provedor: provedor.nome,
        modelo: modeloFinal,
        tokens_prompt: usage?.prompt_tokens,
        tokens_resposta: usage?.completion_tokens,
        tempo_ms: duration
      });

      return completion.choices[0].message.content;
    }

    const response = await axios.post(
      provedor.baseUrl,
      {
        model: modeloFinal,
        messages: mensagens,
        ...provedor.configuracoes
      },
      {
        headers: {
          Authorization: `Bearer ${provedor.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const duration = Date.now() - start;
    console.log({
      provedor: provedor.nome,
      modelo: modeloFinal,
      tempo_ms: duration
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(`❌ Erro ao chamar IA (${provedor.nome}):`, error.message);
    throw error;
  }
}

async function listarProvedores(filtros = {}) {
  const eid = getEmpresaId();
  const where = { empresaId: eid };
  if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
  if (filtros.tipo) where.tipo = filtros.tipo;

  return ProvedorIA.findAll({
    where,
    order: [['isPrincipal', 'DESC'], ['nome', 'ASC']]
  });
}

async function getProvedorPorId(id) {
  const eid = getEmpresaId();
  return ProvedorIA.findOne({ where: { id, empresaId: eid } });
}

async function criarProvedor(dados) {
  const eid = getEmpresaId();
  if (dados.isPrincipal) {
    await ProvedorIA.update({ isPrincipal: false }, { where: { isPrincipal: true, empresaId: eid } });
  }

  const provedor = await ProvedorIA.create({ ...dados, empresaId: eid });
  await carregarProvedores();
  return provedor;
}

async function atualizarProvedor(id, dados) {
  const provedor = await getProvedorPorId(id);
  if (!provedor) throw new Error('Provedor não encontrado');

  const eid = getEmpresaId();
  if (dados.isPrincipal) {
    await ProvedorIA.update({ isPrincipal: false }, { where: { isPrincipal: true, empresaId: eid } });
  }

  await provedor.update(dados);
  await carregarProvedores();
  return provedor;
}

async function deletarProvedor(id) {
  const provedor = await getProvedorPorId(id);
  if (!provedor) throw new Error('Provedor não encontrado');

  await provedor.destroy();
  await carregarProvedores();
  return true;
}

async function definirPrincipal(id) {
  const eid = getEmpresaId();
  await ProvedorIA.update({ isPrincipal: false }, { where: { isPrincipal: true, empresaId: eid } });

  const provedor = await getProvedorPorId(id);
  if (!provedor) throw new Error('Provedor não encontrado');

  await provedor.update({ isPrincipal: true });
  await carregarProvedores();
  return provedor;
}

async function testarProvedor(id) {
  const provedor = await getProvedorPorId(id);
  if (!provedor) throw new Error('Provedor não encontrado');

  try {
    const start = Date.now();
    const resposta = await enviarParaIA(
      [{ role: 'user', content: 'Responda apenas: OK' }],
      provedor.nome
    );
    const tempo = Date.now() - start;

    return {
      sucesso: true,
      resposta: resposta.substring(0, 100),
      tempo_ms: tempo
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

module.exports = {
  carregarProvedores,
  getProvedorPrincipal,
  enviarParaIA,
  listarProvedores,
  getProvedorPorId,
  criarProvedor,
  atualizarProvedor,
  deletarProvedor,
  definirPrincipal,
  testarProvedor
};
