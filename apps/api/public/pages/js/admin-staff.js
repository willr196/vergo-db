/**
 * admin-staff.js — people who already work for you.
 *
 * Everyone marked HIRED. This is a directory, not a pipeline: you search it
 * rather than scan it, and the questions you ask of it are "can this person
 * legally work?" and "can they actually log in and take a shift?" — so
 * right-to-work and account status are columns here rather than something you
 * open a drawer to find out.
 */
(function () {
  'use strict';

  var esc    = AdminCore.escapeHtml;
  var fetch_ = AdminCore.fetchJSON;
  var fmtD   = AdminCore.formatDate;
  var toast  = function (m, t) { AdminCore.notify(m, t); };

  var rows = [];
  var sort = { col: 'fullName', dir: 'asc' };
  var filters = { role: '', search: '', location: '', concern: '' };
  var page = 1;
  var totalPages = 1;
  var PAGE_SIZE = 25;

  // ── Right-to-work presentation ───────────────────────────
  // The server's own labels are full sentences meant for the drawer
  // ("Right to work verified until 01/10/2026"); a column needs a word.
  var RTW = {
    PASSED:      { cls: 'badge-HIRED',     label: 'Cleared' },
    EXPIRED:     { cls: 'badge-REJECTED',  label: 'Expired' },
    FAILED:      { cls: 'badge-REJECTED',  label: 'Failed' },
    PENDING:     { cls: 'badge-REVIEWING', label: 'In progress' },
    NOT_CHECKED: { cls: 'badge-muted',     label: 'Not checked' }
  };

  // Matches RTW_EXPIRY_HORIZON_DAYS on the server, so this page and the
  // attention panel agree about who is expiring.
  var EXPIRY_HORIZON_DAYS = 30;

  function expiringSoon(rtw) {
    if (rtw.status !== 'PASSED' || !rtw.expiresAt) return false;
    var days = (new Date(rtw.expiresAt).getTime() - Date.now()) / 86400000;
    return days <= EXPIRY_HORIZON_DAYS;
  }

  function rtwCell(app) {
    var rtw = app.rightToWork || { status: 'NOT_CHECKED' };
    var meta = RTW[rtw.status] || RTW.NOT_CHECKED;
    var cls = meta.cls;
    var label = meta.label;
    if (expiringSoon(rtw)) { cls = 'badge-REVIEWING'; label = 'Expiring'; }

    var expiry = rtw.expiresAt
      ? '<span class="text-muted fs-sm">'
        + esc((rtw.status === 'EXPIRED' ? 'Expired ' : 'Expires ') + fmtD(rtw.expiresAt))
        + '</span>'
      : '';
    return '<div class="as-stack">'
      + '<span class="badge ' + cls + '" title="' + esc(rtw.label || '') + '">' + esc(label) + '</span>'
      + expiry
      + '</div>';
  }

  function accountCell(app) {
    var account = app.account || {};
    if (account.status === 'ACTIVE') {
      return '<span class="badge badge-HIRED">Active</span>';
    }
    if (account.status === 'PENDING_FIRST_LOGIN') {
      return '<div class="as-stack"><span class="badge badge-REVIEWING">Login sent</span>'
        + '<span class="text-muted fs-sm">Not signed in yet</span></div>';
    }
    return '<button type="button" class="btn btn-primary btn-sm" data-action="send-roster-login" data-app-id="'
      + esc(app.id) + '">Send login</button>';
  }

  // ── Load ─────────────────────────────────────────────────
  function buildParams(extra) {
    var params = new URLSearchParams({ group: 'staff' });
    if (filters.role) params.set('role', filters.role);
    if (filters.search) params.set('search', filters.search);
    if (filters.location) params.set('location', filters.location);
    if (extra) Object.keys(extra).forEach(function (k) { params.set(k, extra[k]); });
    return params;
  }

  // The concern filters ask questions the list endpoint does not answer
  // (right-to-work state is derived, not a column), so they are applied to the
  // fetched page rather than pushed into the query.
  function visibleRows() {
    if (!filters.concern) return rows;
    return rows.filter(function (app) {
      var rtw = app.rightToWork || {};
      var account = app.account || {};
      if (filters.concern === 'rtw-missing') return !rtw.clearedToWork;
      if (filters.concern === 'rtw-expiring') return expiringSoon(rtw) || rtw.status === 'EXPIRED';
      if (filters.concern === 'no-login') return account.status === 'NOT_CREATED';
      return true;
    });
  }

  async function load() {
    try {
      var params = buildParams({
        page: page,
        limit: PAGE_SIZE,
        sortCol: filters.location ? 'distance' : sort.col,
        sortDir: sort.dir
      });
      var data = await fetch_('/api/v1/applications?' + params.toString());
      rows = data.applications || [];
      var total = data.pagination ? data.pagination.total : rows.length;
      totalPages = data.pagination ? data.pagination.totalPages : 1;
      if (page > totalPages) {
        page = Math.max(1, totalPages);
        return load();
      }
      AdminApplicant.setRows(rows);
      render(total);
    } catch (e) {
      document.getElementById('staff-body').innerHTML =
        '<tr><td colspan="6" class="empty-state">Failed to load: ' + esc(e.message) + '</td></tr>';
    }
  }

  // Counts come from the same aggregate that feeds the Pipeline attention
  // panel, so the two pages can never disagree about who is outstanding.
  async function loadCounts() {
    try {
      var data = await fetch_('/api/v1/admin/stats');
      var onboarding = data.onboarding || {};
      var hired = data.applicants.hired || 0;
      var awaiting = (onboarding.pendingRtw || []).length;
      var expiring = (onboarding.expiringRtw || []).length;
      var noLogin = (onboarding.pendingRosterLogin || []).length;

      document.getElementById('stat-total').textContent    = hired;
      document.getElementById('stat-cleared').textContent  = Math.max(0, hired - awaiting);
      document.getElementById('stat-awaiting').textContent = awaiting;
      document.getElementById('stat-expiring').textContent = expiring;
      document.getElementById('stat-nologin').textContent  = noLogin;

      var el = document.getElementById('as-refresh-label');
      if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      toast('Failed to load counts: ' + e.message, 'error');
    }
  }

  async function reload() {
    await Promise.all([load(), loadCounts()]);
  }

  // ── Render ───────────────────────────────────────────────
  function locationCell(app) {
    var postcode = app.postcode || '';
    var distance = typeof app.distanceMiles === 'number' ? app.distanceMiles.toFixed(1) + ' mi' : '';
    if (!postcode && !distance) return '<span class="text-muted">-</span>';
    return '<div class="as-stack"><span>' + esc(postcode || '-') + '</span>'
      + (distance ? '<span class="text-muted fs-sm">' + esc(distance) + '</span>' : '')
      + '</div>';
  }

  function render(total) {
    var tbody = document.getElementById('staff-body');
    var shown = visibleRows();

    document.getElementById('staff-count').textContent =
      filters.concern
        ? shown.length + ' of ' + rows.length + ' on this page'
        : total + (total === 1 ? ' person' : ' people');

    if (!shown.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No staff match these filters</td></tr>';
      renderPagination(total);
      return;
    }

    tbody.innerHTML = shown.map(function (app) {
      var name = esc(((app.firstName || '') + ' ' + (app.lastName || '')).trim() || 'Unnamed');
      return '<tr>'
        + '<td>'
          + '<div class="as-stack">'
            + '<button type="button" class="applicant-link as-stack-title" data-action="open-drawer" data-app-id="' + esc(app.id) + '">' + name + '</button>'
            + '<span class="text-muted fs-sm">' + esc(app.email || '') + '</span>'
            + (app.phone ? '<span class="text-muted fs-sm">' + esc(app.phone) + '</span>' : '')
          + '</div>'
        + '</td>'
        + '<td>' + AdminApplicant.renderRolePills(app.roles || []) + '</td>'
        + '<td>' + locationCell(app) + '</td>'
        + '<td>' + rtwCell(app) + '</td>'
        + '<td>' + accountCell(app) + '</td>'
        + '<td>'
          + '<div class="as-row-actions">'
            + '<button type="button" class="btn btn-ghost btn-sm" data-action="open-drawer" data-app-id="' + esc(app.id) + '">View</button>'
            + '<button type="button" class="btn btn-ghost btn-sm" data-action="open-rtw-modal" data-applicant-id="' + esc(app.applicantId) + '">Record RTW</button>'
          + '</div>'
        + '</td>'
        + '</tr>';
    }).join('');

    renderPagination(total);
  }

  function renderPagination(total) {
    var el = document.getElementById('staff-pagination');
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = '<span class="as-pagination-info">Page ' + page + ' of ' + totalPages + ' · ' + total + ' total</span>'
      + '<span class="as-pagination-controls">'
      + '<button data-action="prev-page"' + (page === 1 ? ' disabled' : '') + '>Prev</button>'
      + '<button data-action="next-page"' + (page === totalPages ? ' disabled' : '') + '>Next</button>'
      + '</span>';
  }

  // ── Filters ──────────────────────────────────────────────
  function applyFilters() {
    filters = {
      role: document.getElementById('filter-role').value,
      search: document.getElementById('filter-search').value.trim(),
      location: document.getElementById('filter-location').value.trim(),
      concern: filters.concern
    };
    page = 1;
    reload();
  }

  function clearFilters() {
    ['filter-role', 'filter-search', 'filter-location'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.querySelectorAll('#staff-stats .kpi-card').forEach(function (c) { c.classList.remove('kpi-active'); });
    filters = { role: '', search: '', location: '', concern: '' };
    page = 1;
    reload();
  }

  function sortBy(col) {
    if (sort.col === col) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else { sort.col = col; sort.dir = 'asc'; }
    page = 1;
    load();
  }

  async function exportCsv(btn) {
    try {
      var all = await AdminCore.withLoading(btn, async function () {
        var out = [];
        var p = 1;
        for (;;) {
          var data = await fetch_('/api/v1/applications?' + buildParams({ page: p, limit: 50 }).toString());
          out = out.concat(data.applications || []);
          var pages = data.pagination ? data.pagination.totalPages : 1;
          if (p >= pages) break;
          p++;
        }
        return out;
      });

      AdminCore.exportCSV(all.map(function (a) {
        var rtw = a.rightToWork || {};
        return {
          Name: ((a.firstName || '') + ' ' + (a.lastName || '')).trim(),
          Email: a.email,
          Phone: a.phone,
          Roles: (a.roles || []).map(function (r) { return typeof r === 'string' ? r : r.name; }).join('; '),
          Postcode: a.postcode,
          RightToWork: rtw.label || 'Not recorded',
          RightToWorkExpires: rtw.expiresAt ? fmtD(rtw.expiresAt) : '',
          Account: (a.account && a.account.label) || ''
        };
      }), 'staff');
    } catch (e) {
      toast('Export failed: ' + e.message, 'error');
    }
  }

  // ── Events ───────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'refresh-stats') return reload();
    if (action === 'apply-filters') return applyFilters();
    if (action === 'clear-filters') return clearFilters();
    if (action === 'export-csv')    return exportCsv(el);
    if (action === 'prev-page')     { page--; return load(); }
    if (action === 'next-page')     { page++; return load(); }
  });

  document.querySelector('#staff-panel thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    sortBy(th.dataset.sort);
    document.querySelectorAll('#staff-panel th').forEach(function (t) { t.classList.remove('sorted'); });
    th.classList.add('sorted');
  });

  var debounced = AdminCore.debounce(applyFilters, 300);
  ['filter-search', 'filter-location'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', debounced);
  });
  document.getElementById('filter-role').addEventListener('change', applyFilters);

  // Stat cards narrow the list to whatever they are counting.
  document.getElementById('staff-stats').addEventListener('click', function (e) {
    var card = e.target.closest('.kpi-card[data-concern]');
    if (!card) return;
    var concern = card.dataset.concern;
    var wasActive = card.classList.contains('kpi-active');

    document.querySelectorAll('#staff-stats .kpi-card').forEach(function (c) { c.classList.remove('kpi-active'); });
    if (wasActive || !concern) {
      filters.concern = '';
    } else {
      card.classList.add('kpi-active');
      filters.concern = concern;
    }
    render(rows.length);
  });

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;

    await AdminApplicant.init({ onChange: reload });
    await reload();
  }

  window.addEventListener('load', init);
}());
