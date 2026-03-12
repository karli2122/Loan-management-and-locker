// Portal Reports & Exports Module
(function(PLP) {

  PLP.renderReports = async function(el) {
    el.innerHTML = `
      <div class="page-header"><div><h2><i class="fas fa-file-export"></i> Reports & Exports</h2><p>Generate and download reports</p></div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        <div class="card" data-testid="export-clients-card">
          <div class="card-header"><h3><i class="fas fa-users"></i> Clients Report</h3></div>
          <p style="padding:0 20px;color:var(--text-muted)">Export all client data with loan status, payment history, and risk scores.</p>
          <div style="padding:10px 20px 20px;display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" data-testid="export-clients-csv" onclick="PLP.exportReport('csv', 'clients')"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-outline btn-sm" data-testid="export-clients-pdf" onclick="PLP.exportReport('pdf', 'clients')"><i class="fas fa-file-pdf"></i> PDF</button>
            <button class="btn btn-outline btn-sm" data-testid="export-clients-xlsx" onclick="PLP.exportReport('xlsx', 'clients')"><i class="fas fa-file-excel"></i> Excel</button>
          </div>
        </div>
        <div class="card" data-testid="export-payments-card">
          <div class="card-header"><h3><i class="fas fa-money-bill-wave"></i> Payments Report</h3></div>
          <p style="padding:0 20px;color:var(--text-muted)">Detailed payment history with dates, amounts, and status for all clients.</p>
          <div style="padding:10px 20px 20px;display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="PLP.exportReport('csv', 'payments')"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-outline btn-sm" onclick="PLP.exportReport('pdf', 'payments')"><i class="fas fa-file-pdf"></i> PDF</button>
          </div>
        </div>
        <div class="card" data-testid="export-collection-card">
          <div class="card-header"><h3><i class="fas fa-chart-line"></i> Collection Report</h3></div>
          <p style="padding:0 20px;color:var(--text-muted)">Collection rates, overdue trends, and financial summary.</p>
          <div style="padding:10px 20px 20px;display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="PLP.exportReport('csv', 'collection')"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-outline btn-sm" onclick="PLP.exportReport('pdf', 'collection')"><i class="fas fa-file-pdf"></i> PDF</button>
          </div>
        </div>
      </div>
      <div id="export-status" style="margin-top:16px"></div>`;
  };

  PLP.exportReport = async function(format, type) {
    const statusEl = document.getElementById('export-status');
    statusEl.innerHTML = '<div class="card" style="padding:16px;text-align:center"><div class="spinner"></div><p>Generating report...</p></div>';

    try {
      let url;
      if (format === 'csv') {
        url = PLP.API_BASE + `/reports/export/csv?admin_token=${PLP.state.token}&report_type=${type}`;
      } else if (format === 'pdf') {
        url = PLP.API_BASE + `/reports/export/pdf?admin_token=${PLP.state.token}&report_type=${type}`;
      } else if (format === 'xlsx') {
        url = PLP.API_BASE + `/reports/export/csv?admin_token=${PLP.state.token}&report_type=${type}&format=xlsx`;
      }

      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      statusEl.innerHTML = '<div class="card" style="padding:16px;color:var(--success)"><i class="fas fa-check"></i> Report download started</div>';
      setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
    } catch(e) {
      statusEl.innerHTML = `<div class="card" style="padding:16px;color:var(--danger)">${PLP.esc(e.message)}</div>`;
    }
  };

})(window.PLP);
