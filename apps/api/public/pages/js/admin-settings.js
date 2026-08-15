(function () {
  'use strict';

  var esc  = AdminCore.escapeHtml;
  var get  = AdminCore.fetchJSON;
  var fmtDt = AdminCore.formatDateTime;
  var toast = function (m, t) { AdminCore.toast(m, t); };

  AdminCore.initTabs('.as-tabs');

  var currentUsername = null;
  AdminCore.checkAuth().then(function (session) {
    if (session) currentUsername = session.username;
  });

  // ── Admin users list ─────────────────────────────────────
  var allAdmins = [];

  async function loadAdmins() {
    try {
      var data = await get('/api/v1/admin/users');
      allAdmins = Array.isArray(data) ? data : (data.users || []);
      renderAdmins();
    } catch (e) {
      document.getElementById('admins-tbody').innerHTML =
        '<tr><td colspan="4" class="empty-state">Failed to load: ' + esc(e.message) + '</td></tr>';
    }
  }

  function renderAdmins() {
    var tbody = document.getElementById('admins-tbody');
    var countEl = document.getElementById('admins-count');
    if (countEl) countEl.textContent = allAdmins.length + ' admin' + (allAdmins.length !== 1 ? 's' : '');

    if (!allAdmins.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No admins found</td></tr>';
      return;
    }

    tbody.innerHTML = allAdmins.map(function (a) {
      var locked = a.lockedUntil && new Date(a.lockedUntil) > new Date();
      var isSelf = a.username === currentUsername;
      var statusBadge = locked
        ? '<span class="badge badge-warning">Locked</span>'
        : a.mustChangePassword
          ? '<span class="badge badge-warning">Pending first login</span>'
          : '<span class="badge badge-success">Active</span>';
      return '<tr>'
        + '<td>' + esc(a.username) + (isSelf ? ' <span class="text-muted fs-sm">(you)</span>' : '') + '</td>'
        + '<td class="text-muted fs-sm">' + fmtDt(a.createdAt) + '</td>'
        + '<td>' + statusBadge + '</td>'
        + '<td>' + (isSelf ? '' : '<button class="btn btn-danger btn-sm" data-action="delete-admin" data-id="' + esc(a.id) + '" data-username="' + esc(a.username) + '">Remove</button>') + '</td>'
        + '</tr>';
    }).join('');
  }

  async function addAdmin() {
    var username = document.getElementById('na-username').value.trim();
    var password = document.getElementById('na-password').value;
    var resultEl = document.getElementById('na-result');

    if (!username) { toast('Username is required', 'warning'); return; }
    if (!password) { toast('Password is required', 'warning'); return; }

    var btn = document.querySelector('[data-action="add-admin"]');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    if (resultEl) resultEl.innerHTML = '';

    try {
      await get('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      });
      toast('Admin "' + username + '" added', 'success');
      document.getElementById('na-username').value = '';
      document.getElementById('na-password').value = '';
      loadAdmins();
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
      if (resultEl) resultEl.innerHTML = '<div class="alert-error alert">' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add Admin'; }
    }
  }

  async function deleteAdmin(id, username) {
    if (!confirm('Remove admin "' + username + '"? This cannot be undone.')) return;
    try {
      await get('/api/v1/admin/users/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Admin "' + username + '" removed', 'success');
      loadAdmins();
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  // ── Change own password ──────────────────────────────────
  async function changePassword() {
    var current  = document.getElementById('cp-current').value;
    var next     = document.getElementById('cp-new').value;
    var confirmPw = document.getElementById('cp-confirm').value;
    var resultEl = document.getElementById('cp-result');

    if (!current) { toast('Current password is required', 'warning'); return; }
    if (!next)    { toast('New password is required', 'warning'); return; }
    if (next !== confirmPw) { toast('New passwords do not match', 'warning'); return; }

    var btn = document.querySelector('[data-action="change-password"]');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    if (resultEl) resultEl.innerHTML = '';

    try {
      await get('/api/v1/admin/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      toast('Password updated', 'success');
      document.getElementById('cp-current').value = '';
      document.getElementById('cp-new').value = '';
      document.getElementById('cp-confirm').value = '';
      if (resultEl) resultEl.innerHTML = '<div class="alert-success alert">Password updated successfully.</div>';
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
      if (resultEl) resultEl.innerHTML = '<div class="alert-error alert">' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    }
  }

  // ── Delegated events ──────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'admins-reload')  return loadAdmins();
    if (action === 'add-admin')      return addAdmin();
    if (action === 'delete-admin')   return deleteAdmin(el.dataset.id, el.dataset.username);
    if (action === 'change-password') return changePassword();
  });

  loadAdmins();
}());
