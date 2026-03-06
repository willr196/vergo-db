(function () {
  'use strict';

  var esc       = AdminCore.escapeHtml;
  var fetch_    = AdminCore.fetchJSON;
  var fmtDt    = AdminCore.formatDateTime;
  var fmtD     = AdminCore.formatDate;
  var relTime  = AdminCore.relativeTime;
  var toast    = function (m, t) { AdminCore.toast(m, t); };

  // ── State ────────────────────────────────────────────────
  var allApplications = [];
  var allContacts     = [];
  var allEvents       = [];
  var filteredApps    = [];
  var selectedAppIds  = new Set();

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
    document.getElementById('stat-shortlisted').textContent = counts['SHORTLISTED']|| 0;
    document.getElementById('stat-rejected').textContent    = counts['REJECTED']   || 0;
    document.getElementById('stat-hired').textContent       = counts['HIRED']      || 0;
  }

  function applyFilters() {
    var status  = document.getElementById('filter-status').value;
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
    document.querySelectorAll('#app-stats .kpi-card').forEach(function(c){c.style.outline='';});
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
        + '<td><strong style="cursor:pointer" data-action="open-drawer" data-app-id="' + esc(app.id) + '">' + esc(app.firstName) + ' ' + esc(app.lastName) + '</strong></td>'
        + '<td>' + esc(app.email) + '</td>'
        + '<td>' + esc(app.phone || '-') + '</td>'
        + '<td>' + (roles || '<span class="text-muted">-</span>') + '</td>'
        + '<td><span class="badge badge-' + esc(app.status) + '">' + esc(app.status) + '</span></td>'
        + '<td>' + fmtD(app.createdAt) + '</td>'
        + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn btn-info btn-sm" data-action="open-cv" data-app-id="' + esc(app.id) + '" data-cv-url="' + esc(app.cvUrl || app.cvKey || '') + '">CV</button>'
        + (app.status !== 'REVIEWING' ? '<button class="btn btn-warning btn-sm" data-action="update-status" data-app-id="' + esc(app.id) + '" data-status="REVIEWING">Review</button>' : '')
        + (app.status !== 'SHORTLISTED' ? '<button class="btn btn-success btn-sm" data-action="update-status" data-app-id="' + esc(app.id) + '" data-status="SHORTLISTED">Shortlist</button>' : '')
        + (app.status !== 'HIRED' ? '<button class="btn btn-sm" style="background:#20c997;color:#fff" data-action="update-status" data-app-id="' + esc(app.id) + '" data-status="HIRED">Hire</button>' : '')
        + (app.status !== 'REJECTED' ? '<button class="btn btn-danger btn-sm" data-action="update-status" data-app-id="' + esc(app.id) + '" data-status="REJECTED">Reject</button>' : '')
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
    for (var i = 1; i <= Math.min(pages, 7); i++) {
      btns += '<button ' + (i === appPage ? 'class="active"' : '') + ' data-action="app-goto-page" data-page="' + i + '">' + i + '</button>';
    }
    btns += '<button ' + (appPage >= pages ? 'disabled' : '') + ' data-action="app-next-page">Next &#8250;</button></div>';
    el.innerHTML = info + btns;
  }

  // ── Drawer ─────────────────────────────────────────────
  function openDrawer(appId) {
    var app = allApplications.find(function(a){ return a.id === appId; });
    if (!app) return;
    document.getElementById('drawer-name').textContent = app.firstName + ' ' + app.lastName;
    var roles = (app.roles || []).map(function(r){ var name = typeof r==='string'?r:r.name; return '<span class="role-pill">'+esc(name)+'</span>'; }).join('');
    document.getElementById('drawer-body').innerHTML =
      '<div class="detail-grid mb-2">'
      + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">' + esc(app.email) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + esc(app.phone||'-') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="badge badge-'+esc(app.status)+'">'+esc(app.status)+'</span></span></div>'
      + '<div class="detail-row"><span class="detail-label">Applied</span><span class="detail-value">' + fmtDt(app.createdAt) + '</span></div>'
      + '</div>'
      + '<div class="mb-2"><span class="detail-label">Roles</span><div style="margin-top:6px">' + (roles||'<span class="text-muted">-</span>') + '</div></div>'
      + (app.notes ? '<div class="mb-2"><span class="detail-label">Notes</span><p style="font-size:0.875rem;margin-top:4px">'+esc(app.notes)+'</p></div>' : '')
      + '<div class="mt-2"><span class="as-label">Admin Notes</span><textarea id="drawer-notes" class="mt-1" placeholder="Internal notes…">'
      + esc(app.adminNotes||'') + '</textarea>'
      + '<button class="btn btn-ghost btn-sm mt-1" data-action="save-notes" data-app-id="' + esc(appId) + '">Save Notes</button></div>';

    document.getElementById('drawer-footer').innerHTML =
      '<button class="btn btn-info btn-sm" data-action="open-cv" data-app-id="' + esc(appId) + '" data-cv-url="' + esc(app.cvUrl||app.cvKey||'') + '">View CV</button>'
      + (app.status !== 'SHORTLISTED' ? '<button class="btn btn-success btn-sm" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="SHORTLISTED">Shortlist</button>' : '')
      + (app.status !== 'HIRED' ? '<button class="btn btn-sm" style="background:#20c997;color:#fff" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="HIRED">Hire</button>' : '')
      + (app.status !== 'REJECTED' ? '<button class="btn btn-danger btn-sm" data-action="update-status" data-app-id="' + esc(appId) + '" data-status="REJECTED">Reject</button>' : '');

    document.getElementById('app-drawer-backdrop').classList.add('open');
    document.getElementById('app-drawer').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('app-drawer-backdrop').classList.remove('open');
    document.getElementById('app-drawer').classList.remove('open');
  }

  // ── Actions ─────────────────────────────────────────────
  async function updateStatus(appId, status) {
    if (status === 'REJECTED' && !confirm('Move this application to the rejected pile?')) return;
    if (status === 'HIRED' && !confirm('Mark this applicant as hired?')) return;
    try {
      await fetch_('/api/v1/applications/' + appId + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      toast('Status updated to ' + status, 'success');
      await loadApplications();
      closeDrawer();
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  async function openCV(appId, cvUrl) {
    if (!cvUrl || cvUrl === 'undefined') {
      toast('No CV available', 'warning');
      return;
    }
    if (cvUrl.startsWith('http')) { window.open(cvUrl, '_blank', 'noopener,noreferrer'); return; }
    try {
      var resp = await fetch_('/api/v1/applications/' + appId + '/cv');
      if (resp.signedUrl) window.open(resp.signedUrl, '_blank');
      else throw new Error('No signed URL');
    } catch (e) {
      toast('Failed to open CV: ' + e.message, 'error');
    }
  }

  async function saveNotes(appId) {
    var notes = document.getElementById('drawer-notes').value;
    try {
      await fetch_('/api/v1/applications/' + appId + '/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      toast('Notes saved', 'success');
      await loadApplications();
    } catch (e) {
      toast('Failed to save notes: ' + e.message, 'error');
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
    if (!confirm('Update ' + selectedAppIds.size + ' application(s) to ' + status + '?')) return;
    var doUpdate = async function () {
      var ids = Array.from(selectedAppIds);
      await Promise.all(ids.map(function (id) {
        return fetch_('/api/v1/applications/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
      }));
      toast(ids.length + ' applications updated to ' + status, 'success');
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
    if (action === 'update-contact-status') return updateContactStatus(el.dataset.contactId, el.dataset.status);
    if (action === 'update-event-status')   return updateEventStatus(el.dataset.eventId, el.dataset.status);
    if (action === 'open-drawer')        return openDrawer(el.dataset.appId);
    if (action === 'close-drawer')       return closeDrawer();
    if (action === 'save-notes')         return saveNotes(el.dataset.appId);
    if (action === 'bulk-shortlist')     return bulkUpdateStatus('SHORTLISTED', el);
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
  if (filterStatus) filterStatus.addEventListener('change', applyFilters);
  var filterRole = document.getElementById('filter-role');
  if (filterRole) filterRole.addEventListener('change', applyFilters);

  // Backdrop close drawer
  document.getElementById('app-drawer-backdrop').addEventListener('click', closeDrawer);

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;

    await Promise.all([
      loadStats(),
      loadApplications(),
      loadContacts(),
      loadEvents()
    ]);

    scheduleRefresh();
  }

  window.addEventListener('load', init);
}());
