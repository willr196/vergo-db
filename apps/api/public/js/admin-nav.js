/**
 * admin-nav.js - injects VERGO admin sidebar + toast system.
 * Load AFTER admin-core.js, BEFORE page-specific scripts.
 */
(function () {
  'use strict';

  var NAV = [
    { href: 'admin',                  icon: '◈', label: 'Dashboard' },
    { href: 'admin',                  icon: '👤', label: 'Roster',          slug: 'admin' },
    { href: 'admin-jobs',             icon: '💼', label: 'Jobs' },
    { href: 'admin-job-applications', icon: '📝', label: 'Applications' },
    { href: 'admin-clients',          icon: '🏢', label: 'Clients' },
    { href: 'admin-marketplace',      icon: '⭐', label: 'Marketplace' },
    { href: 'admin-bookings',         icon: '📅', label: 'Bookings' },
    { href: 'admin-quotes',           icon: '📋', label: 'Quotes' },
    { href: 'admin-comms',            icon: '📬', label: 'Communications' },
    { href: 'admin-analytics',        icon: '📊', label: 'Analytics' },
  ];

  var currentSlug = window.location.pathname.replace(/^\/|\.html$/g, '');

  function buildNav() {
    return NAV.map(function (item) {
      var slug = item.slug || item.href;
      var active = currentSlug === slug;
      return '<a href="' + item.href + '" class="as-nav-link' + (active ? ' active' : '') + '">'
        + '<span class="as-nav-icon">' + item.icon + '</span>'
        + '<span>' + item.label + '</span>'
        + '</a>';
    }).join('');
  }

  var sidebarHtml = '<div id="admin-sidebar">'
    + '<div class="as-logo-wrap"><a href="admin">VERGO</a><span class="as-logo-sub">Admin Panel</span></div>'
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
      else window.location.href = 'login.html';
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

  // Alias AdminCore.notify to toast for backward compat
  var _originalNotify = AdminCore.notify;
  AdminCore.notify = function (message, type, timeout) {
    // Use new toast if #as-toast exists, else legacy
    if (document.getElementById('as-toast')) {
      AdminCore.toast(message, type, timeout);
    } else if (_originalNotify) {
      _originalNotify(message, type, timeout);
    }
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
