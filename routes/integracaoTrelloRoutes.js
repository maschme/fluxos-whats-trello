'use strict';

const express = require('express');
const router = express.Router();
const integracaoTrelloService = require('../services/integracaoTrelloService');

router.get('/', async (req, res) => {
  try {
    const data = await integracaoTrelloService.getConfigResumo(req.empresaId, req);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/', async (req, res) => {
  try {
    await integracaoTrelloService.salvarCredenciais(req.empresaId, req.body || {});
    const data = await integracaoTrelloService.getConfigResumo(req.empresaId, req);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/testar', async (req, res) => {
  try {
    const r = await integracaoTrelloService.testarConexao(req.empresaId);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/boards', async (req, res) => {
  try {
    const boards = await integracaoTrelloService.listarBoards(req.empresaId);
    res.json({ success: true, data: boards });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/boards/:boardId/lists', async (req, res) => {
  try {
    const lists = await integracaoTrelloService.listarListas(req.empresaId, req.params.boardId);
    res.json({ success: true, data: lists });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/boards/:boardId/labels', async (req, res) => {
  try {
    const labels = await integracaoTrelloService.listarLabelsBoard(req.empresaId, req.params.boardId);
    res.json({ success: true, data: labels });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const boardId = (req.body && req.body.boardId) || '';
    if (!String(boardId).trim()) {
      return res.status(400).json({ success: false, error: 'boardId é obrigatório' });
    }
    const result = await integracaoTrelloService.registrarWebhook(req.empresaId, String(boardId).trim(), req);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.delete('/webhook', async (req, res) => {
  try {
    await integracaoTrelloService.removerWebhook(req.empresaId);
    const data = await integracaoTrelloService.getConfigResumo(req.empresaId, req);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
