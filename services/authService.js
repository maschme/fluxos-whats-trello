'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { setupAssociations } = require('../database/associations');
const { Usuario } = require('../Models/UsuarioModel');
const { Empresa } = require('../Models/EmpresaModel');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || String(s).length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Defina JWT_SECRET com pelo menos 16 caracteres em produção.');
    }
    return 'dev-jwt-secret-altere';
  }
  return s;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      empresaId: user.empresaId
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function login(email, password) {
  setupAssociations();
  const em = String(email || '').trim().toLowerCase();
  if (!em || !password) {
    return { ok: false, error: 'E-mail e senha são obrigatórios' };
  }
  const usuario = await Usuario.findOne({
    where: { email: em, ativo: true },
    include: [{ model: Empresa, as: 'empresa', required: false, attributes: ['id', 'nome', 'slug', 'ativo'] }]
  });
  if (!usuario) {
    return { ok: false, error: 'Credenciais inválidas' };
  }
  if (usuario.role === 'empresa_admin' && usuario.empresaId) {
    const emp = await Empresa.findByPk(usuario.empresaId);
    if (!emp || !emp.ativo) {
      return { ok: false, error: 'Empresa inativa ou inexistente' };
    }
  }
  const match = await bcrypt.compare(password, usuario.passwordHash);
  if (!match) {
    return { ok: false, error: 'Credenciais inválidas' };
  }
  const token = signToken(usuario);
  return {
    ok: true,
    token,
    user: {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
      empresaId: usuario.empresaId,
      empresa: usuario.empresa || null
    }
  };
}

async function getUsuarioPorId(id) {
  setupAssociations();
  return Usuario.findByPk(id, {
    attributes: { exclude: ['passwordHash'] },
    include: [{ model: Empresa, as: 'empresa', required: false, attributes: ['id', 'nome', 'slug', 'ativo'] }]
  });
}

module.exports = {
  getJwtSecret,
  signToken,
  login,
  getUsuarioPorId
};
