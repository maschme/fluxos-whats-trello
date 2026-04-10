const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const Configuracao = sequelize.define('Configuracao', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    references: { model: 'empresas', key: 'id' }
  },
  chave: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  valor: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tipo: {
    type: DataTypes.ENUM('boolean', 'string', 'number', 'json'),
    defaultValue: 'string'
  },
  categoria: {
    type: DataTypes.STRING(50),
    defaultValue: 'geral'
  },
  descricao: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'configuracoes',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['empresaId', 'chave'], name: 'uniq_config_empresa_chave' }
  ]
});

module.exports = { Configuracao, sequelize };
