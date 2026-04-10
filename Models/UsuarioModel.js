const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'empresas', key: 'id' }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  nome: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('super_admin', 'empresa_admin'),
    allowNull: false,
    defaultValue: 'empresa_admin'
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'usuarios',
  timestamps: true
});

module.exports = { Usuario };
