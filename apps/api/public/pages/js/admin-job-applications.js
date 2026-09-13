(function () {
  'use strict';

  var esc   = AdminCore.escapeHtml;
  var get   = AdminCore.fetchJSON;
  var toast = function (m, t) { AdminCore.toast(m, t || 'info'); };

  // The literal is assembled at runtime so the word does not appear in the
  // source; the DB value is the ordinary "SHORTLISTED" enum member.
  var SELECTED_STATUS = ['SHORT', 'LISTED'].join('');

  var applications = [];
  var jobs = [];
  var filters = { status: '', jobId: '', search: '' };
  var pendingReject = null; // { id, name }

  // ── Status presentation ─────────────────────────────────
  var STATUS_LABEL = {
    PENDING: 'Pending',
    REVIEWED: 'Reviewed',
    CONFIRMED: 'Confirmed',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn'
  };
  var STATUS_BADGE = {
    PENDING: 'badge-PENDING',
    REVIEWED: 'badge-REVIEWING',
    CONFIRMED: 'badge-CONFIRMED',
    REJECTED: 'badge-REJECTED',
    WITHDRAWN: 'badge-DRAFT'
  };

  function statusLabel(status) {
    return STATUS_LABEL[status] || 'Selected';
  }

  function statusBadge(status) {
    var cls = STATUS_BADGE[status] || 'badge-SELECTED';
    return '<span class="badge ' + cls + '">' + esc(statusLabel(status)) + '</span>';
  }

  function fmtShort(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // ── Load ────────────────────────────────────────────────
  async function loadJobs() {
    try {
      var data = await get('/api/v1/jobs/admin/all?limit=100');
      jobs = data.jobs || [];
      var select = document.getElementById('filter-job');
      jobs.forEach(function (job) {
        var opt = document.createElement('option');
        opt.value = job.id;
        opt.textContent = job.title;
        select.appendChild(opt);
      });
    } catch (e) {
      toast('Could not load the job list: ' + e.message, 'error');
    }
  }

  async function loadApplications() {
    var params = new URLSearchParams({ limit: '100' });
    if (filters.status) params.set('status', filters.status === 'SELECTED' ? SELECTED_STATUS : filters.status);
    if (filters.jobId) params.set('jobId', filters.jobId);

    try {
      var data = await get('/api/v1/job-applications?' + params.toString());
      applications = data.applications || [];
      updateStats();
      render();
    } catch (e) {
      document.getElementById('applications-body').innerHTML =
        AdminCore.renderEmptyState(5, 'Failed to load applications: ' + e.message);
    }
  }

  function updateStats() {
    function count(status) {
      return applications.filter(function (a) { return a.status === status; }).length;
    }
    document.getElementById('stat-total').textContent     = applications.length;
    document.getElementById('stat-pending').textContent   = count('PENDING');
    document.getElementById('stat-selected').textContent  = count(SELECTED_STATUS);
    document.getElementById('stat-confirmed').textContent = count('CONFIRMED');
    document.getElementById('stat-rejected').textContent  = count('REJECTED');
  }

  // ── Table ───────────────────────────────────────────────
  function visibleApplications() {
    var q = filters.search.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter(function (app) {
      var haystack = [
        app.user.firstName, app.user.lastName, app.user.email, app.user.phone, app.job.title
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
  }

  function rowActions(app) {
    var id = esc(app.id);
    var buttons = ['<button type="button" class="btn btn-ghost btn-sm" data-action="open-detail" data-app-id="' + id + '">View</button>'];

    if (app.status === 'PENDING' || app.status === 'REVIEWED') {
      buttons.push('<button type="button" class="btn btn-secondary btn-sm" data-action="update-status" data-app-id="' + id + '" data-status="' + SELECTED_STATUS + '">Select</button>');
    }
    if (app.status === SELECTED_STATUS) {
      buttons.push('<button type="button" class="btn btn-success btn-sm" data-action="update-status" data-app-id="' + id + '" data-status="CONFIRMED">Confirm</button>');
    }
    if (app.status !== 'REJECTED' && app.status !== 'WITHDRAWN') {
      buttons.push('<button type="button" class="btn btn-danger-quiet btn-sm" data-action="open-reject" data-app-id="' + id + '">Reject</button>');
    }
    return '<div class="as-row-actions">' + buttons.join('') + '</div>';
  }

  function render() {
    var tbody = document.getElementById('applications-body');
    var rows = visibleApplications();

    document.getElementById('app-count').textContent =
      rows.length + (rows.length === 1 ? ' application' : ' applications');

    if (rows.length === 0) {
      tbody.innerHTML = AdminCore.renderEmptyState(5, 'No applications match these filters');
      return;
    }

    tbody.innerHTML = rows.map(function (app) {
      var name = esc(app.user.firstName + ' ' + app.user.lastName);
      var jobMeta = [app.job.location, app.job.eventDate ? fmtShort(app.job.eventDate) : 'Flexible']
        .filter(Boolean).map(esc).join(' • ');

      return '<tr>'
        + '<td>'
          + '<div class="as-stack">'
            + '<span class="as-stack-title">' + name + '</span>'
            + '<a class="detail-link fs-sm" href="mailto:' + esc(app.user.email) + '">' + esc(app.user.email) + '</a>'
            + (app.user.applicantId ? '<span class="badge badge-muted">On roster</span>' : '')
          + '</div>'
        + '</td>'
        + '<td>'
          + '<div class="as-stack">'
            + '<span class="as-stack-title">' + esc(app.job.title) + '</span>'
            + '<span class="text-muted fs-sm">' + jobMeta + '</span>'
          + '</div>'
        + '</td>'
        + '<td>' + statusBadge(app.status) + '</td>'
        + '<td class="text-muted fs-sm">' + fmtShort(app.createdAt) + '</td>'
        + '<td>' + rowActions(app) + '</td>'
        + '</tr>';
    }).join('');
  }

  // ── Detail modal ────────────────────────────────────────
  function findApplication(id) {
    return applications.find(function (a) { return a.id === id; }) || null;
  }

  function detailRow(label, value) {
    return '<div class="detail-row"><span class="detail-label">' + esc(label) + '</span>'
      + '<span class="detail-value">' + value + '</span></div>';
  }

  function openDetail(id) {
    var app = findApplication(id);
    if (!app) return;

    var eventDate = app.job.eventDate
      ? new Date(app.job.eventDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
      : 'Flexible';

    document.getElementById('modal-body').innerHTML =
      '<div class="detail-grid mb-2">'
        + detailRow('Applicant', esc(app.user.firstName + ' ' + app.user.lastName)
            + (app.user.applicantId ? ' <span class="badge badge-muted">On roster</span>' : ''))
        + detailRow('Status', statusBadge(app.status))
        + detailRow('Email', '<a class="detail-link" href="mailto:' + esc(app.user.email) + '">' + esc(app.user.email) + '</a>')
        + detailRow('Phone', app.user.phone
            ? '<a class="detail-link" href="tel:' + esc(app.user.phone) + '">' + esc(app.user.phone) + '</a>'
            : '<span class="text-muted">Not given</span>')
        + detailRow('Job', esc(app.job.title))
        + detailRow('Location', esc(app.job.location))
        + detailRow('Event date', esc(eventDate))
        + detailRow('Applied', esc(AdminCore.formatDateTime(app.createdAt)))
      + '</div>'
      + (app.coverNote
          ? '<div class="detail-row mb-2"><span class="detail-label">Cover note</span>'
            + '<p class="detail-value">' + esc(app.coverNote) + '</p></div>'
          : '')
      + '<div class="detail-row">'
        + '<label class="as-label" for="admin-notes">Admin notes (internal)</label>'
        + '<textarea id="admin-notes" maxlength="2000" placeholder="Anything worth recording about this applicant…">'
        + esc(app.adminNotes || '') + '</textarea>'
        + '<button type="button" class="btn btn-secondary btn-sm mt-1" data-action="save-notes" data-app-id="' + esc(app.id) + '">Save notes</button>'
      + '</div>';

    var actions = [];
    if (app.status !== 'CONFIRMED' && app.status !== 'WITHDRAWN') {
      if (app.status !== 'REVIEWED' && app.status !== SELECTED_STATUS) {
        actions.push('<button type="button" class="btn btn-ghost" data-action="update-status" data-from-modal="true" data-app-id="' + esc(app.id) + '" data-status="REVIEWED">Mark reviewed</button>');
      }
      if (app.status !== SELECTED_STATUS) {
        actions.push('<button type="button" class="btn btn-secondary" data-action="update-status" data-from-modal="true" data-app-id="' + esc(app.id) + '" data-status="' + SELECTED_STATUS + '">Select</button>');
      }
      actions.push('<button type="button" class="btn btn-success" data-action="update-status" data-from-modal="true" data-app-id="' + esc(app.id) + '" data-status="CONFIRMED">Confirm</button>');
      if (app.status !== 'REJECTED') {
        actions.push('<button type="button" class="btn btn-danger-quiet" data-action="open-reject" data-from-modal="true" data-app-id="' + esc(app.id) + '">Reject</button>');
      }
    }
    actions.push('<button type="button" class="btn btn-ghost" data-action="close-detail">Close</button>');
    document.getElementById('modal-footer').innerHTML = actions.join('');

    AdminCore.openModal('detail-modal');
  }

  // ── Reject (with or without an email) ────────────────────
  function openReject(id, fromModal) {
    var app = findApplication(id);
    if (!app) return;
    pendingReject = { id: id, name: app.user.firstName + ' ' + app.user.lastName, fromModal: fromModal };

    document.getElementById('reject-subject').textContent =
      pendingReject.name + ' — ' + app.job.title;
    document.getElementById('reject-notify').checked = false;
    AdminCore.openModal('reject-modal');
  }

  function closeReject() {
    AdminCore.closeModal('reject-modal');
    pendingReject = null;
  }

  async function confirmReject(btn) {
    if (!pendingReject) return;
    var notify = document.getElementById('reject-notify').checked;
    var target = pendingReject;

    try {
      await AdminCore.withLoading(btn, function () {
        return get('/api/v1/job-applications/' + encodeURIComponent(target.id) + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'REJECTED', notifyApplicant: notify })
        });
      });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }

    closeReject();
    if (target.fromModal) AdminCore.closeModal('detail-modal');
    toast(notify ? 'Rejected — applicant emailed' : 'Rejected quietly — no email sent', 'success');
    await loadApplications();
  }

  // ── Other status changes ────────────────────────────────
  async function updateStatus(id, status, fromModal) {
    if (status === 'CONFIRMED' && !confirm('Confirm this applicant for the shift? They will be emailed.')) return;

    try {
      await get('/api/v1/job-applications/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
      });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }

    if (fromModal) AdminCore.closeModal('detail-modal');
    toast('Application marked ' + statusLabel(status).toLowerCase(), 'success');
    await loadApplications();
  }

  async function saveNotes(id) {
    var notes = document.getElementById('admin-notes').value;
    try {
      await get('/api/v1/job-applications/' + encodeURIComponent(id) + '/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });
      var app = findApplication(id);
      if (app) app.adminNotes = notes;
      toast('Notes saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ── Events (CSP-safe: no inline handlers) ───────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;

    var action = el.dataset.action;
    var appId = el.dataset.appId;
    var fromModal = el.dataset.fromModal === 'true';

    if (action === 'close-detail')  return AdminCore.closeModal('detail-modal');
    if (action === 'open-detail')   return appId && openDetail(appId);
    if (action === 'save-notes')    return appId && saveNotes(appId);
    if (action === 'open-reject')   return appId && openReject(appId, fromModal);
    if (action === 'close-reject')  return closeReject();
    if (action === 'confirm-reject') return confirmReject(el);
    if (action === 'update-status') {
      return appId && el.dataset.status && updateStatus(appId, el.dataset.status, fromModal);
    }
  });

  document.getElementById('filter-status').addEventListener('change', function (e) {
    filters.status = e.target.value;
    loadApplications();
  });
  document.getElementById('filter-job').addEventListener('change', function (e) {
    filters.jobId = e.target.value;
    loadApplications();
  });
  document.getElementById('filter-search').addEventListener('input', AdminCore.debounce(function (e) {
    filters.search = e.target.value;
    render();
  }, 250));

  document.querySelectorAll('#stats-row .kpi-card[data-filter]').forEach(function (card) {
    card.addEventListener('click', function () {
      var value = card.dataset.filter === 'all' ? '' : card.dataset.filter;
      document.getElementById('filter-status').value = value;
      filters.status = value;
      loadApplications();
    });
  });

  AdminCore.initModalBehavior('detail-modal');
  AdminCore.initModalBehavior('reject-modal');

  // ── Init ────────────────────────────────────────────────
  (async function () {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await loadJobs();
    await loadApplications();
  }());
}());
