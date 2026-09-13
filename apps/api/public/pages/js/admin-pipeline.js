/**
 * admin-pipeline.js — people you are still deciding about.
 *
 * RECEIVED → REVIEWING → SHORTLISTED, and out the other side as HIRED or
 * REJECTED. Once someone is hired they leave this page and appear on Staff,
 * because nothing you do to a candidate is anything you do to an employee.
 */
(function () {
  'use strict';

  var esc     = AdminCore.escapeHtml;
  var fetch_  = AdminCore.fetchJSON;
  var fmtD    = AdminCore.formatDate;
  var toast   = function (m, t) { AdminCore.notify(m, t); };

  var SELECTED_STATUS = AdminApplicant.SELECTED_STATUS;

  var rows = [];
  var selectedIds = new Set();
  var sort = { col: 'createdAt', dir: 'desc' };
  var filters = { status: '', role: '', search: '', location: '' };
  var view = 'main'; // rejected applications deliberately live outside the pipeline
  var page = 1;
  var totalPages = 1;
  var PAGE_SIZE = 25;

  var REFRESH_INTERVAL = 60 * 1000;

  // ── Headline figures + the attention panel ───────────────
  var attentionOpen = false;

  async function loadStats() {
    try {
      var data = await fetch_('/api/v1/admin/stats');

      var weekEl = document.getElementById('kpi-week-sub');
      if (weekEl) weekEl.textContent = '+' + data.applicants.newThisWeek + ' this week';

      var el = document.getElementById('as-refresh-label');
      if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      renderAttention(data.alerts, data.onboarding);
    } catch (e) {
      toast('Failed to load stats: ' + e.message, 'error');
    }
  }

  // Everything waiting on an admin, in one list, folded away until it matters.
  // The three onboarding groups are all about hired people, so each row links
  // through to Staff rather than opening a drawer here.
  function personRow(item, meta) {
    var href = 'admin-staff?application=' + encodeURIComponent(item.applicationId || '');
    return '<a class="as-attention-item" href="' + esc(href) + '">'
      + '<span class="as-attention-name">' + esc(item.name) + '</span>'
      + '<span class="text-muted fs-sm">' + esc(meta) + '</span></a>';
  }

  function attentionGroup(title, items) {
    if (!items.length) return '';
    return '<div class="as-attention-group">'
      + '<div class="as-attention-group-head">' + esc(title)
      + '<span class="as-count">' + items.length + '</span></div>'
      + items.join('') + '</div>';
  }

  function renderAttention(alerts, onboarding) {
    var body = document.getElementById('attention-body');
    var btn = document.getElementById('attention-btn');
    if (!body || !btn) return;

    onboarding = onboarding || {};
    var pendingRtw = onboarding.pendingRtw || [];
    var pendingRosterLogin = onboarding.pendingRosterLogin || [];
    var expiringRtw = onboarding.expiringRtw || [];

    var warnings = (alerts || []).filter(function (a) {
      return !(AdminCore.staffOnly && a.category === 'client');
    });

    // The warnings summarise the lists below them, so they only earn a line
    // when they are saying something the lists do not.
    var extraWarnings = warnings.filter(function (a) {
      return !/right-to-work|roster login/i.test(a.message);
    });

    var total = pendingRtw.length + pendingRosterLogin.length + expiringRtw.length + extraWarnings.length;

    document.getElementById('attention-count').textContent = total;
    btn.classList.toggle('d-none', total === 0);
    if (total === 0) setAttentionOpen(false);

    body.innerHTML =
      extraWarnings.map(function (a) {
        return '<div class="as-attention-item as-attention-warning">'
          + '<span class="as-attention-name">' + esc(a.message) + '</span></div>';
      }).join('')
      + attentionGroup('Awaiting right-to-work check', pendingRtw.map(function (i) {
          return personRow(i, 'Hired ' + fmtD(i.hiredAt));
        }))
      + attentionGroup('Roster login not sent', pendingRosterLogin.map(function (i) {
          return personRow(i, 'Hired ' + fmtD(i.hiredAt));
        }))
      + attentionGroup('Right-to-work expiring', expiringRtw.map(function (i) {
          return personRow(i, (i.expired ? 'Expired ' : 'Expires ') + fmtD(i.expiresAt));
        }));
  }

  function setAttentionOpen(open) {
    attentionOpen = open;
    var panel = document.getElementById('attention-panel');
    var btn = document.getElementById('attention-btn');
    if (panel) panel.classList.toggle('d-none', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }

  // ── The list ─────────────────────────────────────────────
  // Paginated server-side — only the current page is ever fetched. The status
  // counters come from a separate DB aggregate that ignores pagination, so
  // they describe the whole filtered set rather than the rows on screen.
  function buildParams(extra) {
    var params = new URLSearchParams();
    if (view === 'rejected') {
      params.set('status', 'REJECTED');
      params.set('includeRejected', 'true');
    } else if (filters.status) {
      params.set('status', filters.status);
    } else {
      params.set('group', 'pipeline');
    }
    if (filters.role) params.set('role', filters.role);
    if (filters.search) params.set('search', filters.search);
    if (filters.location) params.set('location', filters.location);
    if (extra) Object.keys(extra).forEach(function (k) { params.set(k, extra[k]); });
    return params;
  }

  async function load() {
    try {
      var params = buildParams({
        page: page,
        limit: PAGE_SIZE,
        // A location search always ranks the closest people first.
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
      document.getElementById('applications-body').innerHTML =
        '<tr><td colspan="7" class="empty-state">Failed to load: ' + esc(e.message) + '</td></tr>';
    }
  }

  async function loadCounts() {
    try {
      var params = new URLSearchParams();
      if (filters.role) params.set('role', filters.role);
      if (filters.search) params.set('search', filters.search);
      var qs = params.toString();
      var data = await fetch_('/api/v1/applications/stats' + (qs ? '?' + qs : ''));
      var counts = (data && data.counts) || {};
      var inPipeline = (counts['RECEIVED'] || 0) + (counts['REVIEWING'] || 0) + (counts[SELECTED_STATUS] || 0);

      document.getElementById('stat-total').textContent     = inPipeline;
      document.getElementById('stat-received').textContent  = counts['RECEIVED'] || 0;
      document.getElementById('stat-reviewing').textContent = counts['REVIEWING'] || 0;
      document.getElementById('stat-selected').textContent  = counts[SELECTED_STATUS] || 0;
      document.getElementById('rejected-pile-count').textContent = counts['REJECTED'] || 0;
      document.getElementById('staff-count').textContent = counts['HIRED'] || 0;
    } catch (e) {
      toast('Failed to load counts: ' + e.message, 'error');
    }
  }

  async function reload() {
    await Promise.all([load(), loadCounts(), loadStats()]);
  }

  function locationCell(app) {
    var postcode = app.postcode || '';
    var distance = typeof app.distanceMiles === 'number' ? app.distanceMiles.toFixed(1) + ' mi' : '';
    if (!postcode && !distance) return '<span class="text-muted">-</span>';
    return '<div class="as-stack">'
      + '<span>' + esc(postcode || '-') + '</span>'
      + (distance ? '<span class="text-muted fs-sm">' + esc(distance) + '</span>' : '')
      + '</div>';
  }

  function render(total) {
    var tbody = document.getElementById('applications-body');

    document.getElementById('app-count').textContent =
      total + (total === 1 ? ' candidate' : ' candidates');

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">'
        + (view === 'rejected' ? 'Nothing in the rejected pile' : 'No candidates match these filters')
        + '</td></tr>';
      renderPagination(total);
      return;
    }

    tbody.innerHTML = rows.map(function (app) {
      var name = esc(((app.firstName || '') + ' ' + (app.lastName || '')).trim() || 'Unnamed');
      return '<tr>'
        + '<td class="checkbox-col"><input type="checkbox" class="app-checkbox" data-app-id="' + esc(app.id) + '"'
          + (selectedIds.has(app.id) ? ' checked' : '') + '></td>'
        + '<td>'
          + '<div class="as-stack">'
            + '<button type="button" class="applicant-link as-stack-title" data-action="open-drawer" data-app-id="' + esc(app.id) + '">' + name + '</button>'
            + '<span class="text-muted fs-sm">' + esc(app.email || '') + '</span>'
            + (app.phone ? '<span class="text-muted fs-sm">' + esc(app.phone) + '</span>' : '')
          + '</div>'
        + '</td>'
        + '<td>' + AdminApplicant.renderRolePills(app.roles || []) + '</td>'
        + '<td>' + locationCell(app) + '</td>'
        + '<td><span class="badge badge-' + esc(AdminApplicant.statusBadgeClass(app.status)) + '">'
          + esc(AdminApplicant.statusLabel(app.status)) + '</span></td>'
        + '<td class="text-muted fs-sm">' + fmtD(app.createdAt) + '</td>'
        + '<td>' + AdminApplicant.renderRowActions(app) + '</td>'
        + '</tr>';
    }).join('');

    renderPagination(total);
    updateBulkBar();
  }

  function renderPagination(total) {
    var el = document.getElementById('app-pagination');
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    var buttons = '';
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
        buttons += '<button data-action="goto-page" data-page="' + p + '"'
          + (p === page ? ' class="active"' : '') + '>' + p + '</button>';
      } else if (Math.abs(p - page) === 2) {
        buttons += '<span class="text-muted" style="padding:0 4px">…</span>';
      }
    }

    el.innerHTML = '<span class="as-pagination-info">Page ' + page + ' of ' + totalPages
      + ' · ' + total + ' total</span>'
      + '<span class="as-pagination-controls">'
      + '<button data-action="prev-page"' + (page === 1 ? ' disabled' : '') + '>Prev</button>'
      + buttons
      + '<button data-action="next-page"' + (page === totalPages ? ' disabled' : '') + '>Next</button>'
      + '</span>';
  }

  // ── Filters ──────────────────────────────────────────────
  function applyFilters() {
    var status = document.getElementById('filter-status').value;
    if (status) {
      view = 'main';
      document.getElementById('rejected-pile-banner').style.display = 'none';
    }
    filters = {
      status: status,
      role: document.getElementById('filter-role').value,
      search: document.getElementById('filter-search').value.trim(),
      location: document.getElementById('filter-location').value.trim()
    };
    page = 1;
    selectedIds.clear();
    reload();
  }

  function clearFilters() {
    ['filter-status', 'filter-role', 'filter-search', 'filter-location'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.querySelectorAll('#app-stats .kpi-card').forEach(function (c) { c.classList.remove('kpi-active'); });
    filters = { status: '', role: '', search: '', location: '' };
    view = 'main';
    document.getElementById('rejected-pile-banner').style.display = 'none';
    page = 1;
    selectedIds.clear();
    reload();
  }

  function showRejectedPile() {
    view = 'rejected';
    page = 1;
    selectedIds.clear();
    document.getElementById('rejected-pile-banner').style.display = '';
    document.getElementById('filter-status').value = '';
    filters.status = '';
    reload();
  }

  function showPipeline() {
    view = 'main';
    page = 1;
    selectedIds.clear();
    document.getElementById('rejected-pile-banner').style.display = 'none';
    reload();
  }

  function sortBy(col) {
    if (sort.col === col) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else { sort.col = col; sort.dir = 'asc'; }
    page = 1;
    load();
  }

  // ── Bulk actions ─────────────────────────────────────────
  function updateBulkBar() {
    var bar = document.getElementById('app-bulk-bar');
    var count = document.getElementById('app-bulk-count');
    if (!bar || !count) return;
    count.textContent = selectedIds.size;
    bar.classList.toggle('visible', selectedIds.size > 0);
  }

  async function bulkUpdateStatus(status, btn) {
    if (!selectedIds.size) return;
    var ids = Array.from(selectedIds);
    var label = AdminApplicant.statusLabel(status).toLowerCase();
    if (!confirm('Mark ' + ids.length + ' candidate' + (ids.length > 1 ? 's' : '') + ' as ' + label + '?')) return;

    try {
      await AdminCore.withLoading(btn, function () {
        return Promise.all(ids.map(function (id) {
          return fetch_('/api/v1/applications/' + id + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
          });
        }));
      });
      toast(ids.length + ' updated', 'success');
      selectedIds.clear();
      await reload();
    } catch (e) {
      toast('Bulk update failed: ' + e.message, 'error');
    }
  }

  // ── CSV ──────────────────────────────────────────────────
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
        return {
          Name: ((a.firstName || '') + ' ' + (a.lastName || '')).trim(),
          Email: a.email,
          Phone: a.phone,
          Roles: (a.roles || []).map(function (r) { return typeof r === 'string' ? r : r.name; }).join('; '),
          Postcode: a.postcode,
          Status: AdminApplicant.statusLabel(a.status),
          Applied: fmtD(a.createdAt)
        };
      }), 'candidates');
    } catch (e) {
      toast('Export failed: ' + e.message, 'error');
    }
  }

  // ── Events ───────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'refresh-stats')      return reload();
    if (action === 'toggle-attention')   return setAttentionOpen(!attentionOpen);
    if (action === 'apply-filters')      return applyFilters();
    if (action === 'clear-filters')      return clearFilters();
    if (action === 'show-rejected-pile') return showRejectedPile();
    if (action === 'show-pipeline')      return showPipeline();
    if (action === 'bulk-select')        return bulkUpdateStatus(SELECTED_STATUS, el);
    if (action === 'bulk-reject')        return bulkUpdateStatus('REJECTED', el);
    if (action === 'bulk-clear')         { selectedIds.clear(); updateBulkBar(); render(rows.length); return; }
    if (action === 'export-csv')         return exportCsv(el);
    if (action === 'prev-page')          { page--; return load(); }
    if (action === 'next-page')          { page++; return load(); }
    if (action === 'goto-page')          { page = parseInt(el.dataset.page, 10); return load(); }
  });

  document.addEventListener('change', function (e) {
    var cb = e.target.closest('.app-checkbox');
    if (cb) {
      if (cb.checked) selectedIds.add(cb.dataset.appId);
      else selectedIds.delete(cb.dataset.appId);
      return updateBulkBar();
    }
    var all = e.target.closest('#app-select-all');
    if (all) {
      document.querySelectorAll('.app-checkbox').forEach(function (c) {
        if (all.checked) selectedIds.add(c.dataset.appId);
        else selectedIds.delete(c.dataset.appId);
        c.checked = all.checked;
      });
      updateBulkBar();
    }
  });

  document.querySelector('#applications-panel thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    sortBy(th.dataset.sort);
    document.querySelectorAll('#applications-panel th').forEach(function (t) { t.classList.remove('sorted'); });
    th.classList.add('sorted');
  });

  var debounced = AdminCore.debounce(applyFilters, 300);
  ['filter-search', 'filter-location'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', debounced);
  });
  ['filter-status', 'filter-role'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', applyFilters);
  });

  // Stat cards double as status filters.
  document.getElementById('app-stats').addEventListener('click', function (e) {
    var card = e.target.closest('.kpi-card[data-filter]');
    if (!card) return;
    var filter = card.dataset.filter;
    var wasActive = card.classList.contains('kpi-active');

    document.querySelectorAll('#app-stats .kpi-card').forEach(function (c) { c.classList.remove('kpi-active'); });
    view = 'main';
    document.getElementById('rejected-pile-banner').style.display = 'none';

    if (wasActive || filter === 'all') {
      document.getElementById('filter-status').value = '';
    } else {
      card.classList.add('kpi-active');
      document.getElementById('filter-status').value = filter === 'SELECTED' ? SELECTED_STATUS : filter;
    }
    applyFilters();
  });

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;

    await AdminApplicant.init({ onChange: reload });
    await reload();
    setInterval(loadStats, REFRESH_INTERVAL);
  }

  window.addEventListener('load', init);
}());
