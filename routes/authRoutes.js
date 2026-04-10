'use strict';

const express = require('express');
const router = express.Router();
const { setupAssociations } = require('../database/associations');
const authService = require('../services/authService');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login(email, password);
    if (!result.ok) {
      return res.status(401).json({ success: false, error: result.error });
    }
    res.json({ success: true, token: result.token, user: result.user });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    setupAssociations();
    const user = await authService.getUsuarioPorId(req.user.sub);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    const json = user.toJSON();
    res.json({ success: true, user: json });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
