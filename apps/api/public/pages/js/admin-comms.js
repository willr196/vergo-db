(function () {
  'use strict';

  var esc  = AdminCore.escapeHtml;
  var get  = AdminCore.fetchJSON;
  var fmtD = AdminCore.formatDate;
  var fmtDt = AdminCore.formatDateTime;
  var toast = function (m, t) { AdminCore.toast(m, t); };

  var allContacts  = [];
  var filteredContacts = [];

  // ── Tabs ────────────────────────────────────────────────
  AdminCore.initTabs('.as-tabs');

  // ── Contact forms ────────────────────────────────────────
  async function loadContacts() {
    try {
      var data = await get('/api/v1/contacts');
      allContacts = Array.isArray(data) ? data : (data.contacts || []);
      filteredContacts = allContacts.slice();
      renderContacts(filteredContacts);
    } catch (e) {
      document.getElementById('cf-tbody').innerHTML =
        '<tr><td colspan="7" class="empty-state">Failed to load: ' + esc(e.message) + '</td></tr>';
    }
  }

  function renderContacts(contacts) {
    var tbody = document.getElementById('cf-tbody');
    var countEl = document.getElementById('cf-count');
    if (countEl) countEl.textContent = contacts.length + ' result' + (contacts.length !== 1 ? 's' : '');

    if (!contacts.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No contacts found</td></tr>';
      return;
    }
    tbody.innerHTML = contacts.map(function (c) {
      var rowStyle = c.status === 'NEW' ? ' style="font-weight:600"' : '';
      return '<tr' + rowStyle + '>'
        + '<td>' + esc(c.name) + '</td>'
        + '<td><a href="mailto:' + esc(c.email) + '" style="color:var(--as-info)">' + esc(c.email) + '</a></td>'
        + '<td><span class="badge badge-' + esc(c.type) + '" style="background:var(--as-gold-bg);color:var(--as-gold)">' + esc(c.type.replace('_', ' ')) + '</span></td>'
        + '<td class="text-muted fs-sm">' + esc((c.subject || c.eventType || c.message || '').substring(0, 50)) + '</td>'
        + '<td><span class="badge badge-' + esc(c.status) + '">' + esc(c.status) + '</span></td>'
        + '<td class="text-muted fs-sm">' + fmtD(c.createdAt) + '</td>'
        + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn btn-info btn-sm" data-action="view-contact" data-id="' + esc(c.id) + '">View</button>'
        + '<a class="btn btn-ghost btn-sm" href="mailto:' + esc(c.email) + '?subject=Re: ' + esc(c.subject || 'Your Enquiry') + '">Reply</a>'
        + (c.status !== 'CONTACTED' ? '<button class="btn btn-warning btn-sm" data-action="mark-contacted" data-id="' + esc(c.id) + '">Mark Contacted</button>' : '')
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  function applyContactFilters() {
    var status = document.getElementById('cf-status').value;
    var type   = document.getElementById('cf-type').value;
    var search = document.getElementById('cf-search').value.toLowerCase();
    filteredContacts = allContacts.filter(function (c) {
      if (status && c.status !== status) return false;
      if (type   && c.type   !== type)   return false;
      if (search && !(c.name + ' ' + c.email + (c.company || '') + (c.message || '')).toLowerCase().includes(search)) return false;
      return true;
    });
    renderContacts(filteredContacts);
  }

  async function markContacted(id) {
    try {
      await get('/api/v1/contacts/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CONTACTED' })
      });
      toast('Marked as contacted', 'success');
      await loadContacts();
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  }

  function openContactModal(id) {
    var c = allContacts.find(function (x) { return x.id === id; });
    if (!c) return;
    document.getElementById('cf-modal-title').textContent = c.name;
    document.getElementById('cf-modal-body').innerHTML =
      '<div class="detail-grid mb-2">'
      + '<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value fw-600">' + esc(c.name) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value"><a href="mailto:' + esc(c.email) + '" style="color:var(--as-info)">' + esc(c.email) + '</a></span></div>'
      + (c.phone ? '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + esc(c.phone) + '</span></div>' : '')
      + (c.company ? '<div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">' + esc(c.company) + '</span></div>' : '')
      + '<div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">' + esc(c.type.replace('_', ' ')) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="badge badge-' + esc(c.status) + '">' + esc(c.status) + '</span></span></div>'
      + '<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">' + fmtDt(c.createdAt) + '</span></div>'
      + (c.eventType ? '<div class="detail-row"><span class="detail-label">Event Type</span><span class="detail-value">' + esc(c.eventType) + '</span></div>' : '')
      + (c.eventDate ? '<div class="detail-row"><span class="detail-label">Event Date</span><span class="detail-value">' + fmtD(c.eventDate) + '</span></div>' : '')
      + (c.guests ? '<div class="detail-row"><span class="detail-label">Guests</span><span class="detail-value">' + esc(String(c.guests)) + '</span></div>' : '')
      + (c.staffCount ? '<div class="detail-row"><span class="detail-label">Staff Needed</span><span class="detail-value">' + esc(String(c.staffCount)) + '</span></div>' : '')
      + '</div>'
      + '<div class="mb-2"><span class="detail-label">Message</span><p style="margin-top:6px;font-size:0.875rem;line-height:1.6;background:var(--as-bg);padding:12px;border-radius:6px;border:1px solid var(--as-border)">' + esc(c.message) + '</p></div>';

    document.getElementById('cf-modal-footer').innerHTML =
      '<button class="btn btn-ghost" data-action="close-cf-modal">Close</button>'
      + '<a class="btn btn-info" href="mailto:' + esc(c.email) + '?subject=Re: Your Enquiry">Reply via Email</a>'
      + (c.status !== 'CONTACTED' ? '<button class="btn btn-warning" data-action="mark-contacted" data-id="' + esc(id) + '">Mark Contacted</button>' : '');

    document.getElementById('cf-modal').classList.remove('d-none');
  }

  // ── Push notifications ────────────────────────────────────
  async function sendPush() {
    var title    = document.getElementById('push-title').value.trim();
    var body     = document.getElementById('push-body').value.trim();
    var audience = document.getElementById('push-audience').value;

    if (!title) { toast('Title is required', 'warning'); return; }
    if (!body)  { toast('Message is required', 'warning'); return; }

    var btn = document.querySelector('[data-action="send-push"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    var resultEl = document.getElementById('push-result');
    try {
      var data = await get('/api/v1/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message: body, audience })
      });
      toast('Sent to ' + data.sent + ' device' + (data.sent !== 1 ? 's' : ''), 'success');
      if (resultEl) {
        resultEl.innerHTML = '<div class="alert-success alert">Sent to ' + esc(String(data.sent)) + ' / ' + esc(String(data.total)) + ' devices.</div>';
      }
      document.getElementById('push-title').value = '';
      document.getElementById('push-body').value  = '';
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
      if (resultEl) resultEl.innerHTML = '<div class="alert-error alert">' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Push Notification'; }
    }
  }

  // ── Email broadcast ───────────────────────────────────────
  async function sendEmail() {
    var subject  = document.getElementById('email-subject').value.trim();
    var body     = document.getElementById('email-body').value.trim();
    var audience = document.getElementById('email-audience').value;

    if (!subject) { toast('Subject is required', 'warning'); return; }
    if (!body)    { toast('Body is required', 'warning'); return; }

    if (!confirm('Send this email to ' + audience.replace('_', ' ') + '? This cannot be undone.')) return;

    var btn = document.querySelector('[data-action="send-email"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    var resultEl = document.getElementById('email-result');
    try {
      var data = await get('/api/v1/admin/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, audience })
      });
      toast('Sent to ' + data.sent + ' recipient' + (data.sent !== 1 ? 's' : ''), 'success');
      if (resultEl) {
        resultEl.innerHTML = '<div class="alert-success alert">Sent to ' + esc(String(data.sent)) + ' / ' + esc(String(data.total)) + ' recipients.</div>';
      }
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
      if (resultEl) resultEl.innerHTML = '<div class="alert-error alert">' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Email Broadcast'; }
    }
  }

  // ── Delegated events ────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'cf-filter')      return applyContactFilters();
    if (action === 'cf-clear')       {
      document.getElementById('cf-status').value = '';
      document.getElementById('cf-type').value   = '';
      document.getElementById('cf-search').value = '';
      filteredContacts = allContacts.slice();
      return renderContacts(filteredContacts);
    }
    if (action === 'cf-reload')      return loadContacts();
    if (action === 'cf-export')      {
      return AdminCore.exportCSV(filteredContacts.map(function(c) {
        return { Name: c.name, Email: c.email, Phone: c.phone || '', Company: c.company || '', Type: c.type, Status: c.status, Date: fmtD(c.createdAt), Message: c.message };
      }), 'contacts');
    }
    if (action === 'view-contact')   return openContactModal(el.dataset.id);
    if (action === 'mark-contacted') {
      document.getElementById('cf-modal').classList.add('d-none');
      return markContacted(el.dataset.id);
    }
    if (action === 'close-cf-modal') return document.getElementById('cf-modal').classList.add('d-none');
    if (action === 'send-push')      return sendPush();
    if (action === 'send-email')     return sendEmail();
  });

  document.getElementById('cf-modal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('d-none');
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') document.getElementById('cf-modal').classList.add('d-none');
  });

  // ── Init ────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await loadContacts();
  }

  window.addEventListener('load', init);
}());
