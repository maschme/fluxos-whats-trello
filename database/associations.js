'use strict';

const { Empresa } = require('../Models/EmpresaModel');
const { Usuario } = require('../Models/UsuarioModel');

let done = false;

function setupAssociations() {
  if (done) return;
  Empresa.hasMany(Usuario, { foreignKey: 'empresaId', as: 'usuarios' });
  Usuario.belongsTo(Empresa, { foreignKey: 'empresaId', as: 'empresa' });
  done = true;
}

module.exports = { setupAssociations };
