// Portal Advanced Reports & Analytics Module
(function(PLP) {

  // Store chart instances for cleanup
  let chartInstances = {};
  
  function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
      if (chart && chart.destroy) chart.destroy();
    });
    chartInstances = {};
  }

  PLP.renderReports = async function(el) {
    destroyCharts();
    
    // Show loading
    el.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div><p>Loading analytics...</p></div>';
    
    try {
      // Fetch all analytics data
      const [analytics, collection, financial, clientsReport, heartbeat] = await Promise.all([
        PLP.api('GET', '/analytics/dashboard'),
        PLP.api('GET', '/reports/collection'),
        PLP.api('GET', '/reports/financial'),
        PLP.api('GET', '/reports/clients'),
        PLP.api('GET', '/heartbeat/summary')
      ]);
      
      const f = collection.financial || collection;
      const cs = clientsReport.summary || {};
      const overview = analytics.overview || {};
      
      el.innerHTML = `
        <div class="page-header">
          <div><h2><i class="fas fa-chart-line"></i> ${PLP.t('reports_title')}</h2><p>Advanced analytics and business insights</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div class="dropdown" style="position:relative;display:inline-block">
              <button class="btn btn-primary btn-sm" onclick="this.nextElementSibling.classList.toggle('show')" data-testid="export-pdf-btn"><i class="fas fa-file-pdf"></i> Export PDF</button>
              <div class="dropdown-menu" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:4px;z-index:100;min-width:160px">
                <a href="${PLP.API_BASE}/reports/export/pdf?admin_token=${PLP.state.token}&report_type=financial" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px">Financial Report</a>
                <a href="${PLP.API_BASE}/reports/export/pdf?admin_token=${PLP.state.token}&report_type=clients" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px">Clients Report</a>
                <a href="${PLP.API_BASE}/reports/export/pdf?admin_token=${PLP.state.token}&report_type=collection" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px">Collection Report</a>
              </div>
            </div>
            <div class="dropdown" style="position:relative;display:inline-block">
              <button class="btn btn-outline btn-sm" onclick="this.nextElementSibling.classList.toggle('show')" data-testid="export-csv-btn"><i class="fas fa-file-csv"></i> Export CSV</button>
              <div class="dropdown-menu" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:4px;z-index:100;min-width:160px">
                <a href="${PLP.API_BASE}/reports/export/csv?admin_token=${PLP.state.token}&report_type=financial" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px">Financial Report</a>
                <a href="${PLP.API_BASE}/reports/export/csv?admin_token=${PLP.state.token}&report_type=clients" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px">Clients Report</a>
                <a href="${PLP.API_BASE}/reports/export/csv?admin_token=${PLP.state.token}&report_type=payments" class="dropdown-item" style="display:block;padding:8px 12px;color:var(--text);text-decoration:none;border-radius:6px;font-size:13px">Payments Report</a>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Quick Stats Overview -->
        <div class="stats-grid" data-testid="analytics-overview">
          <div class="stat-card accent"><div class="stat-label">Total Portfolio</div><div class="stat-value">${PLP.cur(f.total_disbursed)}</div></div>
          <div class="stat-card success"><div class="stat-label">Total Collected</div><div class="stat-value">${PLP.cur(f.total_collected)}</div></div>
          <div class="stat-card warning"><div class="stat-label">Outstanding</div><div class="stat-value">${PLP.cur(f.total_outstanding)}</div></div>
          <div class="stat-card" style="background:linear-gradient(135deg,${f.collection_rate > 80 ? '#22c55e' : f.collection_rate > 50 ? '#f59e0b' : '#ef4444'}22,transparent)">
            <div class="stat-label">Collection Rate</div>
            <div class="stat-value" style="color:${f.collection_rate > 80 ? '#22c55e' : f.collection_rate > 50 ? '#f59e0b' : '#ef4444'}">${(f.collection_rate||0).toFixed(1)}%</div>
          </div>
        </div>
        
        <!-- Charts Row -->
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-chart-area"></i> Revenue & Interest Trend</h3></div>
            <div style="padding:16px;height:280px"><canvas id="revenue-chart"></canvas></div>
          </div>
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-users"></i> Client Status</h3></div>
            <div style="padding:16px;height:280px"><canvas id="client-status-chart"></canvas></div>
          </div>
        </div>
        
        <!-- Second Charts Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-signal"></i> Device Health</h3></div>
            <div style="padding:20px">
              <div style="display:flex;justify-content:space-around;text-align:center">
                <div>
                  <div style="font-size:32px;font-weight:700;color:#22c55e">${heartbeat.online_count || 0}</div>
                  <div style="font-size:12px;color:var(--text-muted)">Online</div>
                </div>
                <div>
                  <div style="font-size:32px;font-weight:700;color:#f59e0b">${heartbeat.warning_count || 0}</div>
                  <div style="font-size:12px;color:var(--text-muted)">Warning</div>
                </div>
                <div>
                  <div style="font-size:32px;font-weight:700;color:#ef4444">${heartbeat.critical_count || 0}</div>
                  <div style="font-size:12px;color:var(--text-muted)">Critical</div>
                </div>
              </div>
              <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Device Status</div>
                <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;display:flex">
                  <div style="width:${(heartbeat.online_count / (heartbeat.total_registered || 1) * 100).toFixed(1)}%;background:#22c55e"></div>
                  <div style="width:${(heartbeat.warning_count / (heartbeat.total_registered || 1) * 100).toFixed(1)}%;background:#f59e0b"></div>
                  <div style="width:${(heartbeat.critical_count / (heartbeat.total_registered || 1) * 100).toFixed(1)}%;background:#ef4444"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-chart-pie"></i> Loan Performance</h3></div>
            <div style="padding:16px;height:160px"><canvas id="loan-performance-chart"></canvas></div>
          </div>
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-tachometer-alt"></i> 7-Day Activity</h3></div>
            <div style="padding:20px">
              <div style="display:flex;justify-content:space-between;margin-bottom:16px">
                <div style="text-align:center">
                  <div style="font-size:28px;font-weight:700;color:var(--accent)">${analytics.recent_activity?.registrations_7d || 0}</div>
                  <div style="font-size:11px;color:var(--text-muted)">New Devices</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:28px;font-weight:700;color:#ef4444">${analytics.recent_activity?.tamper_attempts_7d || 0}</div>
                  <div style="font-size:11px;color:var(--text-muted)">Tamper Alerts</div>
                </div>
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Active Loans: ${overview.active_loans || 0} | Overdue: ${overview.overdue || 0}</div>
              <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
                <div style="width:${overview.active_loans > 0 ? ((overview.active_loans - overview.overdue) / overview.active_loans * 100).toFixed(1) : 100}%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80)"></div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Revenue Details Table -->
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-table"></i> Monthly Revenue Breakdown</h3></div>
          <div class="table-wrap">
            <table data-testid="revenue-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Interest Earned</th>
                  <th>Payments Count</th>
                  <th>Principal</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                ${(financial.monthly_trend||[]).slice(-6).reverse().map((m, idx, arr) => {
                  const prev = arr[idx + 1];
                  const trend = prev ? ((m.revenue - prev.revenue) / (prev.revenue || 1) * 100).toFixed(1) : 0;
                  return `<tr>
                    <td><b>${m.month}</b></td>
                    <td>${PLP.cur(m.revenue)}</td>
                    <td>${PLP.cur(m.interest_earned)}</td>
                    <td>${m.payments_count}</td>
                    <td>${PLP.cur(m.principal_collected)}</td>
                    <td><span style="color:${trend >= 0 ? '#22c55e' : '#ef4444'}"><i class="fas fa-${trend >= 0 ? 'arrow-up' : 'arrow-down'}"></i> ${Math.abs(trend)}%</span></td>
                  </tr>`;
                }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No data available</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Quick Actions -->
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-bolt"></i> Quick Actions</h3></div>
          <div style="padding:16px;display:flex;gap:12px;flex-wrap:wrap">
            <a href="${PLP.API_BASE}/reports/export/pdf?admin_token=${PLP.state.token}&report_type=comprehensive" class="btn btn-primary btn-sm" data-testid="full-report-btn"><i class="fas fa-file-pdf"></i> Download Full Report</a>
            <a href="${PLP.API_BASE}/reports/export/csv?admin_token=${PLP.state.token}&report_type=payments" class="btn btn-outline btn-sm"><i class="fas fa-download"></i> Export Payments</a>
            <button class="btn btn-outline btn-sm" onclick="PLP.renderReports(document.getElementById('main-content'))"><i class="fas fa-sync"></i> Refresh Data</button>
          </div>
        </div>
      `;
      
      // Initialize charts
      setTimeout(() => {
        initRevenueChart(analytics.monthly_revenue, analytics.monthly_interest);
        initClientStatusChart(cs);
        initLoanPerformanceChart(overview);
      }, 100);
      
    } catch(e) {
      el.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--danger)"><i class="fas fa-exclamation-circle" style="font-size:24px;margin-bottom:8px"></i><br>Error loading analytics: ${PLP.esc(e.message)}</div>`;
    }
  };
  
  function initRevenueChart(revenue, interest) {
    const ctx = document.getElementById('revenue-chart');
    if (!ctx) return;
    
    const labels = Object.keys(revenue || {}).sort();
    const revenueData = labels.map(k => revenue[k] || 0);
    const interestData = labels.map(k => interest?.[k] || 0);
    
    chartInstances.revenue = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(l => {
          const [y, m] = l.split('-');
          return new Date(y, m - 1).toLocaleDateString('en', { month: 'short', year: '2-digit' });
        }),
        datasets: [
          {
            label: 'Revenue',
            data: revenueData,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Interest',
            data: interestData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: getComputedStyle(document.body).getPropertyValue('--text') || '#fff' } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.7)' } },
          y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.7)' } }
        }
      }
    });
  }
  
  function initClientStatusChart(summary) {
    const ctx = document.getElementById('client-status-chart');
    if (!ctx) return;
    
    chartInstances.clientStatus = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['On Time', 'At Risk', 'Defaulted', 'Completed'],
        datasets: [{
          data: [
            summary.on_time_clients || 0,
            summary.at_risk_clients || 0,
            summary.defaulted_clients || 0,
            summary.completed_clients || 0
          ],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#6366f1'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text') || '#fff', padding: 12 } }
        },
        cutout: '60%'
      }
    });
  }
  
  function initLoanPerformanceChart(overview) {
    const ctx = document.getElementById('loan-performance-chart');
    if (!ctx) return;
    
    const active = overview.active_loans || 0;
    const overdue = overview.overdue || 0;
    const onTime = active - overdue;
    
    chartInstances.loanPerformance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['On-Time', 'Overdue'],
        datasets: [{
          data: [onTime > 0 ? onTime : 0, overdue],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).getPropertyValue('--text') || '#fff' } }
        }
      }
    });
  }

  PLP.exportReport = async function(format, type) {
    const url = PLP.API_BASE + `/reports/export/${format}?admin_token=${PLP.state.token}&report_type=${type}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_report.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

})(window.PLP);
