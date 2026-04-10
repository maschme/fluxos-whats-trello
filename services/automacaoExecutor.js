'use strict';

/**
 * Executor de automações (fluxos tipo=automacao).
 * Nós: trigger_webhook, trigger_schedule, trigger_trello, condition, set_variable, http_request, ia, merge, log, end, sleep,
 * trello (ações múltiplas), trello_* (legado).
 */

const axios = require('axios');
const provedorService = require('./provedorIAService');
const integracaoTrelloService = require('./integracaoTrelloService');

function interpolate(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

/** Extrai do payload do webhook Trello variáveis planas para {{trelloCardName}}, etc. */
function enriquecerVariaveisTrelloWebhook(variables, triggerPayload) {
  if (!triggerPayload || !triggerPayload.action) return;
  const a = triggerPayload.action;
  const d = a.data || {};
  const card = d.card || {};
  variables.trelloActionType = a.type || '';
  if (card.id) variables.trelloCardId = card.id;
  if (card.name != null) variables.trelloCardName = String(card.name);
  if (card.desc != null) variables.trelloCardDesc = String(card.desc || '');
  if (card.shortUrl) variables.trelloCardShortUrl = card.shortUrl;
  if (card.url) variables.trelloCardUrl = card.url;
  if (card.idShort != null) variables.trelloCardShortId = String(card.idShort);
  if (card.idList) variables.trelloListId = card.idList;
  if (card.idBoard) variables.trelloBoardId = card.idBoard;
  if (card.pos != null) variables.trelloCardPos = card.pos;
  if (card.due) variables.trelloCardDue = card.due;
  if (Array.isArray(card.labels)) {
    variables.trelloLabelsJson = JSON.stringify(card.labels);
    variables.trelloLabelsNames = card.labels.map((l) => l.name || '').filter(Boolean).join(', ');
  }
  if (d.list && d.list.id) variables.trelloListId = d.list.id;
  if (d.list && d.list.name) variables.trelloListName = d.list.name;
  if (d.listAfter) {
    variables.trelloListIdAfter = d.listAfter.id;
    variables.trelloListNameAfter = d.listAfter.name || '';
  }
  if (d.listBefore) {
    variables.trelloListIdBefore = d.listBefore.id;
    variables.trelloListNameBefore = d.listBefore.name || '';
  }
  if (d.board) {
    if (d.board.id) variables.trelloBoardId = d.board.id;
    if (d.board.name) variables.trelloBoardName = d.board.name;
  }
  if (d.memberCreator) {
    variables.trelloMemberId = d.memberCreator.id || '';
    variables.trelloMemberUsername = d.memberCreator.username || '';
  }
  if (typeof d.text === 'string') variables.trelloCommentText = d.text;
  if (d.label && d.label.name) variables.trelloLabelName = d.label.name;
}

/** Mescla resposta GET /cards/{id} nas mesmas variáveis planas. */
function aplicarCamposCardNasVariaveis(variables, card) {
  if (!card || typeof card !== 'object') return;
  if (card.id) variables.trelloCardId = card.id;
  if (card.name != null) variables.trelloCardName = String(card.name);
  if (card.desc != null) variables.trelloCardDesc = String(card.desc || '');
  if (card.shortUrl) variables.trelloCardShortUrl = card.shortUrl;
  if (card.url) variables.trelloCardUrl = card.url;
  if (card.idShort != null) variables.trelloCardShortId = String(card.idShort);
  if (card.idList) variables.trelloListId = card.idList;
  if (card.idBoard) variables.trelloBoardId = card.idBoard;
  if (card.pos != null) variables.trelloCardPos = card.pos;
  if (card.due) variables.trelloCardDue = card.due;
  if (Array.isArray(card.labels)) {
    variables.trelloLabelsJson = JSON.stringify(card.labels);
    variables.trelloLabelsNames = card.labels.map((l) => l.name || '').filter(Boolean).join(', ');
  }
}

/**
 * Executa uma ação Trello (nó único ou legado).
 * @returns {{ stop: boolean, msg?: string }}
 */
async function executarTrelloAction(empresaId, data, variables) {
  const onError = data.onError === 'stop' ? 'stop' : 'continue';
  const acao = String(data.acao || data.operacao || '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_');

  const defaultOut = {
    obter_card: 'trelloCardApi',
    get_card: 'trelloCardApi',
    fetch_card: 'trelloCardApi',
    create_card: 'trelloCard',
    move_card: 'trelloMove',
    comment: 'trelloComment',
    comentar: 'trelloComment',
    add_label: 'trelloLabel',
    label: 'trelloLabel'
  };
  const ov = data.variavelSaida || defaultOut[acao] || 'trelloResult';

  const fail = (err) => {
    variables[ov] = { error: err.message };
    if (onError === 'stop') return { stop: true, msg: err.message };
    return { stop: false };
  };

  if (empresaId == null || Number.isNaN(empresaId)) {
    return fail(new Error('Automação sem empresaId'));
  }

  try {
    switch (acao) {
      case 'obter_card':
      case 'get_card':
      case 'fetch_card': {
        const cardId = interpolate(data.cardId || '', variables);
        if (!String(cardId).trim()) throw new Error('Informe cardId (ex: {{trelloCardId}})');
        const full = await integracaoTrelloService.obterCard(empresaId, cardId);
        variables[ov] = full;
        aplicarCamposCardNasVariaveis(variables, full);
        break;
      }
      case 'create_card': {
        const listId = interpolate(data.listId || '', variables);
        const name = interpolate(data.nome || data.name || '', variables);
        const desc = interpolate(data.descricao || data.desc || '', variables);
        const card = await integracaoTrelloService.criarCard(empresaId, { listId, name, desc });
        variables[ov] = card;
        if (card && card.id) aplicarCamposCardNasVariaveis(variables, card);
        break;
      }
      case 'move_card': {
        const cardId = interpolate(data.cardId || '', variables);
        const listId = interpolate(data.listId || '', variables);
        const moved = await integracaoTrelloService.moverCard(empresaId, { cardId, listId });
        variables[ov] = moved;
        break;
      }
      case 'comment':
      case 'comentar': {
        const cardId = interpolate(data.cardId || '', variables);
        const text = interpolate(data.texto || data.text || '', variables);
        const r = await integracaoTrelloService.comentarCard(empresaId, { cardId, text });
        variables[ov] = r;
        break;
      }
      case 'add_label':
      case 'label': {
        const cardId = interpolate(data.cardId || '', variables);
        const labelId = interpolate(data.labelId || '', variables);
        const r = await integracaoTrelloService.adicionarLabel(empresaId, { cardId, labelId });
        variables[ov] = r;
        break;
      }
      default:
        throw new Error(`Ação Trello desconhecida: "${acao}"`);
    }
    return { stop: false };
  } catch (err) {
    return fail(err);
  }
}

function getNodeById(nodes, id) {
  return nodes.find((n) => n.id === id);
}

function getNextNodeId(edges, sourceId, sourceHandle = 'output') {
  const edge = edges.find((e) => e.source === sourceId && (e.sourceHandle || 'output') === sourceHandle);
  return edge ? edge.target : null;
}

/**
 * Executa uma automação.
 * @param {Object} fluxo - { id, nome, nodes, edges, empresaId }
 * @param {string} triggerType - 'webhook' | 'schedule' | 'manual' | 'trello'
 * @param {Object} triggerPayload - dados do gatilho (body do webhook, etc.)
 */
async function executarAutomacao(fluxo, triggerType = 'manual', triggerPayload = {}) {
  const nodes = fluxo.nodes || [];
  const edges = fluxo.edges || [];
  const empresaId = fluxo.empresaId != null ? Number(fluxo.empresaId) : null;
  const variables = {
    triggerType,
    triggerPayload: triggerPayload || {},
    ...(triggerPayload && typeof triggerPayload === 'object' ? triggerPayload : {})
  };
  if (triggerType === 'trello') {
    enriquecerVariaveisTrelloWebhook(variables, triggerPayload);
  }
  const logs = [];

  let currentNodeId = null;
  if (triggerType === 'webhook') {
    const webhookNode = nodes.find((n) => n.type === 'trigger_webhook');
    currentNodeId = webhookNode ? webhookNode.id : null;
  } else if (triggerType === 'trello') {
    const trelloNode = nodes.find((n) => n.type === 'trigger_trello');
    currentNodeId = trelloNode ? trelloNode.id : null;
  } else if (triggerType === 'schedule' || triggerType === 'manual') {
    const scheduleNode = nodes.find((n) => n.type === 'trigger_schedule');
    currentNodeId = scheduleNode ? scheduleNode.id : null;
  }
  if (!currentNodeId) {
    const anyTrigger = nodes.find((n) => n.type && n.type.startsWith('trigger_'));
    currentNodeId = anyTrigger ? anyTrigger.id : null;
  }

  if (!currentNodeId) {
    return { success: false, variables, logs, error: 'Nenhum nó de gatilho encontrado' };
  }

  try {
    while (currentNodeId) {
      const node = getNodeById(nodes, currentNodeId);
      if (!node) break;

      const data = node.data || {};
      let nextHandle = 'output';
      let nextId = null;

      switch (node.type) {
        case 'trigger_webhook':
        case 'trigger_schedule':
          if (data.variavelPayload && triggerPayload) {
            variables[data.variavelPayload] = triggerPayload;
          }
          nextId = getNextNodeId(edges, node.id, 'output');
          break;

        case 'trigger_trello': {
          if (data.variavelPayload && triggerPayload) {
            variables[data.variavelPayload] = triggerPayload;
          }
          enriquecerVariaveisTrelloWebhook(variables, triggerPayload);
          if (data.buscarCardCompleto && empresaId && variables.trelloCardId) {
            try {
              const full = await integracaoTrelloService.obterCard(empresaId, variables.trelloCardId);
              variables.trelloCardApi = full;
              aplicarCamposCardNasVariaveis(variables, full);
            } catch (e) {
              variables.trelloCardApiError = e.message;
              if (data.onErrorApi === 'stop') {
                return { success: false, variables, logs, error: `Trello API (card): ${e.message}` };
              }
            }
          }
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'condition': {
          const varName = data.variavelNome || 'valor';
          const operador = data.operador || 'igual';
          const valorComparacao = data.valorComparacao;
          const valor = variables[varName];
          let result = false;
          const vStr = valor !== undefined ? String(valor) : '';
          const compStr = valorComparacao !== undefined ? String(valorComparacao) : '';
          switch (operador) {
            case 'igual':
              result = vStr === compStr;
              break;
            case 'diferente':
              result = vStr !== compStr;
              break;
            case 'contem':
              result = vStr.includes(compStr);
              break;
            case 'maior':
              result = Number(valor) > Number(valorComparacao);
              break;
            case 'menor':
              result = Number(valor) < Number(valorComparacao);
              break;
            case 'maior_igual':
              result = Number(valor) >= Number(valorComparacao);
              break;
            case 'menor_igual':
              result = Number(valor) <= Number(valorComparacao);
              break;
            default:
              result = vStr === compStr;
          }
          nextHandle = result ? 'output-true' : 'output-false';
          nextId = getNextNodeId(edges, node.id, nextHandle);
          break;
        }

        case 'set_variable': {
          const nome = data.nomeVariavel || data.variavel || 'var';
          let valor = data.valor !== undefined ? data.valor : data.valorVariavel;
          if (typeof valor === 'string') valor = interpolate(valor, variables);
          variables[nome] = valor;
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'http_request': {
          const method = (data.method || 'GET').toUpperCase();
          const url = interpolate(data.url || '', variables);
          const headers = data.headers && typeof data.headers === 'object' ? data.headers : {};
          let body = data.body;
          if (typeof body === 'string') body = interpolate(body, variables);
          if (body && typeof body === 'object' && !(body instanceof String)) {
            try {
              const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
              body = interpolate(bodyStr, variables);
            } catch (_) {}
          }
          try {
            const res = await axios({
              method,
              url,
              headers: { 'Content-Type': 'application/json', ...headers },
              data: body,
              timeout: (data.timeout || 30) * 1000,
              validateStatus: () => true
            });
            const outVar = data.variavelSaida || 'response';
            variables[outVar] = res.data;
            variables[`${outVar}_status`] = res.status;
          } catch (err) {
            variables[data.variavelSaida || 'response'] = { error: err.message };
            if (data.onError === 'stop') {
              return { success: false, variables, logs, error: `HTTP: ${err.message}` };
            }
          }
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'ia': {
          const instrucao = interpolate(data.instrucao || '', variables);
          const contexto = data.incluirVariaveis ? JSON.stringify(variables) : '';
          const mensagens = contexto
            ? [{ role: 'user', content: contexto + '\n\n' + instrucao }]
            : [{ role: 'user', content: instrucao }];
          try {
            const resposta = await provedorService.enviarParaIA(mensagens, data.provedorId || null);
            const outVar = data.variavelSaida || 'respostaIA';
            variables[outVar] =
              resposta && typeof resposta === 'string' ? resposta.trim() : String(resposta);
          } catch (err) {
            variables[data.variavelSaida || 'respostaIA'] = '';
            if (data.onError === 'stop') {
              return { success: false, variables, logs, error: `IA: ${err.message}` };
            }
          }
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'merge':
          nextId = getNextNodeId(edges, node.id, 'output');
          break;

        case 'log': {
          const msg = interpolate(data.mensagem || 'Log', variables);
          const nivel = data.nivel || 'info';
          logs.push(`[${nivel}] ${msg}`);
          if (data.variavelLog) variables[data.variavelLog] = msg;
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'sleep': {
          const ms =
            Math.min(600000, parseInt(data.delayMs || data.segundos || 0, 10) * 1000 || 0);
          if (ms > 0) await new Promise((r) => setTimeout(r, ms));
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'trello': {
          const r = await executarTrelloAction(empresaId, data, variables);
          if (r.stop) return { success: false, variables, logs, error: `Trello: ${r.msg}` };
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'trello_create_card': {
          const r = await executarTrelloAction(empresaId, { ...data, acao: 'create_card' }, variables);
          if (r.stop) return { success: false, variables, logs, error: `Trello: ${r.msg}` };
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'trello_move_card': {
          const r = await executarTrelloAction(empresaId, { ...data, acao: 'move_card' }, variables);
          if (r.stop) return { success: false, variables, logs, error: `Trello: ${r.msg}` };
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'trello_comment': {
          const r = await executarTrelloAction(empresaId, { ...data, acao: 'comment' }, variables);
          if (r.stop) return { success: false, variables, logs, error: `Trello: ${r.msg}` };
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'trello_add_label': {
          const r = await executarTrelloAction(empresaId, { ...data, acao: 'add_label' }, variables);
          if (r.stop) return { success: false, variables, logs, error: `Trello: ${r.msg}` };
          nextId = getNextNodeId(edges, node.id, 'output');
          break;
        }

        case 'end':
          return { success: true, variables, logs };

        default:
          nextId = getNextNodeId(edges, node.id, 'output');
      }

      if (!nextId) break;
      currentNodeId = nextId;
    }

    return { success: true, variables, logs };
  } catch (err) {
    return { success: false, variables, logs, error: err.message };
  }
}

module.exports = {
  executarAutomacao,
  interpolate,
  enriquecerVariaveisTrelloWebhook
};
