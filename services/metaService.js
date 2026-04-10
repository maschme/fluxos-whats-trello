'use strict';

const mysql = require('mysql2/promise');
const { dbConfig } = require('../database/connection');
const { getEmpresaId } = require('../context/tenantContext');

const mysql2Config = {
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

async function listarMetas(apenasAtivas = true) {
  const eid = getEmpresaId();
  const conn = await mysql.createConnection(mysql2Config);
  try {
    try {
      const where = apenasAtivas ? 'WHERE ativo = 1 AND empresa_id = ?' : 'WHERE empresa_id = ?';
      const [rows] = await conn.execute(
        `SELECT id, nome, descricao, ativo FROM metas ${where} ORDER BY nome`,
        [eid]
      );
      return rows;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const where = apenasAtivas ? 'WHERE ativo = 1' : '';
        const [rows] = await conn.execute(`SELECT id, nome, descricao, ativo FROM metas ${where} ORDER BY nome`);
        return rows;
      }
      throw e;
    }
  } finally {
    await conn.end();
  }
}

async function getMetaPorNomeOuId(nomeOuId) {
  const eid = getEmpresaId();
  const conn = await mysql.createConnection(mysql2Config);
  try {
    const isId = /^\d+$/.test(String(nomeOuId));
    try {
      if (isId) {
        const [rows] = await conn.execute(
          'SELECT id, nome, descricao FROM metas WHERE id = ? AND empresa_id = ?',
          [parseInt(nomeOuId, 10), eid]
        );
        return rows[0] || null;
      }
      const [rows] = await conn.execute(
        'SELECT id, nome, descricao FROM metas WHERE nome = ? AND empresa_id = ?',
        [String(nomeOuId).trim(), eid]
      );
      return rows[0] || null;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = isId
          ? await conn.execute('SELECT id, nome, descricao FROM metas WHERE id = ?', [parseInt(nomeOuId, 10)])
          : await conn.execute('SELECT id, nome, descricao FROM metas WHERE nome = ?', [String(nomeOuId).trim()]);
        return rows[0] || null;
      }
      throw e;
    }
  } finally {
    await conn.end();
  }
}

async function marcarConcluido(whatsappId, metaNomeOuId) {
  const meta = await getMetaPorNomeOuId(metaNomeOuId);
  if (!meta) return { ok: false, erro: 'Meta não encontrada' };
  const wid = normalizarWhatsappId(whatsappId);
  if (!wid) return { ok: false, erro: 'whatsapp_id inválido' };

  const conn = await mysql.createConnection(mysql2Config);
  try {
    await conn.execute(
      `INSERT INTO contato_metas (whatsapp_id, meta_id, concluido) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE concluido = 1, concluido_em = CURRENT_TIMESTAMP`,
      [wid, meta.id]
    );
    return { ok: true, meta: meta.nome };
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return { ok: false, erro: 'Tabelas metas/contato_metas não existem' };
    throw e;
  } finally {
    await conn.end();
  }
}

async function verificarConcluido(whatsappId, metaNomeOuId) {
  const meta = await getMetaPorNomeOuId(metaNomeOuId);
  if (!meta) return false;
  const wid = normalizarWhatsappId(whatsappId);
  if (!wid) return false;

  const conn = await mysql.createConnection(mysql2Config);
  try {
    const [rows] = await conn.execute(
      'SELECT 1 FROM contato_metas WHERE whatsapp_id = ? AND meta_id = ? AND concluido = 1 LIMIT 1',
      [wid, meta.id]
    );
    return rows.length > 0;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  } finally {
    await conn.end();
  }
}

async function listarMetasConcluidasPorContato(whatsappId) {
  const wid = normalizarWhatsappId(whatsappId);
  if (!wid) return [];

  const conn = await mysql.createConnection(mysql2Config);
  try {
    const [rows] = await conn.execute(
      `SELECT m.nome, m.descricao, cm.concluido_em
       FROM contato_metas cm
       JOIN metas m ON m.id = cm.meta_id
       WHERE cm.whatsapp_id = ? AND cm.concluido = 1
       ORDER BY cm.concluido_em DESC`,
      [wid]
    );
    return rows;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  } finally {
    await conn.end();
  }
}

module.exports = {
  listarMetas,
  getMetaPorNomeOuId,
  marcarConcluido,
  verificarConcluido,
  listarMetasConcluidasPorContato,
  normalizarWhatsappId
};
