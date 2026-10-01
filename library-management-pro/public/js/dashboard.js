async function renderDashboard(root) {
  const res = await LMP.apiFetch('GET', '/api/dashboard/stats');
  const activity = await LMP.apiFetch('GET', '/api/dashboard/activity?limit=10');
  const d = res.data;
  const t = d.totals;

  root.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Dashboard</h1>
        <div class="subtitle">Overview of your library performance</div>
      </div>
      <div>
        <button class="btn primary" data-link="/borrowings"><i data-lucide="plus"></i> New borrowing</button>
      </div>
    </div>

    <div class="grid grid-cols-4">
      <div class="card"><div class="card-body stat">
        <div class="icon indigo"><i data-lucide="book-open"></i></div>
        <div><div class="label">Total copies</div><div class="value">${LMP.formatCurrency(t.total_books_copies)}</div><div class="trend">${LMP.formatCurrency(t.total_books_available)} available</div></div>
      </div></div>
      <div class="card"><div class="card-body stat">
        <div class="icon cyan"><i data-lucide="users"></i></div>
        <div><div class="label">Readers</div><div class="value">${LMP.formatCurrency(t.total_readers)}</div></div>
      </div></div>
      <div class="card"><div class="card-body stat">
        <div class="icon green"><i data-lucide="repeat"></i></div>
        <div><div class="label">Borrowing</div><div class="value">${LMP.formatCurrency(t.currently_borrowing)}</div><div class="trend">${LMP.formatCurrency(t.total_borrowings)} all-time</div></div>
      </div></div>
      <div class="card"><div class="card-body stat">
        <div class="icon red"><i data-lucide="alert-triangle"></i></div>
        <div><div class="label">Overdue</div><div class="value">${LMP.formatCurrency(t.total_overdue)}</div></div>
      </div></div>
    </div>

    <div class="grid grid-cols-3" style="margin-top:16px">
      <div class="card"><div class="card-body">
        <div class="card-title">Borrowings (7 days)</div>
        <div class="chart-wrap"><canvas id="chartBorrowings"></canvas></div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="card-title">Books by category</div>
        <div class="chart-wrap"><canvas id="chartCategory"></canvas></div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="card-title">Status distribution</div>
        <div class="chart-wrap"><canvas id="chartStatus"></canvas></div>
      </div></div>
    </div>

    <div class="grid grid-cols-2" style="margin-top:16px">
      <div class="card"><div class="card-body">
        <div class="card-title">Overdue books</div>
        <div class="table-wrap">
          <table class="data" id="overdueTable">
            <thead><tr><th>Reader</th><th>Book</th><th>Due</th><th>Days</th></tr></thead>
            <tbody>
              ${d.overdue_list.length ? d.overdue_list.map((o) => `
                <tr>
                  <td>${LMP.escapeHtml(o.reader?.full_name || '-')}<div style="color:var(--muted);font-size:12px">${LMP.escapeHtml(o.reader?.reader_code || '')}</div></td>
                  <td>${LMP.escapeHtml(o.book?.title || '-')}</td>
                  <td>${LMP.formatDate(o.due_date)}</td>
                  <td><span class="badge-pill danger">${o.overdue_days}d</span></td>
                </tr>`).join('') : `<tr><td colspan="4">${LMP.emptyState({ icon: 'check-circle', title: 'No overdue books' })}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="card-title">Recent activity</div>
        <div class="activity-list" id="activityList"></div>
      </div></div>
    </div>
  `;

  // Activity list
  const list = document.getElementById('activityList');
  if (activity.data.length === 0) {
    list.innerHTML = LMP.emptyState({ icon: 'history', title: 'No activity yet' });
  } else {
    list.innerHTML = activity.data.map((a) => `
      <div class="activity-item">
        <div class="dot" style="background:${a.action === 'BORROW' ? 'var(--primary)' : a.action === 'RETURN' ? 'var(--success)' : 'var(--muted)'}"></div>
        <div style="flex:1">
          <div>${LMP.escapeHtml(a.description || a.action)}</div>
          <div style="color:var(--muted);font-size:12px">${LMP.formatDateTime(a.created_at)} • ${LMP.escapeHtml(a.user?.username || 'system')}</div>
        </div>
      </div>`).join('');
  }

  // Charts
  const c1 = document.getElementById('chartBorrowings');
  if (c1) new Chart(c1, {
    type: 'line',
    data: {
      labels: d.last_7_days_borrowings.map((x) => x.date.slice(5)),
      datasets: [{
        label: 'Borrowings',
        data: d.last_7_days_borrowings.map((x) => x.count),
        borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.15)',
        fill: true, tension: 0.35, pointRadius: 4
      }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  const c2 = document.getElementById('chartCategory');
  if (c2) new Chart(c2, {
    type: 'doughnut',
    data: {
      labels: d.books_by_category.map((x) => x.category),
      datasets: [{ data: d.books_by_category.map((x) => x.count), backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#22c55e', '#64748b'] }]
    },
    options: { plugins: { legend: { position: 'right' } } }
  });

  const c3 = document.getElementById('chartStatus');
  if (c3) new Chart(c3, {
    type: 'bar',
    data: {
      labels: d.status_distribution.map((x) => x.status),
      datasets: [{ label: 'Count', data: d.status_distribution.map((x) => x.count), backgroundColor: ['#4f46e5', '#10b981', '#ef4444'] }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}
