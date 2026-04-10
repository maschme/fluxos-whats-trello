'use strict';

const fluxoService = require('./fluxoService');
const automacaoExecutor = require('./automacaoExecutor');
const integracaoTrelloService = require('./integracaoTrelloService');

/**
 * Verifica se o nó trigger_trello deve disparar para este payload do Trello.
 * @param {object} nodeData - node.data
 * @param {object} payload - corpo do webhook (action, model, ...)
 */
function triggerTrelloMatches(nodeData, payload) {
  const act = payload && payload.action;
  if (!act) return false;
  const data = nodeData || {};

  const boardFilter = (data.boardId || '').trim();
  if (boardFilter) {
    const bid = integracaoTrelloService.extrairBoardIdDoPayload(payload);
    if (!bid || bid !== boardFilter) return false;
  }

  const tipoFiltro = (data.filtroTipoAcao || '').trim();
  if (tipoFiltro && tipoFiltro !== '*' && act.type !== tipoFiltro) {
    return false;
  }

  const listDest = (data.listIdDestino || '').trim();
  if (listDest) {
    if (act.type === 'updateCard' && act.data && act.data.listAfter) {
      if (act.data.listAfter.id !== listDest) return false;
    } else if (act.type === 'createCard' && act.data && act.data.list) {
      if (act.data.list.id !== listDest) return false;
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Executa todas as automações ativas da empresa que tenham trigger_trello compatível.
 */
async function dispatchTrelloWebhook(integrationRow, payload) {
  const empresaId = integrationRow.empresaId;
  const boardFromPayload = integracaoTrelloService.extrairBoardIdDoPayload(payload);
  if (
    integrationRow.webhookBoardId &&
    boardFromPayload &&
    boardFromPayload !== integrationRow.webhookBoardId
  ) {
    return { processed: 0, note: 'board mismatch' };
  }

  const fluxos = await fluxoService.listarAutomacoesAtivasPorEmpresaId(empresaId);
  let processed = 0;
  const errors = [];

  for (const fluxo of fluxos) {
    const nodes = fluxo.nodes || [];
    const trigger = nodes.find((n) => n.type === 'trigger_trello');
    if (!trigger) continue;
    if (!triggerTrelloMatches(trigger.data || {}, payload)) continue;

    const dados = typeof fluxo.toJSON === 'function' ? fluxo.toJSON() : fluxo;
    try {
      await automacaoExecutor.executarAutomacao(dados, 'trello', payload);
      processed += 1;
    } catch (e) {
      errors.push({ fluxoId: dados.id, error: e.message });
      console.error(`[Trello→Automação] fluxo ${dados.id}:`, e);
    }
  }

  return { processed, errors: errors.length ? errors : undefined };
}

module.exports = {
  triggerTrelloMatches,
  dispatchTrelloWebhook
};
