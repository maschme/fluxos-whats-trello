'use strict';

const express = require('express');
const router = express.Router();
const empresaService = require('../services/empresaService');

router.get('/empresas', async (req, res) => {
  try {
    const data = await empresaService.listarEmpresas();
    res.json({ success: true, total: data.length, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/empresas', async (req, res) => {
  try {
    const out = await empresaService.criarEmpresaComAdmin(req.body || {});
    res.status(201).json({ success: true, data: out });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/empresas/:id/clonar-de/:origemId', async (req, res) => {
  try {
    const destinoId = parseInt(req.params.id, 10);
    const origemId = parseInt(req.params.origemId, 10);
    const stats = await empresaService.clonarConfiguracaoEmpresa(origemId, destinoId);
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/empresas/:id/usuarios', async (req, res) => {
  try {
    const empresaId = parseInt(req.params.id, 10);
    const data = await empresaService.listarUsuariosEmpresa(empresaId);
    res.json({ success: true, total: data.length, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/empresas/:id/usuarios', async (req, res) => {
  try {
    const empresaId = parseInt(req.params.id, 10);
    const u = await empresaService.criarUsuarioNaEmpresa(empresaId, req.body || {});
    const json = u.toJSON();
    delete json.passwordHash;
    res.status(201).json({ success: true, data: json });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
