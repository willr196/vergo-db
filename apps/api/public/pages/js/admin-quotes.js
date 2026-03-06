(function () {
  'use strict';

  var esc  = AdminCore.escapeHtml;
  var get  = AdminCore.fetchJSON;
  var fmtD = AdminCore.formatDate;
  var toast = function (m, t) { AdminCore.toast(m, t); };

  var allQuotes    = [];
  var filteredQ    = [];
  var currentPage  = 1;
  var PAGE_SIZE    = 25;
  var sortState    = { col: 'createdAt', dir: 'desc' };
  var pendingId    = null;

  // ── Load stats ────────────────────────────────────────
  async function loadStats() {
    try {
      var s = await get('/api/v1/admin/quotes/stats');
      document.getElementById('q-total').textContent    = s.total;
      document.getElementById('q-new').textContent      = s.new;
      document.getElementById('q-quoted').textContent   = s.quoted;
      document.getElementById('q-accepted').textContent = s.accepted;
      document.getElementById('q-completed').textContent= s.completed;
      document.getElementById('q-declined').textContent = s.declined;
      document.getElementById('q-value').textContent    = '£' + (s.totalQuotedValue || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
    } catch (e) { /* non-fatal */ }
  }

  // ── Load quotes ───────────────────────────────────────
  async function loadQuotes() {
    var status   = document.getElementById('filter-status').value;
    var search   = document.getElementById('filter-search').value;
    var dateFrom = document.getElementById('filter-date-from').value;
    var dateTo   = document.getElementById('filter-date-to').value;

    var params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE });
    if (status)   params.set('status', status);
    if (search)   params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo)   params.set('dateTo', dateTo);

    document.getElementById('quotes-tbody').innerHTML =
      '<tr><td colspan="9" class="loading"><div class="as-skeleton" style="margin:auto;max-width:200px"></div></td></tr>';

    try {
      var data = await get('/api/v1/admin/quotes?' + params.toString());
      allQuotes = data.quotes || [];
      filteredQ = allQuotes.slice();
      var pagination = data.pagination || {};

      sortAndRender();
      renderPagination(pagination);

      var countEl = document.getElementById('quote-count');
      if (countEl) countEl.textContent = (pagination.total || allQuotes.length) + ' results';
    } catch (e) {
      document.getElementById('quotes-tbody').innerHTML =
        '<tr><td colspan="9" class="empty-state">Failed to load: ' + esc(e.message) + '</td></tr>';
    }
  }

  function sortAndRender() {
    var rows = filteredQ.slice();
    rows.sort(function (a, b) {
      var av, bv;
      if (sortState.col === 'clientName') {
        av = (a.client && a.client.companyName || '').toLowerCase();
        bv = (b.client && b.client.companyName || '').toLowerCase();
      } else if (sortState.col === 'eventDate' || sortState.col === 'createdAt') {
        av = new Date(a[sortState.col] || 0);
        bv = new Date(b[sortState.col] || 0);
      } else {
        av = (a[sortState.col] || '').toString().toLowerCase();
        bv = (b[sortState.col] || '').toString().toLowerCase();
      }
      if (av < bv) return sortState.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortState.dir === 'asc' ? 1 : -1;
      return 0;
    });

    var tbody = document.getElementById('quotes-tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No quote requests found</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (q) {
      var client = q.client || {};
      var eventDate = q.eventDate ? fmtD(q.eventDate) : '-';
      var amount = q.quotedAmount ? '£' + Number(q.quotedAmount).toLocaleString('en-GB') : '-';
      return '<tr>'
        + '<td><strong>' + esc(client.companyName || '-') + '</strong>'
        + (client.contactName ? '<br><span class="text-muted fs-sm">' + esc(client.contactName) + '</span>' : '')
        + '</td>'
        + '<td>' + esc(q.eventType || '-') + '</td>'
        + '<td>' + eventDate + '</td>'
        + '<td>' + esc(String(q.staffCount || '-')) + '</td>'
        + '<td><span class="text-muted fs-sm">' + esc(q.roles ? q.roles.substring(0, 40) : '-') + '</span></td>'
        + '<td>' + esc(q.budget || amount) + '</td>'
        + '<td><span class="badge badge-' + esc(q.status) + '">' + esc(q.status) + '</span></td>'
        + '<td>' + fmtD(q.createdAt) + '</td>'
        + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn btn-info btn-sm" data-action="view-quote" data-id="' + esc(q.id) + '">View</button>'
        + '<button class="btn btn-warning btn-sm" data-action="update-status" data-id="' + esc(q.id) + '">Status</button>'
        + (client.email ? '<a class="btn btn-ghost btn-sm" href="mailto:' + esc(client.email) + '">Email</a>' : '')
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  function renderPagination(pag) {
    var el = document.getElementById('quotes-pagination');
    if (!el) return;
    var total = pag.total || 0;
    var pages = pag.pages || 1;
    if (pages <= 1) { el.innerHTML = ''; return; }
    var info = '<span class="as-pagination-info">Page ' + currentPage + ' of ' + pages + ' (' + total + ')</span>';
    var btns = '<div class="as-pagination-controls">'
      + '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' data-action="prev-page">&#8249; Prev</button>';
    var start = Math.max(1, currentPage - 2);
    var end   = Math.min(pages, start + 4);
    for (var i = start; i <= end; i++) {
      btns += '<button ' + (i === currentPage ? 'class="active"' : '') + ' data-action="goto-page" data-page="' + i + '">' + i + '</button>';
    }
    btns += '<button ' + (currentPage >= pages ? 'disabled' : '') + ' data-action="next-page">Next &#8250;</button></div>';
    el.innerHTML = info + btns;
  }

  // ── Quote detail modal ─────────────────────────────────
  async function openQuoteModal(id) {
    try {
      var q = await get('/api/v1/admin/quotes/' + id);
      var client = q.client || {};
      document.getElementById('qm-title').textContent = 'Quote - ' + (client.companyName || q.id);
      document.getElementById('qm-body').innerHTML =
        '<div class="detail-grid mb-2">'
        + '<div class="detail-row"><span class="detail-label">Company</span><span class="detail-value fw-600">' + esc(client.companyName || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">' + esc(client.contactName || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value"><a href="mailto:' + esc(client.email||'') + '" style="color:var(--as-info)">' + esc(client.email || '-') + '</a></span></div>'
        + '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + esc(client.phone || '-') + '</span></div>'
        + '</div>'
        + '<hr style="border:none;border-top:1px solid var(--as-border);margin:14px 0">'
        + '<div class="detail-grid mb-2">'
        + '<div class="detail-row"><span class="detail-label">Event Type</span><span class="detail-value">' + esc(q.eventType || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Event Date</span><span class="detail-value">' + (q.eventDate ? fmtD(q.eventDate) : '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">' + esc(q.location || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Venue</span><span class="detail-value">' + esc(q.venue || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Staff Count</span><span class="detail-value">' + esc(String(q.staffCount || '-')) + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Roles</span><span class="detail-value">' + esc(q.roles || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Budget</span><span class="detail-value">' + esc(q.budget || '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Quoted Amount</span><span class="detail-value fw-600 text-success">' + (q.quotedAmount ? '£' + Number(q.quotedAmount).toLocaleString('en-GB') : '-') + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="badge badge-' + esc(q.status) + '">' + esc(q.status) + '</span></span></div>'
        + '<div class="detail-row"><span class="detail-label">Quote Sent</span><span class="detail-value">' + (q.quoteSentAt ? fmtD(q.quoteSentAt) : '-') + '</span></div>'
        + '</div>'
        + (q.description ? '<div class="mb-2"><span class="detail-label">Description</span><p style="font-size:0.875rem;margin-top:6px;line-height:1.6">' + esc(q.description) + '</p></div>' : '')
        + (q.adminNotes ? '<div><span class="detail-label">Admin Notes</span><p style="font-size:0.875rem;margin-top:6px">' + esc(q.adminNotes) + '</p></div>' : '');

      document.getElementById('qm-footer').innerHTML =
        '<button class="btn btn-ghost" data-action="close-modal">Close</button>'
        + '<button class="btn btn-warning" data-action="update-status" data-id="' + esc(id) + '">Update Status</button>'
        + (client.email ? '<a class="btn btn-info" href="mailto:' + esc(client.email) + '">Email Client</a>' : '');

      document.getElementById('quote-modal').classList.remove('d-none');
    } catch (e) {
      toast('Failed to load quote: ' + e.message, 'error');
    }
  }

  // ── Status update modal ────────────────────────────────
  function openStatusModal(id) {
    pendingId = id;
    var q = allQuotes.find(function(q){ return q.id === id; });
    if (q) {
      document.getElementById('sm-status').value = q.status;
      document.getElementById('sm-amount').value = q.quotedAmount || '';
      document.getElementById('sm-notes').value  = q.adminNotes || '';
    }
    document.getElementById('sm-title').textContent = 'Update Status';
    document.getElementById('status-modal').classList.remove('d-none');
  }

  async function confirmStatusUpdate() {
    if (!pendingId) return;
    var status = document.getElementById('sm-status').value;
    var amount = document.getElementById('sm-amount').value;
    var notes  = document.getElementById('sm-notes').value;
    try {
      await get('/api/v1/admin/quotes/' + pendingId + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes: notes || undefined })
      });
      if (amount) {
        await get('/api/v1/admin/quotes/' + pendingId + '/quoted-amount', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quotedAmount: parseFloat(amount) })
        });
      }
      toast('Quote updated', 'success');
      document.getElementById('status-modal').classList.add('d-none');
      document.getElementById('quote-modal').classList.add('d-none');
      pendingId = null;
      await Promise.all([loadStats(), loadQuotes()]);
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  // ── Delegated events ───────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'apply-filters')  { currentPage = 1; return loadQuotes(); }
    if (action === 'clear-filters')  {
      document.getElementById('filter-status').value    = '';
      document.getElementById('filter-search').value    = '';
      document.getElementById('filter-date-from').value = '';
      document.getElementById('filter-date-to').value   = '';
      currentPage = 1;
      return loadQuotes();
    }
    if (action === 'prev-page')      { currentPage--; return loadQuotes(); }
    if (action === 'next-page')      { currentPage++; return loadQuotes(); }
    if (action === 'goto-page')      { currentPage = parseInt(el.dataset.page, 10); return loadQuotes(); }
    if (action === 'view-quote')     return openQuoteModal(el.dataset.id);
    if (action === 'update-status')  { document.getElementById('quote-modal').classList.add('d-none'); return openStatusModal(el.dataset.id); }
    if (action === 'close-modal')    return document.getElementById('quote-modal').classList.add('d-none');
    if (action === 'close-status-modal') { document.getElementById('status-modal').classList.add('d-none'); pendingId = null; }
    if (action === 'confirm-status-update') return confirmStatusUpdate();
    if (action === 'export-csv') {
      return AdminCore.exportCSV(allQuotes.map(function(q) {
        return {
          Client: q.client ? q.client.companyName : '',
          Contact: q.client ? q.client.contactName : '',
          Email: q.client ? q.client.email : '',
          EventType: q.eventType,
          EventDate: q.eventDate ? fmtD(q.eventDate) : '',
          Location: q.location,
          StaffCount: q.staffCount,
          Roles: q.roles,
          Budget: q.budget,
          QuotedAmount: q.quotedAmount || '',
          Status: q.status,
          Received: fmtD(q.createdAt)
        };
      }), 'quotes');
    }
  });

  // Sort on thead click
  document.querySelector('thead')?.addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    if (sortState.col === th.dataset.sort) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    else { sortState.col = th.dataset.sort; sortState.dir = 'asc'; }
    document.querySelectorAll('th').forEach(function(t){ t.classList.remove('sorted'); });
    th.classList.add('sorted');
    sortAndRender();
  });

  // Backdrop close modals
  document.getElementById('quote-modal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('d-none');
  });
  document.getElementById('status-modal').addEventListener('click', function(e) {
    if (e.target === this) { this.classList.add('d-none'); pendingId = null; }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.getElementById('quote-modal').classList.add('d-none');
      document.getElementById('status-modal').classList.add('d-none');
      pendingId = null;
    }
  });

  // ── Init ─────────────────────────────────────────────
  async function init() {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await Promise.all([loadStats(), loadQuotes()]);
  }

  window.addEventListener('load', init);
}());
