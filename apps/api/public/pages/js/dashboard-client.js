'use strict';

(function () {
  // Auth guard — must be a client
  const user = window.VERGOAuth.requireAuth('client');
  if (!user) return;

  // DOM refs
  const loadingState   = document.getElementById('loading-state');
  const errorState     = document.getElementById('error-state');
  const errorMsg       = document.getElementById('error-msg');
  const dashContent    = document.getElementById('dashboard-content');
  const headerCompany  = document.getElementById('header-company');
  const headerTier     = document.getElementById('header-tier');
  const logoutBtn      = document.getElementById('logout-btn');
  const briefsGrid     = document.getElementById('briefs-grid');
  const briefsCount    = document.getElementById('briefs-count');
  const eventsGrid     = document.getElementById('events-grid');
  const eventsCount    = document.getElementById('events-count');
	  const historyGrid    = document.getElementById('history-grid');
	  const historyCount   = document.getElementById('history-count');
	  const newBriefBtn    = document.getElementById('new-brief-btn');
	  const briefModal     = document.getElementById('brief-modal');
	  const briefForm      = document.getElementById('brief-form');
	  const briefFormError = document.getElementById('brief-form-error');

	  let latestBriefs = [];
	  let latestBookings = [];

  // Seed company name from token immediately
  if (headerCompany) headerCompany.textContent = user.companyName || user.name;

	  if (logoutBtn) logoutBtn.addEventListener('click', () => window.VERGOAuth.logout());
	  if (newBriefBtn) newBriefBtn.addEventListener('click', openBriefModal);

  // ---- Helpers ----

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function statusClass(s) {
    if (!s) return 'status-new';
    return 'status-' + s.toLowerCase().replace(/_/g, '-');
  }

  function briefStatusLabel(s) {
    const map = {
      NEW: 'Received',
      QUOTED: 'Quote Sent',
      ACCEPTED: 'Confirmed',
      DECLINED: 'Declined',
      COMPLETED: 'Completed',
    };
    return map[s] || s;
  }

  function bookingStatusLabel(s) {
    const map = {
      PENDING:   'Pending',
      CONFIRMED: 'Confirmed',
      REJECTED:  'Not Proceeding',
      CANCELLED: 'Cancelled',
      COMPLETED: 'Completed',
      NO_SHOW:   'No-show',
    };
    return map[s] || s;
  }

  function laneLabel(lane) {
    const map = { FLEX: 'Flex', SELECT: 'Select', MANAGED: 'Managed' };
    return map[lane] || lane;
  }

  function tierLabel(tier) {
    if (!tier) return 'Standard';
    return tier.charAt(0) + tier.slice(1).toLowerCase();
  }

  function tierClass(tier) {
    if (!tier || tier === 'STANDARD') return 'tier-standard';
    return 'tier-premium';
  }

  function showError(msg) {
	    loadingState.hidden = true;
	    errorState.hidden = false;
	    if (errorMsg) errorMsg.textContent = msg;
	  }

	  function openBriefModal() {
	    if (!briefModal) return;
	    if (briefFormError) briefFormError.hidden = true;
	    briefModal.hidden = false;
	  }

	  function closeBriefModal() {
	    if (!briefModal) return;
	    briefModal.hidden = true;
	    if (briefForm) briefForm.reset();
	    if (briefFormError) briefFormError.hidden = true;
	  }

  // ---- Render active briefs ----
  function renderBriefs(briefs) {
    const activeBriefs = briefs.filter(b => !['COMPLETED', 'DECLINED'].includes(b.status));

    briefsCount.textContent = activeBriefs.length ? activeBriefs.length + ' active' : '';

	    if (!activeBriefs.length) {
	      briefsGrid.innerHTML = `
	        <div class="empty-state" style="grid-column:1/-1">
	          <div class="empty-icon" aria-hidden="true">📋</div>
	          <p>No active briefs. <a href="#" data-action="open-brief-modal" style="color:var(--color-gold-dark)">Submit a staffing brief</a> to get started.</p>
	        </div>`;
	      return;
	    }

    briefsGrid.innerHTML = activeBriefs.map(brief => `
      <article class="dash-card${brief.status === 'ACCEPTED' ? ' upcoming-event' : ''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <h3 class="dash-card-title">${escHtml(brief.eventType)}</h3>
          <span class="status-badge ${statusClass(brief.status)}">${briefStatusLabel(brief.status)}</span>
        </div>
        <div class="dash-card-meta">
          <span class="dash-card-meta-item">${escHtml(brief.location)}</span>
          ${brief.eventDate ? `<span class="dash-card-meta-item">${formatDate(brief.eventDate)}</span>` : ''}
          <span class="dash-card-meta-item">${brief.staffCount} staff required</span>
          ${brief.requestedLane ? `<span class="dash-card-meta-item">${laneLabel(brief.requestedLane)} lane</span>` : ''}
        </div>
        ${brief.quotedAmount ? `<p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin:0">Quoted: <strong>£${Number(brief.quotedAmount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>` : ''}
        <div class="dash-card-footer">
          <span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Submitted ${formatDate(brief.createdAt)}</span>
	          <a href="#" class="btn-apply" data-action="open-brief-modal" style="font-size:var(--font-size-xs)">Re-brief</a>
        </div>
      </article>`).join('');
  }

  // ---- Render upcoming confirmed events (bookings) ----
  function renderUpcomingEvents(bookings) {
    const now = new Date();
    const upcoming = bookings.filter(b =>
      b.status === 'CONFIRMED' && b.eventDate && new Date(b.eventDate) >= now
    );

    eventsCount.textContent = upcoming.length ? upcoming.length + ' upcoming' : '';

    if (!upcoming.length) {
	      eventsGrid.innerHTML = `
	        <div class="empty-state" style="grid-column:1/-1">
	          <div class="empty-icon" aria-hidden="true">📅</div>
	          <p>No upcoming confirmed events. <a href="#" data-action="open-brief-modal" style="color:var(--color-gold-dark)">Request staff for your next event.</a></p>
	        </div>`;
	      return;
	    }

    eventsGrid.innerHTML = upcoming.map(b => {
      const staffNames = b.staff
        ? `${escHtml(b.staff.firstName)} ${escHtml(b.staff.lastName)}`
        : 'Assigned by VERGO';
      const staffTierLabel = b.staff?.staffTier === 'ELITE' ? ' · Gold' : b.staff?.staffTier ? ' · Standard' : '';

      return `
        <article class="dash-card upcoming-event">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <h3 class="dash-card-title">${escHtml(b.eventName || b.location)}</h3>
            <span class="status-badge status-confirmed">${bookingStatusLabel(b.status)}</span>
          </div>
          <div class="dash-card-meta">
            <span class="dash-card-meta-item">${escHtml(b.location)}</span>
            ${b.venue ? `<span class="dash-card-meta-item">${escHtml(b.venue)}</span>` : ''}
            <span class="dash-card-meta-item">${formatDate(b.eventDate)}</span>
            ${b.shiftStart ? `<span class="dash-card-meta-item">${b.shiftStart}${b.shiftEnd ? '–' + b.shiftEnd : ''}</span>` : ''}
          </div>
          <div class="dash-card-meta" style="color:var(--color-text-muted)">
            <span class="dash-card-meta-item">Staff: ${staffNames}${staffTierLabel}</span>
            ${b.hourlyRateCharged ? `<span class="dash-card-meta-item">£${b.hourlyRateCharged.toFixed(2)}/hr</span>` : ''}
            ${b.hoursEstimated ? `<span class="dash-card-meta-item">${b.hoursEstimated}h est.</span>` : ''}
          </div>
          <div class="dash-card-footer">
            <span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Confirmed ${formatDate(b.confirmedAt)}</span>
	            <a href="#" data-action="open-brief-modal" class="btn-apply" style="font-size:var(--font-size-xs)">Re-book</a>
          </div>
        </article>`;
    }).join('');
  }

  // ---- Render brief history ----
  function renderHistory(briefs, bookings) {
    const now = new Date();

    const pastBriefs = briefs.filter(b => ['COMPLETED', 'DECLINED'].includes(b.status));
    const pastBookings = bookings.filter(b =>
      ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.status) ||
      (b.status === 'CONFIRMED' && b.eventDate && new Date(b.eventDate) < now)
    );

    const totalHistory = pastBriefs.length + pastBookings.length;
    historyCount.textContent = totalHistory ? totalHistory + ' past' : '';

    if (!totalHistory) {
      historyGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon" aria-hidden="true">🗂️</div>
          <p>No completed briefs or events yet.</p>
        </div>`;
      return;
    }

    const briefCards = pastBriefs.map(brief => `
      <article class="dash-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <h3 class="dash-card-title">${escHtml(brief.eventType)}</h3>
          <span class="status-badge ${statusClass(brief.status)}">${briefStatusLabel(brief.status)}</span>
        </div>
        <div class="dash-card-meta">
          <span class="dash-card-meta-item">${escHtml(brief.location)}</span>
          ${brief.eventDate ? `<span class="dash-card-meta-item">${formatDate(brief.eventDate)}</span>` : ''}
          <span class="dash-card-meta-item">${brief.staffCount} staff</span>
        </div>
        <div class="dash-card-footer">
          <span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${formatDate(brief.createdAt)}</span>
	          <a href="#" data-action="open-brief-modal" class="btn-apply" style="font-size:var(--font-size-xs)">Request same again</a>
        </div>
      </article>`);

    const bookingCards = pastBookings.map(b => `
      <article class="dash-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <h3 class="dash-card-title">${escHtml(b.eventName || b.location)}</h3>
          <span class="status-badge ${statusClass(b.status)}">${bookingStatusLabel(b.status)}</span>
        </div>
        <div class="dash-card-meta">
          <span class="dash-card-meta-item">${escHtml(b.location)}</span>
          ${b.eventDate ? `<span class="dash-card-meta-item">${formatDate(b.eventDate)}</span>` : ''}
          ${b.shiftStart ? `<span class="dash-card-meta-item">${b.shiftStart}${b.shiftEnd ? '–' + b.shiftEnd : ''}</span>` : ''}
        </div>
        <div class="dash-card-footer">
          <span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${formatDate(b.eventDate)}</span>
	          <a href="#" data-action="open-brief-modal" class="btn-apply" style="font-size:var(--font-size-xs)">Book same team</a>
	        </div>
	      </article>`);

    historyGrid.innerHTML = [...briefCards, ...bookingCards].join('');
  }

  // ---- Load dashboard ----
  async function loadDashboard() {
    try {
      const [profileRes, briefsRes, bookingsRes] = await Promise.all([
        window.VERGOAuth.authFetch('/api/v1/web/client/me'),
        window.VERGOAuth.authFetch('/api/v1/web/client/briefs'),
        window.VERGOAuth.authFetch('/api/v1/web/client/bookings'),
      ]);

      if (!profileRes || !briefsRes || !bookingsRes) return; // auth redirect

      const [profileData, briefsData, bookingsData] = await Promise.all([
        profileRes.json().catch(() => ({})),
        briefsRes.json().catch(() => ({})),
        bookingsRes.json().catch(() => ({})),
      ]);

      if (!profileData.ok) {
        showError(profileData.error || 'Failed to load your profile.');
        return;
      }

      const client   = profileData.client;
	      const briefs   = briefsData.briefs || [];
	      const bookings = bookingsData.bookings || [];
	      latestBriefs = briefs;
	      latestBookings = bookings;

      // Update header
      if (headerCompany) headerCompany.textContent = client.companyName;
      if (headerTier) {
        headerTier.textContent = tierLabel(client.subscriptionTier);
        headerTier.className = 'tier-badge ' + tierClass(client.subscriptionTier);
      }

      renderBriefs(briefs);
      renderUpcomingEvents(bookings);
      renderHistory(briefs, bookings);

      loadingState.hidden = true;
      dashContent.hidden  = false;

    } catch (err) {
      showError('Something went wrong loading your dashboard. Please refresh.');
      console.error('[Client Dashboard]', err);
    }
	  }

	  async function submitBrief(e) {
	    e.preventDefault();
	    if (!briefForm) return;

	    const submitBtn = briefForm.querySelector('button[type="submit"]');
	    if (submitBtn) {
	      submitBtn.disabled = true;
	      submitBtn.textContent = 'Submitting...';
	    }
	    if (briefFormError) briefFormError.hidden = true;

	    const formData = new FormData(briefForm);
	    const payload = Object.fromEntries(formData);

	    try {
	      const res = await window.VERGOAuth.authFetch('/api/v1/web/client/briefs', {
	        method: 'POST',
	        body: JSON.stringify(payload),
	      });
	      if (!res) return;
	      const data = await res.json().catch(() => ({}));
	      if (!res.ok || !data.ok) {
	        throw new Error(data.error || 'Could not submit brief');
	      }

	      latestBriefs = [data.brief].concat(latestBriefs);
	      renderBriefs(latestBriefs);
	      renderHistory(latestBriefs, latestBookings);
	      closeBriefModal();
	    } catch (err) {
	      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Could not submit brief';
	      if (briefFormError) {
	        briefFormError.textContent = message;
	        briefFormError.hidden = false;
	      }
	    } finally {
	      if (submitBtn) {
	        submitBtn.disabled = false;
	        submitBtn.textContent = 'Submit Brief';
	      }
	    }
	  }

	  document.addEventListener('click', (e) => {
	    const actionEl = e.target.closest('[data-action]');
	    if (!actionEl) return;
	    if (actionEl.dataset.action === 'open-brief-modal') {
	      e.preventDefault();
	      openBriefModal();
	    }
	    if (actionEl.dataset.action === 'close-brief-modal') {
	      e.preventDefault();
	      closeBriefModal();
	    }
	  });

	  if (briefForm) briefForm.addEventListener('submit', submitBrief);

	  loadDashboard();
	})();
