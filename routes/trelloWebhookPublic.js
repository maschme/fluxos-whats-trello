'use strict';

const integracaoTrelloService = require('../services/integracaoTrelloService');
const { dispatchTrelloWebhook } = require('../services/trelloWebhookDispatcher');

/**
 * Webhook público do Trello (sem JWT). Identificação por token na URL.
 */
async function handleTrelloWebhook(req, res) {
  const token = req.params.token;
  const row = await integracaoTrelloService.findByCallbackToken(token);
  if (!row) {
    return res.status(404).type('text/plain').send('not found');
  }

  try {
    const result = await dispatchTrelloWebhook(row, req.body || {});
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[Trello webhook]', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}

function handleTrelloWebhookHead(req, res) {
  res.sendStatus(200);
}

module.exports = {
  handleTrelloWebhook,
  handleTrelloWebhookHead
};
