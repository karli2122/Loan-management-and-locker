const API_BASE = window.location.origin + '/api';
let state = { token: localStorage.getItem('plp_token'), user: null, page: 'dashboard', clients: [], selectedClient: null, modal: null, language: localStorage.getItem('plp_language') || 'et' };

// Translation helper
function t(key) {
  const lang = state.language || 'en';
  const dict = (typeof PORTAL_TRANSLATIONS !== 'undefined') ? PORTAL_TRANSLATIONS[lang] || PORTAL_TRANSLATIONS.en : {};
  return dict[key] || (PORTAL_TRANSLATIONS?.en?.[key]) || key;
}

// API helper
async function api(method, path, body) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${state.token ? sep + 'admin_token=' + state.token : ''}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}

function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('plp_token');
  render();
}

function navigate(page) { state.page = page; state.selectedClient = null; render(); }

// Render engine
function render() {
  const app = document.getElementById('app');
  if (!state.token) { app.innerHTML = renderLogin(); bindLogin(); return; }
  if (!state.user) { app.innerHTML = '<div class="loading-page"><div class="spinner"></div>Loading...</div>'; loadUser(); return; }
  app.innerHTML = renderSidebar() + `<div class="main-content" id="page-content"></div>`;
  bindSidebar();
  loadPage();
}

// Login
function renderLogin() {
  return `<div class="login-screen"><div class="login-box">
    <div class="logo-row"><div class="logo-icon">P</div><div><h1>PayLock Pro</h1><p class="subtitle">${t('login_title')}</p></div></div>
    <form id="login-form">
      <div class="form-group"><label>${t('login_username')}</label><input id="login-user" type="text" placeholder="${t('login_username')}" data-testid="login-username" required></div>
      <div class="form-group"><label>${t('login_password')}</label><input id="login-pass" type="password" placeholder="${t('login_password')}" data-testid="login-password" required></div>
      <div id="login-error" class="error-msg hidden"></div>
      <button type="submit" class="btn btn-primary" style="margin-top:8px" data-testid="login-submit"><i class="fas fa-sign-in-alt"></i> ${t('login_submit')}</button>
    </form>
  </div></div>`;
}

function bindLogin() {
  document.getElementById('login-form').onsubmit = async(e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    try {
      const data = await fetch(`${API_BASE}/admin/login`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: document.getElementById('login-user').value, password: document.getElementById('login-pass').value })
      }).then(r=>r.json());
      if (data.token) {
        // Check plan - only enterprise or custom can access portal
        const plan = (data.plan || '').toLowerCase();
        if (plan !== 'enterprise' && plan !== 'custom') {
          errEl.textContent = 'Portal access requires Enterprise or Custom plan. Please upgrade your subscription.';
          errEl.classList.remove('hidden');
          return;
        }
        state.token = data.token; state.user = data; localStorage.setItem('plp_token', data.token); toast('Welcome back!'); render();
      }
      else { errEl.textContent = data.detail || 'Login failed'; errEl.classList.remove('hidden'); }
    } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  };
}

async function loadUser() {
  try {
    const data = await api('GET', `/admin/verify/${state.token}`);
    // Check plan - only enterprise or custom can access portal
    const plan = (data.plan || '').toLowerCase();
    if (plan !== 'enterprise' && plan !== 'custom') {
      logout();
      toast('Portal access requires Enterprise or Custom plan.', 'error');
      return;
    }
    state.user = data;
    render();
  } catch { logout(); }
}

// Permission map for sidebar items
const NAV_PERMS = {
  dashboard: null, // always visible
  clients: 'clients',
  loans: 'loans',
  reminders: 'reminders',
  reports: 'reports',
  devices: 'devices',
  documents: 'documents',
  bank_statements: 'documents',
  import: 'import',
  telegram: 'reminders',
  schedules: 'schedules',
  team: '__super_admin__',
  activity: '__super_admin__',
  provisioning: 'devices',
  settings: null, // always visible
};

// Sidebar
function renderSidebar() {
  const allItems = [
    { id:'dashboard', icon:'fa-chart-line', label: t('nav_dashboard') },
    { id:'clients', icon:'fa-users', label: t('nav_clients') },
    { id:'loans', icon:'fa-hand-holding-usd', label: t('nav_loans') },
    { id:'reminders', icon:'fa-bell', label: t('nav_reminders') },
    { id:'reports', icon:'fa-chart-bar', label: t('nav_reports') },
    { id:'devices', icon:'fa-mobile-alt', label: t('nav_devices') },
    { id:'documents', icon:'fa-folder-open', label: t('nav_documents') },
    { id:'bank_statements', icon:'fa-university', label: 'Bank Analyzer' },
    { id:'risk_scoring', icon:'fa-shield-alt', label: 'Risk Scoring' },
    { id:'bulk_messaging', icon:'fa-paper-plane', label: 'Bulk Messaging' },
    { id:'exports', icon:'fa-file-export', label: 'Exports' },
    { id:'import', icon:'fa-file-csv', label: t('nav_import') },
    { id:'schedules', icon:'fa-calendar-check', label: t('nav_schedules') },
    { id:'telegram', icon:'fa-paper-plane', label: t('nav_telegram') },
    { id:'team', icon:'fa-user-shield', label: t('nav_team') },
    { id:'activity', icon:'fa-history', label: t('nav_activity') },
    { id:'provisioning', icon:'fa-qrcode', label: t('nav_provisioning') },
    { id:'settings', icon:'fa-cog', label: t('nav_settings') },
  ];
  const userPerms = state.user?.permissions || [];
  const isSuperAdmin = state.user?.is_super_admin === true;
  const items = allItems.filter(i => {
    const req = NAV_PERMS[i.id];
    if (req === null) return true;
    if (req === '__super_admin__') return isSuperAdmin;
    if (isSuperAdmin || userPerms.includes('all')) return true;
    return userPerms.includes(req);
  });
  return `<div class="sidebar" data-testid="sidebar">
    <div class="logo"><div class="logo-icon">P</div><span>PayLock Pro</span></div>
    <div class="nav-section">
      <div class="section-title">Menu</div>
      ${items.map(i => `<div class="nav-item ${state.page===i.id?'active':''}" data-page="${i.id}" data-testid="nav-${i.id}"><i class="fas ${i.icon}"></i><span>${i.label}</span></div>`).join('')}
    </div>
    <div class="sidebar-footer">
      <div class="user-info"><div><div class="username">${state.user?.username||'Admin'}</div><div class="role">${state.user?.is_super_admin?'Super Admin':'Admin'}</div></div></div>
      <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="logout()" data-testid="logout-btn"><i class="fas fa-sign-out-alt"></i> <span>Logout</span></button>
    </div>
  </div>`;
}

function bindSidebar() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.onclick = () => navigate(el.dataset.page);
  });
}

// Page loading
async function loadPage() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-page"><div class="spinner"></div>Loading...</div>';
  try {
    switch(state.page) {
      case 'dashboard': await renderDashboard(el); break;
      case 'clients': state.selectedClient ? await renderClientDetail(el) : await renderClients(el); break;
      case 'loans': await renderLoanPlans(el); break;
      case 'reminders': await renderReminders(el); break;
      case 'reports': await renderReports(el); break;
      case 'devices': await renderDevices(el); break;
      case 'documents': await renderDocuments(el); break;
      case 'bank_statements': await renderBankStatements(el); break;
      case 'risk_scoring': if (window.PLP?.renderRiskScoring) { window.PLP.state.token = state.token; window.PLP.API_BASE = API_BASE; await window.PLP.renderRiskScoring(el); } break;
      case 'bulk_messaging': if (window.PLP?.renderBulkMessaging) { window.PLP.state.token = state.token; window.PLP.API_BASE = API_BASE; await window.PLP.renderBulkMessaging(el); } break;
      case 'exports': if (window.PLP?.renderReports) { window.PLP.state.token = state.token; window.PLP.API_BASE = API_BASE; await window.PLP.renderReports(el); } break;
      case 'import': await renderImport(el); break;
      case 'telegram': await renderTelegram(el); break;
      case 'team': await renderTeam(el); break;
      case 'schedules': await renderSchedules(el); break;
      case 'activity': await renderActivity(el); break;
      case 'provisioning': await renderProvisioning(el); break;
      case 'settings': await renderSettings(el); break;
      default: el.innerHTML = '<p>Page not found</p>';
    }
  } catch(err) { el.innerHTML = `<div class="card"><p class="error-msg">Error: ${err.message}</p></div>`; }
}

// Dashboard with Analytics Charts
async function renderDashboard(el) {
  const [dash, collection, financial] = await Promise.all([
    api('GET', '/analytics/dashboard'),
    api('GET', '/reports/collection'),
    api('GET', '/reports/financial')
  ]);
  const o = dash.overview; const f = dash.financial;
  el.innerHTML = `
    <div class="page-header"><h2>${t('dash_title')}</h2><p>${t('dash_subtitle')}</p></div>
    <div class="stats-grid" data-testid="dashboard-stats">
      <div class="stat-card accent"><div class="stat-label">${t('total_clients')}</div><div class="stat-value">${o.total_clients}</div><div class="stat-sub">${o.registered} ${t('registered')}</div></div>
      <div class="stat-card success"><div class="stat-label">${t('total_collected')}</div><div class="stat-value">${cur(f.total_collected)}</div><div class="stat-sub">${f.collection_rate.toFixed(1)}% ${t('rate')}</div></div>
      <div class="stat-card warning"><div class="stat-label">${t('outstanding')}</div><div class="stat-value">${cur(f.total_outstanding)}</div><div class="stat-sub">${o.active_loans} ${t('active_loans')}</div></div>
      <div class="stat-card danger"><div class="stat-label">${t('overdue')}</div><div class="stat-value">${o.overdue}</div><div class="stat-sub">${t('clients_overdue')}</div></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">${t('disbursed')}</div><div class="stat-value">${cur(f.total_disbursed)}</div></div>
      <div class="stat-card"><div class="stat-label">${t('locked_devices')}</div><div class="stat-value">${o.locked}</div></div>
      <div class="stat-card"><div class="stat-label">${t('this_month')}</div><div class="stat-value">${cur(collection.this_month?.total_collected||0)}</div><div class="stat-sub">${collection.this_month?.number_of_payments||0} ${t('payments')}</div></div>
      <div class="stat-card"><div class="stat-label">${t('late_fees')}</div><div class="stat-value">${cur(collection.financial?.total_late_fees||0)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px" data-testid="dashboard-charts">
      <div class="card" style="padding:20px"><div class="card-header"><h3>${t('revenue_trends')}</h3></div><canvas id="chart-revenue" height="220" data-testid="chart-revenue"></canvas></div>
      <div class="card" style="padding:20px"><div class="card-header"><h3>${t('profit_trends')}</h3></div><canvas id="chart-profit" height="220" data-testid="chart-profit"></canvas></div>
      <div class="card" style="padding:20px"><div class="card-header"><h3>${t('collection_rates')}</h3></div><canvas id="chart-collection" height="220" data-testid="chart-collection"></canvas></div>
      <div class="card" style="padding:20px"><div class="card-header"><h3>${t('loan_distribution')}</h3></div><canvas id="chart-distribution" height="220" data-testid="chart-distribution"></canvas></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-header"><h3>${t('recent_activity')}</h3></div>
      ${dash.activity_log?.length ? `<table><thead><tr><th>${t('client')}</th><th>${t('action')}</th><th>${t('time')}</th></tr></thead><tbody>
        ${dash.activity_log.map(a => `<tr><td>${a.client_name}</td><td>${a.details}</td><td>${fmtDate(a.timestamp)}</td></tr>`).join('')}
      </tbody></table>` : `<p style="color:var(--text-muted);font-size:13px">${t('no_recent_activity')}</p>`}
    </div>
    <div class="card live-feed-card" style="margin-top:16px" data-testid="live-payment-feed">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3 style="display:flex;align-items:center;gap:8px"><span class="live-dot"></span> Live Payment Feed</h3>
        <div class="live-feed-stats" id="live-feed-stats"></div>
      </div>
      <div id="live-feed-container" class="live-feed-container">
        <div class="live-feed-loading"><div class="spinner" style="width:24px;height:24px"></div></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px" data-testid="stripe-payment-tracker">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3 style="display:flex;align-items:center;gap:8px"><i class="fab fa-stripe-s" style="color:#6366F1"></i> Stripe Payment Tracker</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <div id="stripe-tracker-stats" style="display:flex;gap:12px;font-size:13px"></div>
          <button class="btn btn-outline btn-sm" onclick="loadStripeTracker()" data-testid="refresh-tracker-btn"><i class="fas fa-sync-alt"></i></button>
        </div>
      </div>
      <div id="stripe-tracker-container" style="min-height:60px">
        <div class="live-feed-loading"><div class="spinner" style="width:24px;height:24px"></div></div>
      </div>
    </div>`;

  // Render charts after DOM is ready
  setTimeout(() => drawDashboardCharts(financial, dash, collection), 100);
  // Start live feed
  setTimeout(() => startLiveFeed(), 200);
  // Start Stripe tracker
  setTimeout(() => startStripeTracker(), 300);
}


let liveFeedInterval = null;
let liveFeedPrevIds = new Set();

async function startLiveFeed() {
  if (liveFeedInterval) clearInterval(liveFeedInterval);
  await loadLiveFeed();
  liveFeedInterval = setInterval(loadLiveFeed, 15000); // Poll every 15s
}

async function loadLiveFeed() {
  try {
    const data = await api('GET', '/payments/live-feed?limit=20');
    const container = document.getElementById('live-feed-container');
    const statsEl = document.getElementById('live-feed-stats');
    if (!container) { if (liveFeedInterval) clearInterval(liveFeedInterval); return; }

    if (statsEl) {
      statsEl.innerHTML = `<span class="live-stat"><i class="fas fa-coins"></i> Today: <strong>${cur(data.amount_today)}</strong></span><span class="live-stat"><i class="fas fa-receipt"></i> <strong>${data.total_today}</strong> payments</span>`;
    }

    if (!data.payments || data.payments.length === 0) {
      container.innerHTML = '<div class="live-feed-empty"><i class="fas fa-inbox" style="font-size:28px;color:#334155"></i><p style="color:#64748B;margin-top:8px">No payments recorded yet</p></div>';
      return;
    }

    const newIds = new Set(data.payments.map(p => p.id));
    const html = data.payments.map((p, i) => {
      const isNew = !liveFeedPrevIds.has(p.id) && liveFeedPrevIds.size > 0;
      const methodIcon = { cash: 'fa-money-bill-wave', bank_transfer: 'fa-university', card: 'fa-credit-card', mobile_money: 'fa-mobile-alt', stripe: 'fa-stripe-s', other: 'fa-ellipsis-h' }[p.payment_method] || 'fa-money-bill-wave';
      const methodColor = { cash: '#10B981', bank_transfer: '#3B82F6', card: '#8B5CF6', mobile_money: '#F59E0B', stripe: '#6366F1' }[p.payment_method] || '#10B981';
      const timeAgo = getTimeAgo(p.payment_date);
      return `<div class="live-feed-item${isNew ? ' feed-item-new' : ''}" style="animation-delay:${i * 60}ms" data-testid="feed-item-${p.id}">
        <div class="feed-icon" style="background:${methodColor}20;color:${methodColor}"><i class="fas ${methodIcon}"></i></div>
        <div class="feed-details">
          <div class="feed-name">${p.client_name}</div>
          <div class="feed-meta"><span>${p.payment_method.replace('_',' ')}</span>${p.notes ? ` &middot; ${p.notes}` : ''}</div>
        </div>
        <div class="feed-right">
          <div class="feed-amount">+${cur(p.amount)}</div>
          <div class="feed-time">${timeAgo}</div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = html;
    liveFeedPrevIds = newIds;
  } catch(e) { console.error('Live feed error:', e); }
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return d.toLocaleDateString();
}


// --- Stripe Payment Tracker ---
let stripeTrackerInterval = null;

async function startStripeTracker() {
  if (stripeTrackerInterval) clearInterval(stripeTrackerInterval);
  await loadStripeTracker();
  stripeTrackerInterval = setInterval(loadStripeTracker, 20000); // Poll every 20s
}

async function loadStripeTracker() {
  try {
    const data = await api('GET', '/stripe/payment-tracker?limit=30');
    const container = document.getElementById('stripe-tracker-container');
    const statsEl = document.getElementById('stripe-tracker-stats');
    if (!container) { if (stripeTrackerInterval) clearInterval(stripeTrackerInterval); return; }

    const s = data.summary;
    if (statsEl) {
      statsEl.innerHTML = `
        <span style="color:#F59E0B" data-testid="tracker-pending-count"><i class="fas fa-clock"></i> ${s.pending} pending (${cur(s.pending_amount)})</span>
        <span style="color:#10B981" data-testid="tracker-success-count"><i class="fas fa-check-circle"></i> ${s.succeeded} completed (${cur(s.succeeded_amount)})</span>
        ${s.failed > 0 ? `<span style="color:#EF4444" data-testid="tracker-failed-count"><i class="fas fa-times-circle"></i> ${s.failed} failed</span>` : ''}`;
    }

    if (!data.payments || data.payments.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:#64748B"><i class="fab fa-stripe-s" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.4"></i>No Stripe payments yet. Create a payment link from the client detail page.</div>';
      return;
    }

    const statusConfig = {
      pending: { icon: 'fa-clock', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'Pending' },
      succeeded: { icon: 'fa-check-circle', color: '#10B981', bg: 'rgba(16,185,129,0.1)', label: 'Completed' },
      failed: { icon: 'fa-times-circle', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: 'Failed' },
      unpaid: { icon: 'fa-hourglass-half', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', label: 'Unpaid' },
    };

    const html = `<div style="display:grid;gap:1px;background:var(--border);border-radius:8px;overflow:hidden">
      ${data.payments.map((p, i) => {
        const sc = statusConfig[p.status] || statusConfig.pending;
        const timeAgo = getTimeAgo(p.created_at);
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-card);transition:background 0.15s" data-testid="tracker-item-${p.id}">
          <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${sc.bg};flex-shrink:0">
            <i class="fas ${sc.icon}" style="color:${sc.color};font-size:14px"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.client_name}</div>
            <div style="font-size:12px;color:var(--text-muted)">${p.source === 'auto' ? '<i class="fas fa-robot" style="margin-right:3px"></i>Auto' : '<i class="fas fa-hand-pointer" style="margin-right:3px"></i>Manual'} &middot; ${timeAgo}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:15px">${cur(p.amount)}</div>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${sc.bg};color:${sc.color};font-weight:600">${sc.label}</span>
          </div>
          ${p.status === 'pending' ? `<button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:11px" onclick="refreshStripePayment('${p.id}')" data-testid="refresh-payment-${p.id}"><i class="fas fa-sync-alt"></i></button>` : ''}
        </div>`;
      }).join('')}
    </div>`;

    container.innerHTML = html;
  } catch(e) { console.error('Stripe tracker error:', e); }
}

async function refreshStripePayment(paymentId) {
  try {
    toast('Checking payment status...');
    const result = await api('POST', `/stripe/refresh-payment/${paymentId}`);
    toast(`Payment status: ${result.status}`);
    await loadStripeTracker();
  } catch(e) { toast(e.message, 'error'); }
}


function drawDashboardCharts(financial, dash, collection) {
  if (typeof Chart === 'undefined') return;
  const chartColors = { blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', red: '#ef4444', cyan: '#06b6d4', purple: '#8b5cf6' };
  const defaults = Chart.defaults;
  defaults.color = '#94a3b8';
  defaults.borderColor = 'rgba(30,41,59,0.5)';
  defaults.font.family = 'Segoe UI, system-ui, sans-serif';

  const months = (financial.monthly_trend||[]).map(m => m.month);
  const revenues = (financial.monthly_trend||[]).map(m => m.revenue||0);
  const interests = (financial.monthly_trend||[]).map(m => m.interest_earned||0);
  const principals = (financial.monthly_trend||[]).map(m => m.principal_collected||0);
  const profits = (financial.monthly_trend||[]).map(m => (m.interest_earned||0) + (m.late_fees||0));

  // Revenue Trends (line)
  const revCtx = document.getElementById('chart-revenue');
  if (revCtx) new Chart(revCtx, { type: 'line', data: {
    labels: months.length ? months : ['No data'],
    datasets: [
      { label: t('revenue'), data: revenues, borderColor: chartColors.blue, backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 },
      { label: t('principal'), data: principals, borderColor: chartColors.green, backgroundColor: 'transparent', tension: 0.3 },
      { label: t('interest'), data: interests, borderColor: chartColors.amber, backgroundColor: 'transparent', tension: 0.3 },
    ]
  }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(30,41,59,0.3)' } }, x: { grid: { display: false } } } } });

  // Profit Trends (bar + line)
  const profCtx = document.getElementById('chart-profit');
  if (profCtx) new Chart(profCtx, { type: 'bar', data: {
    labels: months.length ? months : ['No data'],
    datasets: [
      { label: t('interest_earned_label'), data: interests, backgroundColor: 'rgba(16,185,129,0.6)', borderRadius: 4 },
      { label: t('profit_trends'), data: profits, type: 'line', borderColor: chartColors.cyan, backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
    ]
  }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(30,41,59,0.3)' } }, x: { grid: { display: false } } } } });

  // Collection Rates (bar)
  const collCtx = document.getElementById('chart-collection');
  if (collCtx) {
    const collMonths = (financial.monthly_trend||[]).map(m => m.month);
    const collected = (financial.monthly_trend||[]).map(m => m.principal_collected||0);
    const payCounts = (financial.monthly_trend||[]).map(m => m.payments_count||0);
    new Chart(collCtx, { type: 'bar', data: {
      labels: collMonths.length ? collMonths : ['No data'],
      datasets: [
        { label: t('collected'), data: collected, backgroundColor: 'rgba(59,130,246,0.6)', borderRadius: 4 },
        { label: t('payments'), data: payCounts, type: 'line', borderColor: chartColors.amber, backgroundColor: 'transparent', yAxisID: 'y1', tension: 0.3 },
      ]
    }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(30,41,59,0.3)' } }, y1: { position: 'right', beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } } });
  }

  // Loan Distribution (doughnut)
  const distCtx = document.getElementById('chart-distribution');
  if (distCtx) {
    const overview = dash.overview || {};
    const distData = [overview.active_loans||0, overview.overdue||0, overview.completed||0, (overview.total_clients||0)-(overview.active_loans||0)-(overview.overdue||0)-(overview.completed||0)];
    new Chart(distCtx, { type: 'doughnut', data: {
      labels: [t('active'), t('overdue'), t('completed'), t('other')],
      datasets: [{ data: distData, backgroundColor: [chartColors.blue, chartColors.red, chartColors.green, chartColors.purple], borderWidth: 0 }]
    }, options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } } } } });
  }
}

// Clients
async function renderClients(el) {
  const data = await api('GET', '/clients');
  state.clients = data.clients || [];
  el.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>${t('clients_title')}</h2><p>${state.clients.length} ${t('total_clients_count')}</p></div>
      <button class="btn btn-primary btn-sm" onclick="showAddClient()" data-testid="add-client-btn"><i class="fas fa-plus"></i> ${t('add_client')}</button>
    </div>
    <div class="search-bar"><input id="client-search" placeholder="${t('search_clients')}" oninput="filterClients()" data-testid="client-search"></div>
    <div class="card"><div class="table-wrap"><table data-testid="clients-table">
      <thead><tr><th>${t('name')}</th><th>${t('phone')}</th><th>${t('loan_col')}</th><th>${t('outstanding_col')}</th><th>${t('status')}</th><th>${t('device_col')}</th><th></th></tr></thead>
      <tbody id="clients-tbody">${renderClientRows(state.clients)}</tbody>
    </table></div></div>`;
}

function renderClientRows(clients) {
  if (!clients.length) return `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">${t('no_clients')}</td></tr>`;
  return clients.map(c => {
    const status = c.outstanding_balance > 0 ? (c.days_overdue > 0 ? 'danger' : 'info') : 'success';
    const statusText = c.outstanding_balance > 0 ? (c.days_overdue > 0 ? `${c.days_overdue}d ${t('overdue_days')}` : t('active_status')) : t('paid');
    return `<tr>
      <td><b>${esc(c.name)}</b></td><td>${esc(c.phone||'-')}</td><td>${cur(c.loan_amount||0)}</td><td>${cur(c.outstanding_balance||0)}</td>
      <td><span class="badge badge-${status}">${statusText}</span></td>
      <td>${c.is_locked ? `<span class="badge badge-danger"><i class="fas fa-lock"></i> ${t('locked')}</span>` : (c.is_registered ? `<span class="badge badge-success"><i class="fas fa-unlock"></i> ${t('active_status')}</span>` : `<span class="badge badge-warning">${t('unregistered')}</span>`)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewClient('${c.id}')" data-testid="view-client-${c.id}"><i class="fas fa-eye"></i></button></td>
    </tr>`;
  }).join('');
}

function filterClients() {
  const q = document.getElementById('client-search').value.toLowerCase();
  const filtered = state.clients.filter(c => c.name.toLowerCase().includes(q) || (c.phone||'').includes(q));
  document.getElementById('clients-tbody').innerHTML = renderClientRows(filtered);
}

async function viewClient(id) {
  state.selectedClient = state.clients.find(c => c.id === id);
  await renderClientDetail(document.getElementById('page-content'));
}

async function renderClientDetail(el) {
  const c = state.selectedClient;
  if (!c) { navigate('clients'); return; }
  const payments = await api('GET', `/loans/payments/${c.id}`).catch(() => []);
  const loans = await api('GET', `/loans/client/${c.id}`).catch(() => ({ loans: [] }));
  const clientLoans = loans.loans || loans || [];
  el.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><button class="btn btn-ghost" onclick="navigate('clients')" data-testid="back-to-clients"><i class="fas fa-arrow-left"></i> ${t('back')}</button><h2 style="margin-top:8px">${esc(c.name)}</h2></div>
      <div class="action-row">
        ${c.is_locked ? `<button class="btn btn-success btn-sm" onclick="toggleLock('${c.id}',false)" data-testid="unlock-btn"><i class="fas fa-unlock"></i> ${t('unlock')}</button>` : `<button class="btn btn-danger btn-sm" onclick="toggleLock('${c.id}',true)" data-testid="lock-btn"><i class="fas fa-lock"></i> ${t('lock')}</button>`}
        <button class="btn btn-warning btn-sm" onclick="sendWarning('${c.id}')" data-testid="warning-btn"><i class="fas fa-exclamation-triangle"></i> Warning</button>
        <button class="btn btn-primary btn-sm" onclick="showAddLoan('${c.id}')" data-testid="add-loan-btn"><i class="fas fa-plus-circle"></i> Add Loan</button>
        <button class="btn btn-outline btn-sm" onclick="showEditClient('${c.id}')" data-testid="edit-client-btn"><i class="fas fa-edit"></i> ${t('edit')}</button>
        <button class="btn btn-outline btn-sm" onclick="sendReminder('${c.id}','email')" data-testid="send-email-btn"><i class="fas fa-envelope"></i> ${t('email')}</button>
        <button class="btn btn-outline btn-sm" onclick="downloadContract('${c.id}')" data-testid="download-contract-btn"><i class="fas fa-file-pdf"></i> ${t('contract')}</button>
        <button class="btn btn-outline btn-sm" onclick="showLockHistory('${c.id}')" data-testid="lock-history-btn"><i class="fas fa-history"></i> Lock History</button>
      </div>
    </div>
    <div class="detail-grid" data-testid="client-details">
      <div class="detail-item"><div class="label">${t('phone')}</div><div class="value">${esc(c.phone||'-')}</div></div>
      <div class="detail-item"><div class="label">${t('email')}</div><div class="value">${esc(c.email||'-')}</div></div>
      <div class="detail-item"><div class="label">${t('address')}</div><div class="value">${esc(c.address||'-')}</div></div>
      <div class="detail-item"><div class="label">${t('id_code')}</div><div class="value">${esc(c.birth_number||'-')}</div></div>
      <div class="detail-item"><div class="label">${t('loan_amount')}</div><div class="value">${cur(c.loan_amount||0)}</div></div>
      <div class="detail-item"><div class="label">${t('total_due')}</div><div class="value">${cur(c.total_amount_due||c.outstanding_balance||0)}</div></div>
      <div class="detail-item"><div class="label">${t('total_paid')}</div><div class="value" style="color:var(--success)">${cur(c.total_paid||0)}</div></div>
      <div class="detail-item"><div class="label">${t('outstanding')}</div><div class="value" style="color:${c.outstanding_balance>0?'var(--warning)':'var(--success)'}">${cur(c.outstanding_balance||0)}</div></div>
      <div class="detail-item"><div class="label">${t('interest_rate')}</div><div class="value">${c.interest_rate||0}%</div></div>
      <div class="detail-item"><div class="label">${t('next_payment')}</div><div class="value">${c.next_payment_due ? fmtDate(c.next_payment_due) : '-'}</div></div>
      <div class="detail-item"><div class="label">${t('days_overdue')}</div><div class="value" style="color:${(c.days_overdue||0)>0?'var(--danger)':'var(--text)'}">${c.days_overdue||0}</div></div>
      <div class="detail-item"><div class="label">${t('device_col')}</div><div class="value">${c.is_locked?`<span style="color:var(--danger)">${t('locked')}</span>`:c.is_registered?`<span style="color:var(--success)">${t('active_status')}</span>`:t('unregistered')}</div></div>
    </div>

    <div class="card" style="margin-top:16px" data-testid="device-reg-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3><i class="fas fa-key"></i> Device Registration</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="generateRegKey('${c.id}', 8)" data-testid="gen-key-8"><i class="fas fa-key"></i> Generate 8-digit (Admin)</button>
          <button class="btn btn-outline btn-sm" onclick="generateRegKey('${c.id}', 9)" data-testid="gen-key-9"><i class="fas fa-shield-alt"></i> Generate 9-digit (Owner)</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:0 20px 16px">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-muted)">Current Registration Code</div>
          <div id="reg-code-display" style="font-size:24px;font-weight:700;letter-spacing:4px;font-family:monospace;color:var(--primary-light)">${esc(c.registration_code || 'Not generated')}</div>
        </div>
        ${c.registration_code ? `<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${esc(c.registration_code)}');toast('Code copied!')"><i class="fas fa-copy"></i> Copy</button>` : ''}
        <div style="font-size:12px;color:var(--text-muted)">${c.is_registered ? '<span style="color:var(--success)"><i class="fas fa-check-circle"></i> Device registered</span>' : '<span style="color:var(--warning)"><i class="fas fa-clock"></i> Awaiting registration</span>'}</div>
      </div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-header"><h3>${t('record_payment')}</h3></div>
      <div style="display:flex;gap:12px;align-items:end">
        <div class="form-group" style="flex:1;margin:0"><label>${t('amount_eur')} (&#8364;)</label><input id="pay-amount" type="number" step="0.01" placeholder="0.00" data-testid="payment-amount"></div>
        <select id="pay-method" style="padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="payment-method-select">
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="card">Card</option>
          <option value="mobile_money">Mobile Money</option>
        </select>
        <button class="btn btn-success btn-sm" onclick="recordPayment('${c.id}')" data-testid="record-payment-btn"><i class="fas fa-plus"></i> ${t('record')}</button>
        ${c.auto_pay_enabled ? `<button class="btn btn-primary btn-sm" onclick="chargeClientCard('${c.id}')" data-testid="charge-card-btn"><i class="fas fa-credit-card"></i> Stripe Pay</button>` : ''}
      </div>
    </div>

    <div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center"><h3><i class="fas fa-file-invoice-dollar"></i> Active Loans</h3></div>
      <div class="table-wrap"><table data-testid="client-loans-table"><thead><tr><th>Loan Amount</th><th>Interest</th><th>Remaining</th><th>Status</th><th>Schedule</th></tr></thead><tbody>
        ${(Array.isArray(clientLoans)?clientLoans:[]).map(l => `<tr>
          <td><b>${cur(l.amount||l.loan_amount||0)}</b></td>
          <td>${l.interest_rate||0}%</td>
          <td style="color:var(--warning)">${cur(l.remaining_amount||0)}</td>
          <td><span class="badge badge-${l.status==='active'?'success':'warning'}">${l.status||'active'}</span></td>
          <td><button class="btn btn-ghost btn-sm" onclick="showLoanSchedule('${l.id}','${c.id}')"><i class="fas fa-calendar"></i> View</button></td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No loans</td></tr>'}
      </tbody></table></div>
    </div>

    <div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center"><h3><i class="fas fa-credit-card" style="margin-right:8px;color:#6366F1"></i> Stripe Payments</h3>
      <button class="btn btn-primary btn-sm" onclick="setupPaymentMethod('${c.id}')" data-testid="create-payment-link-btn"><i class="fas fa-link"></i> Create Payment Link</button>
    </div>
      <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);padding:12px;border-radius:8px">
        <i class="fas fa-credit-card" style="font-size:24px;color:#6366F1"></i>
        <div>
          <div style="font-weight:600">Stripe Checkout</div>
          <div style="font-size:12px;color:var(--text-muted)">Create payment links and send to clients. Payments auto-processed via Stripe webhook.</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <label style="font-size:13px"><input type="checkbox" ${c.auto_pay_enabled?'checked':''} onchange="toggleAutoPay('${c.id}', this.checked)" data-testid="auto-pay-toggle"> Auto-pay</label>
        </div>
      </div>
    </div>
    <div class="card"><div class="card-header"><h3>${t('payment_history')}</h3></div>
      <div class="table-wrap"><table data-testid="payments-table"><thead><tr><th>${t('date')}</th><th>${t('amount')}</th><th>${t('method')}</th></tr></thead><tbody>
        ${(Array.isArray(payments)?payments:[]).map(p => `<tr><td>${fmtDate(p.payment_date)}</td><td>${cur(p.amount)}</td><td>${esc(p.payment_method||'cash')}</td></tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">${t('no_payments')}</td></tr>`}
      </tbody></table></div>
    </div>`;
}

// Client actions
async function toggleLock(id, lock) {
  try {
    if (lock) {
      // Show lock options dialog
      const reason = prompt('Lock reason:\n1. manual\n2. overdue_payment\n3. policy_violation\n4. suspicious_activity\n\nEnter reason (or press Enter for manual):', 'manual');
      const message = prompt('Lock message for client (optional):', '');
      const tempStr = prompt('Temporary lock? Enter hours (or leave empty for permanent):', '');
      
      let url = `/clients/${id}/lock?reason=${reason || 'manual'}`;
      if (message) url += `&message=${encodeURIComponent(message)}`;
      if (tempStr && parseInt(tempStr) > 0) {
        url += `&temporary=true&unlock_after_hours=${parseInt(tempStr)}`;
      }
      await api('POST', url);
      toast(t('device_locked'));
    } else {
      await api('POST', `/clients/${id}/unlock`);
      toast(t('device_unlocked'));
    }
    state.selectedClient = { ...state.selectedClient, is_locked: lock };
    renderClientDetail(document.getElementById('page-content'));
  } catch(e) { toast(e.message, 'error'); }
}

async function showLockHistory(clientId) {
  try {
    const data = await api('GET', `/clients/${clientId}/lock-history?limit=20`);
    const history = data.history || [];
    let html = '<div style="max-height:300px;overflow-y:auto"><table><thead><tr><th>Action</th><th>Reason</th><th>Message</th><th>Time</th></tr></thead><tbody>';
    if (history.length === 0) {
      html += '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No lock history</td></tr>';
    } else {
      history.forEach(h => {
        const badge = h.action === 'lock' ? 'badge-danger' : 'badge-success';
        html += `<tr>
          <td><span class="badge ${badge}">${h.action}</span></td>
          <td>${(h.reason || '-').replace(/_/g, ' ')}</td>
          <td>${h.message || '-'}</td>
          <td>${fmtDate(h.timestamp)}</td>
        </tr>`;
      });
    }
    html += '</tbody></table></div>';
    
    state.modal = { title: 'Lock/Unlock History', body: html };
    renderModal();
  } catch(e) { toast(e.message, 'error'); }
}

async function recordPayment(clientId) {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  if (!amount || amount <= 0) { toast(t('enter_valid_amount'), 'error'); return; }
  const method = document.getElementById('pay-method')?.value || 'cash';
  try {
    await api('POST', '/loans/payment', { client_id: clientId, amount, payment_method: method });
    toast(t('payment_recorded'));
    // Refresh client data
    const data = await api('GET', '/clients');
    state.clients = data.clients || [];
    state.selectedClient = state.clients.find(c => c.id === clientId);
    renderClientDetail(document.getElementById('page-content'));
  } catch(e) { toast(e.message, 'error'); }
}

async function setupPaymentMethod(clientId) {
  try {
    const amount = parseFloat(prompt('Enter payment amount (EUR):', state.selectedClient?.monthly_emi || '0'));
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    toast('Creating Stripe payment link...');
    const result = await api('POST', `/clients/${clientId}/create-payment-link`, {
      amount,
      description: `Payment - ${state.selectedClient?.name || 'Client'}`,
    });
    // Show the payment link
    const html = `
      <div style="text-align:center;padding:16px">
        <i class="fas fa-credit-card" style="font-size:48px;color:#6366F1;margin-bottom:16px"></i>
        <h3 style="margin-bottom:8px">Payment Link Created</h3>
        <p style="color:var(--text-muted);margin-bottom:16px">Amount: <strong>${result.amount.toFixed(2)} ${result.currency.toUpperCase()}</strong></p>
        <a href="${result.checkout_url}" target="_blank" class="btn btn-primary" style="display:inline-block;margin-bottom:16px;text-decoration:none" data-testid="open-stripe-link">
          <i class="fas fa-external-link-alt"></i> Open Stripe Payment Page
        </a>
        <div style="background:var(--bg-input);padding:12px;border-radius:8px;margin-bottom:12px;text-align:left">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Payment Link (share with client):</div>
          <input type="text" value="${result.checkout_url}" onclick="this.select()" style="width:100%;font-size:11px" readonly data-testid="payment-link-input">
        </div>
        <p style="font-size:12px;color:var(--text-muted)">After the client completes payment, it will be automatically reflected in their balance.</p>
      </div>`;
    state.modal = { title: 'Stripe Payment Link', body: html };
    renderModal();
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleAutoPay(clientId, enabled) {
  try {
    await api('POST', `/clients/${clientId}/toggle-autopay`, { enabled });
    toast(enabled ? 'Auto-pay enabled' : 'Auto-pay disabled');
    if (state.selectedClient) state.selectedClient.auto_pay_enabled = enabled;
  } catch(e) { toast(e.message, 'error'); }
}

async function chargeClientCard(clientId) {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  if (!amount || amount <= 0) { toast('Enter an amount to charge', 'error'); return; }
  try {
    toast('Creating payment link...');
    const result = await api('POST', `/clients/${clientId}/create-payment-link`, {
      amount,
      description: `Manual charge - ${state.selectedClient?.name || 'Client'}`,
    });
    window.open(result.checkout_url, '_blank');
    toast(`Payment link created for ${amount.toFixed(2)} EUR`);
  } catch(e) { toast(e.message, 'error'); }
}

async function sendReminder(clientId, type) {
  try {
    if (type === 'email') {
      const res = await api('POST', `/reminders/send-email/${clientId}`);
      toast(res.message || 'Email sent');
    } else {
      const res = await api('GET', `/reminders/whatsapp-link/${clientId}`);
      if (res.deep_link) window.open(res.deep_link, '_blank');
      else toast('No phone number', 'error');
    }
  } catch(e) { toast(e.message, 'error'); }
}

function downloadContract(clientId) {
  window.open(`${API_BASE}/contracts/${clientId}/download?admin_token=${state.token}&language=${state.language}`, '_blank');
}

function showAddClient() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <h3>${t('add_new_client')}</h3>
    <form id="add-client-form">
      <div class="form-row">
        <div class="form-group"><label>${t('name_required')}</label><input id="nc-name" required data-testid="new-client-name"></div>
        <div class="form-group"><label>${t('phone')}</label><input id="nc-phone" data-testid="new-client-phone"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('email')}</label><input id="nc-email" type="email" data-testid="new-client-email"></div>
        <div class="form-group"><label>${t('id_code')}</label><input id="nc-birth" data-testid="new-client-birth"></div>
      </div>
      <div class="form-group"><label>${t('address')}</label><input id="nc-addr" data-testid="new-client-address"></div>
      <div class="form-row">
        <div class="form-group"><label>${t('loan_amount_eur')} (&#8364;)</label><input id="nc-loan" type="number" step="0.01" data-testid="new-client-loan"></div>
        <div class="form-group"><label>${t('interest_rate_pct')}</label><input id="nc-rate" type="number" step="0.1" data-testid="new-client-rate"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal()">${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="save-client-btn"><i class="fas fa-save"></i> ${t('save')}</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  document.getElementById('add-client-form').onsubmit = async(e) => {
    e.preventDefault();
    try {
      await api('POST', '/clients', {
        name: document.getElementById('nc-name').value,
        phone: document.getElementById('nc-phone').value,
        email: document.getElementById('nc-email').value,
        birth_number: document.getElementById('nc-birth').value,
        address: document.getElementById('nc-addr').value,
        loan_amount: parseFloat(document.getElementById('nc-loan').value) || 0,
        interest_rate: parseFloat(document.getElementById('nc-rate').value) || 0,
      });
      toast(t('client_added'));
      closeModal();
      navigate('clients');
    } catch(err) { toast(err.message, 'error'); }
  };
}

function showEditClient(clientId) {
  const c = state.selectedClient;
  if (!c) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <h3>${t('edit_client')}</h3>
    <form id="edit-client-form">
      <div class="form-row">
        <div class="form-group"><label>${t('name')}</label><input id="ec-name" value="${esc(c.name||'')}" data-testid="edit-client-name"></div>
        <div class="form-group"><label>${t('phone')}</label><input id="ec-phone" value="${esc(c.phone||'')}" data-testid="edit-client-phone"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('email')}</label><input id="ec-email" value="${esc(c.email||'')}" data-testid="edit-client-email"></div>
        <div class="form-group"><label>${t('address')}</label><input id="ec-addr" value="${esc(c.address||'')}" data-testid="edit-client-address"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal()">${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="save-edit-btn"><i class="fas fa-save"></i> ${t('save')}</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  document.getElementById('edit-client-form').onsubmit = async(e) => {
    e.preventDefault();
    try {
      await api('PUT', `/clients/${clientId}`, {
        name: document.getElementById('ec-name').value,
        phone: document.getElementById('ec-phone').value,
        email: document.getElementById('ec-email').value,
        address: document.getElementById('ec-addr').value,
      });
      toast(t('client_updated'));
      closeModal();
      const data = await api('GET', '/clients');
      state.clients = data.clients || [];
      state.selectedClient = state.clients.find(c => c.id === clientId);
      renderClientDetail(document.getElementById('page-content'));
    } catch(err) { toast(err.message, 'error'); }
  };
}

function closeModal() { document.getElementById('modal-overlay')?.remove(); }

function renderModal() {
  // Generic modal renderer for state.modal
  if (!state.modal) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="margin:0">${state.modal.title || 'Modal'}</h3>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()" style="padding:4px 8px"><i class="fas fa-times"></i></button>
    </div>
    <div>${state.modal.body || ''}</div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

// Loan Plans
async function renderLoanPlans(el) {
  const plans = await api('GET', '/loan-plans');
  el.innerHTML = `
    <div class="page-header"><h2>${t('loan_plans_title')}</h2><p>${t('loan_plans_subtitle')}</p></div>
    <div class="card"><div class="table-wrap"><table data-testid="loan-plans-table">
      <thead><tr><th>${t('name')}</th><th>${t('interest_rate_col')}</th><th>${t('tenure')}</th><th>${t('processing_fee')}</th><th>${t('late_fee_col')}</th><th>${t('status')}</th></tr></thead>
      <tbody>${(Array.isArray(plans)?plans:[]).map(p => `<tr>
        <td><b>${esc(p.name)}</b></td><td>${p.interest_rate}%</td><td>${p.min_tenure_months}-${p.max_tenure_months} mo</td>
        <td>${p.processing_fee_percent}%</td><td>${p.late_fee_percent}%</td>
        <td><span class="badge badge-${p.is_active?'success':'warning'}">${p.is_active?t('active'):t('inactive')}</span></td>
      </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">${t('no_loan_plans')}</td></tr>`}</tbody>
    </table></div></div>`;
}

// Reminders
async function renderReminders(el) {
  const [pending, config] = await Promise.all([
    api('GET', '/reminders/pending'),
    api('GET', '/reminders/config')
  ]);
  const s = pending.summary;
  el.innerHTML = `
    <div class="page-header"><h2>${t('reminders_title')}</h2><p>${t('reminders_subtitle')}</p></div>
    <div class="stats-grid">
      <div class="stat-card danger"><div class="stat-label">${t('overdue')}</div><div class="stat-value">${s.overdue_count}</div></div>
      <div class="stat-card warning"><div class="stat-label">${t('due_today_label')}</div><div class="stat-value">${s.due_today_count}</div></div>
      <div class="stat-card accent"><div class="stat-label">${t('due_soon')}</div><div class="stat-value">${s.due_soon_count}</div></div>
      <div class="stat-card"><div class="stat-label">${t('upcoming')}</div><div class="stat-value">${s.upcoming_count}</div></div>
    </div>
    <div class="card"><div class="card-header"><h3>${t('integration_status')}</h3></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span class="badge badge-${config.email_configured?'success':'danger'}"><i class="fas fa-envelope"></i> ${t('email')} ${config.email_configured?t('email_connected'):t('email_not_configured')}</span>
        <span class="badge badge-${config.push_configured?'success':'danger'}"><i class="fas fa-bell"></i> ${t('push')} ${config.push_configured?t('push_ready'):t('push_unavailable')}</span>
        <span class="badge badge-${config.whatsapp_configured?'success':'warning'}"><i class="fab fa-whatsapp"></i> ${t('whatsapp')} ${config.whatsapp_configured?t('whatsapp_connected'):t('whatsapp_deep_link')}</span>
      </div>
    </div>
    <div class="action-row" style="margin-bottom:16px">
      <button class="btn btn-primary btn-sm" onclick="sendBulkEmail()" data-testid="bulk-email-btn"><i class="fas fa-envelope"></i> ${t('send_all_emails')}</button>
      <button class="btn btn-outline btn-sm" onclick="sendBulkPush()" data-testid="bulk-push-btn"><i class="fas fa-bell"></i> ${t('send_all_push')}</button>
    </div>
    ${renderReminderSection(t('overdue'), pending.overdue, 'danger')}
    ${renderReminderSection(t('due_today_label'), pending.due_today, 'warning')}
    ${renderReminderSection(t('due_soon_days'), pending.due_soon, 'info')}`;
}

function renderReminderSection(title, clients, type) {
  if (!clients?.length) return '';
  return `<div class="card"><div class="card-header"><h3>${title}</h3><span class="badge badge-${type}">${clients.length}</span></div>
    <div class="table-wrap"><table><thead><tr><th>${t('client')}</th><th>${t('phone')}</th><th>${t('outstanding')}</th><th>${t('due_date')}</th><th>${t('actions')}</th></tr></thead><tbody>
      ${clients.map(c => `<tr><td>${esc(c.client_name)}</td><td>${esc(c.phone||'-')}</td><td>${cur(c.outstanding_balance)}</td><td>${fmtDate(c.next_payment_due)}</td>
        <td class="action-row"><button class="btn btn-ghost btn-sm" onclick="sendReminder('${c.client_id}','email')"><i class="fas fa-envelope"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="sendReminder('${c.client_id}','whatsapp')"><i class="fab fa-whatsapp"></i></button></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

async function sendBulkEmail() {
  try { const r = await api('POST', '/reminders/send-bulk-email'); toast(`Sent ${r.sent} emails, ${r.failed} failed`); } catch(e) { toast(e.message, 'error'); }
}
async function sendBulkPush() {
  try { const r = await api('POST', '/reminders/send-push'); toast(r.message); } catch(e) { toast(e.message, 'error'); }
}

// Reports
async function renderReports(el) {
  const [collection, financial, clientsReport] = await Promise.all([
    api('GET', '/reports/collection'),
    api('GET', '/reports/financial'),
    api('GET', '/reports/clients')
  ]);
  const f = collection.financial || collection;
  const cs = clientsReport.summary;
  el.innerHTML = `
    <div class="page-header">
      <div><h2>${t('reports_title')}</h2><p>${t('reports_subtitle')}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="dropdown" style="position:relative;display:inline-block">
          <button class="btn btn-primary btn-sm" onclick="this.nextElementSibling.classList.toggle('show')" data-testid="export-pdf-btn"><i class="fas fa-file-pdf"></i> ${t('export_pdf')}</button>
          <div class="dropdown-menu" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:4px;z-index:100;min-width:160px">
            <a href="${API_BASE}/reports/export/pdf?admin_token=${state.token}&report_type=financial" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-pdf-financial">${t('tab_financial')}</a>
            <a href="${API_BASE}/reports/export/pdf?admin_token=${state.token}&report_type=clients" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-pdf-clients">${t('tab_clients')}</a>
            <a href="${API_BASE}/reports/export/pdf?admin_token=${state.token}&report_type=collection" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-pdf-collection">${t('collection_rate')}</a>
          </div>
        </div>
        <div class="dropdown" style="position:relative;display:inline-block">
          <button class="btn btn-outline btn-sm" onclick="this.nextElementSibling.classList.toggle('show')" data-testid="export-csv-btn"><i class="fas fa-file-csv"></i> ${t('export_csv')}</button>
          <div class="dropdown-menu" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:4px;z-index:100;min-width:160px">
            <a href="${API_BASE}/reports/export/csv?admin_token=${state.token}&report_type=financial" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-csv-financial">${t('tab_financial')}</a>
            <a href="${API_BASE}/reports/export/csv?admin_token=${state.token}&report_type=clients" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-csv-clients">${t('tab_clients')}</a>
            <a href="${API_BASE}/reports/export/csv?admin_token=${state.token}&report_type=collection" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-csv-collection">${t('collection_rate')}</a>
            <a href="${API_BASE}/reports/export/csv?admin_token=${state.token}&report_type=payments" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px" data-testid="export-csv-payments">${t('payments')}</a>
          </div>
        </div>
      </div>
    </div>
    <div class="tabs" data-testid="report-tabs">
      <button class="tab active" onclick="showReportTab(this,'tab-financial')">${t('tab_financial')}</button>
      <button class="tab" onclick="showReportTab(this,'tab-clients')">${t('tab_clients')}</button>
      <button class="tab" onclick="showReportTab(this,'tab-revenue')">${t('tab_revenue')}</button>
    </div>
    <div id="tab-financial">
      <div class="stats-grid">
        <div class="stat-card accent"><div class="stat-label">${t('total_disbursed')}</div><div class="stat-value">${cur(f.total_disbursed)}</div></div>
        <div class="stat-card success"><div class="stat-label">${t('total_collected')}</div><div class="stat-value">${cur(f.total_collected)}</div></div>
        <div class="stat-card warning"><div class="stat-label">${t('outstanding')}</div><div class="stat-value">${cur(f.total_outstanding)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('collection_rate')}</div><div class="stat-value">${(f.collection_rate||0).toFixed(1)}%</div></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">${t('interest_earned_label')}</div><div class="stat-value">${cur(financial.totals?.interest_earned||0)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('late_fees')}</div><div class="stat-value">${cur(f.total_late_fees||0)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('processing_fees')}</div><div class="stat-value">${cur(financial.totals?.processing_fees||0)}</div></div>
        <div class="stat-card success"><div class="stat-label">${t('total_revenue')}</div><div class="stat-value">${cur(financial.totals?.total_revenue||0)}</div></div>
      </div>
    </div>
    <div id="tab-clients" class="hidden">
      <div class="stats-grid">
        <div class="stat-card success"><div class="stat-label">${t('on_time')}</div><div class="stat-value">${cs.on_time_clients}</div></div>
        <div class="stat-card warning"><div class="stat-label">${t('at_risk')}</div><div class="stat-value">${cs.at_risk_clients}</div></div>
        <div class="stat-card danger"><div class="stat-label">${t('defaulted')}</div><div class="stat-value">${cs.defaulted_clients}</div></div>
        <div class="stat-card"><div class="stat-label">${t('completed')}</div><div class="stat-value">${cs.completed_clients}</div></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card accent"><div class="stat-label">${t('new_this_month')}</div><div class="stat-value">${cs.new_clients_this_month}</div></div>
        <div class="stat-card"><div class="stat-label">${t('repeat_customers')}</div><div class="stat-value">${cs.repeat_customers}</div></div>
      </div>
    </div>
    <div id="tab-revenue" class="hidden">
      <div class="card"><div class="card-header"><h3>${t('monthly_revenue')}</h3></div>
        <div class="table-wrap"><table><thead><tr><th>${t('month')}</th><th>${t('revenue')}</th><th>${t('payments')}</th><th>${t('interest')}</th><th>${t('principal')}</th></tr></thead><tbody>
          ${(financial.monthly_trend||[]).map(m => `<tr><td>${m.month}</td><td>${cur(m.revenue)}</td><td>${m.payments_count}</td><td>${cur(m.interest_earned)}</td><td>${cur(m.principal_collected)}</td></tr>`).join('')
          || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">${t('no_data')}</td></tr>`}
        </tbody></table></div>
      </div>
    </div>`;
}

function showReportTab(btn, tabId) {
  btn.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  ['tab-financial','tab-clients','tab-revenue'].forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', id !== tabId);
  });
}

// Devices
async function renderDevices(el) {
  const hb = await api('GET', '/heartbeat/summary');
  el.innerHTML = `
    <div class="page-header"><h2>${t('devices_title')}</h2><p>${hb.total_registered} ${t('registered_devices')}</p></div>
    <div class="stats-grid" data-testid="device-stats">
      <div class="stat-card success"><div class="stat-label">${t('online')}</div><div class="stat-value">${hb.online_count}</div><div class="stat-sub">< ${hb.thresholds.online_minutes} min</div></div>
      <div class="stat-card warning"><div class="stat-label">${t('warning_label')}</div><div class="stat-value">${hb.warning_count}</div><div class="stat-sub">${hb.thresholds.online_minutes}-${hb.thresholds.warning_minutes} min</div></div>
      <div class="stat-card danger"><div class="stat-label">${t('critical')}</div><div class="stat-value">${hb.critical_count}</div><div class="stat-sub">> ${hb.thresholds.warning_minutes} min</div></div>
    </div>
    ${renderDeviceSection(t('online'), hb.online, 'success')}
    ${renderDeviceSection(t('warning_label'), hb.warning, 'warning')}
    ${renderDeviceSection(t('critical_offline'), hb.critical, 'danger')}`;
}

function renderDeviceSection(title, devices, type) {
  if (!devices?.length) return '';
  return `<div class="card"><div class="card-header"><h3>${title}</h3><span class="badge badge-${type}">${devices.length}</span></div>
    <div class="table-wrap"><table><thead><tr><th>${t('client')}</th><th>${t('device_col')}</th><th>${t('last_seen')}</th><th>${t('lock_status')}</th></tr></thead><tbody>
      ${devices.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.device_model)}</td><td>${d.minutes_ago!==null? d.minutes_ago+' '+t('min_ago'):t('never')}</td>
        <td>${d.is_locked?`<span class="badge badge-danger">${t('locked')}</span>`:`<span class="badge badge-success">${t('unlocked')}</span>`}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

// Provisioning
async function renderProvisioning(el) {
  el.innerHTML = `
    <div class="page-header"><h2>${t('provisioning_title')}</h2><p>${t('provisioning_subtitle')}</p></div>
    <div class="tabs" data-testid="provisioning-tabs">
      <button class="tab active" onclick="showProvTab(this,'prov-qr')">${t('qr_code')}</button>
      <button class="tab" onclick="showProvTab(this,'prov-nfc')">${t('nfc_tag')}</button>
    </div>
    <div id="prov-qr">
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center">
            <i class="fas fa-qrcode" style="color:#fff;font-size:18px"></i>
          </div>
          <div><h3 style="margin:0">${t('qr_provisioning')}</h3><p style="margin:0;font-size:12px;color:var(--text-muted)">${t('provisioning_subtitle')}</p></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
          <div class="form-group"><label>${t('wifi_ssid')}</label><input id="qr-ssid" placeholder="${t('network_name')}" data-testid="qr-wifi-ssid"></div>
          <div class="form-group"><label>${t('wifi_password')}</label><input id="qr-pass" type="password" placeholder="${t('password')}" data-testid="qr-wifi-pass"></div>
          <div class="form-group"><label>${t('server_url_label')}</label><input id="qr-server" placeholder="https://api.example.com" value="${API_BASE}" data-testid="qr-server-url"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="generateQR()" data-testid="generate-qr-btn"><i class="fas fa-qrcode"></i> ${t('generate_qr')}</button>
          <span id="qr-status" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
        <div id="qr-result" style="margin-top:16px;text-align:center"></div>
      </div>
    </div>
    <div id="prov-nfc" class="hidden">
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);display:flex;align-items:center;justify-content:center">
            <i class="fas fa-wifi" style="color:#fff;font-size:18px"></i>
          </div>
          <div><h3 style="margin:0">${t('nfc_provisioning')}</h3><p style="margin:0;font-size:12px;color:var(--text-muted)">${t('provisioning_subtitle')}</p></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
          <div class="form-group"><label>${t('wifi_ssid')}</label><input id="nfc-ssid" placeholder="${t('network_name')}" data-testid="nfc-wifi-ssid"></div>
          <div class="form-group"><label>${t('wifi_password')}</label><input id="nfc-pass" type="password" placeholder="${t('password')}" data-testid="nfc-wifi-pass"></div>
          <div class="form-group"><label>${t('server_url_label')}</label><input id="nfc-server" placeholder="https://api.example.com" value="${API_BASE}" data-testid="nfc-server-url"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="generateNFC()" data-testid="generate-nfc-btn"><i class="fas fa-wifi"></i> ${t('generate_nfc')}</button>
          <span id="nfc-status" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
        <div id="nfc-result" style="margin-top:16px"></div>
      </div>
    </div>`;
}

function showProvTab(btn, tabId) {
  btn.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  ['prov-qr','prov-nfc'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', id !== tabId));
}

async function generateQR() {
  try {
    const ssid = document.getElementById('qr-ssid').value;
    const pass = document.getElementById('qr-pass').value;
    const data = await api('GET', `/provisioning/qr-code?wifi_ssid=${encodeURIComponent(ssid)}&wifi_password=${encodeURIComponent(pass)}`);
    document.getElementById('qr-result').innerHTML = `
      <div style="display:inline-block;background:var(--bg-card);border:2px solid var(--border);border-radius:12px;padding:16px">
        <img src="data:image/png;base64,${data.qr_code_base64}" style="max-width:280px;border-radius:8px" data-testid="qr-code-img">
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
          <a href="data:image/png;base64,${data.qr_code_base64}" download="paylock_qr.png" class="btn btn-outline btn-sm" data-testid="download-qr-btn"><i class="fas fa-download"></i> ${t('download')}</a>
        </div>
      </div>
      <div style="margin-top:12px;text-align:left;background:var(--bg-input);padding:16px;border-radius:8px">
        <b>${t('instructions_label')}:</b><ol style="margin:8px 0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.8">
          ${data.instructions.en.map(i => `<li>${i.substring(3)}</li>`).join('')}
        </ol>
      </div>`;
    toast(t('qr_generated'));
  } catch(e) { toast(e.message, 'error'); }
}

async function generateNFC() {
  try {
    const ssid = document.getElementById('nfc-ssid').value;
    const pass = document.getElementById('nfc-pass').value;
    const data = await api('GET', `/provisioning/nfc-payload?wifi_ssid=${encodeURIComponent(ssid)}&wifi_password=${encodeURIComponent(pass)}`);
    document.getElementById('nfc-result').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="label">${t('nfc_mime_type')}</div><div class="value" style="font-size:12px;word-break:break-all">${data.mime_type}</div></div>
        <div class="detail-item"><div class="label">${t('payload_size')}</div><div class="value">${data.payload_size_bytes} bytes</div></div>
      </div>
      <div style="margin-top:12px;background:var(--bg-input);padding:16px;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b style="font-size:13px">${t('nfc_payload')}</b>
          <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('nfc-payload-text').textContent);toast(t('copied'))"><i class="fas fa-copy"></i> ${t('copy_btn')}</button>
        </div>
        <pre id="nfc-payload-text" style="background:var(--bg);padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;color:var(--text-muted);white-space:pre-wrap">${esc(data.payload_text)}</pre>
      </div>
      <div style="margin-top:12px;background:var(--bg-input);padding:16px;border-radius:8px">
        <b>${t('instructions_label')}:</b><ol style="margin:8px 0 0 16px;color:var(--text-muted);font-size:13px;line-height:1.8">
          ${data.instructions.en.map(i => `<li>${i.substring(3)}</li>`).join('')}
        </ol>
      </div>`;
    toast(t('nfc_generated'));
  } catch(e) { toast(e.message, 'error'); }
}

// Settings
async function renderSettings(el) {
  const settings = await api('GET', '/admin/settings');
  const admin = await api('GET', '/admin/credits');
  el.innerHTML = `
    <div class="page-header"><h2>${t('settings_title')}</h2><p>${t('manage_account')}</p></div>
    <div class="card"><div class="card-header"><h3>${t('account')}</h3></div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">${t('role')}</div><div class="value">${admin.is_super_admin?t('super_admin'):t('admin_role')}</div></div>
      </div>
    </div>
    <div class="card"><div class="card-header"><h3>${t('language_label')}</h3></div>
      <div class="form-group"><label>${t('contract_portal_language')}</label>
        <select id="set-lang" style="width:100%;padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px" onchange="setPortalLanguage(this.value)" data-testid="settings-language">
          <option value="et" ${state.language==='et'?'selected':''}>Eesti (Estonian)</option>
          <option value="en" ${state.language==='en'?'selected':''}>English (EN)</option>
          <option value="no" ${state.language==='no'?'selected':''}>Norsk</option>
          <option value="sv" ${state.language==='sv'?'selected':''}>Svenska</option>
          <option value="da" ${state.language==='da'?'selected':''}>Dansk</option>
          <option value="fi" ${state.language==='fi'?'selected':''}>Suomi</option>
          <option value="lv" ${state.language==='lv'?'selected':''}>Latviešu</option>
          <option value="lt" ${state.language==='lt'?'selected':''}>Lietuvių</option>
          <option value="de" ${state.language==='de'?'selected':''}>Deutsch</option>
          <option value="de_at" ${state.language==='de_at'?'selected':''}>Österreichisch</option>
          <option value="de_ch" ${state.language==='de_ch'?'selected':''}>Schweizerdeutsch</option>
          <option value="cs" ${state.language==='cs'?'selected':''}>Čeština</option>
          <option value="pl" ${state.language==='pl'?'selected':''}>Polski</option>
          <option value="es" ${state.language==='es'?'selected':''}>Español</option>
          <option value="fr" ${state.language==='fr'?'selected':''}>Français</option>
          <option value="it" ${state.language==='it'?'selected':''}>Italiano</option>
        </select>
      </div>
    </div>
    <div class="card"><div class="card-header"><h3>${t('default_settings')}</h3></div>
      <div class="form-row" style="gap:16px">
        <div class="form-group"><label>${t('late_fee_pct')}</label><input id="set-late" type="number" step="0.1" value="${settings.default_late_fee_percent||2}" data-testid="settings-late-fee"></div>
        <div class="form-group"><label>${t('auto_lock_grace')}</label><input id="set-grace" type="number" value="${settings.default_auto_lock_grace_days||3}" data-testid="settings-grace-days"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="saveSettings()" data-testid="save-settings-btn"><i class="fas fa-save"></i> ${t('save_settings')}</button>
    </div>
    <div class="card"><div class="card-header"><h3><i class="fas fa-robot" style="margin-right:8px;color:var(--primary)"></i> Payment Automation</h3></div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Configure how payments are automatically processed, reminders sent, and overdue actions taken.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label><input type="checkbox" id="pa-auto-remind" ${settings.payment_auto_reminder_enabled!==false?'checked':''} data-testid="pa-auto-remind"> Auto-send payment reminders</label></div>
        <div class="form-group"><label>Remind days before due</label><input id="pa-remind-days" type="number" min="1" max="30" value="${settings.payment_auto_reminder_days_before||3}" data-testid="pa-remind-days"></div>
        <div class="form-group"><label><input type="checkbox" id="pa-auto-lock" ${settings.payment_auto_lock_enabled!==false?'checked':''} data-testid="pa-auto-lock"> Auto-lock on overdue (after grace period)</label></div>
        <div class="form-group"><label><input type="checkbox" id="pa-auto-late-fee" ${settings.payment_auto_late_fee_enabled!==false?'checked':''} data-testid="pa-auto-late-fee"> Auto-apply late fees</label></div>
        <div class="form-group"><label>Late fee frequency (days)</label><input id="pa-fee-freq" type="number" min="1" max="30" value="${settings.payment_late_fee_frequency_days||7}" data-testid="pa-fee-freq"></div>
        <div class="form-group" style="grid-column:span 2;background:rgba(16,185,129,0.08);padding:12px;border-radius:8px;border:1px solid rgba(16,185,129,0.2)">
          <label style="font-weight:600;color:#10B981"><input type="checkbox" id="pa-auto-charge" ${settings.payment_auto_charge_enabled?'checked':''} data-testid="pa-auto-charge"> <i class="fas fa-credit-card" style="margin-right:4px"></i> Auto-charge saved payment methods (Stripe)</label>
          <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0 24px">When enabled, clients with saved cards and auto-pay will be charged automatically on their due date.</p>
        </div>
        <div class="form-group"><label>Reminder channels</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label><input type="checkbox" id="pa-ch-push" ${(settings.payment_reminder_channels||['push','email']).includes('push')?'checked':''}> Push</label>
            <label><input type="checkbox" id="pa-ch-email" ${(settings.payment_reminder_channels||['push','email']).includes('email')?'checked':''}> Email</label>
            <label><input type="checkbox" id="pa-ch-telegram" ${(settings.payment_reminder_channels||[]).includes('telegram')?'checked':''}> Telegram</label>
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="saveAutomationSettings()" data-testid="save-automation-btn"><i class="fas fa-save"></i> Save Automation Settings</button>
    </div>
    <div class="card"><div class="card-header"><h3>${t('change_password')}</h3></div>
      <div class="form-group"><label>${t('current_password')}</label><input id="pw-current" type="password" data-testid="current-password"></div>
      <div class="form-group"><label>${t('new_password')}</label><input id="pw-new" type="password" data-testid="new-password"></div>
      <button class="btn btn-warning btn-sm" style="margin-top:8px" onclick="changePassword()" data-testid="change-password-btn"><i class="fas fa-key"></i> ${t('change_password')}</button>
    </div>
    <div class="card"><div class="card-header"><h3>${t('scheduled_reports')}</h3></div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${t('scheduled_reports_desc')}</p>
      <div class="form-row" style="gap:12px">
        <div class="form-group" style="flex:2"><label>${t('email_address')}</label><input id="rpt-email" type="email" placeholder="admin@example.com" data-testid="report-email"></div>
        <div class="form-group" style="flex:1"><label>${t('report_type_label')}</label>
          <select id="rpt-type" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="report-type-select">
            <option value="financial">${t('tab_financial')}</option>
            <option value="clients">${t('tab_clients')}</option>
            <option value="collection">${t('collection_rate')}</option>
          </select></div>
        <div class="form-group" style="flex:1"><label>${t('frequency')}</label>
          <select id="rpt-freq" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="report-freq-select">
            <option value="daily">${t('daily')}</option>
            <option value="weekly">${t('weekly')}</option>
            <option value="monthly">${t('monthly')}</option>
          </select></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="createReportSchedule()" data-testid="create-report-schedule-btn"><i class="fas fa-calendar-plus"></i> ${t('schedule_report')}</button>
        <button class="btn btn-outline btn-sm" onclick="sendReportNow()" data-testid="send-report-now-btn"><i class="fas fa-paper-plane"></i> ${t('send_now')}</button>
      </div>
      <div id="report-schedules-list" style="margin-top:12px"></div>
    </div>`;
  // Load existing report schedules
  loadReportSchedules();
}

async function saveSettings() {
  try {
    await api('PUT', `/admin/settings?default_late_fee_percent=${document.getElementById('set-late').value}&default_auto_lock_grace_days=${document.getElementById('set-grace').value}`);
    toast('Settings saved');
  } catch(e) { toast(e.message, 'error'); }
}

async function saveAutomationSettings() {
  try {
    const channels = [];
    if (document.getElementById('pa-ch-push').checked) channels.push('push');
    if (document.getElementById('pa-ch-email').checked) channels.push('email');
    if (document.getElementById('pa-ch-telegram').checked) channels.push('telegram');
    const params = new URLSearchParams({
      payment_auto_reminder_enabled: document.getElementById('pa-auto-remind').checked,
      payment_auto_reminder_days_before: document.getElementById('pa-remind-days').value,
      payment_auto_lock_enabled: document.getElementById('pa-auto-lock').checked,
      payment_auto_late_fee_enabled: document.getElementById('pa-auto-late-fee').checked,
      payment_late_fee_frequency_days: document.getElementById('pa-fee-freq').value,
      payment_reminder_channels: channels.join(','),
      payment_auto_charge_enabled: document.getElementById('pa-auto-charge').checked,
    });
    await api('PUT', `/admin/settings?${params.toString()}`);
    toast('Automation settings saved');
  } catch(e) { toast(e.message, 'error'); }
}

async function changePassword() {
  const curr = document.getElementById('pw-current').value;
  const newPw = document.getElementById('pw-new').value;
  if (!curr || !newPw) { toast('Fill both fields', 'error'); return; }
  try {
    await api('POST', '/admin/change-password', { current_password: curr, new_password: newPw });
    toast('Password changed');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
  } catch(e) { toast(e.message, 'error'); }
}

async function loadReportSchedules() {
  try {
    const data = await api('GET', '/report-schedules');
    const list = document.getElementById('report-schedules-list');
    if (!list) return;
    const scheds = data.schedules || [];
    if (!scheds.length) { list.innerHTML = `<p style="font-size:12px;color:var(--text-muted)">${t('no_scheduled_reports')}</p>`; return; }
    list.innerHTML = scheds.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-input);border-radius:8px;margin-bottom:6px">
        <div style="font-size:13px"><b>${esc(s.email)}</b> - ${s.report_type} (${s.frequency})</div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge badge-${s.is_active?'success':'danger'}">${s.is_active?t('active'):t('inactive')}</span>
          <button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:11px" onclick="deleteReportSchedule('${s.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');
  } catch(e) { /* ignore */ }
}

async function createReportSchedule() {
  const email = document.getElementById('rpt-email').value;
  if (!email) { toast('Enter email address', 'error'); return; }
  try {
    await api('POST', '/report-schedules', {
      email, report_type: document.getElementById('rpt-type').value,
      frequency: document.getElementById('rpt-freq').value, send_day: 1
    });
    toast(t('schedule_created'));
    loadReportSchedules();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteReportSchedule(id) {
  try {
    await api('DELETE', `/report-schedules/${id}`);
    toast(t('schedule_deleted'));
    loadReportSchedules();
  } catch(e) { toast(e.message, 'error'); }
}

async function sendReportNow() {
  const email = document.getElementById('rpt-email').value;
  if (!email) { toast('Enter email address', 'error'); return; }
  try {
    const result = await api('POST', '/report-schedules/send-now', {
      email, report_type: document.getElementById('rpt-type').value
    });
    if (result.success) toast(result.message);
    else toast(result.error || 'Failed', 'error');
  } catch(e) { toast(e.message, 'error'); }
}


function setPortalLanguage(lang) {
  state.language = lang;
  localStorage.setItem('plp_language', lang);
  toast(t('language_label') + ': ' + lang.toUpperCase());
  render(); // Re-render entire portal with new language
}

// ===================== TEAM MANAGEMENT =====================
async function renderTeam(el) {
  let check;
  try { check = await api('GET', '/team/enterprise-check'); } catch { check = { has_enterprise: false, is_super_admin: false }; }
  if (!check.has_enterprise && !check.is_super_admin) {
    el.innerHTML = `<div class="page-header" style="text-align:center;padding:48px"><i class="fas fa-lock" style="font-size:48px;color:var(--text-dim);margin-bottom:16px"></i>
        <h3>${t('enterprise_feature')}</h3><p style="color:var(--text-muted);margin-top:8px">${t('enterprise_desc')}</p></div>`;
    return;
  }
  const [roles, members] = await Promise.all([
    api('GET', '/team/roles'),
    api('GET', '/team/members')
  ]);
  window._teamRoles = roles.roles;
  window._teamMembers = members.members;
  window._teamPage = 1;
  window._teamPageSize = 5;
  window._teamCheck = check;
  renderTeamTable(el, check, members);
}

function renderTeamTable(el, check, members) {
  const allMembers = members.members || window._teamMembers || [];
  const page = window._teamPage || 1;
  const pageSize = window._teamPageSize || 5;
  const totalPages = Math.max(1, Math.ceil(allMembers.length / pageSize));
  const paged = allMembers.slice((page - 1) * pageSize, page * pageSize);

  el.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>${t('team_title')}</h2><p>${allMembers.length} ${t('team_members')}</p></div>
      ${check.is_super_admin ? `<button class="btn btn-primary btn-sm" onclick="showAddMember()" data-testid="add-member-btn"><i class="fas fa-user-plus"></i> ${t('add_member')}</button>` : ''}
    </div>
    <div class="card"><div class="table-wrap"><table data-testid="team-table">
      <thead><tr><th>${t('username')}</th><th>${t('name')}</th><th>${t('role')}</th><th>${t('email')}</th><th>${t('status')}</th>${check.is_super_admin?`<th>${t('actions')}</th>`:''}</tr></thead>
      <tbody>${paged.map(m => `<tr>
        <td><b>${esc(m.username)}</b></td>
        <td>${esc((m.first_name||'')+' '+(m.last_name||''))}</td>
        <td><span class="badge badge-info">${esc(m.role_label||m.role)}</span></td>
        <td>${esc(m.email||'-')}</td>
        <td><span class="badge badge-${m.is_active!==false?'success':'warning'}">${m.is_active!==false?t('active'):t('inactive')}</span></td>
        ${check.is_super_admin && !m.is_super_admin ? `<td class="action-row">
          <button class="btn btn-ghost btn-sm" onclick="editMember('${m.id}')" data-testid="edit-member-${m.id}"><i class="fas fa-edit"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="deleteMember('${m.id}','${esc(m.username)}')" data-testid="delete-member-${m.id}"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
        </td>` : '<td></td>'}
      </tr>`).join('')}</tbody>
    </table></div>
    ${totalPages > 1 ? `<div style="display:flex;justify-content:center;align-items:center;gap:8px;padding:16px">
      <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="teamPageNav(${page - 1})" data-testid="team-prev-page"><i class="fas fa-chevron-left"></i></button>
      <span style="font-size:13px;color:var(--text-muted)">${page} / ${totalPages}</span>
      <button class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="teamPageNav(${page + 1})" data-testid="team-next-page"><i class="fas fa-chevron-right"></i></button>
    </div>` : ''}
    </div>`;
}

function teamPageNav(page) {
  window._teamPage = page;
  const el = document.getElementById('main');
  renderTeamTable(el, window._teamCheck, { members: window._teamMembers });
}


function showAddMember() {
  const roles = window._teamRoles || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><h3>${t('add_team_member')}</h3>
    <form id="add-member-form">
      <div class="form-row"><div class="form-group"><label>Username *</label><input id="tm-user" required data-testid="tm-username"></div>
        <div class="form-group"><label>Password *</label><input id="tm-pass" type="password" required data-testid="tm-password"></div></div>
      <div class="form-row"><div class="form-group"><label>First Name</label><input id="tm-fname" data-testid="tm-fname"></div>
        <div class="form-group"><label>Last Name</label><input id="tm-lname" data-testid="tm-lname"></div></div>
      <div class="form-row"><div class="form-group"><label>Email</label><input id="tm-email" type="email" data-testid="tm-email"></div>
        <div class="form-group"><label>Role</label><select id="tm-role" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="tm-role">
          ${Object.entries(roles).filter(([k])=>k!=='super_admin').map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
        </select></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal()">${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="save-member-btn"><i class="fas fa-save"></i> Save</button></div>
    </form></div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  document.getElementById('add-member-form').onsubmit = async(e) => {
    e.preventDefault();
    try {
      await api('POST', '/team/members', {
        username: document.getElementById('tm-user').value,
        password: document.getElementById('tm-pass').value,
        first_name: document.getElementById('tm-fname').value,
        last_name: document.getElementById('tm-lname').value,
        email: document.getElementById('tm-email').value,
        role: document.getElementById('tm-role').value,
      });
      toast('Team member added'); closeModal(); navigate('team');
    } catch(err) { toast(err.message, 'error'); }
  };
}

async function editMember(memberId) {
  const m = (window._teamMembers||[]).find(x=>x.id===memberId);
  if (!m) return;
  const roles = window._teamRoles || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><h3>Edit Team Member</h3>
    <form id="edit-member-form">
      <div class="form-row"><div class="form-group"><label>First Name</label><input id="em-fname" value="${esc(m.first_name||'')}" data-testid="em-fname"></div>
        <div class="form-group"><label>Last Name</label><input id="em-lname" value="${esc(m.last_name||'')}" data-testid="em-lname"></div></div>
      <div class="form-row"><div class="form-group"><label>Email</label><input id="em-email" value="${esc(m.email||'')}" data-testid="em-email"></div>
        <div class="form-group"><label>Role</label><select id="em-role" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="em-role">
          ${Object.entries(roles).filter(([k])=>k!=='super_admin').map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v.label}</option>`).join('')}
        </select></div></div>
      <div class="form-group"><label>New Password (leave blank to keep)</label><input id="em-pass" type="password" data-testid="em-pass"></div>
      <div class="form-group"><label><input type="checkbox" id="em-active" ${m.is_active!==false?'checked':''} data-testid="em-active"> ${t('active_label')}</label></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal()">${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="save-edit-member-btn"><i class="fas fa-save"></i> Save</button></div>
    </form></div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  document.getElementById('edit-member-form').onsubmit = async(e) => {
    e.preventDefault();
    const data = {
      first_name: document.getElementById('em-fname').value,
      last_name: document.getElementById('em-lname').value,
      email: document.getElementById('em-email').value,
      role: document.getElementById('em-role').value,
      is_active: document.getElementById('em-active').checked,
    };
    const pw = document.getElementById('em-pass').value;
    if (pw) data.password = pw;
    try { await api('PUT', `/team/members/${memberId}`, data); toast('Member updated'); closeModal(); navigate('team'); } catch(err) { toast(err.message, 'error'); }
  };
}

async function deleteMember(id, name) {
  if (!confirm(`Remove team member "${name}"?`)) return;
  try { await api('DELETE', `/team/members/${id}`); toast('Member removed'); navigate('team'); } catch(e) { toast(e.message, 'error'); }
}

// ===================== DOCUMENTS =====================
async function renderDocuments(el) {
  const stats = await api('GET', '/documents/stats').catch(() => ({ total_documents: 0, total_size_mb: 0, by_type: {} }));
  el.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>${t('docs_title')}</h2><p>${stats.total_documents} ${t('documents')} (${stats.total_size_mb} MB)</p></div>
      <button class="btn btn-primary btn-sm" onclick="showUploadDoc()" data-testid="upload-doc-btn"><i class="fas fa-upload"></i> ${t('upload_document')}</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-label">${t('total_documents')}</div><div class="stat-value">${stats.total_documents}</div></div>
      <div class="stat-card"><div class="stat-label">${t('total_size')}</div><div class="stat-value">${stats.total_size_mb} MB</div></div>
      ${Object.entries(stats.by_type||{}).map(([t,v])=>`<div class="stat-card"><div class="stat-label">${esc(t)}</div><div class="stat-value">${v.count}</div></div>`).join('')}
    </div>
    <div class="card"><div class="card-header"><h3>Search Documents by Client</h3></div>
      <div class="search-bar"><input id="doc-client-search" placeholder="Enter client ID or search clients..." data-testid="doc-search"><button class="btn btn-primary btn-sm" onclick="searchClientDocs()" data-testid="doc-search-btn"><i class="fas fa-search"></i> Search</button></div>
      <div id="doc-results"></div>
    </div>`;
}

async function searchClientDocs() {
  const q = document.getElementById('doc-client-search').value.trim();
  if (!q) return;
  const container = document.getElementById('doc-results');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    // Try as client ID first
    const docs = await api('GET', `/documents/client/${q}`);
    if (docs.documents && docs.documents.length > 0) {
      container.innerHTML = `<table><thead><tr><th>${t('filename')}</th><th>${t('type')}</th><th>${t('size')}</th><th>${t('uploaded')}</th><th>${t('actions')}</th></tr></thead><tbody>
        ${docs.documents.map(d=>`<tr><td>${esc(d.filename)}</td><td><span class="badge badge-info">${esc(d.doc_type)}</span></td>
          <td>${(d.size/1024).toFixed(1)} KB</td><td>${fmtDate(d.uploaded_at)}</td>
          <td class="action-row"><a href="${API_BASE}/documents/${d.id}/download?admin_token=${state.token}" class="btn btn-ghost btn-sm" target="_blank"><i class="fas fa-download"></i></a>
          <button class="btn btn-ghost btn-sm" onclick="deleteDoc('${d.id}')"><i class="fas fa-trash" style="color:var(--danger)"></i></button></td></tr>`).join('')}
      </tbody></table>`;
    } else {
      container.innerHTML = '<p style="color:var(--text-muted)">No documents found for this client</p>';
    }
  } catch { container.innerHTML = '<p style="color:var(--text-muted)">Client not found or no documents</p>'; }
}

function showUploadDoc() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><h3>Upload Document</h3>
    <form id="upload-doc-form">
      <div class="form-group"><label>Client *</label>
        <div style="position:relative">
          <input id="ud-client-search" placeholder="Search clients by name..." autocomplete="off" data-testid="ud-client-search" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)">
          <input type="hidden" id="ud-client" required>
          <div id="ud-client-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:0 0 8px 8px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>
        </div>
      </div>
      <div class="form-row"><div class="form-group"><label>Document Type</label><select id="ud-type" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="ud-type">
        <option value="contract">Contract</option><option value="id_scan">ID Scan</option><option value="proof_of_income">Proof of Income</option><option value="other">Other</option>
      </select></div><div class="form-group"><label>Description</label><input id="ud-desc" data-testid="ud-desc"></div></div>
      <div class="form-group"><label>File (max 10MB)</label><input id="ud-file" type="file" required data-testid="ud-file" style="padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);width:100%"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal()">${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="upload-doc-submit"><i class="fas fa-upload"></i> Upload</button></div>
    </form></div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

  // Client search dropdown logic
  let allClients = [];
  (async () => {
    try {
      const data = await api('GET', '/clients');
      allClients = data.clients || [];
    } catch(e) { console.error('Failed to load clients:', e); }
  })();

  const searchInput = document.getElementById('ud-client-search');
  const dropdown = document.getElementById('ud-client-dropdown');
  const hiddenInput = document.getElementById('ud-client');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { dropdown.style.display = 'none'; return; }
    const matches = allClients.filter(c => c.name.toLowerCase().includes(q) || (c.phone||'').includes(q) || (c.id||'').includes(q)).slice(0, 10);
    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:10px;color:var(--text-muted)">No clients found</div>';
    } else {
      dropdown.innerHTML = matches.map(c => `<div class="client-dropdown-item" data-id="${c.id}" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'"><b>${esc(c.name)}</b> <span style="color:var(--text-muted);font-size:0.85em">${esc(c.phone||'')} - ${c.id.substring(0,8)}</span></div>`).join('');
    }
    dropdown.style.display = 'block';
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.client-dropdown-item');
    if (!item) return;
    const id = item.dataset.id;
    const client = allClients.find(c => c.id === id);
    searchInput.value = client ? client.name : id;
    hiddenInput.value = id;
    dropdown.style.display = 'none';
  });

  document.getElementById('upload-doc-form').onsubmit = async(e) => {
    e.preventDefault();
    if (!hiddenInput.value) { toast('Please select a client', 'error'); return; }
    const fd = new FormData();
    fd.append('admin_token', state.token);
    fd.append('client_id', hiddenInput.value);
    fd.append('doc_type', document.getElementById('ud-type').value);
    fd.append('description', document.getElementById('ud-desc').value);
    fd.append('file', document.getElementById('ud-file').files[0]);
    try {
      const res = await fetch(`${API_BASE}/documents/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast('Document uploaded'); closeModal(); navigate('documents');
    } catch(err) { toast(err.message, 'error'); }
  };
}

async function deleteDoc(id) {
  if (!confirm('Delete this document?')) return;
  try { await api('DELETE', `/documents/${id}`); toast('Document deleted'); navigate('documents'); } catch(e) { toast(e.message, 'error'); }
}

// ===================== BANK STATEMENT ANALYZER =====================
async function renderBankStatements(el) {
  // Load clients and analysis history in parallel
  let allClients = [];
  let history = [];
  try {
    const [clientData, histData] = await Promise.all([
      api('GET', '/clients'),
      api('GET', '/bank-statements/history').catch(() => [])
    ]);
    allClients = clientData.clients || [];
    history = Array.isArray(histData) ? histData : [];
  } catch(e) { console.error('Bank statements load error:', e); }

  el.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>Bank Statement Analyzer</h2><p>Upload and analyze bank statements with AI</p></div>
    </div>
    <div class="card" data-testid="bs-upload-card">
      <div class="card-header"><h3><i class="fas fa-file-invoice-dollar"></i> Analyze Statement</h3></div>
      <form id="bs-analyze-form" style="padding:0 20px 20px">
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Client (optional)</label>
            <div style="position:relative">
              <input id="bs-client-search" placeholder="Search clients..." autocomplete="off" data-testid="bs-client-search" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)">
              <input type="hidden" id="bs-client-id">
              <div id="bs-client-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:0 0 8px 8px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>
            </div>
          </div>
          <div class="form-group" style="flex:1">
            <label>Statement File (.pdf, .csv, .xml, .asice)</label>
            <input id="bs-file" type="file" accept=".pdf,.csv,.xml,.asice" required data-testid="bs-file" style="padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);width:100%">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="submit" class="btn btn-primary btn-sm" data-testid="bs-analyze-btn"><i class="fas fa-brain"></i> Analyze with AI</button>
        </div>
      </form>
    </div>
    <div id="bs-result" style="margin-top:16px"></div>
    <div class="card" style="margin-top:16px" data-testid="bs-history-card">
      <div class="card-header"><h3><i class="fas fa-history"></i> Analysis History</h3></div>
      <div id="bs-history-container">
        ${history.length > 0 ? `<div class="table-wrap"><table data-testid="bs-history-table">
          <thead><tr><th>Date</th><th>File</th><th>Client</th><th>Income</th><th>Expenses</th><th>Actions</th></tr></thead>
          <tbody>${history.map(h => {
            const a = h.analysis || {};
            const totalIncome = Array.isArray(a.income_categories) ? a.income_categories.reduce((s,c) => s + (c.total||0), 0) : 0;
            const totalExpense = Array.isArray(a.expense_categories) ? a.expense_categories.reduce((s,c) => s + (c.total||0), 0) : 0;
            const clientName = allClients.find(c => c.id === h.client_id)?.name || (h.client_id || '-');
            return `<tr>
              <td>${fmtDate(h.analyzed_at)}</td>
              <td>${esc(h.filename||'Unknown')}</td>
              <td>${esc(clientName)}</td>
              <td style="color:var(--success)">${cur(totalIncome)}</td>
              <td style="color:var(--danger)">${cur(totalExpense)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick='showBsDetail(${JSON.stringify(h).replace(/'/g,"\\'")})'><i class="fas fa-eye"></i></button></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p style="padding:20px;color:var(--text-muted)">No analyses yet. Upload a bank statement to get started.</p>'}
      </div>
    </div>`;

  // Client search dropdown for bank statement form
  const bsSearch = document.getElementById('bs-client-search');
  const bsDropdown = document.getElementById('bs-client-dropdown');
  const bsHidden = document.getElementById('bs-client-id');

  bsSearch.addEventListener('input', () => {
    const q = bsSearch.value.toLowerCase().trim();
    if (!q) { bsDropdown.style.display = 'none'; return; }
    const matches = allClients.filter(c => c.name.toLowerCase().includes(q) || (c.phone||'').includes(q)).slice(0, 10);
    bsDropdown.innerHTML = matches.length > 0
      ? matches.map(c => `<div class="client-dropdown-item" data-id="${c.id}" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'"><b>${esc(c.name)}</b> <span style="color:var(--text-muted);font-size:0.85em">${esc(c.phone||'')}</span></div>`).join('')
      : '<div style="padding:10px;color:var(--text-muted)">No clients found</div>';
    bsDropdown.style.display = 'block';
  });

  bsDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.client-dropdown-item');
    if (!item) return;
    const client = allClients.find(c => c.id === item.dataset.id);
    bsSearch.value = client ? client.name : item.dataset.id;
    bsHidden.value = item.dataset.id;
    bsDropdown.style.display = 'none';
  });

  // Form submission
  document.getElementById('bs-analyze-form').onsubmit = async(e) => {
    e.preventDefault();
    const file = document.getElementById('bs-file').files[0];
    if (!file) { toast('Please select a file', 'error'); return; }
    const resultDiv = document.getElementById('bs-result');
    resultDiv.innerHTML = '<div class="card" style="padding:30px;text-align:center"><div class="spinner"></div><p style="margin-top:12px;color:var(--text-muted)">Analyzing statement with AI... This may take up to 30 seconds.</p></div>';

    const fd = new FormData();
    fd.append('file', file);
    fd.append('admin_token', state.token);
    if (bsHidden.value) fd.append('client_id', bsHidden.value);

    try {
      const res = await fetch(`${API_BASE}/bank-statements/analyze?admin_token=${encodeURIComponent(state.token)}${bsHidden.value ? '&client_id=' + encodeURIComponent(bsHidden.value) : ''}`, {
        method: 'POST', body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Analysis failed');
      renderBsResult(resultDiv, data);
    } catch(err) { resultDiv.innerHTML = `<div class="card" style="padding:20px"><p class="error-msg"><i class="fas fa-exclamation-triangle"></i> ${esc(err.message)}</p></div>`; }
  };
}

function renderBsResult(container, data) {
  const a = data.analysis || {};
  const income = Array.isArray(a.income_categories) ? a.income_categories : [];
  const expenses = Array.isArray(a.expense_categories) ? a.expense_categories : [];
  const totalIncome = income.reduce((s,c) => s + (c.total||0), 0);
  const totalExpense = expenses.reduce((s,c) => s + (c.total||0), 0);
  const netFlow = totalIncome - totalExpense;

  container.innerHTML = `
    <div class="card" data-testid="bs-result-card">
      <div class="card-header"><h3><i class="fas fa-chart-pie"></i> Analysis Result — ${esc(data.filename||'')}</h3></div>
      <div class="stats-grid" style="padding:0 20px">
        <div class="stat-card" style="border-left:3px solid var(--success)"><div class="stat-label">Total Income</div><div class="stat-value" style="color:var(--success)">${cur(totalIncome)}</div></div>
        <div class="stat-card" style="border-left:3px solid var(--danger)"><div class="stat-label">Total Expenses</div><div class="stat-value" style="color:var(--danger)">${cur(totalExpense)}</div></div>
        <div class="stat-card" style="border-left:3px solid ${netFlow >= 0 ? 'var(--success)' : 'var(--danger)'}"><div class="stat-label">Net Cash Flow</div><div class="stat-value" style="color:${netFlow >= 0 ? 'var(--success)' : 'var(--danger)'}">${cur(netFlow)}</div></div>
      </div>
      ${a.period ? `<p style="padding:0 20px;color:var(--text-muted)">Period: ${esc(a.period)}</p>` : ''}
      ${a.account_holder ? `<p style="padding:0 20px;color:var(--text-muted)">Account: ${esc(a.account_holder)}</p>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px">
        <div>
          <h4 style="margin-bottom:8px;color:var(--success)"><i class="fas fa-arrow-down"></i> Income Categories</h4>
          ${income.length > 0 ? `<table><thead><tr><th>Category</th><th>Amount</th><th>Count</th></tr></thead><tbody>
            ${income.map(c => `<tr><td>${esc(c.category||'Other')}</td><td style="color:var(--success)">${cur(c.total||0)}</td><td>${c.count||'-'}</td></tr>`).join('')}
          </tbody></table>` : '<p style="color:var(--text-muted)">No income detected</p>'}
        </div>
        <div>
          <h4 style="margin-bottom:8px;color:var(--danger)"><i class="fas fa-arrow-up"></i> Expense Categories</h4>
          ${expenses.length > 0 ? `<table><thead><tr><th>Category</th><th>Amount</th><th>Count</th></tr></thead><tbody>
            ${expenses.map(c => `<tr><td>${esc(c.category||'Other')}</td><td style="color:var(--danger)">${cur(c.total||0)}</td><td>${c.count||'-'}</td></tr>`).join('')}
          </tbody></table>` : '<p style="color:var(--text-muted)">No expenses detected</p>'}
        </div>
      </div>
      ${a.summary ? `<div style="padding:0 20px 20px"><h4 style="margin-bottom:8px"><i class="fas fa-clipboard-list"></i> AI Summary</h4><p style="color:var(--text-muted);line-height:1.6">${esc(a.summary)}</p></div>` : ''}
    </div>`;
}

function showBsDetail(data) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';
  const resultDiv = document.createElement('div');
  resultDiv.style.cssText = 'max-width:900px;max-height:80vh;overflow-y:auto;margin:auto';
  renderBsResult(resultDiv, data);
  overlay.innerHTML = `<div class="modal" style="max-width:950px;max-height:85vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3>Analysis Details</h3>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    ${resultDiv.innerHTML}
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}
async function renderImport(el) {
  el.innerHTML = `
    <div class="page-header"><h2>${t('import_title')}</h2><p>${t('import_subtitle')}</p></div>
    <div class="card"><div class="card-header"><h3>CSV Template</h3><button class="btn btn-outline btn-sm" onclick="downloadTemplate()" data-testid="download-template-btn"><i class="fas fa-download"></i> Download Template</button></div>
      <p style="color:var(--text-muted);font-size:13px">Expected columns: <b>name</b>, phone, email, address, birth_number, loan_amount, interest_rate, telegram_chat_id</p>
    </div>
    <div class="card"><div class="card-header"><h3>Import Clients</h3></div>
      <form id="import-form" style="display:flex;gap:16px;align-items:end;flex-wrap:wrap">
        <div class="form-group" style="flex:1;min-width:200px"><label>CSV File</label><input id="csv-file" type="file" accept=".csv" required data-testid="csv-file" style="padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);width:100%"></div>
        <div class="form-group"><label><input type="checkbox" id="csv-skip-dupes" checked data-testid="csv-skip-dupes"> Skip duplicates</label></div>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="import-btn"><i class="fas fa-file-import"></i> Import</button>
      </form>
      <div id="import-result" style="margin-top:16px"></div>
    </div>`;
  document.getElementById('import-form').onsubmit = async(e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('admin_token', state.token);
    fd.append('file', document.getElementById('csv-file').files[0]);
    fd.append('skip_duplicates', document.getElementById('csv-skip-dupes').checked ? 'true' : 'false');
    document.getElementById('import-result').innerHTML = '<div class="spinner"></div> Importing...';
    try {
      const res = await fetch(`${API_BASE}/import/clients/csv`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      document.getElementById('import-result').innerHTML = `
        <div class="stats-grid">
          <div class="stat-card success"><div class="stat-label">Imported</div><div class="stat-value">${data.imported}</div></div>
          <div class="stat-card warning"><div class="stat-label">Skipped</div><div class="stat-value">${data.skipped}</div></div>
          <div class="stat-card danger"><div class="stat-label">Errors</div><div class="stat-value">${data.errors?.length||0}</div></div>
          <div class="stat-card"><div class="stat-label">Total Rows</div><div class="stat-value">${data.total_rows}</div></div>
        </div>
        ${data.errors?.length ? `<div class="card" style="margin-top:12px"><h4 style="color:var(--danger);margin-bottom:8px">Errors</h4>
          ${data.errors.map(e=>`<p style="font-size:12px;color:var(--text-muted)">Row ${e.row}: ${e.error}</p>`).join('')}</div>` : ''}`;
      toast(`Imported ${data.imported} clients`);
    } catch(err) { document.getElementById('import-result').innerHTML = `<p class="error-msg">${err.message}</p>`; }
  };
}

async function downloadTemplate() {
  try {
    const data = await api('GET', '/import/template');
    const blob = new Blob([data.template], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'client_import_template.csv';
    a.click();
    toast('Template downloaded');
  } catch(e) { toast(e.message, 'error'); }
}

// ===================== TELEGRAM =====================
async function renderTelegram(el) {
  const botInfo = await api('GET', '/telegram/bot-info').catch(() => ({ configured: false }));
  el.innerHTML = `
    <div class="page-header"><h2>${t('tg_title')}</h2><p>${t('tg_subtitle')}</p></div>
    <div class="card"><div class="card-header"><h3>Bot Status</h3></div>
      ${botInfo.configured ?
        `<div style="display:flex;align-items:center;gap:12px"><span class="badge badge-success"><i class="fas fa-check-circle"></i> Connected</span>
         <span style="color:var(--text-muted);font-size:13px">Bot: <b>@${esc(botInfo.bot_username||'')}</b> (${esc(botInfo.bot_name||'')})</span></div>` :
        `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Not Configured</span>
         <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Set TELEGRAM_BOT_TOKEN in environment to enable.</p>`}
    </div>
    <div class="card"><div class="card-header"><h3>Link Client to Telegram</h3></div>
      <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <div class="form-group" style="flex:1;margin:0"><label>Client ID</label><input id="tg-client" data-testid="tg-client-id"></div>
        <div class="form-group" style="flex:1;margin:0"><label>Telegram Chat ID</label><input id="tg-chatid" data-testid="tg-chat-id"></div>
        <button class="btn btn-primary btn-sm" onclick="linkTelegram()" data-testid="tg-link-btn"><i class="fas fa-link"></i> Link</button>
      </div>
    </div>
    <div class="card"><div class="card-header"><h3>Send Reminders</h3>
      <button class="btn btn-primary btn-sm" onclick="sendBulkTelegram()" data-testid="tg-bulk-btn"><i class="fas fa-paper-plane"></i> Send All Reminders</button></div>
      <p style="color:var(--text-muted);font-size:13px">Sends payment reminders to all clients with linked Telegram accounts and outstanding balance.</p>
      <div id="tg-result" style="margin-top:12px"></div>
    </div>
    <div class="card"><div class="card-header"><h3>Send to Individual Client</h3></div>
      <div style="display:flex;gap:12px;align-items:end">
        <div class="form-group" style="flex:1;margin:0"><label>Client ID</label><input id="tg-send-client" data-testid="tg-send-client-id"></div>
        <button class="btn btn-outline btn-sm" onclick="sendTelegramSingle()" data-testid="tg-send-btn"><i class="fas fa-paper-plane"></i> Send</button>
      </div>
    </div>`;
}

async function linkTelegram() {
  const clientId = document.getElementById('tg-client').value.trim();
  const chatId = document.getElementById('tg-chatid').value.trim();
  if (!clientId || !chatId) { toast('Both fields required', 'error'); return; }
  try { await api('POST', '/telegram/link-client', { client_id: clientId, chat_id: chatId }); toast('Telegram linked'); } catch(e) { toast(e.message, 'error'); }
}

async function sendBulkTelegram() {
  try {
    const r = await api('POST', '/telegram/send-bulk');
    document.getElementById('tg-result').innerHTML = `<div class="stats-grid">
      <div class="stat-card success"><div class="stat-label">Sent</div><div class="stat-value">${r.sent}</div></div>
      <div class="stat-card danger"><div class="stat-label">Failed</div><div class="stat-value">${r.failed}</div></div>
      <div class="stat-card"><div class="stat-label">Eligible</div><div class="stat-value">${r.total_eligible}</div></div></div>`;
    toast(`Sent ${r.sent} Telegram reminders`);
  } catch(e) { toast(e.message, 'error'); }
}

async function sendTelegramSingle() {
  const clientId = document.getElementById('tg-send-client').value.trim();
  if (!clientId) { toast('Enter a client ID', 'error'); return; }
  try { await api('POST', `/telegram/send/${clientId}`); toast('Telegram reminder sent'); } catch(e) { toast(e.message, 'error'); }
}

// ===================== PAYMENT SCHEDULES =====================
async function renderSchedules(el) {
  const [data, due] = await Promise.all([
    api('GET', '/schedules'),
    api('GET', '/schedules/due/today').catch(() => ({ due_schedules: [], count: 0 }))
  ]);
  el.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>${t('sched_title')}</h2><p>${data.total} ${t('active_schedules')}</p></div>
      <div class="action-row">
        <button class="btn btn-outline btn-sm" onclick="processScheduledReminders()" data-testid="process-reminders-btn"><i class="fas fa-sync"></i> Process Reminders</button>
        <button class="btn btn-primary btn-sm" onclick="showAddSchedule()" data-testid="add-schedule-btn"><i class="fas fa-plus"></i> New Schedule</button>
      </div>
    </div>
    ${due.count > 0 ? `<div class="card" style="border-left:3px solid var(--warning);margin-bottom:16px"><div class="card-header"><h3 style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> ${due.count} Payments Due Today</h3></div>
      <div class="table-wrap"><table><thead><tr><th>${t('client')}</th><th>${t('amount')}</th><th>${t('next_due')}</th></tr></thead><tbody>
        ${due.due_schedules.map(s => `<tr><td><b>${esc(s.client_name)}</b></td><td>${cur(s.amount)}</td><td>${s.next_due_date||'-'}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
    <div class="card"><div class="table-wrap"><table data-testid="schedules-table">
      <thead><tr><th>${t('client')}</th><th>${t('amount')}</th><th>${t('frequency')}</th><th>${t('day')}</th><th>${t('next_due')}</th><th>${t('auto_remind')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
      <tbody>${data.schedules.length ? data.schedules.map(s => `<tr>
        <td><b>${esc(s.client_name||s.client_id)}</b></td>
        <td>${cur(s.amount)}</td>
        <td><span class="badge badge-info">${esc(s.frequency)}</span></td>
        <td>${s.day_of_month}</td>
        <td>${s.next_due_date||'-'}</td>
        <td>${s.auto_reminder ? '<span class="badge badge-success">On</span>' : '<span class="badge badge-warning">Off</span>'}</td>
        <td><span class="badge badge-${s.is_active?'success':'warning'}">${s.is_active?'Active':'Paused'}</span></td>
        <td class="action-row">
          <button class="btn btn-ghost btn-sm" onclick="toggleSchedule('${s.id}',${!s.is_active})" data-testid="toggle-schedule-${s.id}"><i class="fas fa-${s.is_active?'pause':'play'}"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="deleteSchedule('${s.id}')" data-testid="delete-schedule-${s.id}"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
        </td>
      </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No schedules yet. Create one to automate payment tracking.</td></tr>'}</tbody>
    </table></div></div>`;
}

function showAddSchedule() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><h3>New Payment Schedule</h3>
    <form id="add-schedule-form">
      <div class="form-group"><label>Client ID *</label><input id="sched-client" required data-testid="sched-client-id"></div>
      <div class="form-row">
        <div class="form-group"><label>Amount (leave blank for EMI)</label><input id="sched-amount" type="number" step="0.01" data-testid="sched-amount"></div>
        <div class="form-group"><label>${t('frequency')}</label><select id="sched-freq" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="sched-freq">
          <option value="monthly">${t('monthly')}</option><option value="biweekly">${t('biweekly')}</option><option value="weekly">${t('weekly')}</option>
        </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Day of Month</label><input id="sched-day" type="number" min="1" max="28" value="1" data-testid="sched-day"></div>
        <div class="form-group"><label>Remind Days Before</label><input id="sched-remind" type="number" min="0" max="14" value="3" data-testid="sched-remind-days"></div>
      </div>
      <div class="form-group"><label>Reminder Channels</label>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <label><input type="checkbox" id="sched-ch-push" checked> Push</label>
          <label><input type="checkbox" id="sched-ch-email"> Email</label>
          <label><input type="checkbox" id="sched-ch-telegram"> Telegram</label>
        </div>
      </div>
      <div class="form-group"><label><input type="checkbox" id="sched-auto" checked data-testid="sched-auto-remind"> Auto-send reminders</label></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal()">${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-sm" data-testid="save-schedule-btn"><i class="fas fa-save"></i> Create</button></div>
    </form></div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  document.getElementById('add-schedule-form').onsubmit = async(e) => {
    e.preventDefault();
    const channels = [];
    if (document.getElementById('sched-ch-push').checked) channels.push('push');
    if (document.getElementById('sched-ch-email').checked) channels.push('email');
    if (document.getElementById('sched-ch-telegram').checked) channels.push('telegram');
    try {
      const payload = {
        client_id: document.getElementById('sched-client').value,
        frequency: document.getElementById('sched-freq').value,
        day_of_month: parseInt(document.getElementById('sched-day').value) || 1,
        reminder_days_before: parseInt(document.getElementById('sched-remind').value) || 3,
        auto_reminder: document.getElementById('sched-auto').checked,
        reminder_channels: channels,
      };
      const amt = document.getElementById('sched-amount').value;
      if (amt) payload.amount = parseFloat(amt);
      await api('POST', '/schedules', payload);
      toast('Schedule created'); closeModal(); navigate('schedules');
    } catch(err) { toast(err.message, 'error'); }
  };
}

async function toggleSchedule(id, active) {
  try { await api('PUT', `/schedules/${id}`, { is_active: active }); toast(active ? 'Schedule activated' : 'Schedule paused'); navigate('schedules'); } catch(e) { toast(e.message, 'error'); }
}

async function deleteSchedule(id) {
  if (!confirm('Delete this schedule?')) return;
  try { await api('DELETE', `/schedules/${id}`); toast('Schedule deleted'); navigate('schedules'); } catch(e) { toast(e.message, 'error'); }
}

async function processScheduledReminders() {
  try {
    const r = await api('POST', '/schedules/process-reminders');
    toast(`Processed ${r.processed} schedules, ${r.reminders_sent} reminders sent`);
  } catch(e) { toast(e.message, 'error'); }
}

// ===================== ACTIVITY LOG =====================
async function renderActivity(el) {
  const data = await api('GET', '/audit-logs?limit=100');
  const logs = data.logs || [];
  const members = await api('GET', '/team/members').catch(() => ({ members: [] }));
  const memberMap = {};
  (members.members || []).forEach(m => { memberMap[m.id] = m.username; });

  // Compute activity stats
  const actionCounts = {};
  logs.forEach(l => { const a = l.action_type||'other'; actionCounts[a] = (actionCounts[a]||0) + 1; });
  const totalActions = logs.length;
  const uniqueUsers = new Set(logs.map(l => l.admin_id||l.admin_username)).size;
  const todayLogs = logs.filter(l => {
    const d = new Date(l.timestamp||l.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  el.innerHTML = `
    <div class="page-header"><h2>${t('activity_title')}</h2><p>${t('activity_subtitle')}</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center" data-testid="activity-stat-total">
        <div style="font-size:24px;font-weight:700;color:var(--accent)">${totalActions}</div>
        <div style="font-size:12px;color:var(--text-muted)">${t('total_actions')}</div>
      </div>
      <div class="card" style="padding:16px;text-align:center" data-testid="activity-stat-today">
        <div style="font-size:24px;font-weight:700;color:#10b981">${todayLogs}</div>
        <div style="font-size:12px;color:var(--text-muted)">${t('today_actions')}</div>
      </div>
      <div class="card" style="padding:16px;text-align:center" data-testid="activity-stat-users">
        <div style="font-size:24px;font-weight:700;color:#8b5cf6">${uniqueUsers}</div>
        <div style="font-size:12px;color:var(--text-muted)">${t('active_users')}</div>
      </div>
      <div class="card" style="padding:16px;text-align:center" data-testid="activity-stat-types">
        <div style="font-size:24px;font-weight:700;color:#f59e0b">${Object.keys(actionCounts).length}</div>
        <div style="font-size:12px;color:var(--text-muted)">${t('action_types')}</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
        <div class="form-group" style="flex:1;min-width:140px;margin:0"><label>${t('action_type_label')}</label>
          <select id="act-type" style="width:100%;padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="activity-filter-type">
            <option value="">${t('all')}</option><option value="login">${t('login')}</option><option value="client_create">${t('client_create')}</option>
            <option value="client_update">${t('client_update')}</option><option value="lock">${t('lock')}</option><option value="unlock">${t('unlock')}</option>
            <option value="payment">${t('payment')}</option><option value="reminder">${t('reminder_label')}</option>
          </select></div>
        <div class="form-group" style="flex:1;min-width:140px;margin:0"><label>${t('team_member')}</label>
          <select id="act-member" style="width:100%;padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)" data-testid="activity-filter-member">
            <option value="">${t('all_members')}</option>
            ${(members.members||[]).map(m => `<option value="${m.id}">${esc(m.username)}</option>`).join('')}
          </select></div>
        <button class="btn btn-primary btn-sm" onclick="filterActivity()" data-testid="activity-filter-btn"><i class="fas fa-filter"></i> ${t('filter_btn')}</button>
        <button class="btn btn-outline btn-sm" onclick="exportActivityCSV()" data-testid="export-activity-btn"><i class="fas fa-file-csv"></i> ${t('export_csv')}</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table data-testid="activity-table">
      <thead><tr><th>${t('time')}</th><th>${t('user')}</th><th>${t('action')}</th><th>${t('target')}</th><th>${t('details')}</th></tr></thead>
      <tbody id="activity-tbody">${renderActivityRows(logs, memberMap)}</tbody>
    </table></div></div>`;
}

function renderActivityRows(logs, memberMap) {
  if (!logs.length) return `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">${t('no_activity')}</td></tr>`;
  return logs.map(l => {
    const user = memberMap[l.admin_id] || l.admin_username || l.admin_id || '-';
    const actionBadge = { login: 'info', lock: 'danger', unlock: 'success', payment: 'success', client_create: 'accent', reminder: 'warning' };
    const actionIcon = { login: 'fa-sign-in-alt', lock: 'fa-lock', unlock: 'fa-lock-open', payment: 'fa-money-bill', client_create: 'fa-user-plus', client_update: 'fa-user-edit', reminder: 'fa-bell' };
    const badge = actionBadge[l.action_type] || 'info';
    const icon = actionIcon[l.action_type] || 'fa-circle';
    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${fmtDate(l.timestamp||l.created_at)}</td>
      <td><b>${esc(user)}</b></td>
      <td><span class="badge badge-${badge}"><i class="fas ${icon}" style="margin-right:4px;font-size:10px"></i>${esc(l.action_type||'-')}</span></td>
      <td>${esc(l.target_type||'-')}: ${esc(l.target_id||'').substring(0,8)}</td>
      <td style="font-size:12px;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis">${esc(l.details||l.description||'-')}</td>
    </tr>`;
  }).join('');
}

async function filterActivity() {
  const type = document.getElementById('act-type').value;
  const member = document.getElementById('act-member').value;
  let url = '/audit-logs?limit=100';
  if (type) url += `&action_type=${type}`;
  if (member) url += `&admin_id_filter=${member}`;
  try {
    const data = await api('GET', url);
    const members = await api('GET', '/team/members').catch(() => ({ members: [] }));
    const memberMap = {};
    (members.members || []).forEach(m => { memberMap[m.id] = m.username; });
    document.getElementById('activity-tbody').innerHTML = renderActivityRows(data.logs||[], memberMap);
  } catch(e) { toast(e.message, 'error'); }
}

async function exportActivityCSV() {
  try {
    const type = document.getElementById('act-type')?.value || '';
    const member = document.getElementById('act-member')?.value || '';
    let url = '/audit-logs?limit=500';
    if (type) url += `&action_type=${type}`;
    if (member) url += `&admin_id_filter=${member}`;
    const data = await api('GET', url);
    const logs = data.logs || [];
    const members = await api('GET', '/team/members').catch(() => ({ members: [] }));
    const memberMap = {};
    (members.members || []).forEach(m => { memberMap[m.id] = m.username; });
    let csv = 'Time,User,Action,Target,Details\n';
    logs.forEach(l => {
      const user = memberMap[l.admin_id] || l.admin_username || l.admin_id || '';
      csv += `"${l.timestamp||l.created_at||''}","${user}","${l.action_type||''}","${(l.target_type||'')+': '+(l.target_id||'')}","${(l.details||l.description||'').replace(/"/g,'""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `activity_log_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast(t('export_csv') + ' - ' + logs.length + ' records');
  } catch(e) { toast(e.message, 'error'); }
}
function cur(n) { return '€' + (Number(n)||0).toFixed(2); }
function esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
function fmtDate(d) {
  if (!d) return '-';
  try { const dt = new Date(d); return isNaN(dt) ? String(d).substring(0,10) : dt.toLocaleDateString('en-GB'); } catch { return String(d).substring(0,10); }
}

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
  }
});

// Init
render();
