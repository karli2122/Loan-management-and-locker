// Portal Risk Scoring Module
(function(PLP) {

  PLP.renderRiskScoring = async function(el) {
    el.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div><p>Loading risk analysis...</p></div>';

    try {
      const data = await PLP.api('GET', '/risk/overview');
      const ov = data.overview || {};
      const clients = data.clients || [];

      el.innerHTML = `
        <div class="page-header"><div><h2><i class="fas fa-shield-alt"></i> Client Risk Scoring</h2><p>AI-powered risk analysis based on payment history and behavior</p></div></div>
        <div class="stats-grid" data-testid="risk-overview">
          <div class="stat-card" style="border-left:3px solid var(--success)"><div class="stat-label">Low Risk</div><div class="stat-value" style="color:var(--success)">${ov.low || 0}</div></div>
          <div class="stat-card" style="border-left:3px solid var(--warning)"><div class="stat-label">Medium Risk</div><div class="stat-value" style="color:var(--warning)">${ov.medium || 0}</div></div>
          <div class="stat-card" style="border-left:3px solid var(--danger)"><div class="stat-label">High Risk</div><div class="stat-value" style="color:var(--danger)">${ov.high || 0}</div></div>
          <div class="stat-card" style="border-left:3px solid var(--primary)"><div class="stat-label">Avg Score</div><div class="stat-value">${ov.avg_score || 0}/100</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div class="card"><div class="card-header"><h3>Risk Distribution</h3></div>
            <canvas id="risk-chart" height="200"></canvas>
          </div>
          <div class="card"><div class="card-header"><h3>Score Distribution</h3></div>
            <canvas id="score-chart" height="200"></canvas>
          </div>
        </div>
        <div class="card" style="margin-top:16px" data-testid="risk-table">
          <div class="card-header"><h3>All Clients</h3></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Client</th><th>Score</th><th>Risk</th><th>Active Loans</th><th>Overdue</th><th>Total Debt</th><th>Key Factors</th></tr></thead>
            <tbody>${clients.map(c => {
              const color = c.risk_level === 'high' ? 'var(--danger)' : c.risk_level === 'medium' ? 'var(--warning)' : 'var(--success)';
              const badge = `<span style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:0.8em">${c.risk_level.toUpperCase()}</span>`;
              const factors = (c.factors || []).slice(0, 2).map(f => f.detail).join(', ');
              return `<tr>
                <td><b>${PLP.esc(c.client_name)}</b></td>
                <td><b>${c.score}</b>/100</td>
                <td>${badge}</td>
                <td>${c.active_loans}</td>
                <td style="color:${c.overdue_loans > 0 ? 'var(--danger)' : 'inherit'}">${c.overdue_loans}</td>
                <td>${PLP.cur(c.total_debt)}</td>
                <td style="font-size:0.85em;color:var(--text-muted)">${PLP.esc(factors)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>`;

      // Draw charts
      const riskCtx = document.getElementById('risk-chart');
      if (riskCtx) {
        new Chart(riskCtx, {
          type: 'doughnut',
          data: {
            labels: ['Low Risk', 'Medium Risk', 'High Risk'],
            datasets: [{ data: [ov.low || 0, ov.medium || 0, ov.high || 0], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderWidth: 0 }]
          },
          options: { responsive: true, animation: { animateRotate: true, duration: 1200 }, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
        });
      }

      const scoreCtx = document.getElementById('score-chart');
      if (scoreCtx) {
        const scores = clients.map(c => c.score);
        const buckets = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
        scores.forEach(s => { buckets[Math.min(Math.floor(s / 20), 4)]++; });
        new Chart(scoreCtx, {
          type: 'bar',
          data: {
            labels: ['0-20', '21-40', '41-60', '61-80', '81-100'],
            datasets: [{ label: 'Clients', data: buckets, backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e'], borderRadius: 6 }]
          },
          options: { responsive: true, animation: { duration: 800 }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } }, plugins: { legend: { display: false } } }
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="card" style="padding:20px"><p class="error-msg">${PLP.esc(e.message)}</p></div>`;
    }
  };

})(window.PLP);
