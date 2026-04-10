'use strict';

const mysql = require('mysql2/promise');
const { dbConfig } = require('../database/connection');
const { getEmpresaId } = require('../context/tenantContext');
const { parseVcards } = require('../utils/vcardParser');

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

async function registrarIndicacoes(indicadorWhatsappId, indicados) {
  const eid = getEmpresaId();
  if (!indicados || indicados.length === 0) {
    const qt = await obterQtIndicados(indicadorWhatsappId);
    return { qtInseridos: 0, qtTotal: qt, completouMissao: qt >= 10 };
  }

  const conn = await mysql.createConnection(mysql2Config);
  try {
    let qtInseridos = 0;
    const indicadorNorm = indicadorWhatsappId || '';

    for (const { numero, nome } of indicados) {
      if (!numero || !numero.replace(/\D/g, '')) continue;
      const numNorm = numero.replace(/\D/g, '');
      try {
        const [result] = await conn.execute(
          `INSERT INTO indicacoes (indicador_whatsapp_id, indicado_numero, indicado_nome, empresa_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE indicado_nome = VALUES(indicado_nome)`,
          [indicadorNorm, numNorm, nome || null, eid]
        );
        if (result.affectedRows === 1) qtInseridos++;
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          const [result] = await conn.execute(
            `INSERT INTO indicacoes (indicador_whatsapp_id, indicado_numero, indicado_nome)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE indicado_nome = VALUES(indicado_nome)`,
            [indicadorNorm, numNorm, nome || null]
          );
          if (result.affectedRows === 1) qtInseridos++;
        } else if (e.code !== 'ER_DUP_ENTRY') {
          throw e;
        }
      }
    }

    let qtTotal = 0;
    try {
      const [rows] = await conn.execute(
        'SELECT COUNT(*) as total FROM indicacoes WHERE empresa_id = ? AND indicador_whatsapp_id = ?',
        [eid, indicadorNorm]
      );
      qtTotal = rows[0] && rows[0].total ? Number(rows[0].total) : 0;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = await conn.execute(
          'SELECT COUNT(*) as total FROM indicacoes WHERE indicador_whatsapp_id = ?',
          [indicadorNorm]
        );
        qtTotal = rows[0] && rows[0].total ? Number(rows[0].total) : 0;
      } else {
        throw e;
      }
    }

    const whatsappIdParaContato = normalizarWhatsappId(indicadorWhatsappId);
    try {
      await conn.execute(
        `UPDATE contatos SET qt_indicados = ?, cam_indicacoes = ? WHERE whatsapp_id = ? AND empresa_id = ?`,
        [qtTotal, qtTotal >= 10 ? 1 : 0, whatsappIdParaContato, eid]
      );
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        await conn.execute(
          `UPDATE contatos SET qt_indicados = ?, cam_indicacoes = ? WHERE whatsapp_id = ?`,
          [qtTotal, qtTotal >= 10 ? 1 : 0, whatsappIdParaContato]
        ).catch(() => {});
      } else if (e.code !== 'ER_NO_SUCH_TABLE') {
        throw e;
      }
    }

    return {
      qtInseridos,
      qtTotal,
      completouMissao: qtTotal >= 10
    };
  } finally {
    await conn.end();
  }
}

async function obterQtIndicados(indicadorWhatsappId) {
  const eid = getEmpresaId();
  const conn = await mysql.createConnection(mysql2Config);
  try {
    try {
      const [rows] = await conn.execute(
        'SELECT COUNT(*) as total FROM indicacoes WHERE empresa_id = ? AND indicador_whatsapp_id = ?',
        [eid, indicadorWhatsappId || '']
      );
      return rows[0] && rows[0].total ? Number(rows[0].total) : 0;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = await conn.execute(
          'SELECT COUNT(*) as total FROM indicacoes WHERE indicador_whatsapp_id = ?',
          [indicadorWhatsappId || '']
        );
        return rows[0] && rows[0].total ? Number(rows[0].total) : 0;
      }
      throw e;
    }
  } finally {
    await conn.end();
  }
}

async function completouMissaoIndicacoes(whatsappId) {
  const eid = getEmpresaId();
  const conn = await mysql.createConnection(mysql2Config);
  try {
    const id = normalizarWhatsappId(whatsappId);
    try {
      const [rows] = await conn.execute(
        'SELECT cam_indicacoes FROM contatos WHERE whatsapp_id = ? AND empresa_id = ? LIMIT 1',
        [id, eid]
      );
      return rows[0] ? Boolean(rows[0].cam_indicacoes) : false;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const [rows] = await conn.execute(
          'SELECT cam_indicacoes FROM contatos WHERE whatsapp_id = ? LIMIT 1',
          [id]
        );
        return rows[0] ? Boolean(rows[0].cam_indicacoes) : false;
      }
      throw e;
    }
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  } finally {
    await conn.end();
  }
}

module.exports = {
  registrarIndicacoes,
  obterQtIndicados,
  completouMissaoIndicacoes,
  normalizarWhatsappId,
  parseVcards
};
