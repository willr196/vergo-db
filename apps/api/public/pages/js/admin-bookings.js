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

  const gbpFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  /** Formats whole pence (as returned by the dashboard/money endpoints) as £-GBP. */
  function gbp(pence) {
    if (pence == null || !Number.isFinite(Number(pence))) return '-';
    return gbpFormatter.format(Number(pence) / 100);
  }

  function shiftTimes(booking) {
    if (!booking.shiftStart || !booking.shiftEnd) return '';
    return booking.shiftStart + '–' + booking.shiftEnd;
  }

  function bookingLabel(booking) {
    const who = booking.client ? booking.client.companyName : 'Unknown client';
    const staff = booking.staff ? (booking.staff.firstName + ' ' + booking.staff.lastName) : 'unassigned';
    return esc(who) + ' — ' + esc(staff);
  }

  function whatsappChaseUrl(booking) {
    const staff = booking.staff;
    if (!staff || !staff.phone) return null;
    const digits = String(staff.phone).replace(/[^\d+]/g, '').replace(/^\+/, '');
    const when = formatDate(booking.eventDate) + (shiftTimes(booking) ? ' (' + shiftTimes(booking) + ')' : '');
    const message = 'Hi ' + staff.firstName + ', can you confirm you\'re still good for ' +
      (booking.eventName || 'the shift') + ' on ' + when + '?';
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function tierBadge(tier) {
    if (!tier) return '<span class="badge tier-null">UNASSIGNED</span>';
    return '<span class="badge tier-' + esc(tier) + '">' + esc(tier) + '</span>';
  }

  function laneBadge(lane) {
    if (!lane) return '<span class="badge tier-null">-</span>';
    return '<span class="badge">' + esc(lane) + '</span>';
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
        + '<span class="event-meta">' + laneBadge(booking.bookingLane) + '</span>'
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
    await Promise.all([loadStats(), loadBookings(currentPage), loadDashboard(), loadTimesheets()]);
  }

  // ── Float band + Needs You queue ─────────────────────────────────────

  let dashboardBookingsById = {};

  function renderFloatBand(float) {
    setText('float-held', gbp(float.heldPence));
    setText('float-committed', gbp(float.committedPence));
    setText('float-free', gbp(float.freePence));

    const bar = document.getElementById('float-bar-committed');
    const pct = float.heldPence > 0 ? Math.min(100, Math.round((float.committedPence / float.heldPence) * 100)) : 0;
    if (bar) bar.style.width = pct + '%';

    const note = document.getElementById('float-unwind-note');
    if (!note) return;
    if (!float.unwindsFrom) {
      note.textContent = 'Nothing held right now.';
    } else if (float.daysToUnwind <= 0) {
      note.textContent = 'Staff pay on held bookings is due — starts leaving now.';
    } else {
      note.textContent = 'Starts leaving in ' + float.daysToUnwind + (float.daysToUnwind === 1 ? ' day' : ' days') +
        ' (' + formatDate(float.unwindsFrom) + ').';
    }
  }

  function queueRowActions(booking) {
    const id = esc(booking.id);
    switch (booking.status) {
      case 'PENDING': {
        const chase = whatsappChaseUrl(booking);
        return (chase ? '<a class="btn btn-ghost btn-sm" href="' + esc(chase) + '" target="_blank" rel="noopener noreferrer">Chase via WhatsApp</a>' : '') +
          '<button class="btn btn-success btn-sm" data-action="confirm-booking" data-id="' + id + '">Confirm</button>' +
          '<button class="btn btn-danger btn-sm" data-action="open-reject" data-id="' + id + '">Reject</button>';
      }
      case 'CONFIRMED':
        return '<button class="btn btn-info btn-sm" data-action="open-complete" data-id="' + id + '">Log hours</button>';
      case 'COMPLETED':
        if (!booking.invoicedAt) {
          return '<button class="btn btn-primary btn-sm" data-action="send-invoice" data-id="' + id + '">Send invoice</button>';
        }
        if (!booking.clientPaidAt) {
          return '<button class="btn btn-primary btn-sm" data-action="mark-client-paid" data-id="' + id + '">Mark client paid</button>';
        }
        if (!booking.staffPaidAt) {
          return '<button class="btn btn-primary btn-sm" data-action="mark-staff-paid" data-id="' + id + '">Mark staff paid</button>';
        }
        return '';
      default:
        return '';
    }
  }

  function renderQueueRow(booking) {
    const margin = booking.money ? booking.money.netMarginPence : null;
    const marginLow = booking.money && booking.money.revenuePence > 0 &&
      (booking.money.netMarginPence / booking.money.revenuePence) < 0.1;
    const provisional = booking.money && booking.money.provisional;

    return '<div class="queue-row">' +
      '<div class="queue-row-info">' +
        '<span class="queue-row-title">' + bookingLabel(booking) + (booking.eventName ? ' — ' + esc(booking.eventName) : '') + '</span>' +
        '<span class="queue-row-meta">' + esc(formatDate(booking.eventDate)) + (shiftTimes(booking) ? ' · ' + esc(shiftTimes(booking)) : '') +
          (margin != null ? ' · <span class="queue-row-margin' + (marginLow ? ' margin-low' : '') + '">' + gbp(margin) + ' net' + (provisional ? ' (est.)' : '') + '</span>' : '') +
        '</span>' +
      '</div>' +
      '<div class="queue-row-actions">' + queueRowActions(booking) + '</div>' +
    '</div>';
  }

  function renderNeedsStaffRow(item) {
    return '<div class="queue-row">' +
      '<div class="queue-row-info">' +
        '<span class="queue-row-title">' + esc(item.eventType || 'Event') + '</span>' +
        '<span class="queue-row-meta">' + esc(formatDate(item.eventDate)) + ' · ' + item.staffed + '/' + item.staffCount + ' staffed</span>' +
      '</div>' +
      '<div class="queue-row-actions">' +
        '<button class="btn btn-ghost btn-sm" data-action="assign-staff" data-id="' + esc(item.quoteRequestId) + '">Assign staff</button>' +
      '</div>' +
    '</div>';
  }

  const QUEUE_LABELS = {
    needsStaff: 'Needs staff',
    staffNotConfirmed: 'Staff not confirmed',
    logHours: 'Log hours',
    sendInvoice: 'Send invoice',
    chasePayment: 'Chase payment',
    runPayroll: 'Run payroll',
  };

  function renderQueue(sections) {
    const body = document.getElementById('needs-you-body');
    if (!body) return;

    if (!sections || sections.length === 0) {
      body.innerHTML = '<div class="queue-empty">Nothing needs you.</div>';
      return;
    }

    body.innerHTML = sections.map((section) => {
      const label = QUEUE_LABELS[section.key] || section.key;
      const rows = section.key === 'needsStaff'
        ? section.items.map(renderNeedsStaffRow)
        : section.items.map((item) => renderQueueRow(dashboardBookingsById[item.id] || item));
      return '<div class="queue-section">' +
        '<p class="queue-section-label">' + esc(label) + ' (' + section.items.length + ')</p>' +
        rows.join('') +
        '</div>';
    }).join('');
  }

  async function loadDashboard() {
    try {
      const data = await get('/api/v1/admin/bookings/dashboard');
      dashboardBookingsById = {};
      (data.bookings || []).forEach((b) => { dashboardBookingsById[b.id] = b; });
      renderFloatBand(data.float);
      renderQueue(data.queue);
    } catch (err) {
      console.error('[ADMIN] Failed to load dashboard', err);
      toast('Failed to load the float/queue: ' + err.message, 'error');
    }
  }

  async function sendInvoice(id) {
    if (!confirm('Mark this booking as invoiced? This starts the 14-day staff pay clock.')) return;
    try {
      await get('/api/v1/admin/bookings/' + encodeURIComponent(id) + '/invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      toast('Booking invoiced', 'success');
      await refreshData();
    } catch (err) {
      toast('Failed to invoice booking: ' + err.message, 'error');
    }
  }

  async function markClientPaid(id) {
    if (!confirm('Mark the client as paid for this booking?')) return;
    try {
      await get('/api/v1/admin/bookings/' + encodeURIComponent(id) + '/mark-client-paid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      toast('Client payment recorded', 'success');
      await refreshData();
    } catch (err) {
      toast('Failed to record client payment: ' + err.message, 'error');
    }
  }

  async function markStaffPaid(id) {
    if (!confirm('Mark staff as paid for this booking?')) return;
    try {
      await get('/api/v1/admin/bookings/' + encodeURIComponent(id) + '/mark-staff-paid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      toast('Staff payment recorded', 'success');
      await refreshData();
    } catch (err) {
      toast('Failed to record staff payment: ' + err.message, 'error');
    }
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
      + '<div class="detail-row"><span class="detail-label">Lane</span><span class="detail-value">' + laneBadge(booking.bookingLane) + '</span></div>'
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

  // ── New Booking (manual entry) ────────────────────────────
  async function loadNewBookingOptions() {
    const clientSel = document.getElementById('nb-client');
    const staffSel = document.getElementById('nb-staff');
    clientSel.innerHTML = '<option value="">Loading clients…</option>';
    staffSel.innerHTML = '<option value="">Loading staff…</option>';

    try {
      const [clientsRes, staffRes] = await Promise.all([
        get('/api/v1/admin/clients?status=APPROVED&limit=100'),
        get('/api/v1/admin/bookings/staff-options'),
      ]);

      const clients = clientsRes.clients || [];
      const staff = Array.isArray(staffRes) ? staffRes : [];

      clientSel.innerHTML = clients.length
        ? '<option value="">Select a client…</option>' + clients.map((c) =>
            '<option value="' + esc(c.id) + '">' + esc(c.companyName) + ' (' + esc(c.subscriptionTier) + ')</option>'
          ).join('')
        : '<option value="">No approved clients found</option>';

      staffSel.innerHTML = staff.length
        ? '<option value="">Select a staff member…</option>' + staff.map((s) =>
            '<option value="' + esc(s.id) + '">' + esc(s.firstName + ' ' + s.lastName) + ' (' + esc(s.staffTier) + ')</option>'
          ).join('')
        : '<option value="">No eligible roster members found</option>';
    } catch (err) {
      clientSel.innerHTML = '<option value="">Failed to load clients</option>';
      staffSel.innerHTML = '<option value="">Failed to load staff</option>';
      toast('Failed to load clients/staff: ' + err.message, 'error');
    }
  }

  function resetNewBookingForm() {
    document.getElementById('new-booking-alert').innerHTML = '';
    ['nb-event-name', 'nb-event-date', 'nb-event-end-date', 'nb-location', 'nb-venue',
     'nb-shift-start', 'nb-shift-end', 'nb-hours-estimated', 'nb-hourly-rate', 'nb-staff-pay-rate',
     'nb-client-notes', 'nb-admin-notes'].forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('nb-booking-lane').value = 'FLEX';
    document.getElementById('nb-status').value = 'CONFIRMED';
  }

  function openNewBookingModal() {
    resetNewBookingForm();
    AdminCore.openModal('new-booking-modal');
    loadNewBookingOptions();
  }

  function closeNewBookingModal() {
    AdminCore.closeModal('new-booking-modal');
  }

  async function submitNewBooking(btn) {
    const clientId = document.getElementById('nb-client').value;
    const staffId = document.getElementById('nb-staff').value;
    const eventDate = document.getElementById('nb-event-date').value;
    const location = document.getElementById('nb-location').value.trim();
    const shiftStart = document.getElementById('nb-shift-start').value;
    const shiftEnd = document.getElementById('nb-shift-end').value;
    const hourlyRateRaw = document.getElementById('nb-hourly-rate').value;

    if (!clientId || !staffId || !eventDate || !location || !shiftStart || !shiftEnd || !hourlyRateRaw) {
      AdminCore.showAlert('Client, staff, event date, location, shift times and hourly rate are all required.', 'error', 'new-booking-alert');
      return;
    }

    const body = {
      clientId,
      staffId,
      eventDate: new Date(eventDate).toISOString(),
      location,
      shiftStart,
      shiftEnd,
      hourlyRateCharged: Number(hourlyRateRaw),
      bookingLane: document.getElementById('nb-booking-lane').value,
      status: document.getElementById('nb-status').value,
    };

    const eventName = document.getElementById('nb-event-name').value.trim();
    if (eventName) body.eventName = eventName;

    const eventEndDate = document.getElementById('nb-event-end-date').value;
    if (eventEndDate) body.eventEndDate = new Date(eventEndDate).toISOString();

    const venue = document.getElementById('nb-venue').value.trim();
    if (venue) body.venue = venue;

    const hoursEstimated = document.getElementById('nb-hours-estimated').value;
    if (hoursEstimated) body.hoursEstimated = Number(hoursEstimated);

    const staffPayRate = document.getElementById('nb-staff-pay-rate').value;
    if (staffPayRate) body.staffPayRate = Number(staffPayRate);

    const clientNotes = document.getElementById('nb-client-notes').value.trim();
    if (clientNotes) body.clientNotes = clientNotes;

    const adminNotes = document.getElementById('nb-admin-notes').value.trim();
    if (adminNotes) body.adminNotes = adminNotes;

    try {
      await AdminCore.withLoading(btn, () => get('/api/v1/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));

      closeNewBookingModal();
      toast('Booking created', 'success');
      await refreshData();
    } catch (err) {
      AdminCore.showAlert(err.message, 'error', 'new-booking-alert');
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

    if (action === 'open-new-booking') return openNewBookingModal();
    if (action === 'close-new-booking-modal') return closeNewBookingModal();
    if (action === 'submit-new-booking') return submitNewBooking(el);

    if (action === 'send-invoice') return sendInvoice(id);
    if (action === 'mark-client-paid') return markClientPaid(id);
    if (action === 'mark-staff-paid') return markStaffPaid(id);
    if (action === 'timesheet-filter') return setTimesheetFilter(el.dataset.filter || 'all', el);
    if (action === 'open-timesheet') return openTimesheetModal(id);
    if (action === 'close-timesheet-modal') return closeTimesheetModal();
    if (action === 'save-timesheet') return saveTimesheet();

    if (action === 'assign-staff') return toast('Staff assignment picker isn\'t built yet — create the booking manually via "New Booking".', 'info');
  });


  // ============================================
  // Timesheets
  // ============================================

  let timesheetFilter = 'all';
  let timesheetsById = {};
  let editingTimesheetId = null;

  function hoursLabel(value) {
    if (value == null) return '-';
    return Number(value).toFixed(2).replace(/\.00$/, '') + 'h';
  }

  function varianceLabel(row) {
    if (row.hoursVariance == null) return '';
    if (row.hoursVariance === 0) return '<span class="ts-variance ts-variance-ok">on schedule</span>';
    const sign = row.hoursVariance > 0 ? '+' : '';
    const cls = Math.abs(row.hoursVariance) >= 1 ? ' ts-variance-high' : '';
    return '<span class="ts-variance' + cls + '">' + sign + hoursLabel(row.hoursVariance) + ' vs scheduled</span>';
  }

  function renderTimesheetRow(row) {
    const stillOn = row.checkedOutAt == null;
    const worked = stillOn
      ? '<span class="ts-onsite">On site since ' + esc(formatDate(row.checkedInAt)) + '</span>'
      : hoursLabel(row.hoursWorked) + ' worked';

    const actions = [
      '<button class="btn btn-ghost btn-sm" data-action="open-timesheet" data-id="' + esc(row.id) + '">Correct</button>',
    ];
    // Only a checked-out shift that is still CONFIRMED is waiting to be completed.
    if (!stillOn && row.status === 'CONFIRMED') {
      actions.push('<button class="btn btn-primary btn-sm" data-action="open-complete" data-id="' + esc(row.id) + '">Complete</button>');
    }

    return '<div class="queue-row">' +
      '<div class="queue-row-info">' +
        '<span class="queue-row-title">' + bookingLabel(row) + (row.eventName ? ' — ' + esc(row.eventName) : '') + '</span>' +
        '<span class="queue-row-meta">' + esc(formatDate(row.eventDate)) +
          ' · scheduled ' + hoursLabel(row.hoursEstimated) +
          ' · ' + worked +
          (varianceLabel(row) ? ' · ' + varianceLabel(row) : '') +
        '</span>' +
        (row.workerShiftNotes ? '<span class="queue-row-meta ts-note">Note: ' + esc(row.workerShiftNotes) + '</span>' : '') +
      '</div>' +
      '<div class="queue-row-actions">' + actions.join('') + '</div>' +
    '</div>';
  }

  function renderTimesheets(payload) {
    const body = document.getElementById('timesheets-body');
    if (!body) return;

    const rows = (payload && payload.timesheets) || [];
    const summary = (payload && payload.summary) || {};

    setText('ts-count-open', summary.openCount ? '(' + summary.openCount + ')' : '');
    setText('ts-count-ready', summary.readyCount ? '(' + summary.readyCount + ')' : '');
    setText('ts-count-variance', summary.varianceCount ? '(' + summary.varianceCount + ')' : '');

    const summaryEl = document.getElementById('timesheet-summary');
    if (summaryEl) {
      summaryEl.textContent = rows.length
        ? rows.length + ' shift(s), ' + hoursLabel(summary.totalHoursWorked) + ' recorded'
        : '';
    }

    if (!rows.length) {
      body.innerHTML = '<div class="queue-empty">No attendance recorded for this filter.</div>';
      return;
    }

    body.innerHTML = rows.map(renderTimesheetRow).join('');
  }

  async function loadTimesheets() {
    try {
      const data = await get('/api/v1/admin/bookings/timesheets?filter=' + encodeURIComponent(timesheetFilter));
      timesheetsById = {};
      (data.timesheets || []).forEach((row) => { timesheetsById[row.id] = row; });
      renderTimesheets(data);
    } catch (err) {
      console.error('[ADMIN] Failed to load timesheets', err);
      const body = document.getElementById('timesheets-body');
      if (body) body.innerHTML = '<div class="queue-empty">Could not load timesheets.</div>';
    }
  }

  function setTimesheetFilter(filter, button) {
    timesheetFilter = filter;
    document.querySelectorAll('[data-action="timesheet-filter"]').forEach((el) => {
      el.classList.toggle('is-active', el === button);
    });
    loadTimesheets();
  }

  // datetime-local wants local wall-clock with no zone, so the ISO string is
  // shifted by the offset before slicing rather than sliced directly.
  function toLocalInputValue(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fromLocalInputValue(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function openTimesheetModal(id) {
    const row = timesheetsById[id];
    if (!row) return;
    editingTimesheetId = id;
    document.getElementById('ts-checked-in').value = toLocalInputValue(row.checkedInAt);
    document.getElementById('ts-checked-out').value = toLocalInputValue(row.checkedOutAt);
    document.getElementById('ts-hours').value = row.hoursWorked == null ? '' : String(row.hoursWorked);
    setText('timesheet-modal-context', bookingLabel(row) + ' · ' + formatDate(row.eventDate));
    AdminCore.openModal('timesheet-modal');
  }

  function closeTimesheetModal() {
    editingTimesheetId = null;
    AdminCore.closeModal('timesheet-modal');
  }

  async function saveTimesheet() {
    if (!editingTimesheetId) return;

    const checkedInAt = fromLocalInputValue(document.getElementById('ts-checked-in').value);
    const checkedOutAt = fromLocalInputValue(document.getElementById('ts-checked-out').value);
    const hoursRaw = document.getElementById('ts-hours').value.trim();

    const payload = { checkedInAt: checkedInAt, checkedOutAt: checkedOutAt };
    if (hoursRaw) {
      const parsed = Number(hoursRaw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
        toast('Hours worked must be between 0 and 24', 'warning');
        return;
      }
      payload.hoursWorked = parsed;
    } else {
      payload.hoursWorked = null;
    }

    try {
      await get('/api/v1/admin/bookings/' + encodeURIComponent(editingTimesheetId) + '/timesheet', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      closeTimesheetModal();
      toast('Timesheet corrected', 'success');
      await loadTimesheets();
    } catch (err) {
      toast('Failed to correct the timesheet: ' + err.message, 'error');
    }
  }

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
    AdminCore.initModalBehavior('new-booking-modal');
    AdminCore.initModalBehavior('timesheet-modal');

    await Promise.all([loadStats(), loadBookings(1), loadDashboard(), loadTimesheets()]);
  })();
})();
