(function () {
  'use strict';

  var get   = AdminCore.fetchJSON;
  var esc   = AdminCore.escapeHtml;
  var fmtD  = AdminCore.formatDate;
  var toast = function (m, t) { AdminCore.toast(m, t); };

  var allClients      = [];
  var selectedIds     = new Set();
  var currentPage     = 1;
  var totalPages      = 1;
  var pendingRejectId = null;

  var debounceSearch = AdminCore.debounce(function () { loadClients(1); }, 300);

  // ── Stats ────────────────────────────────────────────────
  async function loadStats() {
    try {
      var stats = await get('/api/v1/admin/clients/stats');
      document.getElementById('stat-pending').textContent  = stats.pending  ?? stats.data?.pending  ?? '-';
      document.getElementById('stat-approved').textContent = stats.approved ?? stats.data?.approved ?? '-';
      document.getElementById('stat-rejected').textContent = stats.rejected ?? stats.data?.rejected ?? '-';
      document.getElementById('stat-total').textContent    = stats.total    ?? stats.data?.total    ?? '-';
    } catch (e) { console.error('Stats failed:', e); }
  }

  // ── Load clients ────────────────────────────────────────
  async function loadClients(page) {
    page = page || 1;
    currentPage = page;
    var status = document.getElementById('filter-status').value;
    var search = document.getElementById('filter-search').value;

    var params = new URLSearchParams({ page: page, limit: 25 });
    if (status) params.append('status', status);
    if (search) params.append('search', search);

    var tbody = document.getElementById('clients-table');
    tbody.innerHTML = '<tr><td colspan="8" class="loading"><div class="as-skeleton" style="margin:auto;max-width:200px"></div></td></tr>';

    try {
      var data = await get('/api/v1/admin/clients?' + params.toString());
      var list = data.clients || data.data?.clients || [];
      var pag  = data.pagination || data.data?.pagination || { total: list.length, pages: 1 };

      allClients = list;
      totalPages = pag.pages || 1;
      selectedIds.clear();
      updateBulkBar();

      var countEl = document.getElementById('client-count');
      if (countEl) countEl.textContent = pag.total + ' client' + (pag.total !== 1 ? 's' : '');

      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No clients found</td></tr>';
        renderPagination();
        return;
      }

      tbody.innerHTML = list.map(function (c) {
        var quoteCount = c._count?.quoteRequests ?? c.quoteCount ?? 0;
        return '<tr>'
          + '<td class="checkbox-col"><input type="checkbox" class="row-check" data-id="' + esc(c.id) + '"' + (selectedIds.has(c.id) ? ' checked' : '') + '></td>'
          + '<td><div style="font-weight:600;font-size:0.875rem">' + esc(c.companyName) + '</div>'
            + '<div class="text-muted fs-sm">' + esc(c.industry || '') + '</div></td>'
          + '<td><div>' + esc(c.contactName)
            + (c.emailVerified ? ' <span style="color:var(--as-success)" title="Email verified">✓</span>' : ' <span style="color:var(--as-error)" title="Unverified">✗</span>')
            + '</div></td>'
          + '<td class="fs-sm">' + esc(c.email) + '</td>'
          + '<td><span class="badge badge-' + esc(c.status) + '">' + esc(c.status) + '</span></td>'
          + '<td class="text-muted fs-sm">' + fmtD(c.createdAt) + '</td>'
          + '<td class="text-muted fs-sm" style="text-align:center">' + quoteCount + '</td>'
          + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
            + '<button class="btn btn-info btn-sm" data-action="view-client" data-id="' + esc(c.id) + '">View</button>'
            + (c.status === 'PENDING' && c.emailVerified
                ? '<button class="btn btn-success btn-sm" data-action="approve-client" data-id="' + esc(c.id) + '">Approve</button>'
                  + '<button class="btn btn-danger btn-sm" data-action="open-reject" data-id="' + esc(c.id) + '">Reject</button>'
                : '')
            + (c.status === 'APPROVED'
                ? '<button class="btn btn-warning btn-sm" data-action="suspend-client" data-id="' + esc(c.id) + '">Suspend</button>'
                : '')
            + (c.status === 'SUSPENDED' || c.status === 'REJECTED'
                ? '<button class="btn btn-ghost btn-sm" data-action="reinstate-client" data-id="' + esc(c.id) + '">Reinstate</button>'
                : '')
          + '</div></td>'
          + '</tr>';
      }).join('');

      renderPagination();
    } catch (e) {
      toast('Failed to load clients: ' + e.message, 'error');
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load clients</td></tr>';
    }
  }

  // ── Pagination ────────────────────────────────────────────
  function renderPagination() {
    var el = document.getElementById('pagination');
    if (!el) return;
    el.innerHTML = ''
      + '<button data-action="paginate" data-page="' + (currentPage - 1) + '" ' + (currentPage <= 1 ? 'disabled' : '') + '>← Prev</button>'
      + '<span>Page ' + currentPage + ' of ' + (totalPages || 1) + '</span>'
      + '<button data-action="paginate" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages ? 'disabled' : '') + '>Next →</button>';
  }

  // ── Bulk helpers ─────────────────────────────────────────
  function updateBulkBar() {
    var bar     = document.getElementById('bulk-bar');
    var countEl = document.getElementById('bulk-count');
    if (!bar) return;
    if (selectedIds.size > 0) {
      bar.style.display = 'flex';
      if (countEl) countEl.textContent = selectedIds.size;
    } else {
      bar.style.display = 'none';
    }
  }

  function syncSelectAll() {
    var sa = document.getElementById('select-all');
    if (!sa) return;
    var all = document.querySelectorAll('#clients-table .row-check');
    sa.checked = all.length > 0 && Array.from(all).every(function (cb) { return cb.checked; });
    sa.indeterminate = selectedIds.size > 0 && !sa.checked;
  }

  async function bulkUpdate(status) {
    var ids = Array.from(selectedIds);
    if (!ids.length) return;
    var action = status === 'APPROVED' ? 'approve' : (status === 'REJECTED' ? 'reject' : 'suspend');
    if (!confirm(action.charAt(0).toUpperCase() + action.slice(1) + ' ' + ids.length + ' client(s)?')) return;
    var ok = 0, fail = 0;
    await Promise.all(ids.map(async function (id) {
      try {
        await get('/api/v1/admin/clients/' + id + '/' + action, { method: 'POST' });
        ok++;
      } catch (_) { fail++; }
    }));
    toast((ok ? ok + ' updated' : '') + (fail ? '; ' + fail + ' failed' : ''), fail ? 'warning' : 'success');
    selectedIds.clear();
    await loadClients(currentPage);
    await loadStats();
  }

  // ── CSV export ───────────────────────────────────────────
  function exportCSV() {
    AdminCore.exportCSV(allClients.map(function (c) {
      return {
        Company:   c.companyName,
        Industry:  c.industry || '',
        Contact:   c.contactName,
        Email:     c.email,
        Phone:     c.phone || '',
        Status:    c.status,
        Verified:  c.emailVerified ? 'Yes' : 'No',
        Registered: fmtD(c.createdAt),
        Quotes:    c._count?.quoteRequests ?? c.quoteCount ?? 0
      };
    }), 'clients');
  }

  // ── Client detail modal ──────────────────────────────────
  async function viewClient(id) {
    try {
      var c = await get('/api/v1/admin/clients/' + id);
      c = c.data || c;
      document.getElementById('modal-title').textContent = c.companyName;
      document.getElementById('modal-body').innerHTML =
        '<div class="detail-grid">'
        + '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="badge badge-' + esc(c.status) + '">' + esc(c.status) + '</span></span></div>'
        + '<div class="detail-row"><span class="detail-label">Email Verified</span><span class="detail-value">' + (c.emailVerified ? 'Yes ✓' : 'No ✗') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Industry</span><span class="detail-value">' + esc(c.industry || 'Not specified') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Company Size</span><span class="detail-value">' + esc(c.companySize || 'Not specified') + '</span></div>'
        + (c.website ? '<div class="detail-row"><span class="detail-label">Website</span><span class="detail-value"><a href="' + esc(c.website) + '" target="_blank" rel="noopener noreferrer" style="color:var(--as-info)">' + esc(c.website) + '</a></span></div>' : '')
        + '</div>'
        + '<div class="detail-grid mt-2">'
        + '<div class="detail-row"><span class="detail-label">Contact Name</span><span class="detail-value fw-600">' + esc(c.contactName) + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value"><a href="mailto:' + esc(c.email) + '" style="color:var(--as-info)">' + esc(c.email) + '</a></span></div>'
        + '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + esc(c.phone || 'Not provided') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Job Title</span><span class="detail-value">' + esc(c.jobTitle || 'Not specified') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Registered</span><span class="detail-value">' + fmtD(c.createdAt) + '</span></div>'
        + (c.approvedAt ? '<div class="detail-row"><span class="detail-label">Approved</span><span class="detail-value">' + fmtD(c.approvedAt) + ' by ' + esc(c.approvedBy || 'Admin') + '</span></div>' : '')
        + (c.rejectionReason ? '<div class="detail-row"><span class="detail-label">Rejection Reason</span><span class="detail-value" style="color:var(--as-error)">' + esc(c.rejectionReason) + '</span></div>' : '')
        + '</div>'
        + '<div class="mt-2"><label class="as-label">Admin Notes</label>'
        + '<textarea id="modal-notes" style="width:100%;min-height:80px;margin-top:6px" placeholder="Add notes about this client…">' + esc(c.adminNotes || '') + '</textarea>'
        + '<button class="btn btn-ghost btn-sm mt-1" data-action="save-notes" data-id="' + esc(c.id) + '" style="margin-top:6px">Save Notes</button>'
        + '</div>';

      // Render action buttons in footer
      var footer = document.getElementById('modal-footer');
      footer.innerHTML = '<button class="btn btn-ghost" data-action="close-modal">Close</button>';
      if (c.status === 'PENDING' && c.emailVerified) {
        footer.innerHTML +=
          '<button class="btn btn-success" data-action="approve-client" data-id="' + esc(c.id) + '">Approve</button>'
          + '<button class="btn btn-danger" data-action="open-reject" data-id="' + esc(c.id) + '">Reject</button>';
      } else if (c.status === 'APPROVED') {
        footer.innerHTML += '<button class="btn btn-warning" data-action="suspend-client" data-id="' + esc(c.id) + '">Suspend</button>';
      } else if (c.status === 'SUSPENDED' || c.status === 'REJECTED') {
        footer.innerHTML += '<button class="btn btn-ghost" data-action="reinstate-client" data-id="' + esc(c.id) + '">Reinstate</button>';
      }

      document.getElementById('client-modal').classList.remove('d-none');
    } catch (e) { toast('Failed to load client: ' + e.message, 'error'); }
  }

  // ── Client actions ───────────────────────────────────────
  async function approveClient(id, btn) {
    if (!confirm('Approve this client?')) return;
    var doApprove = async function () {
      await get('/api/v1/admin/clients/' + id + '/approve', { method: 'POST' });
      toast('Client approved', 'success');
      document.getElementById('client-modal').classList.add('d-none');
      await loadClients(currentPage);
      await loadStats();
    };
    var run = btn ? AdminCore.withLoading(btn, doApprove) : doApprove();
    run.catch(function (e) { toast('Failed: ' + e.message, 'error'); });
  }

  function openRejectModal(id) {
    pendingRejectId = id;
    document.getElementById('reject-reason').value = '';
    document.getElementById('reject-modal').classList.remove('d-none');
  }

  async function confirmReject() {
    if (!pendingRejectId) return;
    var reason = document.getElementById('reject-reason').value.trim();
    try {
      await get('/api/v1/admin/clients/' + pendingRejectId + '/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason })
      });
      toast('Client rejected', 'success');
      document.getElementById('reject-modal').classList.add('d-none');
      document.getElementById('client-modal').classList.add('d-none');
      pendingRejectId = null;
      await loadClients(currentPage);
      await loadStats();
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  }

  async function suspendClient(id, btn) {
    if (!confirm('Suspend this client?')) return;
    var doSuspend = async function () {
      await get('/api/v1/admin/clients/' + id + '/suspend', { method: 'POST' });
      toast('Client suspended', 'warning');
      document.getElementById('client-modal').classList.add('d-none');
      await loadClients(currentPage);
      await loadStats();
    };
    var run = btn ? AdminCore.withLoading(btn, doSuspend) : doSuspend();
    run.catch(function (e) { toast('Failed: ' + e.message, 'error'); });
  }

  async function reinstateClient(id, btn) {
    if (!confirm('Reinstate this client?')) return;
    var doReinstate = async function () {
      await get('/api/v1/admin/clients/' + id + '/reinstate', { method: 'POST' });
      toast('Client reinstated', 'success');
      document.getElementById('client-modal').classList.add('d-none');
      await loadClients(currentPage);
      await loadStats();
    };
    var run = btn ? AdminCore.withLoading(btn, doReinstate) : doReinstate();
    run.catch(function (e) { toast('Failed: ' + e.message, 'error'); });
  }

  async function saveNotes(id) {
    var notesEl = document.getElementById('modal-notes');
    if (!notesEl) return;
    try {
      await get('/api/v1/admin/clients/' + id + '/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesEl.value })
      });
      toast('Notes saved', 'success');
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  }

  // ── Delegated events ─────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    var id     = el.dataset.id || el.dataset.clientId;

    if (action === 'apply-filters')    return loadClients(1);
    if (action === 'clear-filters') {
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-search').value = '';
      return loadClients(1);
    }
    if (action === 'export-csv')       return exportCSV();
    if (action === 'paginate') {
      var pg = parseInt(el.dataset.page, 10);
      if (isFinite(pg) && pg >= 1) return loadClients(pg);
    }

    // Row actions
    if (action === 'view-client')      return id && viewClient(id);
    if (action === 'approve-client')   return id && approveClient(id, el);
    if (action === 'open-reject')      return id && openRejectModal(id);
    if (action === 'suspend-client')   return id && suspendClient(id, el);
    if (action === 'reinstate-client') return id && reinstateClient(id, el);
    if (action === 'save-notes')       return id && saveNotes(id);
    if (action === 'confirm-reject')   return confirmReject();

    // Bulk
    if (action === 'bulk-approve')     return bulkUpdate('APPROVED');
    if (action === 'bulk-reject')      return bulkUpdate('REJECTED');
    if (action === 'bulk-clear') {
      selectedIds.clear();
      document.querySelectorAll('#clients-table .row-check').forEach(function (cb) { cb.checked = false; });
      var sa = document.getElementById('select-all');
      if (sa) { sa.checked = false; sa.indeterminate = false; }
      return updateBulkBar();
    }

    // Modal close
    if (action === 'close-modal')        return document.getElementById('client-modal').classList.add('d-none');
    if (action === 'close-reject-modal') {
      document.getElementById('reject-modal').classList.add('d-none');
      pendingRejectId = null;
    }
  });

  // Delegated change handler. A single listener covers all dynamically rendered checkboxes.
  document.addEventListener('change', function (e) {
    var cb = e.target;
    if (!cb.matches) return;
    if (cb.matches('#clients-table .row-check')) {
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else selectedIds.delete(cb.dataset.id);
      updateBulkBar();
      syncSelectAll();
      return;
    }
    if (cb.matches('#select-all')) {
      document.querySelectorAll('#clients-table .row-check').forEach(function (box) {
        box.checked = cb.checked;
        if (cb.checked) selectedIds.add(box.dataset.id);
        else selectedIds.delete(box.dataset.id);
      });
      updateBulkBar();
    }
  });

  // Dismiss modals on backdrop click or Escape
  document.getElementById('client-modal').addEventListener('click', function (e) {
    if (e.target === this) this.classList.add('d-none');
  });
  document.getElementById('reject-modal').addEventListener('click', function (e) {
    if (e.target === this) { this.classList.add('d-none'); pendingRejectId = null; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.getElementById('client-modal').classList.add('d-none');
    document.getElementById('reject-modal').classList.add('d-none');
    pendingRejectId = null;
  });

  // Live search
  document.getElementById('filter-search')?.addEventListener('input', debounceSearch);

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await Promise.all([loadStats(), loadClients(1)]);
  }

  window.addEventListener('load', init);
}());
