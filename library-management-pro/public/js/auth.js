(function () {
  const token = LMP.getToken();
  if (!token) {
    window.location.href = '/login';
    return;
  }
  // Verify token by calling /api/auth/me
  LMP.apiFetch('GET', '/api/auth/me')
    .then((res) => {
      LMP.setUser(res.data);
      const u = res.data;
      const name = u.full_name || u.username;
      document.querySelectorAll('[data-username]').forEach((el) => { el.textContent = name; });
      const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
      document.querySelectorAll('[data-avatar]').forEach((el) => { el.textContent = initials; });
      document.querySelectorAll('[data-role]').forEach((el) => { el.textContent = u.role; });
    })
    .catch(() => {
      LMP.clearSession();
      window.location.href = '/login';
    });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-link]');
    if (link) {
      e.preventDefault();
      const route = link.dataset.link;
      window.location.href = route;
    }
    const logout = e.target.closest('[data-logout]');
    if (logout) {
      e.preventDefault();
      LMP.apiFetch('POST', '/api/auth/logout').finally(() => {
        LMP.clearSession();
        window.location.href = '/login';
      });
    }
    const ddToggle = e.target.closest('[data-dropdown]');
    if (ddToggle) {
      const root = ddToggle.closest('.dropdown');
      document.querySelectorAll('.dropdown.open').forEach((d) => { if (d !== root) d.classList.remove('open'); });
      root.classList.toggle('open');
    } else {
      document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
    }
  });

  // Highlight active nav
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-item').forEach((it) => {
    const r = it.dataset.route;
    if (!r) return;
    if (path === r || (r !== '/' && path.startsWith(r))) it.classList.add('active');
  });

  // Mobile sidebar
  const sb = document.querySelector('.sidebar');
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-menu]')) {
      sb.classList.toggle('open');
    }
  });
})();
