(function (global) {
  const TOKEN_KEY = 'pizzabot_token';
  const ROLE_KEY = 'pizzabot_role';
  const ADMIN_EMPRESA_KEY = 'pizzabot_admin_empresa_id';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getRole() {
    return localStorage.getItem(ROLE_KEY);
  }

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (getRole() === 'super_admin') {
      const e = sessionStorage.getItem(ADMIN_EMPRESA_KEY);
      if (e) h['X-Empresa-Id'] = e;
    }
    return h;
  }

  function setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) {
      localStorage.setItem(ROLE_KEY, user.role || '');
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(ADMIN_EMPRESA_KEY);
  }

  function logout() {
    clearSession();
    window.location.href = '/login.html';
  }

  function ensurePainel() {
    if (!getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    if (getRole() === 'super_admin' && !sessionStorage.getItem(ADMIN_EMPRESA_KEY)) {
      window.location.href = '/admin.html?precisaEmpresa=1';
      return false;
    }
    return true;
  }

  function ensureAdmin() {
    if (!getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    if (getRole() !== 'super_admin') {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  }

  function setEmpresaParaPainel(empresaId) {
    sessionStorage.setItem(ADMIN_EMPRESA_KEY, String(empresaId));
  }

  global.PizzabotSession = {
    TOKEN_KEY,
    ROLE_KEY,
    ADMIN_EMPRESA_KEY,
    getToken,
    getRole,
    authHeaders,
    setSession,
    clearSession,
    logout,
    ensurePainel,
    ensureAdmin,
    setEmpresaParaPainel
  };
})(typeof window !== 'undefined' ? window : globalThis);
