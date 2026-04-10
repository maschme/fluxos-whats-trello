'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { IntegracaoTrello } = require('../Models/IntegracaoTrelloModel');

const TRELLO_API = 'https://api.trello.com/1';

function ensureCallbackToken(row) {
  if (row.callbackToken && String(row.callbackToken).length >= 16) return row.callbackToken;
  const t = crypto.randomBytes(24).toString('hex');
  row.callbackToken = t;
  return t;
}

function maskToken(t) {
  if (!t || String(t).length < 8) return '';
  const s = String(t);
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function getOrCreateRow(empresaId) {
  const eid = Number(empresaId);
  const [row] = await IntegracaoTrello.findOrCreate({
    where: { empresaId: eid },
    defaults: { empresaId: eid, ativo: true, callbackToken: crypto.randomBytes(24).toString('hex') }
  });
  if (!row.callbackToken) {
    row.callbackToken = crypto.randomBytes(24).toString('hex');
    await row.save();
  }
  return row;
}

function getCredentials(row) {
  const key = (row.apiKey || '').trim();
  const token = (row.token || '').trim();
  if (!key || !token) return null;
  return { apiKey: key, token };
}

function publicBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_APP_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, '');
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    if (host) return `${proto}://${host}`;
  }
  return '';
}

function callbackUrl(req, row) {
  const base = publicBaseUrl(req);
  if (!base || !row.callbackToken) return '';
  return `${base}/api/integrations/trello/webhook/${row.callbackToken}`;
}

async function getConfigResumo(empresaId, req) {
  const row = await getOrCreateRow(empresaId);
  const cred = getCredentials(row);
  return {
    temCredenciais: !!cred,
    apiKeyPreview: row.apiKey ? `${String(row.apiKey).slice(0, 4)}…` : '',
    boardIdPadrao: row.boardIdPadrao || '',
    webhookBoardId: row.webhookBoardId || '',
    webhookRegistrado: !!(row.trelloWebhookId && row.webhookBoardId),
    trelloWebhookId: row.trelloWebhookId || null,
    callbackUrl: callbackUrl(req, row),
    publicBaseUrl: publicBaseUrl(req) || null
  };
}

async function salvarCredenciais(empresaId, body) {
  const row = await getOrCreateRow(empresaId);
  if (body.apiKey !== undefined && body.apiKey !== null) {
    const k = String(body.apiKey).trim();
    if (k) row.apiKey = k;
  }
  if (body.token !== undefined && body.token !== null) {
    const t = String(body.token).trim();
    if (t) row.token = t;
  }
  if (body.boardIdPadrao !== undefined) {
    row.boardIdPadrao = body.boardIdPadrao ? String(body.boardIdPadrao).trim() : null;
  }
  ensureCallbackToken(row);
  await row.save();
  return row;
}

async function trelloGet(empresaId, path, params = {}) {
  const row = await getOrCreateRow(empresaId);
  const c = getCredentials(row);
  if (!c) throw new Error('Configure API Key e Token do Trello');
  const res = await axios.get(`${TRELLO_API}${path}`, {
    params: { ...params, key: c.apiKey, token: c.token },
    timeout: 25000,
    validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = res.data && (res.data.message || res.data.error);
    throw new Error(msg || `Trello HTTP ${res.status}`);
  }
  return res.data;
}

async function trelloPost(empresaId, path, params = {}, data = null) {
  const row = await getOrCreateRow(empresaId);
  const c = getCredentials(row);
  if (!c) throw new Error('Configure API Key e Token do Trello');
  const res = await axios({
    method: 'POST',
    url: `${TRELLO_API}${path}`,
    params: { ...params, key: c.apiKey, token: c.token },
    data: data !== undefined && data !== null ? data : undefined,
    timeout: 25000,
    validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = res.data && (res.data.message || res.data.error);
    throw new Error(msg || `Trello HTTP ${res.status}`);
  }
  return res.data;
}

async function trelloPut(empresaId, path, params = {}) {
  const row = await getOrCreateRow(empresaId);
  const c = getCredentials(row);
  if (!c) throw new Error('Configure API Key e Token do Trello');
  const res = await axios.put(`${TRELLO_API}${path}`, null, {
    params: { ...params, key: c.apiKey, token: c.token },
    timeout: 25000,
    validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = res.data && (res.data.message || res.data.error);
    throw new Error(msg || `Trello HTTP ${res.status}`);
  }
  return res.data;
}

async function trelloDelete(empresaId, path, params = {}) {
  const row = await getOrCreateRow(empresaId);
  const c = getCredentials(row);
  if (!c) throw new Error('Configure API Key e Token do Trello');
  const res = await axios.delete(`${TRELLO_API}${path}`, {
    params: { ...params, key: c.apiKey, token: c.token },
    timeout: 25000,
    validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = res.data && (res.data.message || res.data.error);
    throw new Error(msg || `Trello HTTP ${res.status}`);
  }
  return res.status === 204 ? true : res.data;
}

async function testarConexao(empresaId) {
  const data = await trelloGet(empresaId, '/members/me', { fields: 'username,fullName' });
  return { ok: true, usuario: data };
}

async function listarBoards(empresaId) {
  return trelloGet(empresaId, '/members/me/boards', { fields: 'id,name,url' });
}

async function listarListas(empresaId, boardId) {
  return trelloGet(empresaId, `/boards/${boardId}/lists`, { fields: 'id,name,pos' });
}

async function listarLabelsBoard(empresaId, boardId) {
  return trelloGet(empresaId, `/boards/${boardId}/labels`, { fields: 'id,name,color' });
}

async function registrarWebhook(empresaId, boardId, req) {
  const base = publicBaseUrl(req);
  if (!base) {
    throw new Error('Defina PUBLIC_APP_URL no .env com a URL pública do sistema (ex.: https://seu-dominio.com)');
  }
  const row = await getOrCreateRow(empresaId);
  ensureCallbackToken(row);
  const url = `${base}/api/integrations/trello/webhook/${row.callbackToken}`;
  if (row.trelloWebhookId) {
    try {
      await trelloDelete(empresaId, `/webhooks/${row.trelloWebhookId}`);
    } catch (_) {}
    row.trelloWebhookId = null;
  }
  const created = await trelloPost(
    empresaId,
    '/webhooks',
    {},
    {
      description: `CS Canivete Suíço — empresa ${empresaId}`,
      callbackURL: url,
      idModel: boardId
    }
  );
  row.trelloWebhookId = created.id;
  row.webhookBoardId = boardId;
  await row.save();
  return { webhookId: created.id, callbackURL: url, boardId };
}

async function removerWebhook(empresaId) {
  const row = await getOrCreateRow(empresaId);
  if (row.trelloWebhookId) {
    try {
      await trelloDelete(empresaId, `/webhooks/${row.trelloWebhookId}`);
    } catch (_) {}
  }
  row.trelloWebhookId = null;
  row.webhookBoardId = null;
  await row.save();
  return true;
}

async function findByCallbackToken(token) {
  if (!token || String(token).length < 8) return null;
  return IntegracaoTrello.findOne({
    where: { callbackToken: String(token).trim(), ativo: true }
  });
}

function extrairBoardIdDoPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const a = payload.action;
  if (a && a.data) {
    if (a.data.board && a.data.board.id) return a.data.board.id;
    if (a.data.card && a.data.card.idBoard) return a.data.card.idBoard;
    if (a.data.list && a.data.list.idBoard) return a.data.list.idBoard;
  }
  if (payload.model && payload.model.id && payload.model.idBoard) return payload.model.idBoard;
  if (payload.model && payload.model.id && payload.model.desc !== undefined && payload.model.name) {
    // pode ser board como model
    if (payload.model.id && a && a.data && a.data.board) return a.data.board.id;
  }
  return null;
}

// ——— Ações usadas pelo executor de automações (empresaId explícito) ———

async function criarCard(empresaId, { listId, name, desc }) {
  const row = await getOrCreateRow(empresaId);
  const c = getCredentials(row);
  if (!c) throw new Error('Trello não configurado');
  const params = {
    idList: interpolateSafe(listId),
    name: interpolateSafe(name) || 'Card',
    key: c.apiKey,
    token: c.token
  };
  if (desc != null && String(desc).trim()) params.desc = interpolateSafe(desc);
  const res = await axios.post(`${TRELLO_API}/cards`, null, {
    params,
    timeout: 25000,
    validateStatus: () => true
  });
  if (res.status >= 400) {
    const msg = res.data && (res.data.message || res.data.error);
    throw new Error(msg || `Trello HTTP ${res.status}`);
  }
  return res.data;
}

function interpolateSafe(v) {
  if (v == null) return '';
  return String(v);
}

async function moverCard(empresaId, { cardId, listId }) {
  const cid = interpolateSafe(cardId);
  const lid = interpolateSafe(listId);
  if (!cid || !lid) throw new Error('trello_move_card: cardId e listId são obrigatórios');
  return trelloPut(empresaId, `/cards/${cid}`, { idList: lid });
}

async function comentarCard(empresaId, { cardId, text }) {
  const cid = interpolateSafe(cardId);
  const t = interpolateSafe(text);
  if (!cid || !t) throw new Error('trello_comment: cardId e text são obrigatórios');
  return trelloPost(empresaId, `/cards/${cid}/actions/comments`, { text: t });
}

async function adicionarLabel(empresaId, { cardId, labelId }) {
  const cid = interpolateSafe(cardId);
  const lid = interpolateSafe(labelId);
  if (!cid || !lid) throw new Error('trello_add_label: cardId e labelId são obrigatórios');
  return trelloPost(empresaId, `/cards/${cid}/idLabels`, { value: lid });
}

module.exports = {
  getOrCreateRow,
  getConfigResumo,
  salvarCredenciais,
  maskToken,
  publicBaseUrl,
  callbackUrl,
  testarConexao,
  listarBoards,
  listarListas,
  listarLabelsBoard,
  registrarWebhook,
  removerWebhook,
  findByCallbackToken,
  extrairBoardIdDoPayload,
  getCredentials,
  criarCard,
  moverCard,
  comentarCard,
  adicionarLabel,
  trelloGet
};
