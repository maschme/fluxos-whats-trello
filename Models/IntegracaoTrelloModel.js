'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const IntegracaoTrello = sequelize.define(
  'IntegracaoTrello',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    empresaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'empresas', key: 'id' }
    },
    apiKey: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    boardIdPadrao: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    webhookBoardId: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    trelloWebhookId: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    callbackToken: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  },
  {
    tableName: 'integracoes_trello',
    timestamps: true
  }
);

module.exports = { IntegracaoTrello };
