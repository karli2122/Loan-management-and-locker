// Portal Bulk Messaging Module
(function(PLP) {

  PLP.renderBulkMessaging = async function(el) {
    let clients = [];
    try {
      const data = await PLP.api('GET', '/clients');
      clients = data.clients || [];
    } catch(e) { console.error(e); }

    const overdueClients = clients.filter(c => c.is_overdue || c.days_overdue > 0);

    el.innerHTML = `
      <div class="page-header"><div><h2><i class="fas fa-paper-plane"></i> Bulk Messaging</h2><p>Send Telegram messages to clients</p></div></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Clients</div><div class="stat-value">${clients.length}</div></div>
        <div class="stat-card" style="border-left:3px solid var(--danger)"><div class="stat-label">Overdue Clients</div><div class="stat-value" style="color:var(--danger)">${overdueClients.length}</div></div>
        <div class="stat-card"><div class="stat-label">With Telegram</div><div class="stat-value">${clients.filter(c => c.telegram_chat_id).length}</div></div>
      </div>
      <div class="card" style="margin-top:16px" data-testid="bulk-msg-form">
        <div class="card-header"><h3><i class="fas fa-comment-dots"></i> Compose Message</h3></div>
        <form id="bulk-msg-form" style="padding:0 20px 20px">
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Target</label>
              <select id="bm-target" data-testid="bm-target" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)">
                <option value="all">All Clients</option>
                <option value="overdue">Overdue Only (${overdueClients.length})</option>
                <option value="custom">Select Clients</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label>Template</label>
              <select id="bm-template" data-testid="bm-template" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)">
                <option value="">Custom message</option>
                <option value="reminder">Payment Reminder</option>
                <option value="overdue">Overdue Notice</option>
                <option value="thank">Thank You</option>
              </select>
            </div>
          </div>
          <div id="bm-client-select" style="display:none;margin-bottom:12px">
            <label>Select Clients</label>
            <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--bg-input)">
              ${clients.map(c => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer"><input type="checkbox" class="bm-client-cb" value="${c.id}"> ${PLP.esc(c.name)} ${c.telegram_chat_id ? '<i class="fab fa-telegram" style="color:#0088cc"></i>' : '<span style="color:var(--text-muted);font-size:0.8em">No Telegram</span>'}</label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>Message (use {name} for client name)</label>
            <textarea id="bm-message" data-testid="bm-message" rows="4" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);resize:vertical" placeholder="Hello {name}, this is a reminder about your upcoming payment..."></textarea>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button type="submit" class="btn btn-primary" data-testid="bm-send-btn"><i class="fab fa-telegram"></i> Send via Telegram</button>
          </div>
        </form>
      </div>
      <div id="bm-result" style="margin-top:16px"></div>`;

    // Template selection
    document.getElementById('bm-template').addEventListener('change', function() {
      const msgEl = document.getElementById('bm-message');
      const templates = {
        reminder: 'Hello {name}, this is a friendly reminder that your payment is due soon. Please make your payment on time to avoid any late fees. Thank you!',
        overdue: 'Dear {name}, your payment is overdue. Please make your payment as soon as possible to avoid additional charges and device restrictions.',
        thank: 'Thank you {name} for your recent payment! Your account is in good standing.'
      };
      if (templates[this.value]) msgEl.value = templates[this.value];
    });

    // Target change
    document.getElementById('bm-target').addEventListener('change', function() {
      document.getElementById('bm-client-select').style.display = this.value === 'custom' ? 'block' : 'none';
    });

    // Form submit
    document.getElementById('bulk-msg-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const target = document.getElementById('bm-target').value;
      const message = document.getElementById('bm-message').value.trim();
      if (!message) { PLP.toast('Please enter a message', 'error'); return; }

      let clientIds = '';
      if (target === 'custom') {
        clientIds = Array.from(document.querySelectorAll('.bm-client-cb:checked')).map(cb => cb.value).join(',');
        if (!clientIds) { PLP.toast('Please select clients', 'error'); return; }
      }

      const resultDiv = document.getElementById('bm-result');
      resultDiv.innerHTML = '<div class="card" style="padding:20px;text-align:center"><div class="spinner"></div><p>Sending messages...</p></div>';

      try {
        const params = new URLSearchParams({ admin_token: PLP.state.token, message });
        if (clientIds) params.set('client_ids', clientIds);
        if (target === 'overdue') params.set('overdue_only', 'true');

        const resp = await fetch(PLP.API_BASE + '/push/bulk-telegram?' + params.toString(), { method: 'POST' });
        const data = await resp.json();

        resultDiv.innerHTML = `<div class="card" style="padding:20px">
          <h3><i class="fas fa-check-circle" style="color:var(--success)"></i> Messages Sent</h3>
          <div class="stats-grid" style="margin-top:12px">
            <div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value" style="color:var(--success)">${data.sent || 0}</div></div>
            <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value" style="color:var(--danger)">${data.failed || 0}</div></div>
            <div class="stat-card"><div class="stat-label">Targeted</div><div class="stat-value">${data.total_targeted || 0}</div></div>
          </div>
        </div>`;
      } catch(err) {
        resultDiv.innerHTML = `<div class="card" style="padding:20px"><p class="error-msg">${PLP.esc(err.message)}</p></div>`;
      }
    });
  };

})(window.PLP);
