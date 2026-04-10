'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

/**
 * Executa uma função com contexto de tenant (empresa).
 * Usado pelo middleware HTTP; o bot usa só getEmpresaId() via EMPRESA_ID.
 */
function runWithTenant(empresaId, fn) {
  const id = empresaId == null ? null : Number(empresaId);
  return als.run({ empresaId: id }, fn);
}

function getEmpresaId() {
  const store = als.getStore();
  if (store && store.empresaId != null && !Number.isNaN(store.empresaId)) {
    return store.empresaId;
  }
  const env = process.env.EMPRESA_ID;
  if (env !== undefined && env !== null && String(env).trim() !== '') {
    const n = parseInt(String(env), 10);
    if (!Number.isNaN(n)) return n;
  }
  return 1;
}

module.exports = {
  als,
  runWithTenant,
  getEmpresaId
};
