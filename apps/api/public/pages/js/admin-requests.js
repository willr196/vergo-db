(function () {
  'use strict';

  // Staff requests: every booking request and question sent from the public
  // site (quote page, hire pages, Halloween/Christmas briefs, contact form).
  // Stored as Contact rows; see saveWebsiteRequest in src/routes/quotes.ts.

  var esc   = AdminCore.escapeHtml;
  var get   = AdminCore.fetchJSON;
  var toast = function (m, t) { AdminCore.toast(m, t || 'info'); };

  var requests = [];
  var filters = { type: '', status: '', search: '' };

  var STATUS_LABEL = { NEW: 'New', CONTACTED: 'Contacted', QUOTED: 'Quoted', BOOKED: 'Booked', LOST: 'Lost' };
  var TYPE_LABEL = { STAFF_REQUEST: 'Booking request', GENERAL: 'Question' };

  function statusBadge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
  }

  function fmtDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function parseRoles(raw) {
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [String(raw)];
    } catch (_) {
      return [String(raw)];
    }
  }

  function summary(req) {
    var bits = [];
    if (req.staffCount) bits.push(req.staffCount + ' staff');
    if (req.eventType) bits.push(req.eventType);
    var roles = parseRoles(req.roles);
    if (roles.length) bits.push(roles.join(', '));
    return bits.length ? bits.join(' · ') : (req.subject || '');
  }

  // ── Load ────────────────────────────────────────────────
  async function load() {
    try {
      requests = await get('/api/v1/contacts') || [];
      updateStats();
      render();
    } catch (e) {
      document.getElementById('requests-body').innerHTML =
        AdminCore.renderEmptyState(6, 'Failed to load requests: ' + e.message);
    }
  }

  function updateStats() {
    var pool = requests.filter(function (r) { return !filters.type || r.type === filters.type; });
    function count(status) { return pool.filter(function (r) { return r.status === status; }).length; }
    document.getElementById('stat-total').textContent = pool.length;
    ['NEW', 'CONTACTED', 'QUOTED', 'BOOKED', 'LOST'].forEach(function (s) {
      document.getElementById('stat-' + s.toLowerCase()).textContent = count(s);
    });
  }

  function visible() {
    var q = filters.search.trim().toLowerCase();
    return requests.filter(function (r) {
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.company, r.eventType, r.message].filter(Boolean)
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    var rows = visible();
    var tbody = document.getElementById('requests-body');
    document.getElementById('request-count').textContent = rows.length + (rows.length === 1 ? ' request' : ' requests');

    if (!rows.length) {
      tbody.innerHTML = AdminCore.renderEmptyState(6, requests.length ? 'No requests match these filters' : 'No requests yet. New ones from the website appear here.');
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var id = esc(r.id);
      var contact = r.email
        ? '<a class="detail-link fs-sm" href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>'
        : (r.phone ? '<a class="detail-link fs-sm" href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : '');
      return '<tr>'
        + '<td><div class="as-stack">'
          + '<span class="as-stack-title">' + esc(r.name) + (r.company ? ' <span class="text-muted fs-sm">· ' + esc(r.company) + '</span>' : '') + '</span>'
          + contact
        + '</div></td>'
        + '<td><div class="as-stack">'
          + '<span class="as-stack-title">' + esc(TYPE_LABEL[r.type] || r.type) + '</span>'
          + '<span class="text-muted fs-sm">' + esc(summary(r)) + '</span>'
        + '</div></td>'
        + '<td class="fs-sm">' + (r.eventDate ? esc(fmtDate(r.eventDate)) : '<span class="text-muted">-</span>') + '</td>'
        + '<td>' + statusBadge(r.status) + '</td>'
        + '<td class="text-muted fs-sm">' + esc(fmtDate(r.createdAt)) + '</td>'
        + '<td><div class="as-row-actions">'
          + '<button type="button" class="btn btn-ghost btn-sm" data-action="open-detail" data-id="' + id + '">View</button>'
          + '<button type="button" class="btn btn-danger-quiet btn-sm" data-action="delete" data-id="' + id + '">Delete</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  // ── Detail ──────────────────────────────────────────────
  function find(id) {
    return requests.find(function (r) { return r.id === id; }) || null;
  }

  function row(label, value) {
    return '<div class="detail-row"><span class="detail-label">' + esc(label) + '</span>'
      + '<span class="detail-value">' + value + '</span></div>';
  }

  function openDetail(id) {
    var r = find(id);
    if (!r) return;
    var roles = parseRoles(r.roles);

    document.getElementById('modal-title').textContent = (TYPE_LABEL[r.type] || 'Request') + ' from ' + r.name;
    document.getElementById('modal-body').innerHTML =
      '<div class="detail-grid mb-2">'
        + row('Name', esc(r.name))
        + row('Company', r.company ? esc(r.company) : '<span class="text-muted">Not given</span>')
        + row('Email', r.email ? '<a class="detail-link" href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '<span class="text-muted">Not given</span>')
        + row('Phone', r.phone ? '<a class="detail-link" href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : '<span class="text-muted">Not given</span>')
        + row('Event', r.eventType ? esc(r.eventType) : '<span class="text-muted">-</span>')
        + row('Event date', r.eventDate ? esc(fmtDate(r.eventDate)) : '<span class="text-muted">-</span>')
        + row('Staff', r.staffCount ? esc(String(r.staffCount)) : '<span class="text-muted">-</span>')
        + row('Guests', r.guests ? esc(String(r.guests)) : '<span class="text-muted">-</span>')
        + row('Roles', roles.length ? esc(roles.join(', ')) : '<span class="text-muted">-</span>')
        + row('Received', esc(AdminCore.formatDateTime(r.createdAt)))
      + '</div>'
      + '<div class="detail-row mb-2"><span class="detail-label">Message and details</span>'
        + '<p class="detail-value" style="white-space:pre-wrap">' + esc(r.message || '') + '</p></div>'
      + '<div class="detail-row mb-2">'
        + '<label class="as-label" for="req-status">Status</label>'
        + '<select id="req-status" class="as-input" data-id="' + esc(r.id) + '">'
          + Object.keys(STATUS_LABEL).map(function (s) {
              return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
            }).join('')
        + '</select>'
      + '</div>'
      + '<div class="detail-row">'
        + '<label class="as-label" for="req-notes">Admin notes (internal)</label>'
        + '<textarea id="req-notes" maxlength="2000" placeholder="Who called them back, what was quoted…">' + esc(r.adminNotes || '') + '</textarea>'
        + '<button type="button" class="btn btn-secondary btn-sm mt-1" data-action="save-notes" data-id="' + esc(r.id) + '">Save notes</button>'
      + '</div>';

    document.getElementById('modal-footer').innerHTML =
      '<button type="button" class="btn btn-danger-quiet" data-action="delete" data-from-modal="true" data-id="' + esc(r.id) + '">Delete</button>'
      + '<button type="button" class="btn btn-ghost" data-action="close-detail">Close</button>';

    AdminCore.openModal('detail-modal');
  }

  async function setStatus(id, status) {
    try {
      await get('/api/v1/contacts/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
      });
      var r = find(id);
      if (r) r.status = status;
      updateStats();
      render();
      toast('Marked ' + STATUS_LABEL[status].toLowerCase(), 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveNotes(id) {
    var notes = document.getElementById('req-notes').value;
    try {
      await get('/api/v1/contacts/' + encodeURIComponent(id) + '/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });
      var r = find(id);
      if (r) r.adminNotes = notes;
      toast('Notes saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function remove(id, fromModal) {
    var r = find(id);
    if (!r) return;
    if (!confirm('Delete the request from ' + r.name + '? This cannot be undone.')) return;
    try {
      await get('/api/v1/contacts/' + encodeURIComponent(id), { method: 'DELETE' });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }
    if (fromModal) AdminCore.closeModal('detail-modal');
    requests = requests.filter(function (x) { return x.id !== id; });
    updateStats();
    render();
    toast('Request deleted', 'success');
  }

  // ── Events ──────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var id = el.dataset.id;
    var action = el.dataset.action;
    if (action === 'close-detail') return AdminCore.closeModal('detail-modal');
    if (action === 'open-detail')  return id && openDetail(id);
    if (action === 'save-notes')   return id && saveNotes(id);
    if (action === 'delete')       return id && remove(id, el.dataset.fromModal === 'true');
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'req-status') setStatus(e.target.dataset.id, e.target.value);
  });

  document.getElementById('filter-type').addEventListener('change', function (e) {
    filters.type = e.target.value;
    updateStats();
    render();
  });
  document.getElementById('filter-status').addEventListener('change', function (e) {
    filters.status = e.target.value;
    render();
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
      render();
    });
  });

  AdminCore.initModalBehavior('detail-modal');

  (async function () {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await load();
  }());
}());
