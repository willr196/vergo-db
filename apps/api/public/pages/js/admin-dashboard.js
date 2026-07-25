(function () {
  'use strict';

  var esc       = AdminCore.escapeHtml;
  var fetch_    = AdminCore.fetchJSON;
  var fmtDt    = AdminCore.formatDateTime;
  var fmtD     = AdminCore.formatDate;
  var relTime  = AdminCore.relativeTime;
  var notify   = function (m, t) { AdminCore.notify(m, t); };
  var toast    = notify;

  // ── State ────────────────────────────────────────────────
  var allApplications = [];
  var allContacts     = [];
  var allEvents       = [];
  var filteredApps    = [];
  var selectedAppIds  = new Set();
  var applicationDetails = {};
  var activeDrawerAppId = null;
  var SELECTED_STATUS = ['SHORT', 'LISTED'].join('');

  var appSort      = { col: 'createdAt', dir: 'desc' };
  var contactSort  = { col: 'createdAt', dir: 'desc' };
  var eventSort    = { col: 'eventDate',  dir: 'asc'  };

  var appPage = 1;
  var APP_PAGE_SIZE = 25;

  // ── Auto-refresh ────────────────────────────────────────
  var REFRESH_INTERVAL = 60 * 1000;
  function scheduleRefresh() {
    setInterval(function () { loadStats(); }, REFRESH_INTERVAL);
  }

  // ── KPI Dashboard ────────────────────────────────────────
  async function loadStats() {
    try {
      var data = await fetch_('/api/v1/admin/stats');

      // Applicants
      document.getElementById('kpi-applicants').textContent = data.applicants.total;
      document.getElementById('kpi-applicants-sub').textContent = '+' + data.applicants.newThisWeek + ' this week';
      document.getElementById('kpi-pending').textContent   = data.applicants.received;
      document.getElementById('kpi-hired').textContent     = data.applicants.hired;

      // Clients
      document.getElementById('kpi-clients').textContent         = data.clients.total;
      document.getElementById('kpi-clients-sub').textContent     = data.clients.approved + ' approved';
      document.getElementById('kpi-clients-pending').textContent = data.clients.pending;

      // Quotes
      document.getElementById('kpi-quotes').textContent     = data.quotes.new + ' new / ' + data.quotes.quoted + ' quoted';
      document.getElementById('kpi-quotes-sub').textContent = data.quotes.total + ' total requests';

      // Revenue
      var rev = data.quotes.revenueEstimate || 0;
      document.getElementById('kpi-revenue').textContent = '£' + rev.toLocaleString('en-GB', { maximumFractionDigits: 0 });

      // New this week
      document.getElementById('kpi-week').textContent = data.applicants.newThisWeek + data.clients.newThisWeek;

      // Refresh label
      var el = document.getElementById('as-refresh-label');
      if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      renderAlerts(data.alerts);
      renderActivity(data.activity);
    } catch (e) {
      toast('Failed to load stats: ' + e.message, 'error');
    }
  }

  function renderAlerts(alerts) {
    var panel = document.getElementById('alerts-panel');
    if (!panel) return;
    if (!alerts || alerts.length === 0) {
      panel.innerHTML = '<div class="as-alert-panel"><div class="as-alert-header">✓ All clear</div>'
        + '<div class="as-alert-item"><span class="as-alert-icon">✓</span><span class="as-alert-text text-muted">No issues requiring attention.</span></div></div>';
      return;
    }
    var items = alerts.map(function (a) {
      return '<div class="as-alert-item"><span class="as-alert-icon">⚠</span>'
        + '<span class="as-alert-text">' + esc(a.message) + '</span></div>';
    }).join('');
    panel.innerHTML = '<div class="as-alert-panel"><div class="as-alert-header">⚠ ' + alerts.length + ' alert' + (alerts.length > 1 ? 's' : '') + '</div>' + items + '</div>';
  }

  function renderActivity(items) {
    var feed = document.getElementById('activity-feed');
    if (!feed) return;
    if (!items || items.length === 0) {
      feed.innerHTML = '<div class="as-activity-header">Recent Activity</div>'
        + '<div class="as-activity-item"><span class="as-dot"></span><span class="as-activity-text text-muted">No recent activity.</span></div>';
      return;
    }
    var rows = items.map(function (item) {
      var color = item.color || 'default';
      var dotClass = color === 'success' ? 'success' : color === 'error' ? 'error' : color === 'info' ? 'info' : '';
      return '<div class="as-activity-item">'
        + '<span class="as-dot ' + dotClass + '"></span>'
        + '<span class="as-activity-text">' + esc(item.text) + '</span>'
        + '<span class="as-activity-time">' + esc(relTime(item.time)) + '</span>'
        + '</div>';
    }).join('');
    feed.innerHTML = '<div class="as-activity-header">Last 10 actions</div>' + rows;
  }

  // ── Tabs ─────────────────────────────────────────────────
  AdminCore.initTabs('#roster-tabs');

  // ── Applications ─────────────────────────────────────────
  async function loadApplications() {
    try {
      var data = await fetch_('/api/v1/applications');
      allApplications = Array.isArray(data) ? data : (data.applications || []);
      filteredApps = allApplications.slice();
      updateAppStats();
      renderApplications();
    } catch (e) {
      document.getElementById('applications-body').innerHTML =
        '<tr><td colspan="8" class="empty-state">Failed to load: ' + esc(e.message) + '</td></tr>';
    }
  }

  function updateAppStats() {
    var counts = allApplications.reduce(function (acc, a) {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});
    document.getElementById('stat-total').textContent       = allApplications.length;
    document.getElementById('stat-received').textContent    = counts['RECEIVED']   || 0;
    document.getElementById('stat-reviewing').textContent   = counts['REVIEWING']  || 0;
    document.getElementById('stat-selected').textContent    = counts[SELECTED_STATUS] || 0;
    document.getElementById('stat-rejected').textContent    = counts['REJECTED']   || 0;
    document.getElementById('stat-hired').textContent       = counts['HIRED']      || 0;
  }

  function formatApplicationStatus(status) {
    if (status === 'RECEIVED') return 'New';
    if (status === 'REVIEWING') return 'Reviewing';
    if (status === 'REJECTED') return 'Rejected';
    if (status === 'HIRED') return 'Hired';
    return status === SELECTED_STATUS ? 'Selected' : status;
  }

  function applicationBadgeClass(status) {
    return status === SELECTED_STATUS ? 'SELECTED' : status;
  }

  function applyFilters() {
    var status  = document.getElementById('filter-status').value;
    if (status === 'SELECTED') status = SELECTED_STATUS;
    var role    = document.getElementById('filter-role').value;
    var search  = document.getElementById('filter-search').value.toLowerCase();
    filteredApps = allApplications.filter(function (a) {
      if (status && a.status !== status) return false;
      if (role) {
        var names = (a.roles || []).map(function(r){ return typeof r === 'string' ? r : r.name; });
        if (!names.includes(role)) return false;
      }
      if (search) {
        var txt = (a.firstName + ' ' + a.lastName + ' ' + (a.email||'') + ' ' + (a.phone||'')).toLowerCase();
        if (!txt.includes(search)) return false;
      }
      return true;
    });
    appPage = 1;
    renderApplications();
  }

  function clearFilters() {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-role').value   = '';
    document.getElementById('filter-search').value = '';
    document.querySelectorAll('#app-stats .kpi-card').forEach(function(c){c.classList.remove('kpi-active');});
    filteredApps = allApplications.slice();
    appPage = 1;
    renderApplications();
  }

  function sortApplications(col) {
    if (appSort.col === col) {
      appSort.dir = appSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      appSort.col = col;
      appSort.dir = 'asc';
    }
    renderApplications();
  }

  function renderApplications() {
    var apps = filteredApps.slice();

    // Sort
    apps.sort(function (a, b) {
      var av, bv;
      if (appSort.col === 'fullName') {
        av = (a.firstName + ' ' + a.lastName).toLowerCase();
        bv = (b.firstName + ' ' + b.lastName).toLowerCase();
      } else if (appSort.col === 'createdAt') {
        av = new Date(a.createdAt); bv = new Date(b.createdAt);
      } else if (appSort.col === 'roles') {
        av = (a.roles||[]).map(function(r){return typeof r==='string'?r:r.name;}).join('');
        bv = (b.roles||[]).map(function(r){return typeof r==='string'?r:r.name;}).join('');
      } else {
        av = a[appSort.col]; bv = b[appSort.col];
      }
      if (av < bv) return appSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return appSort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    var total = apps.length;
    var pages = Math.max(1, Math.ceil(total / APP_PAGE_SIZE));
    if (appPage > pages) appPage = pages;
    var start = (appPage - 1) * APP_PAGE_SIZE;
    var pageApps = apps.slice(start, start + APP_PAGE_SIZE);

    var countEl = document.getElementById('app-count');
    if (countEl) countEl.textContent = total + ' result' + (total !== 1 ? 's' : '');

    var tbody = document.getElementById('applications-body');
    if (!pageApps.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No applications found</td></tr>';
      renderAppPagination(total, pages);
      return;
    }

    tbody.innerHTML = pageApps.map(function (app) {
      var roles = (app.roles || []).map(function (r) {
        var name = typeof r === 'string' ? r : r.name;
        return '<span class="role-pill">' + esc(name) + '</span>';
      }).join('');
      var checked = selectedAppIds.has(app.id) ? ' checked' : '';
      return '<tr>'
        + '<td class="checkbox-col"><input type="checkbox" data-app-id="' + esc(app.id) + '" class="app-checkbox"' + checked + '></td>'
        + '<td><button type="button" class="applicant-link" data-action="open-drawer" data-app-id="' + esc(app.id) + '">' + esc(app.firstName) + ' ' + esc(app.lastName) + '</button></td>'
        + '<td>' + esc(app.email) + '</td>'
        + '<td>' + esc(app.phone || '-') + '</td>'
        + '<td>' + (roles || '<span class="text-muted">-</span>') + '</td>'
        + '<td><span class="badge badge-' + esc(applicationBadgeClass(app.status)) + '">' + esc(formatApplicationStatus(app.status)) + '</span></td>'
        + '<td>' + fmtD(app.createdAt) + '</td>'
        + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn btn-info btn-sm" data-action="open-cv" data-app-id="' + esc(app.id) + '" data-cv-url="' + esc(app.cvUrl || app.cvKey || '') + '">CV</button>'
        + renderStatusActions(app.id, app.status)
        + renderRosterLoginEmailAction(app.id, app.status, app.account)
        + '</div></td>'
        + '</tr>';
    }).join('');

    renderAppPagination(total, pages);
  }

  function renderAppPagination(total, pages) {
    var el = document.getElementById('app-pagination');
    if (!el) return;
    if (pages <= 1) { el.innerHTML = ''; return; }
    var info = '<span class="as-pagination-info">Page ' + appPage + ' of ' + pages + ' (' + total + ' total)</span>';
    var btns = '<div class="as-pagination-controls">'
      + '<button ' + (appPage <= 1 ? 'disabled' : '') + ' data-action="app-prev-page">&#8249; Prev</button>';

    var toShow = [];
    if (pages <= 7) {
      for (var i = 1; i <= pages; i++) toShow.push(i);
    } else {
      toShow.push(1);
      if (appPage > 3) toShow.push('...');
      var start = Math.max(2, appPage - 1);
      var end = Math.min(pages - 1, appPage + 1);
      for (var i = start; i <= end; i++) toShow.push(i);
      if (appPage < pages - 2) toShow.push('...');
      toShow.push(pages);
    }

    toShow.forEach(function (item) {
      if (item === '...') {
        btns += '<span style="padding:0 4px;color:var(--as-muted)">…</span>';
      } else {
        btns += '<button ' + (item === appPage ? 'class="active"' : '') + ' data-action="app-goto-page" data-page="' + item + '">' + item + '</button>';
      }
    });

    btns += '<button ' + (appPage >= pages ? 'disabled' : '') + ' data-action="app-next-page">Next &#8250;</button></div>';
    el.innerHTML = info + btns;
  }

  function findApplication(appId) {
    return allApplications.find(function (app) { return app.id === appId; }) || null;
  }

  function getRequestedApplicationId() {
    var params = new URLSearchParams(window.location.search || '');
    var appId = params.get('applicationId') || params.get('appId') || params.get('application');
    if (!appId && window.location.hash) {
      var hashParams = new URLSearchParams(window.location.hash.slice(1));
      appId = hashParams.get('applicationId') || hashParams.get('appId') || hashParams.get('application');
    }
    return appId || '';
  }

  async function openRequestedApplicationFromUrl() {
    var appId = getRequestedApplicationId();
    if (!appId) return;
    await openDrawer(appId);
  }

  function renderTagPills(items, className, emptyLabel) {
    if (!items || items.length === 0) {
      return '<span class="text-muted">' + esc(emptyLabel || '-') + '</span>';
    }
    return items.map(function (item) {
      return '<span class="tag-pill ' + esc(className || '') + '">' + esc(item) + '</span>';
    }).join('');
  }

  function renderRolePills(roles) {
    if (!roles || roles.length === 0) {
      return '<span class="text-muted">No roles selected</span>';
    }
    return roles.map(function (role) {
      var label = role.experienceLevel ? role.name + ' · ' + role.experienceLevel : role.name;
      return '<span class="tag-pill tag-pill-role">' + esc(label) + '</span>';
    }).join('');
  }

  function renderTierBadge(tier) {
    var safeTier = tier === 'GOLD' ? 'GOLD' : 'STANDARD';
    var tierClass = safeTier === 'GOLD' ? 'gold' : 'standard';
    return '<span class="tier-badge ' + tierClass + '">' + safeTier + '</span>';
  }

  function formatRating(rating) {
    return rating ? esc(String(rating)) + '/5' : 'Unrated';
  }

  function formatCurrency(rate) {
    return rate ? '£' + esc(String(rate)) + '/hr' : 'Not set';
  }

  function isPdfCv(detail) {
    var mime = String(detail.cvMimeType || '').toLowerCase();
    var fileName = String(detail.cvOriginalName || '').toLowerCase();
    return mime === 'application/pdf' || /\.pdf($|\?)/.test(fileName);
  }

  function renderStatusActions(appId, status) {
    return (status !== 'REVIEWING' ? '<button class="btn btn-warning btn-sm" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="REVIEWING">Review</button>' : '')
      + (status !== SELECTED_STATUS ? '<button class="btn btn-success btn-sm" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="' + SELECTED_STATUS + '">Select</button>' : '')
      + (status !== 'HIRED' ? '<button class="btn btn-sm" style="background:#20c997;color:#fff" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="HIRED">Hire</button>' : '')
      + (status !== 'REJECTED' ? '<button class="btn btn-danger btn-sm" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="REJECTED">Reject</button>' : '');
  }

  function renderRosterLoginEmailAction(appId, status, account) {
    if (status !== 'HIRED') return '';
    if (account && account.status === 'ACTIVE') {
      return '<span class="badge badge-HIRED">Account active</span>';
    }
    var label = account && account.exists ? 'Resend login email' : 'Send login email';
    return '<button class="btn btn-info btn-sm" data-action="send-roster-login" data-app-id="' + esc(appId) + '">' + label + '</button>';
  }

  function wireDrawerNotesAutoSave(appId, savedNotes) {
    var notesEl = document.getElementById('drawer-notes');
    if (!notesEl) return;
    notesEl.dataset.savedValue = savedNotes || '';
    notesEl.addEventListener('blur', function () {
      if (notesEl.value !== (notesEl.dataset.savedValue || '')) {
        saveNotes(appId, true);
      }
    });
  }

  function renderDrawer(detail) {
    var applicant = detail.applicant || {};
    var preferredJobTypes = renderTagPills(applicant.preferredJobTypes || [], 'tag-pill-jobtype', 'Not provided');
    var rolePills = renderRolePills(detail.roles || []);
    var hasPdfPreview = Boolean(detail.cvUrl) && isPdfCv(detail);
    var downloadHref = detail.cvUrl || '';
    var notesValue = detail.notes || '';

    document.getElementById('drawer-name').textContent = applicant.fullName || ((applicant.firstName || '') + ' ' + (applicant.lastName || '')).trim() || 'Applicant';
    document.getElementById('drawer-body').innerHTML =
      '<div class="detail-grid mb-2">'
      + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value"><a class="detail-link" href="mailto:' + esc(applicant.email || '') + '">' + esc(applicant.email || '-') + '</a></span></div>'
      + '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + esc(applicant.phone || '-') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">DOB</span><span class="detail-value">' + fmtD(applicant.dateOfBirth) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Postcode</span><span class="detail-value">' + esc(applicant.postcode || '-') + '</span></div>'
      + '</div>'
      + '<div class="drawer-section mb-2"><span class="detail-label">Preferred job types</span><div class="pill-wrap mt-1">' + preferredJobTypes + '</div></div>'
      + '<div class="drawer-section mb-2"><span class="detail-label">Roles applied for</span><div class="pill-wrap mt-1">' + rolePills + '</div></div>'
      + '<div class="drawer-section mb-2"><span class="detail-label">Bio</span><p class="drawer-copy">' + esc(applicant.bio || 'No bio provided.') + '</p></div>'
      + '<div class="detail-grid mb-2">'
      + '<div class="detail-row"><span class="detail-label">Years of experience</span><span class="detail-value">' + esc(applicant.yearsExperience != null ? String(applicant.yearsExperience) : 'Not provided') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Standard hourly rate</span><span class="detail-value">' + formatCurrency(applicant.hourlyRate) + '</span></div>'
      + '</div>'
      + '<div class="detail-grid mb-2">'
      + '<div class="detail-row">'
      + '<span class="detail-label">Current tier</span>'
      + '<div class="drawer-tier-row">' + renderTierBadge(applicant.staffTier) + '</div>'
      + '</div>'
      + '<div class="detail-row">'
      + '<label class="as-label" for="drawer-tier-select">Change tier</label>'
      + '<select id="drawer-tier-select" class="as-input" data-action="change-tier" data-applicant-id="' + esc(applicant.id || '') + '" data-current-tier="' + esc(applicant.staffTier || 'STANDARD') + '">'
      + '<option value="STANDARD"' + ((applicant.staffTier || 'STANDARD') === 'STANDARD' ? ' selected' : '') + '>STANDARD</option>'
      + '<option value="GOLD"' + (applicant.staffTier === 'GOLD' ? ' selected' : '') + '>GOLD</option>'
      + '</select>'
      + '</div>'
      + '<div class="detail-row">'
      + '<span class="detail-label">Profile visible</span>'
      + '<label class="toggle-switch">'
      + '<input type="checkbox" data-action="toggle-visibility" data-applicant-id="' + esc(applicant.id || '') + '"' + (applicant.profileVisible ? ' checked' : '') + '>'
      + '<span class="toggle-slider"></span>'
      + '<span class="toggle-label">' + (applicant.profileVisible ? 'Visible on marketplace' : 'Hidden from marketplace') + '</span>'
      + '</label>'
      + '</div>'
      + '<div class="detail-row"><span class="detail-label">Promoted to Gold</span><span class="detail-value">' + fmtDt(applicant.promotedToGoldAt) + '</span></div>'
      + '</div>'
      + '<div class="drawer-section mb-2">'
      + '<div class="drawer-section-header"><span class="detail-label">CV</span><span class="detail-meta">' + esc(detail.cvOriginalName || 'Uploaded CV') + '</span></div>'
      + (hasPdfPreview
        ? '<div class="cv-preview"><iframe src="' + esc(downloadHref) + '" title="CV preview"></iframe></div>'
        : '<p class="drawer-copy text-muted">Embedded preview is available for PDF CVs. Use the download link if preview is unavailable.</p>')
      + '<div class="drawer-inline-actions mt-1">'
      + (downloadHref
        ? '<a class="btn btn-ghost btn-sm" href="' + esc(downloadHref) + '" target="_blank" rel="noopener noreferrer">Download CV</a>'
        : '<button class="btn btn-ghost btn-sm" data-action="open-cv" data-app-id="' + esc(detail.id) + '" data-cv-url="' + esc(detail.cvKey || '') + '">Download CV</button>')
      + '</div>'
      + '</div>'
      + '<div class="drawer-section mb-2" id="rtw-section">'
      + '<div class="drawer-section-header"><span class="detail-label">Right to work</span></div>'
      + '<div class="drawer-loading">Loading right-to-work status…</div>'
      + '</div>'
      + '<div class="drawer-section mb-2">'
      + '<label class="as-label" for="drawer-notes">Admin notes</label>'
      + '<textarea id="drawer-notes" maxlength="2000" placeholder="Internal notes for this application...">' + esc(notesValue) + '</textarea>'
      + '<div class="drawer-inline-actions mt-1"><button class="btn btn-ghost btn-sm" data-action="save-notes" data-app-id="' + esc(detail.id) + '">Save notes</button></div>'
      + '</div>'
      + '<div class="stats-row mb-2">'
      + '<div class="stat-card"><span class="detail-label">Total bookings</span><strong>' + esc(String(applicant.totalBookings || 0)) + '</strong></div>'
      + '<div class="stat-card"><span class="detail-label">Average rating</span><strong>' + formatRating(applicant.averageRating) + '</strong></div>'
      + '<div class="stat-card"><span class="detail-label">Status</span><strong><span class="badge badge-' + esc(applicationBadgeClass(detail.status)) + '">' + esc(formatApplicationStatus(detail.status)) + '</span></strong></div>'
      + '</div>'
      + '<div class="detail-grid">'
      + '<div class="detail-row"><span class="detail-label">Applied date</span><span class="detail-value">' + fmtDt(detail.createdAt) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Last updated</span><span class="detail-value">' + fmtDt(detail.lastUpdatedAt || detail.updatedAt) + '</span></div>'
      + '</div>';

    document.getElementById('drawer-footer').innerHTML =
      (downloadHref
        ? '<a class="btn btn-info btn-sm" href="' + esc(downloadHref) + '" target="_blank" rel="noopener noreferrer">Open CV</a>'
        : '<button class="btn btn-info btn-sm" data-action="open-cv" data-app-id="' + esc(detail.id) + '" data-cv-url="' + esc(detail.cvKey || '') + '">Open CV</button>')
      + renderStatusActions(detail.id, detail.status)
      + renderRosterLoginEmailAction(detail.id, detail.status, detail.account);

    wireDrawerNotesAutoSave(detail.id, notesValue);
    loadRightToWork(applicant.id);
  }

  // ── Right to work ────────────────────────────────────────
  var RTW_STATUS_CLASS = {
    PASSED: 'success',
    EXPIRED: 'warning',
    FAILED: 'danger',
    PENDING: 'warning',
    NOT_CHECKED: 'muted'
  };

  var RTW_METHOD_LABEL = {
    SHARE_CODE: 'Online share code',
    DOCUMENT: 'Manual document check',
    IDSP: 'IDSP'
  };

  function renderRightToWork(applicantId, data) {
    var section = document.getElementById('rtw-section');
    if (!section) return;

    var summary = data.summary || {};
    var checks = data.checks || [];
    var statusClass = RTW_STATUS_CLASS[summary.status] || 'muted';

    var history = checks.length
      ? '<table class="drawer-mini-table mt-1"><tbody>' + checks.map(function (check) {
          return '<tr>'
            + '<td>' + fmtD(check.checkedAt) + '</td>'
            + '<td>' + esc(RTW_METHOD_LABEL[check.method] || check.method) + '</td>'
            + '<td>' + esc(check.documentType || '—') + '</td>'
            + '<td>' + (check.expiresAt ? 'Expires ' + fmtD(check.expiresAt) : 'No expiry') + '</td>'
            + '<td><span class="badge badge-' + esc(check.outcome === 'PASS' ? 'success' : check.outcome === 'FAIL' ? 'danger' : 'warning') + '">' + esc(check.outcome) + '</span></td>'
            + '<td>' + (check.hasDocument
              ? '<button class="btn btn-ghost btn-sm" data-action="open-rtw-document" data-check-id="' + esc(check.id) + '">Evidence</button>'
              : '<span class="text-muted fs-sm">No copy</span>') + '</td>'
            + '</tr>';
        }).join('') + '</tbody></table>'
      : '<p class="drawer-copy text-muted mt-1">No checks recorded.</p>';

    section.innerHTML =
      '<div class="drawer-section-header"><span class="detail-label">Right to work</span>'
      + '<span class="badge badge-' + esc(statusClass) + '">' + esc(summary.label || 'Unknown') + '</span>'
      + '</div>'
      + (!summary.clearedToWork
        ? '<div class="alert alert-warning mt-1 fs-sm">This worker cannot be confirmed for a shift until a passed, in-date check is recorded.</div>'
        : '')
      + history
      + '<div class="drawer-inline-actions mt-1">'
      + '<button class="btn btn-ghost btn-sm" data-action="open-rtw-modal" data-applicant-id="' + esc(applicantId) + '">Record a check</button>'
      + (summary.clearedToWork
        ? ''
        : '<button class="btn btn-ghost btn-sm" data-action="resend-rtw-request" data-applicant-id="' + esc(applicantId) + '">Re-send request</button>')
      + '</div>';
  }

  async function loadRightToWork(applicantId) {
    if (!applicantId) return;
    try {
      var data = await fetch_('/api/v1/admin/right-to-work/' + encodeURIComponent(applicantId));
      renderRightToWork(applicantId, data);
    } catch (e) {
      var section = document.getElementById('rtw-section');
      if (section) {
        section.innerHTML =
          '<div class="drawer-section-header"><span class="detail-label">Right to work</span></div>'
          + '<p class="drawer-copy text-muted mt-1">Could not load right-to-work status: ' + esc(e.message) + '</p>';
      }
    }
  }

  var rtwModalApplicantId = null;

  function openRtwModal(applicantId) {
    rtwModalApplicantId = applicantId;
    var detail = applicationDetails[activeDrawerAppId];
    var name = detail && detail.applicant ? detail.applicant.fullName : '';

    document.getElementById('rtw-modal-subject').textContent = name ? 'Recording a check for ' + name : '';
    document.getElementById('rtw-modal-alert').innerHTML = '';
    document.getElementById('rtw-method').value = 'SHARE_CODE';
    document.getElementById('rtw-outcome').value = 'PASS';
    document.getElementById('rtw-document-type').value = '';
    document.getElementById('rtw-reference').value = '';
    document.getElementById('rtw-valid-from').value = '';
    document.getElementById('rtw-expires-at').value = '';
    document.getElementById('rtw-notes').value = '';
    document.getElementById('rtw-document').value = '';

    AdminCore.openModal('rtw-modal');
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('Could not read the selected file.')); };
      reader.readAsDataURL(file);
    });
  }

  async function submitRtwCheck(btn) {
    if (!rtwModalApplicantId) return;

    var body = {
      method: document.getElementById('rtw-method').value,
      outcome: document.getElementById('rtw-outcome').value,
      documentType: document.getElementById('rtw-document-type').value.trim() || undefined,
      reference: document.getElementById('rtw-reference').value.trim() || undefined,
      validFrom: document.getElementById('rtw-valid-from').value || undefined,
      expiresAt: document.getElementById('rtw-expires-at').value || undefined,
      notes: document.getElementById('rtw-notes').value.trim() || undefined
    };

    var fileInput = document.getElementById('rtw-document');
    var file = fileInput.files && fileInput.files[0];

    try {
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error('Document is larger than 10MB.');
        }
        body.document = {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: await readFileAsBase64(file)
        };
      }

      await AdminCore.withLoading(btn, function () {
        return fetch_('/api/v1/admin/right-to-work/' + encodeURIComponent(rtwModalApplicantId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      });

      AdminCore.closeModal('rtw-modal');
      notify('Right-to-work check recorded', 'success');
      loadRightToWork(rtwModalApplicantId);
    } catch (e) {
      AdminCore.showAlert(e.message, 'error', 'rtw-modal-alert');
    }
  }

  async function resendRtwRequest(applicantId, btn) {
    var detail = applicationDetails[activeDrawerAppId];
    var name = detail && detail.applicant ? detail.applicant.fullName : 'this applicant';
    if (!confirm('Re-send the right-to-work request email to ' + name + '?')) return;

    try {
      var result = await AdminCore.withLoading(btn, function () {
        return fetch_('/api/v1/admin/right-to-work/' + encodeURIComponent(applicantId) + '/request', {
          method: 'POST'
        });
      });
      notify(result && result.message ? result.message : 'Request sent', 'success');
    } catch (e) {
      notify('Could not send request: ' + e.message, 'error');
    }
  }

  async function openRtwDocument(checkId) {
    try {
      var data = await fetch_('/api/v1/admin/right-to-work/check/' + encodeURIComponent(checkId) + '/document');
      var url = data.signedUrl || data.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      notify('Could not open evidence: ' + e.message, 'error');
    }
  }

  async function loadApplicationDetail(appId) {
    var detail = await fetch_('/api/v1/applications/' + appId);
    applicationDetails[appId] = detail;
    return detail;
  }

  async function openDrawer(appId) {
    var app = findApplication(appId);
    activeDrawerAppId = appId;
    document.getElementById('drawer-name').textContent = app ? app.firstName + ' ' + app.lastName : 'Applicant';
    document.getElementById('drawer-body').innerHTML = '<div class="drawer-loading">Loading applicant details…</div>';
    document.getElementById('drawer-footer').innerHTML = '';
    document.getElementById('app-drawer-backdrop').classList.add('open');
    document.getElementById('app-drawer').classList.add('open');

    try {
      var detail = await loadApplicationDetail(appId);
      if (activeDrawerAppId === appId) {
        renderDrawer(detail);
      }
    } catch (e) {
      document.getElementById('drawer-body').innerHTML = '<div class="empty-state">Failed to load applicant details: ' + esc(e.message) + '</div>';
      notify('Failed to load applicant details: ' + e.message, 'error');
    }
  }

  function closeDrawer() {
    activeDrawerAppId = null;
    document.getElementById('app-drawer-backdrop').classList.remove('open');
    document.getElementById('app-drawer').classList.remove('open');
  }

  async function refreshOpenDrawer(appId) {
    if (!activeDrawerAppId || activeDrawerAppId !== appId) return;
    var detail = await loadApplicationDetail(appId);
    if (activeDrawerAppId === appId) {
      renderDrawer(detail);
    }
  }

  // ── Actions ─────────────────────────────────────────────
  async function updateStatus(appId, status) {
    if (status === 'REJECTED' && !confirm('Move this application to the rejected pile?')) return;
    if (status === 'HIRED' && !confirm('Mark this applicant as hired?\n\nThis emails them asking for their right-to-work evidence (share code, or an appointment to see their passport).')) return;
    try {
      var result = await fetch_('/api/v1/applications/' + appId + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      notify(
        result && result.rightToWorkRequestSent
          ? 'Hired — right-to-work request emailed'
          : 'Status updated to ' + formatApplicationStatus(status),
        'success'
      );
      await loadApplications();
      await refreshOpenDrawer(appId);
    } catch (e) {
      notify('Failed: ' + e.message, 'error');
    }
  }

  async function sendRosterLoginEmail(appId) {
    var app = findApplication(appId);
    var applicantName = app ? (app.firstName + ' ' + app.lastName).trim() : 'this applicant';
    if (!confirm('Send a login email with a new temporary password to ' + applicantName + '?')) return;

    try {
      var result = await fetch_('/api/v1/applications/' + appId + '/roster-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      notify(result.message || 'Roster login email sent.', 'success');
      await loadApplications();
      await refreshOpenDrawer(appId);
    } catch (e) {
      notify('Login email problem: ' + e.message, 'error', 7000);
      await loadApplications();
      await refreshOpenDrawer(appId);
    }
  }

  async function openCV(appId, cvUrl) {
    if (!cvUrl || cvUrl === 'undefined') {
      notify('No CV available', 'warning');
      return;
    }
    if (cvUrl.startsWith('http')) {
      window.open(cvUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      var resp = await fetch_('/api/v1/applications/' + appId + '/cv');
      if (resp.signedUrl) window.open(resp.signedUrl, '_blank', 'noopener,noreferrer');
      else throw new Error('No signed URL');
    } catch (e) {
      notify('Failed to open CV: ' + e.message, 'error');
    }
  }

  async function saveNotes(appId) {
    var notesEl = document.getElementById('drawer-notes');
    if (!notesEl) return;
    var notes = notesEl.value;
    if (notes === (notesEl.dataset.savedValue || '')) return;
    if (notesEl.dataset.saving === 'true') return;
    notesEl.dataset.saving = 'true';

    try {
      var updated = await fetch_('/api/v1/applications/' + appId + '/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });
      notesEl.dataset.savedValue = updated.notes || '';
      if (applicationDetails[appId]) {
        applicationDetails[appId].notes = updated.notes || '';
        applicationDetails[appId].updatedAt = updated.updatedAt || applicationDetails[appId].updatedAt;
      }
      notify('Notes saved', 'success');
      await refreshOpenDrawer(appId);
    } catch (e) {
      notify('Failed to save notes: ' + e.message, 'error');
    } finally {
      delete notesEl.dataset.saving;
    }
  }

  async function updateTier(applicantId, tier, selectEl) {
    var previousTier = selectEl.dataset.currentTier || 'STANDARD';
    selectEl.disabled = true;
    try {
      await fetch_('/api/v1/admin/staff/' + encodeURIComponent(applicantId) + '/tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tier })
      });
      selectEl.dataset.currentTier = tier;
      notify('Applicant tier updated to ' + tier, 'success');
      if (activeDrawerAppId) {
        await refreshOpenDrawer(activeDrawerAppId);
      }
    } catch (e) {
      selectEl.value = previousTier;
      notify('Failed to update tier: ' + e.message, 'error');
    } finally {
      selectEl.disabled = false;
    }
  }

  async function updateVisibility(applicantId, visible, checkboxEl) {
    checkboxEl.disabled = true;
    try {
      await fetch_('/api/v1/admin/staff/' + encodeURIComponent(applicantId) + '/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: visible })
      });
      notify('Profile visibility updated', 'success');
      if (activeDrawerAppId) {
        await refreshOpenDrawer(activeDrawerAppId);
      }
    } catch (e) {
      checkboxEl.checked = !visible;
      notify('Failed to update visibility: ' + e.message, 'error');
    } finally {
      checkboxEl.disabled = false;
    }
  }

  // Bulk actions
  function updateBulkBar() {
    var bar = document.getElementById('app-bulk-bar');
    var countEl = document.getElementById('app-bulk-count');
    if (selectedAppIds.size > 0) {
      bar.classList.add('visible');
      countEl.textContent = selectedAppIds.size;
    } else {
      bar.classList.remove('visible');
    }
  }

  async function bulkUpdateStatus(status, btn) {
    if (selectedAppIds.size === 0) return;
    if (!confirm('Update ' + selectedAppIds.size + ' application(s) to ' + formatApplicationStatus(status) + '?')) return;
    var doUpdate = async function () {
      var ids = Array.from(selectedAppIds);
      await Promise.all(ids.map(function (id) {
        return fetch_('/api/v1/applications/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
      }));
      toast(ids.length + ' applications updated to ' + formatApplicationStatus(status), 'success');
      selectedAppIds.clear();
      updateBulkBar();
      await loadApplications();
    };
    var run = btn ? AdminCore.withLoading(btn, doUpdate) : doUpdate();
    run.catch(function (e) { toast('Bulk update failed: ' + e.message, 'error'); });
  }

  // ── Contacts ────────────────────────────────────────────
  async function loadContacts() {
    try {
      var data = await fetch_('/api/v1/contacts');
      allContacts = Array.isArray(data) ? data : (data.contacts || []);
      updateContactStats();
      renderContacts();
    } catch (e) {
      document.getElementById('contacts-body').innerHTML =
        '<tr><td colspan="6" class="empty-state">Could not load contacts</td></tr>';
    }
  }

  function updateContactStats() {
    document.getElementById('stat-contacts-total').textContent = allContacts.length;
    document.getElementById('stat-contacts-new').textContent   = allContacts.filter(function(c){return c.status==='NEW';}).length;
    document.getElementById('stat-contacts-quoted').textContent= allContacts.filter(function(c){return c.status==='QUOTED';}).length;
    document.getElementById('stat-contacts-booked').textContent= allContacts.filter(function(c){return c.status==='BOOKED';}).length;
  }

  function renderContacts(contacts) {
    contacts = contacts || allContacts;
    var tbody = document.getElementById('contacts-body');
    if (!contacts.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No contacts found</td></tr>';
      return;
    }
    var sorted = contacts.slice().sort(function(a, b) {
      var av = a[contactSort.col], bv = b[contactSort.col];
      if (contactSort.col === 'createdAt') { av = new Date(av); bv = new Date(bv); }
      if (av < bv) return contactSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return contactSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    tbody.innerHTML = sorted.map(function (c) {
      return '<tr>'
        + '<td><strong>' + esc(c.name) + '</strong></td>'
        + '<td><a href="mailto:' + esc(c.email) + '" style="color:var(--as-info)">' + esc(c.email) + '</a></td>'
        + '<td>' + esc(c.type) + '</td>'
        + '<td><span class="badge badge-' + esc(c.status) + '">' + esc(c.status) + '</span></td>'
        + '<td>' + fmtD(c.createdAt) + '</td>'
        + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn btn-warning btn-sm" data-action="update-contact-status" data-contact-id="' + esc(c.id) + '" data-status="CONTACTED">Contacted</button>'
        + '<button class="btn btn-success btn-sm" data-action="update-contact-status" data-contact-id="' + esc(c.id) + '" data-status="QUOTED">Quoted</button>'
        + '<button class="btn btn-sm" style="background:#20c997;color:#fff" data-action="update-contact-status" data-contact-id="' + esc(c.id) + '" data-status="BOOKED">Booked</button>'
        + '</div></td></tr>';
    }).join('');
  }

  function applyContactFilters() {
    var status = document.getElementById('filter-contact-status').value;
    var type   = document.getElementById('filter-contact-type').value;
    var search = document.getElementById('filter-contact-search').value.toLowerCase();
    var filtered = allContacts.filter(function(c) {
      if (status && c.status !== status) return false;
      if (type   && c.type   !== type)   return false;
      if (search && !(c.name+' '+c.email+(c.company||'')).toLowerCase().includes(search)) return false;
      return true;
    });
    renderContacts(filtered);
  }

  async function updateContactStatus(id, status) {
    try {
      await fetch_('/api/v1/contacts/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      toast('Contact updated to ' + status, 'success');
      await loadContacts();
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  }

  // ── Events ──────────────────────────────────────────────
  async function loadEvents() {
    try {
      var data = await fetch_('/api/v1/events');
      allEvents = Array.isArray(data) ? data : (data.events || []);
      updateEventStats();
      renderEvents();
    } catch (e) {
      document.getElementById('events-body').innerHTML =
        '<tr><td colspan="5" class="empty-state">Events not available</td></tr>';
      var tab = document.querySelector('.as-tab[data-tab="events"]');
      if (tab) tab.style.display = 'none';
    }
  }

  function updateEventStats() {
    document.getElementById('stat-events-total').textContent    = allEvents.length;
    document.getElementById('stat-events-upcoming').textContent = allEvents.filter(function(e){return e.status==='UPCOMING';}).length;
    document.getElementById('stat-events-confirmed').textContent= allEvents.filter(function(e){return e.status==='CONFIRMED';}).length;
    document.getElementById('stat-events-completed').textContent= allEvents.filter(function(e){return e.status==='COMPLETED';}).length;
  }

  function renderEvents(events) {
    events = events || allEvents;
    var tbody = document.getElementById('events-body');
    if (!events.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No events found</td></tr>';
      return;
    }
    var sorted = events.slice().sort(function(a, b) {
      var av = a[eventSort.col], bv = b[eventSort.col];
      if (eventSort.col === 'eventDate') { av = new Date(av); bv = new Date(bv); }
      if (av < bv) return eventSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return eventSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    tbody.innerHTML = sorted.map(function(ev) {
      return '<tr>'
        + '<td><strong>' + esc(ev.eventName||ev.name||'-') + '</strong></td>'
        + '<td>' + fmtD(ev.eventDate) + '</td>'
        + '<td>' + esc(ev.clientName||'-') + '</td>'
        + '<td><span class="badge badge-' + esc(ev.status) + '">' + esc(ev.status) + '</span></td>'
        + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn btn-success btn-sm" data-action="update-event-status" data-event-id="' + esc(ev.id) + '" data-status="CONFIRMED">Confirm</button>'
        + '<button class="btn btn-sm" style="background:#20c997;color:#fff" data-action="update-event-status" data-event-id="' + esc(ev.id) + '" data-status="COMPLETED">Complete</button>'
        + '<button class="btn btn-danger btn-sm" data-action="update-event-status" data-event-id="' + esc(ev.id) + '" data-status="CANCELLED">Cancel</button>'
        + '</div></td></tr>';
    }).join('');
  }

  async function updateEventStatus(id, status) {
    if (!confirm('Update event status to ' + status + '?')) return;
    try {
      await fetch_('/api/v1/events/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      toast('Event updated', 'success');
      await loadEvents();
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  }

  // ── Delegated event listener ─────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'refresh-stats')        return loadStats();
    if (action === 'apply-filters')        return applyFilters();
    if (action === 'clear-filters')        return clearFilters();
    if (action === 'apply-contact-filters') return applyContactFilters();
    if (action === 'clear-contact-filters') {
      document.getElementById('filter-contact-status').value = '';
      document.getElementById('filter-contact-type').value = '';
      document.getElementById('filter-contact-search').value = '';
      return renderContacts();
    }
    if (action === 'apply-event-filters') {
      var es = document.getElementById('filter-event-status').value;
      var esh = document.getElementById('filter-event-search').value.toLowerCase();
      return renderEvents(allEvents.filter(function(ev) {
        if (es && ev.status !== es) return false;
        if (esh && !(ev.eventName||ev.name||'').toLowerCase().includes(esh)) return false;
        return true;
      }));
    }
    if (action === 'clear-event-filters') {
      document.getElementById('filter-event-status').value = '';
      document.getElementById('filter-event-search').value = '';
      return renderEvents();
    }

    if (action === 'open-cv')            return openCV(el.dataset.appId, el.dataset.cvUrl || '');
    if (action === 'update-status')      return updateStatus(el.dataset.appId, el.dataset.status);
    if (action === 'send-roster-login')  return sendRosterLoginEmail(el.dataset.appId);
    if (action === 'update-contact-status') return updateContactStatus(el.dataset.contactId, el.dataset.status);
    if (action === 'update-event-status')   return updateEventStatus(el.dataset.eventId, el.dataset.status);
    if (action === 'open-drawer')        return openDrawer(el.dataset.appId);
    if (action === 'close-drawer')       return closeDrawer();
    if (action === 'open-rtw-modal')     return openRtwModal(el.dataset.applicantId);
    if (action === 'close-rtw-modal')    return AdminCore.closeModal('rtw-modal');
    if (action === 'submit-rtw-check')   return submitRtwCheck(el);
    if (action === 'open-rtw-document')  return openRtwDocument(el.dataset.checkId);
    if (action === 'resend-rtw-request') return resendRtwRequest(el.dataset.applicantId, el);
    if (action === 'save-notes')         return saveNotes(el.dataset.appId);
    if (action === 'bulk-select')        return bulkUpdateStatus(SELECTED_STATUS, el);
    if (action === 'bulk-reject')        return bulkUpdateStatus('REJECTED', el);
    if (action === 'bulk-clear')         { selectedAppIds.clear(); updateBulkBar(); renderApplications(); return; }

    if (action === 'app-prev-page') { appPage--; renderApplications(); return; }
    if (action === 'app-next-page') { appPage++; renderApplications(); return; }
    if (action === 'app-goto-page') { appPage = parseInt(el.dataset.page, 10); renderApplications(); return; }

    if (action === 'export-apps-csv') {
      var rows = filteredApps.map(function(a) {
        return {
          Name: a.firstName + ' ' + a.lastName,
          Email: a.email,
          Phone: a.phone || '',
          Roles: (a.roles||[]).map(function(r){return typeof r==='string'?r:r.name;}).join('; '),
          Status: a.status,
          Applied: fmtD(a.createdAt)
        };
      });
      return AdminCore.exportCSV(rows, 'applicants');
    }
  });

  // Checkbox delegation
  document.addEventListener('change', function (e) {
    var tierSelect = e.target.closest('[data-action="change-tier"]');
    if (tierSelect) {
      return updateTier(tierSelect.dataset.applicantId, tierSelect.value, tierSelect);
    }
    var visibilityToggle = e.target.closest('[data-action="toggle-visibility"]');
    if (visibilityToggle) {
      return updateVisibility(visibilityToggle.dataset.applicantId, visibilityToggle.checked, visibilityToggle);
    }
    var cb = e.target.closest('.app-checkbox');
    if (cb) {
      if (cb.checked) selectedAppIds.add(cb.dataset.appId);
      else selectedAppIds.delete(cb.dataset.appId);
      updateBulkBar();
      return;
    }
    var selectAll = e.target.closest('#app-select-all');
    if (selectAll) {
      var checkboxes = document.querySelectorAll('.app-checkbox');
      checkboxes.forEach(function(c) {
        if (selectAll.checked) selectedAppIds.add(c.dataset.appId);
        else selectedAppIds.delete(c.dataset.appId);
        c.checked = selectAll.checked;
      });
      updateBulkBar();
    }
  });

  // Sort headers
  document.querySelector('#applications-tab thead')?.addEventListener('click', function(e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    sortApplications(th.dataset.sort);
    document.querySelectorAll('#applications-tab th').forEach(function(t){ t.classList.remove('sorted'); });
    th.classList.add('sorted');
  });

  // Debounced live filtering on search input
  var debouncedApplyFilters = AdminCore.debounce(applyFilters, 300);
  var filterSearch = document.getElementById('filter-search');
  if (filterSearch) filterSearch.addEventListener('input', debouncedApplyFilters);
  var filterStatus = document.getElementById('filter-status');
  if (filterStatus) filterStatus.addEventListener('change', function() {
    document.querySelectorAll('#app-stats .kpi-card').forEach(function(c) { c.classList.remove('kpi-active'); });
    applyFilters();
  });

  // KPI stat card filter shortcut
  var appStats = document.getElementById('app-stats');
  if (appStats) appStats.addEventListener('click', function(e) {
    var card = e.target.closest('.kpi-card[data-filter]');
    if (!card) return;
    var filter = card.dataset.filter;
    var isActive = card.classList.contains('kpi-active');
    document.querySelectorAll('#app-stats .kpi-card').forEach(function(c) { c.classList.remove('kpi-active'); });
    if (isActive || filter === 'all') {
      if (filterStatus) filterStatus.value = '';
    } else {
      card.classList.add('kpi-active');
      if (filterStatus) filterStatus.value = filter === 'SELECTED' ? SELECTED_STATUS : filter;
    }
    applyFilters();
  });
  var filterRole = document.getElementById('filter-role');
  if (filterRole) filterRole.addEventListener('change', applyFilters);

  // Backdrop close drawer
  document.getElementById('app-drawer-backdrop').addEventListener('click', closeDrawer);

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;

    AdminCore.initModalBehavior('rtw-modal');

    await Promise.all([
      loadStats(),
      loadApplications(),
      loadContacts(),
      loadEvents()
    ]);
    await openRequestedApplicationFromUrl();

    scheduleRefresh();
  }

  window.addEventListener('load', init);
}());
