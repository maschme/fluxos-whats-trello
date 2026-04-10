'use strict';

/**
 * Ajustes SQL em tabelas criadas fora do Sequelize (contatos, indicacoes, metas)
 * para suportar multi-empresa.
 */
async function runTenantMigration(sequelize) {
  if (sequelize.getDialect() !== 'mysql') {
    console.log('⏭️ tenantMigration: apenas MySQL.');
    return;
  }

  async function columnExists(table, column) {
    const [rows] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      { replacements: [table, column] }
    );
    return rows && rows.length > 0;
  }

  try {
    const [tContatos] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contatos'`
    );
    if (tContatos && tContatos.length > 0) {
      if (!(await columnExists('contatos', 'empresa_id'))) {
        await sequelize.query(
          'ALTER TABLE contatos ADD COLUMN empresa_id INT NOT NULL DEFAULT 1 COMMENT \'FK lógica para empresas.id\''
        );
        console.log('✅ contatos.empresa_id adicionada.');
      }
      try {
        await sequelize.query('ALTER TABLE contatos DROP INDEX uniq_whatsapp_id');
        console.log('✅ Índice uniq_whatsapp_id removido (contatos).');
      } catch (_) {
        /* já removido ou nome diferente */
      }
      try {
        await sequelize.query(
          'ALTER TABLE contatos ADD UNIQUE KEY uniq_contatos_empresa_whatsapp (empresa_id, whatsapp_id)'
        );
        console.log('✅ UNIQUE (empresa_id, whatsapp_id) em contatos.');
      } catch (e) {
        if (!String(e.message).includes('Duplicate')) console.warn('⚠️ contatos unique composto:', e.message);
      }
    }
  } catch (e) {
    console.warn('⚠️ tenantMigration contatos:', e.message);
  }

  try {
    const [tInd] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'indicacoes'`
    );
    if (tInd && tInd.length > 0) {
      if (!(await columnExists('indicacoes', 'empresa_id'))) {
        await sequelize.query(
          'ALTER TABLE indicacoes ADD COLUMN empresa_id INT NOT NULL DEFAULT 1'
        );
        console.log('✅ indicacoes.empresa_id adicionada.');
      }
      try {
        await sequelize.query('ALTER TABLE indicacoes DROP INDEX uniq_indicador_indicado');
        console.log('✅ Índice uniq_indicador_indicado removido.');
      } catch (_) {}
      try {
        await sequelize.query(
          'ALTER TABLE indicacoes ADD UNIQUE KEY uniq_ind_emp_ind_ind (empresa_id, indicador_whatsapp_id, indicado_numero)'
        );
        console.log('✅ UNIQUE composto em indicacoes.');
      } catch (e) {
        if (!String(e.message).includes('Duplicate')) console.warn('⚠️ indicacoes unique:', e.message);
      }
    }
  } catch (e) {
    console.warn('⚠️ tenantMigration indicacoes:', e.message);
  }

  try {
    const [tMetas] = await sequelize.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'metas'`
    );
    if (tMetas && tMetas.length > 0) {
      if (!(await columnExists('metas', 'empresa_id'))) {
        await sequelize.query('ALTER TABLE metas ADD COLUMN empresa_id INT NOT NULL DEFAULT 1');
        console.log('✅ metas.empresa_id adicionada.');
      }
      try {
        await sequelize.query('ALTER TABLE metas DROP INDEX uniq_nome');
        console.log('✅ Índice uniq_nome removido (metas).');
      } catch (_) {}
      try {
        await sequelize.query(
          'ALTER TABLE metas ADD UNIQUE KEY uniq_metas_empresa_nome (empresa_id, nome)'
        );
        console.log('✅ UNIQUE (empresa_id, nome) em metas.');
      } catch (e) {
        if (!String(e.message).includes('Duplicate')) console.warn('⚠️ metas unique:', e.message);
      }
    }
  } catch (e) {
    console.warn('⚠️ tenantMigration metas:', e.message);
  }
}

module.exports = { runTenantMigration };
