// Portal Core - Shared state, API helpers, utilities
// All portal modules access state via window.PLP
window.PLP = window.PLP || {};

(function(PLP) {
  // Shared state
  PLP.state = { token: localStorage.getItem('plp_token'), user: null, page: 'dashboard', selectedClient: null, lang: localStorage.getItem('plp_lang') || 'en' };
  PLP.API_BASE = (document.querySelector('meta[name="api-base"]')?.content || window.location.origin) + '/api';

  // Translation helper
  PLP.t = function(key) {
    const translations = window.PORTAL_TRANSLATIONS || {};
    const lang = PLP.state.lang;
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  // API helper
  PLP.api = async function(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = PLP.API_BASE + path + sep + 'admin_token=' + PLP.state.token;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) { PLP.logout(); throw new Error('Session expired'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
    return data;
  };

  // Toast notification
  PLP.toast = function(msg, type='success') {
    const d = document.createElement('div');
    d.className = `toast toast-${type}`;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.classList.add('show'), 10);
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 300); }, 3000);
  };

  // HTML escape
  PLP.esc = function(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  // Currency formatter
  PLP.cur = function(n) { return new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(n || 0); };

  // Date formatter
  PLP.fmtDate = function(d) {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('et-EE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
  };

  // Logout
  PLP.logout = function() {
    PLP.state.token = null;
    PLP.state.user = null;
    localStorage.removeItem('plp_token');
    PLP.render();
  };

  // Navigate
  PLP.navigate = function(page) {
    PLP.state.page = page;
    PLP.state.selectedClient = null;
    PLP.render();
  };

  // Close modal
  PLP.closeModal = function() { document.getElementById('modal-overlay')?.remove(); };

  // Role check helpers
  PLP.isEnterprise = function() {
    const plan = (PLP.state.user?.plan || '').toLowerCase();
    return plan === 'enterprise' || plan === 'custom';
  };
  PLP.isSuperAdmin = function() {
    return PLP.state.user?.is_super_admin || PLP.state.user?.role === 'superadmin';
  };

})(window.PLP);
