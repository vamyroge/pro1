// Main app: simple hash-less router using pathname
(function () {
  const view = document.getElementById('view');
  const routes = {
    '/': renderDashboard,
    '/dashboard': renderDashboard,
    '/books': renderBooks,
    '/readers': renderReaders,
    '/borrowings': renderBorrowings,
    '/reports': renderReports,
    '/settings': renderSettings
  };

  function getPath() {
    const p = location.pathname.replace(/\/$/, '') || '/';
    return p;
  }

  async function navigate() {
    const path = getPath();
    const fn = routes[path] || routes['/'];
    view.innerHTML = '<div class="skeleton block"></div>';
    try { await fn(view); }
    catch (e) { view.innerHTML = `<div class="card"><div class="card-body">${LMP.escapeHtml(e.message)}</div></div>`; }
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  }

  async function renderReports(root) {
    const [stats, borrowings] = await Promise.all([
      LMP.apiFetch('GET', '/api/dashboard/stats'),
      LMP.apiFetch('GET', '/api/borrowings?limit=200')
    ]);
    const d = stats.data;
    root.innerHTML = `
      <div class="page-title"><div><h1>Reports</h1><div class="subtitle">Library analytics and insights</div></div></div>
      <div class="grid grid-cols-3">
        <div class="card"><div class="card-body">
          <div class="card-title">Borrowing by category</div>
          <div class="chart-wrap"><canvas id="rCat"></canvas></div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="card-title">Status distribution</div>
          <div class="chart-wrap"><canvas id="rStatus"></canvas></div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="card-title">Last 7 days</div>
          <div class="chart-wrap"><canvas id="rLast"></canvas></div>
        </div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-body">
        <div class="card-title">Top readers by borrowings</div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Reader</th><th>Code</th><th>Borrowings</th></tr></thead>
          <tbody>
            ${(() => {
              const map = new Map();
              (borrowings.data || []).forEach((b) => {
                const r = b.reader;
                if (!r) return;
                map.set(r.id, { reader: r, count: (map.get(r.id)?.count || 0) + 1 });
              });
              return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10)
                .map((x) => `<tr><td>${LMP.escapeHtml(x.reader.full_name)}</td><td>${LMP.escapeHtml(x.reader.reader_code)}</td><td>${x.count}</td></tr>`).join('')
                || `<tr><td colspan="3">${LMP.emptyState({ icon: 'bar-chart', title: 'No data yet' })}</td></tr>`;
            })()}
          </tbody>
        </table></div>
      </div></div>
    `;
    new Chart(document.getElementById('rCat'), { type: 'pie', data: { labels: d.books_by_category.map((x) => x.category), datasets: [{ data: d.books_by_category.map((x) => x.count), backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#22c55e', '#64748b'] }] }, options: { plugins: { legend: { position: 'right' } } } });
    new Chart(document.getElementById('rStatus'), { type: 'doughnut', data: { labels: d.status_distribution.map((x) => x.status), datasets: [{ data: d.status_distribution.map((x) => x.count), backgroundColor: ['#4f46e5', '#10b981', '#ef4444'] }] } });
    new Chart(document.getElementById('rLast'), { type: 'bar', data: { labels: d.last_7_days_borrowings.map((x) => x.date.slice(5)), datasets: [{ data: d.last_7_days_borrowings.map((x) => x.count), backgroundColor: '#4f46e5' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }

  async function renderSettings(root) {
    const u = LMP.getUser() || {};
    root.innerHTML = `
      <div class="page-title"><div><h1>Settings</h1><div class="subtitle">Account and system info</div></div></div>
      <div class="grid grid-cols-2">
        <div class="card"><div class="card-body">
          <div class="card-title">Account</div>
          <div style="margin-top:10px;line-height:1.8">
            <div><strong>Username:</strong> ${LMP.escapeHtml(u.username || '-')}</div>
            <div><strong>Full name:</strong> ${LMP.escapeHtml(u.full_name || '-')}</div>
            <div><strong>Role:</strong> ${LMP.escapeHtml(u.role || '-')}</div>
          </div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="card-title">System</div>
          <div style="margin-top:10px;line-height:1.8">
            <div><strong>Database:</strong> Supabase PostgreSQL</div>
            <div><strong>Backend:</strong> Node.js + Express</div>
            <div><strong>Frontend:</strong> Vanilla JS</div>
            <button class="btn ghost" style="margin-top:10px" onclick="LMP.apiFetch('GET','/api/health').then(r=>LMP.showToast({type:'success',message:r.message+' (db='+r.db+')'}))"><i data-lucide="activity"></i> Test API</button>
          </div>
        </div></div>
      </div>
    `;
  }

  // Global search
  document.getElementById('globalSearch').addEventListener('input', LMP.debounce((e) => {
    const q = e.target.value.trim();
    if (!q) return;
    const path = getPath();
    if (path.startsWith('/books')) {
      document.getElementById('bookSearch') && (document.getElementById('bookSearch').value = q, document.getElementById('bookSearch').dispatchEvent(new Event('input')));
    } else if (path.startsWith('/readers')) {
      document.getElementById('readerSearch') && (document.getElementById('readerSearch').value = q, document.getElementById('readerSearch').dispatchEvent(new Event('input')));
    } else {
      window.location.href = `/books?q=${encodeURIComponent(q)}`;
    }
  }, 400));

  window.addEventListener('popstate', navigate);
  // expose navigate for module refresh
  window.LMP = window.LMP || {};
  window.LMP.refresh = navigate;
  document.addEventListener('DOMContentLoaded', navigate);
  if (document.readyState !== 'loading') navigate();
})();
