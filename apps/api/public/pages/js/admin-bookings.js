(function () {
  'use strict';

  const get = AdminCore.fetchJSON;
  const esc = AdminCore.escapeHtml;
  const toast = (message, type) => AdminCore.toast(message, type || 'info');

  let bookings = [];
  let currentPage = 1;
  let totalPages = 1;

  let rejectBookingId = null;
  let completeBookingId = null;
  let viewingBookingId = null;

  function formatDate(value) {
    if (!value) return '-';
    if (AdminCore.formatDateTime) return AdminCore.formatDateTime(value);
    return AdminCore.formatDate(value);
  }

  function money(value) {
    if (value == null || value === '') return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return '£' + num.toFixed(2);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function tierBadge(tier) {
    if (!tier) return '<span class="badge tier-null">UNASSIGNED</span>';
    return '<span class="badge tier-' + esc(tier) + '">' + esc(tier) + '</span>';
  }

  function statusBadge(status) {
    return '<span class="status-badge status-' + esc(status) + '">' + esc(status) + '</span>';
  }

  function updatePendingBanner(count) {
    const banner = document.getElementById('pending-banner');
    setText('pending-count', count || 0);
    if (!banner) return;
    if (count > 0) banner.classList.remove('hidden');
    else banner.classList.add('hidden');
  }

  function queryParams(page) {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    const status = document.getElementById('filter-status').value;
    const search = document.getElementById('filter-search').value.trim();

    if (status) params.set('status', status);
    if (search) params.set('search', search);
    return params;
  }

  async function loadStats() {
    try {
      const data = await get('/api/v1/admin/bookings/stats');
      setText('stat-pending', data.pending ?? 0);
      setText('stat-confirmed', data.confirmed ?? 0);
      setText('stat-completed', data.completed ?? 0);
      setText('stat-rejected', data.rejected ?? 0);
      setText('stat-total', data.total ?? 0);
    } catch (err) {
      console.error('[ADMIN] Failed to load booking stats', err);
      toast('Failed to load booking stats: ' + err.message, 'error');
    }
  }

  async function loadBookings(page) {
    currentPage = page || 1;

    const tbody = document.getElementById('bookings-table');
    tbody.innerHTML = '<tr><td colspan="8" class="loading"><div class="as-skeleton" style="margin:auto;max-width:220px"></div></td></tr>';

    try {
      const params = queryParams(currentPage);
      const data = await get('/api/v1/admin/bookings?' + params.toString());

      bookings = data.bookings || [];
      const pagination = data.pagination || {};
      totalPages = pagination.totalPages || pagination.pages || 1;

      setText('booking-count', (pagination.total || 0) + ' booking' + ((pagination.total || 0) === 1 ? '' : 's'));
      updatePendingBanner(data.pendingCount || 0);

      renderBookingsTable();
      renderPagination();
    } catch (err) {
      console.error('[ADMIN] Failed to load bookings', err);
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load bookings</td></tr>';
      toast('Failed to load bookings: ' + err.message, 'error');
    }
  }

  function renderBookingsTable() {
    const tbody = document.getElementById('bookings-table');

    if (!bookings.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No bookings found</td></tr>';
      return;
    }

    tbody.innerHTML = bookings.map((booking) => {
      const staffName = booking.staff
        ? (booking.staff.firstName + ' ' + booking.staff.lastName)
        : 'Unassigned';
      const staffTier = booking.staff?.staffTier || booking.staffTierAtBooking;

      const clientName = booking.client?.companyName || 'Unknown client';
      const clientTier = booking.client?.subscriptionTier || booking.clientTierAtBooking;

      const eventName = booking.eventName || 'General booking';
      const eventDate = formatDate(booking.eventDate);

      const shiftRange = (booking.shiftStart && booking.shiftEnd)
        ? (booking.shiftStart + ' - ' + booking.shiftEnd)
        : 'Time TBC';

      const estimatedHours = booking.hoursEstimated != null ? Number(booking.hoursEstimated) : null;

      const actions = [];
      if (booking.status === 'PENDING') {
        actions.push('<button class="btn btn-success btn-sm" data-action="confirm-booking" data-id="' + esc(booking.id) + '">Confirm</button>');
        actions.push('<button class="btn btn-danger btn-sm" data-action="open-reject" data-id="' + esc(booking.id) + '">Reject</button>');
      } else if (booking.status === 'CONFIRMED') {
        actions.push('<button class="btn btn-info btn-sm" data-action="open-complete" data-id="' + esc(booking.id) + '">Complete</button>');
        actions.push('<button class="btn btn-danger btn-sm" data-action="mark-no-show" data-id="' + esc(booking.id) + '">No-Show</button>');
      }
      actions.push('<button class="btn btn-ghost btn-sm" data-action="view-booking" data-id="' + esc(booking.id) + '">View</button>');

      return '<tr>'
        + '<td>'
        + '<strong>' + esc(staffName) + '</strong>'
        + '<span class="event-meta">' + tierBadge(staffTier) + '</span>'
        + '</td>'
        + '<td>'
        + '<strong>' + esc(clientName) + '</strong>'
        + '<span class="event-meta">' + tierBadge(clientTier) + '</span>'
        + '</td>'
        + '<td>'
        + '<strong>' + esc(eventName) + '</strong>'
        + '<span class="event-meta">' + esc(eventDate) + '</span>'
        + '<span class="event-meta">' + esc(booking.location || '-') + '</span>'
        + '</td>'
        + '<td>'
        + '<strong>' + esc(shiftRange) + '</strong>'
        + '<span class="shift-meta">Est. Hours: ' + esc(estimatedHours == null ? '-' : String(estimatedHours)) + '</span>'
        + '</td>'
        + '<td>'
        + '<strong>' + esc(money(booking.hourlyRateCharged)) + '/hr</strong>'
        + '<span class="rate-meta">Total: ' + esc(money(booking.totalEstimated)) + '</span>'
        + '</td>'
        + '<td>' + statusBadge(booking.status) + '</td>'
        + '<td class="fs-sm">' + esc(formatDate(booking.createdAt)) + '</td>'
        + '<td><div class="table-actions">' + actions.join('') + '</div></td>'
        + '</tr>';
    }).join('');
  }

  function renderPagination() {
    const el = document.getElementById('bookings-pagination');
    if (!el) return;

    el.innerHTML = ''
      + '<span class="as-pagination-info">Page ' + currentPage + ' of ' + (totalPages || 1) + '</span>'
      + '<div class="as-pagination-controls">'
      + '<button data-action="paginate" data-page="' + (currentPage - 1) + '" ' + (currentPage <= 1 ? 'disabled' : '') + '>Prev</button>'
      + '<button data-action="paginate" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages ? 'disabled' : '') + '>Next</button>'
      + '</div>';
  }

  async function refreshData() {
    await Promise.all([loadStats(), loadBookings(currentPage)]);
  }

  async function confirmBooking(id) {
    if (!confirm('Confirm this booking request?')) return;

    try {
      console.log('[BOOKING] Confirm action', id);
      await get('/api/v1/admin/bookings/' + encodeURIComponent(id) + '/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      toast('Booking confirmed', 'success');
      await refreshData();
    } catch (err) {
      toast('Failed to confirm booking: ' + err.message, 'error');
    }
  }

  function openRejectModal(id) {
    rejectBookingId = id;
    document.getElementById('reject-reason').value = '';
    AdminCore.openModal('reject-modal');
  }

  function closeRejectModal() {
    rejectBookingId = null;
    AdminCore.closeModal('reject-modal');
  }

  async function submitReject() {
    if (!rejectBookingId) return;

    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) {
      toast('Rejection reason is required', 'warning');
      return;
    }

    try {
      console.log('[BOOKING] Reject action', { bookingId: rejectBookingId, reason: reason });
      await get('/api/v1/admin/bookings/' + encodeURIComponent(rejectBookingId) + '/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason }),
      });

      closeRejectModal();
      toast('Booking rejected', 'success');
      await refreshData();
    } catch (err) {
      toast('Failed to reject booking: ' + err.message, 'error');
    }
  }

  function openCompleteModal(id) {
    completeBookingId = id;
    document.getElementById('complete-hours').value = '';
    AdminCore.openModal('complete-modal');
  }

  function closeCompleteModal() {
    completeBookingId = null;
    AdminCore.closeModal('complete-modal');
  }

  async function submitComplete() {
    if (!completeBookingId) return;

    const hoursRaw = document.getElementById('complete-hours').value.trim();
    const payload = {};

    if (hoursRaw) {
      const parsed = Number(hoursRaw);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24) {
        toast('Actual hours must be between 0.1 and 24', 'warning');
        return;
      }
      payload.hoursActual = parsed;
    }

    try {
      console.log('[BOOKING] Complete action', { bookingId: completeBookingId, payload: payload });
      await get('/api/v1/admin/bookings/' + encodeURIComponent(completeBookingId) + '/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      closeCompleteModal();
      toast('Booking marked as completed', 'success');
      await refreshData();
    } catch (err) {
      toast('Failed to complete booking: ' + err.message, 'error');
    }
  }

  async function markNoShow(id) {
    if (!confirm('Mark this booking as no-show?')) return;

    try {
      console.log('[BOOKING] No-show action', id);
      await get('/api/v1/admin/bookings/' + encodeURIComponent(id) + '/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      toast('Booking marked as no-show', 'warning');
      await refreshData();
    } catch (err) {
      toast('Failed to mark no-show: ' + err.message, 'error');
    }
  }

  function renderTimeline(booking) {
    const items = [];

    if (booking.createdAt) {
      items.push('<div class="timeline-item"><strong>Created</strong><small>' + esc(formatDate(booking.createdAt)) + '</small></div>');
    }
    if (booking.confirmedAt) {
      const by = booking.confirmedBy ? (' by ' + booking.confirmedBy) : '';
      items.push('<div class="timeline-item"><strong>Confirmed</strong><small>' + esc(formatDate(booking.confirmedAt) + by) + '</small></div>');
    }
    if (booking.completedAt) {
      items.push('<div class="timeline-item"><strong>Completed</strong><small>' + esc(formatDate(booking.completedAt)) + '</small></div>');
    }
    if (booking.status === 'REJECTED') {
      const reason = booking.rejectionReason ? ('Reason: ' + booking.rejectionReason) : 'No reason provided';
      items.push('<div class="timeline-item"><strong>Rejected</strong><small>' + esc(reason) + '</small></div>');
    }
    if (booking.status === 'NO_SHOW') {
      items.push('<div class="timeline-item"><strong>No Show</strong><small>Marked by admin</small></div>');
    }

    if (!items.length) {
      return '<div class="text-muted fs-sm">No timeline events yet</div>';
    }

    return '<div class="timeline">' + items.join('') + '</div>';
  }

  function renderBookingModal(booking) {
    const staffName = booking.staff
      ? (booking.staff.firstName + ' ' + booking.staff.lastName)
      : 'Unassigned';

    const eventDateRange = booking.eventEndDate
      ? (formatDate(booking.eventDate) + ' → ' + formatDate(booking.eventEndDate))
      : formatDate(booking.eventDate);

    const body = document.getElementById('booking-modal-body');

    body.innerHTML = ''
      + '<div class="modal-section">'
      + '<h3>Staff</h3>'
      + '<div class="detail-grid">'
      + '<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">' + esc(staffName) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Tier</span><span class="detail-value">' + tierBadge(booking.staff?.staffTier || booking.staffTierAtBooking) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Rating</span><span class="detail-value">' + esc(String(booking.staff?.staffRating ?? '-')) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Highlights</span><span class="detail-value">' + esc(booking.staff?.staffHighlights || '-') + '</span></div>'
      + '</div>'
      + '</div>'

      + '<div class="modal-section">'
      + '<h3>Client</h3>'
      + '<div class="detail-grid">'
      + '<div class="detail-row"><span class="detail-label">Company</span><span class="detail-value">' + esc(booking.client?.companyName || '-') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Tier</span><span class="detail-value">' + tierBadge(booking.client?.subscriptionTier || booking.clientTierAtBooking) + '</span></div>'
      + '</div>'
      + '</div>'

      + '<div class="modal-section">'
      + '<h3>Event</h3>'
      + '<div class="detail-grid">'
      + '<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">' + esc(booking.eventName || 'General booking') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">' + esc(eventDateRange) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">' + esc(booking.location || '-') + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Venue</span><span class="detail-value">' + esc(booking.venue || '-') + '</span></div>'
      + '</div>'
      + '</div>'

      + '<div class="modal-section">'
      + '<h3>Shift & Pricing</h3>'
      + '<div class="detail-grid">'
      + '<div class="detail-row"><span class="detail-label">Shift</span><span class="detail-value">' + esc((booking.shiftStart || '-') + ' - ' + (booking.shiftEnd || '-')) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Estimated Hours</span><span class="detail-value">' + esc(String(booking.hoursEstimated ?? '-')) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Hourly Rate</span><span class="detail-value">' + esc(money(booking.hourlyRateCharged)) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Staff Pay Rate</span><span class="detail-value">' + esc(money(booking.staffPayRate)) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Total Estimated</span><span class="detail-value">' + esc(money(booking.totalEstimated)) + '</span></div>'
      + '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">' + statusBadge(booking.status) + '</span></div>'
      + '</div>'
      + '</div>'

      + '<div class="modal-section">'
      + '<h3>Notes</h3>'
      + '<div class="detail-row mb-1"><span class="detail-label">Client Notes</span><span class="detail-value">' + esc(booking.clientNotes || '-') + '</span></div>'
      + '<label class="as-label" for="booking-admin-notes">Admin Notes</label>'
      + '<textarea id="booking-admin-notes" maxlength="2000" placeholder="Add internal notes...">' + esc(booking.adminNotes || '') + '</textarea>'
      + '</div>'

      + '<div class="modal-section">'
      + '<h3>Status Timeline</h3>'
      + renderTimeline(booking)
      + '</div>';
  }

  async function viewBooking(id) {
    try {
      const booking = await get('/api/v1/admin/bookings/' + encodeURIComponent(id));
      viewingBookingId = id;
      renderBookingModal(booking);
      AdminCore.openModal('booking-modal');
    } catch (err) {
      toast('Failed to load booking details: ' + err.message, 'error');
    }
  }

  function closeBookingModal() {
    viewingBookingId = null;
    AdminCore.closeModal('booking-modal');
  }

  async function saveBookingNotes() {
    if (!viewingBookingId) return;

    const notes = document.getElementById('booking-admin-notes').value;

    try {
      console.log('[BOOKING] Saving notes', viewingBookingId);
      await get('/api/v1/admin/bookings/' + encodeURIComponent(viewingBookingId) + '/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: notes }),
      });

      toast('Notes saved', 'success');
      await loadBookings(currentPage);
      await viewBooking(viewingBookingId);
    } catch (err) {
      toast('Failed to save notes: ' + err.message, 'error');
    }
  }

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;
    const id = el.dataset.id;

    if (action === 'refresh-bookings') return refreshData();
    if (action === 'view-pending') {
      document.getElementById('filter-status').value = 'PENDING';
      return loadBookings(1);
    }

    if (action === 'apply-filters') return loadBookings(1);
    if (action === 'clear-filters') {
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-search').value = '';
      return loadBookings(1);
    }
    if (action === 'paginate') {
      const page = Number(el.dataset.page || '1');
      if (Number.isFinite(page) && page >= 1 && page <= totalPages) return loadBookings(page);
      return;
    }

    if (action === 'confirm-booking') return confirmBooking(id);
    if (action === 'open-reject') return openRejectModal(id);
    if (action === 'confirm-reject') return submitReject();
    if (action === 'close-reject-modal') return closeRejectModal();

    if (action === 'open-complete') return openCompleteModal(id);
    if (action === 'confirm-complete') return submitComplete();
    if (action === 'close-complete-modal') return closeCompleteModal();

    if (action === 'mark-no-show') return markNoShow(id);

    if (action === 'view-booking') return viewBooking(id);
    if (action === 'close-booking-modal') return closeBookingModal();
    if (action === 'save-booking-notes') return saveBookingNotes();
  });

  document.getElementById('filter-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadBookings(1);
    }
  });

  (async function init() {
    const session = await AdminCore.checkAuth();
    if (!session) return;

    AdminCore.initModalBehavior('booking-modal');
    AdminCore.initModalBehavior('reject-modal');
    AdminCore.initModalBehavior('complete-modal');

    await Promise.all([loadStats(), loadBookings(1)]);
  })();
})();
