'use strict';

const mysql = require('mysql2/promise');
const { dbConfig } = require('../database/connection');
const { getEmpresaId } = require('../context/tenantContext');

const config = {
  host: dbConfig.host,
  port: dbConfig.port || 3306,
  user: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.database
};

function normalizarWhatsappId(id) {
  if (!id) return '';
  return String(id).replace(/\D/g, '');
}

async function listarContatos() {
  const eid = getEmpresaId();
  const conn = await mysql.createConnection(config);
  try {
    const [rows] = await conn.execute(
      `SELECT id, whatsapp_id, nome, cam_grupo, id_negociacao, qt_indicados, cam_indicacoes, created_at, updated_at, empresa_id
       FROM contatos WHERE empresa_id = ? ORDER BY updated_at DESC, created_at DESC`,
      [eid]
    );
    return rows;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      const [rowsLegacy] = await conn.execute(
        `SELECT id, whatsapp_id, nome, cam_grupo, id_negociacao, qt_indicados, cam_indicacoes, created_at, updated_at
         FROM contatos ORDER BY updated_at DESC, created_at DESC`
      );
      return rowsLegacy;
    }
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  } finally {
    await conn.end();
  }
}

async function deletarContato(whatsappId) {
  const wid = normalizarWhatsappId(whatsappId);
  if (!wid) throw new Error('whatsapp_id inválido');
  const eid = getEmpresaId();

  const conn = await mysql.createConnection(config);
  try {
    await conn.execute('DELETE FROM contato_metas WHERE whatsapp_id = ?', [wid]);

    try {
      await conn.execute(
        `DELETE FROM indicacoes WHERE empresa_id = ? AND (indicador_whatsapp_id = ? OR indicador_whatsapp_id = ?)`,
        [eid, wid, wid + '@c.us']
      );
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        await conn.execute(
          'DELETE FROM indicacoes WHERE indicador_whatsapp_id = ? OR indicador_whatsapp_id = ?',
          [wid, wid + '@c.us']
        );
      } else {
        throw err;
      }
    }

    let affectedRows = 0;
    try {
      const [delRes] = await conn.execute('DELETE FROM contatos WHERE whatsapp_id = ? AND empresa_id = ?', [wid, eid]);
      affectedRows = delRes.affectedRows;
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        const [delRes] = await conn.execute('DELETE FROM contatos WHERE whatsapp_id = ?', [wid]);
        affectedRows = delRes.affectedRows;
      } else {
        throw err;
      }
    }

    return { deleted: affectedRows > 0, whatsapp_id: wid };
  } finally {
    await conn.end();
  }
}

module.exports = {
  listarContatos,
  deletarContato,
  normalizarWhatsappId
};
