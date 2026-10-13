/**
 * admin-nav.js - injects VERGO admin sidebar + toast system.
 * Load AFTER admin-core.js, BEFORE page-specific scripts.
 */
(function () {
  'use strict';

  // Five sections, in the order work moves: it comes in (Inbox), is booked on
  // the board and listed in the app (Board), is staffed (People) and run and
  // paid (Ops). Each page is a tab in one section; a section with more than
  // one page shows its tabs under the topbar. The sidebar links to a section's
  // first tab. The Scheduling board is its own app and has a link back.
  var SECTIONS = [
    { label: 'Inbox', icon: '📥', tabs: [
      { href: '/admin-requests',         label: 'Website requests' },
      { href: '/admin-job-applications', label: 'Job applications' },
      { href: '/admin-quotes',           label: 'App requests' },
      { href: '/admin-clients',          label: 'Client sign-ups' },
    ] },
    { label: 'Board', icon: '🗓️', tabs: [
      { href: '/scheduling/',            label: 'Scheduling board' },
      { href: '/admin-jobs',             label: 'Jobs in the app' },
    ] },
    { label: 'People', icon: '👤', tabs: [
      { href: '/admin',                  label: 'Pipeline' },
      { href: '/admin-staff',            label: 'Staff' },
    ] },
    { label: 'Ops', icon: '🧭', tabs: [
      { href: '/ops',                    label: 'VERGO Ops' },
      { href: '/admin-bookings',         label: 'App bookings' },
    ] },
    { label: 'Settings', icon: '⚙️', tabs: [
      { href: '/admin-site-content',     label: 'Site content' },
      { href: '/admin-comms',            label: 'Messages' },
      { href: '/admin-settings',         label: 'Settings' },
    ] },
  ];

  function slug(path) { return path.replace(/^\/|\.html$|\/$/g, ''); }
  var currentSlug = slug(window.location.pathname);

  var currentSection = SECTIONS.filter(function (s) {
    return s.tabs.some(function (t) { return slug(t.href) === currentSlug; });
  })[0];

  function buildNav() {
    return SECTIONS.map(function (s) {
      var active = s === currentSection;
      return '<a href="' + s.tabs[0].href + '" class="as-nav-link' + (active ? ' active' : '') + '">'
        + '<span class="as-nav-icon">' + s.icon + '</span>'
        + '<span>' + s.label + '</span>'
        + '</a>';
    }).join('');
  }

  function buildTabs() {
    if (!currentSection || currentSection.tabs.length < 2) return '';
    return '<nav class="as-section-tabs" aria-label="' + currentSection.label + '">'
      + currentSection.tabs.map(function (t) {
        var active = slug(t.href) === currentSlug;
        return '<a href="' + t.href + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' + t.label + '</a>';
      }).join('')
      + '</nav>';
  }

  var sidebarHtml = '<div id="admin-sidebar">'
    + '<div class="as-logo-wrap"><a href="/admin-requests">VERGO</a><span class="as-logo-sub">Admin Panel</span></div>'
    + '<nav class="as-nav">' + buildNav() + '</nav>'
    + '<div class="as-sidebar-footer">'
    + '<button id="as-logout-btn" class="as-logout-btn">Logout</button>'
    + '</div></div>'
    + '<div id="as-overlay"></div>'
    + '<div id="as-session-warning">Session expiring in 10 minutes. '
    + '<button data-action="extend-session" style="background:none;border:none;text-decoration:underline;cursor:pointer;font-weight:700;font-family:inherit">click to extend</button>'
    + '</div>'
    + '<div id="as-toast"></div>';

  document.body.insertAdjacentHTML('afterbegin', sidebarHtml);

  var topbar = document.querySelector('.as-topbar');
  if (topbar) topbar.insertAdjacentHTML('afterend', buildTabs());

  // ── Mobile menu toggle ─────────────────────────────────
  var sidebar = document.getElementById('admin-sidebar');
  var overlay = document.getElementById('as-overlay');

  // Single delegated click handler that covers data-action buttons, overlay, and menu btn.
  document.addEventListener('click', function (e) {
    // Mobile menu button (no data-action attribute)
    if (e.target.closest('#as-menu-btn')) {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el) {
      // Close sidebar on outside click
      if (e.target === overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      }
      return;
    }
    var action = el.dataset.action;
    if (action === 'open-menu') {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    }
    if (action === 'close-menu') {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    }
    if (action === 'extend-session') {
      fetch('/api/v1/auth/session', { credentials: 'include' })
        .then(function () {
          document.getElementById('as-session-warning').style.display = 'none';
        })
        .catch(function () {
          AdminCore.toast('Failed to extend session', 'error');
        });
    }
  });

  // Logout button
  var logoutBtn = document.getElementById('as-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (window.AdminCore) AdminCore.logout();
      else window.location.href = '/login';
    });
  }

  // ── Session timeout warning at 1h 50m ─────────────────
  var _sessionTimer = (function () {
    var WARNING_MS = 110 * 60 * 1000;
    var start = Date.now();
    var warned = false;
    var timer = setInterval(function () {
      if (!warned && Date.now() - start >= WARNING_MS) {
        warned = true;
        var el = document.getElementById('as-session-warning');
        if (el) el.style.display = 'block';
      }
    }, 60000);
    return timer;
  }());

  // Stop the interval when the page unloads to prevent memory leaks.
  window.addEventListener('beforeunload', function () {
    clearInterval(_sessionTimer);
  });

  // ── Toast notification system ──────────────────────────
  var TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  AdminCore.toast = function (message, type, duration) {
    var container = document.getElementById('as-toast');
    if (!container) return;

    var item = document.createElement('div');
    item.className = 'as-toast-item ' + (type || 'info');

    var icon = TOAST_ICONS[type] || TOAST_ICONS.info;

    item.innerHTML = '<span style="font-weight:700">' + icon + '</span>'
      + '<span>' + AdminCore.escapeHtml(message) + '</span>';

    container.appendChild(item);

    var ms = duration || 3500;
    setTimeout(function () {
      item.style.opacity = '0';
      item.style.transform = 'translateX(50px)';
      setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 300);
    }, ms);
  };

  // ── CSV export utility ─────────────────────────────────
  AdminCore.exportCSV = function (rows, filename) {
    if (!rows || rows.length === 0) return;
    var headers = Object.keys(rows[0]);
    var lines = [headers.join(',')];
    rows.forEach(function (row) {
      var line = headers.map(function (h) {
        var val = row[h] == null ? '' : String(row[h]);
        val = val.replace(/"/g, '""');
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = '"' + val + '"';
        }
        return val;
      });
      lines.push(line.join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (filename || 'export') + '.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Relative time formatting ───────────────────────────
  AdminCore.relativeTime = function (dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return AdminCore.formatDate(dateStr);
  };

}());
