'use strict';

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../services/authService');
const { runWithTenant } = require('../context/tenantContext');

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  try {
    req.user = jwt.verify(m[1], getJwtSecret());
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao super administrador' });
  }
  next();
}

function resolveTenant(req, res, next) {
  const { role, empresaId } = req.user;
  let eid = empresaId;
  if (role === 'super_admin') {
    const raw = req.headers['x-empresa-id'];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Super admin: envie o header X-Empresa-Id para operar no contexto de uma empresa'
      });
    }
    eid = parseInt(String(raw).trim(), 10);
    if (Number.isNaN(eid)) {
      return res.status(400).json({ success: false, error: 'X-Empresa-Id inválido' });
    }
  }
  if (eid == null || Number.isNaN(Number(eid))) {
    return res.status(403).json({ success: false, error: 'Usuário sem empresa vinculada' });
  }
  const n = Number(eid);
  req.empresaId = n;
  runWithTenant(n, () => next());
}

module.exports = {
  requireAuth,
  requireSuperAdmin,
  resolveTenant
};
