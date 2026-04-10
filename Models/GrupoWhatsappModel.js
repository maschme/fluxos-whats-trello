const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const GrupoWhatsapp = sequelize.define('GrupoWhatsapp', {
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
  grupoId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'ID do grupo no WhatsApp (ex: 120363xxx@g.us)'
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bairro: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Bairro associado ao grupo (para campanha)'
  },
  linkConvite: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  participantes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tipo: {
    type: DataTypes.ENUM('campanha', 'promocao', 'suporte', 'outro'),
    defaultValue: 'outro'
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Se o grupo está ativo para uso na campanha'
  },
  isGrupoGeral: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Se é o grupo geral de fallback'
  },
  ultimaSincronizacao: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'grupos_whatsapp',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['empresaId', 'grupoId'], name: 'uniq_grupo_empresa_grupoId' }
  ]
});

module.exports = { GrupoWhatsapp, sequelize };
