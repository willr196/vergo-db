'use strict';

(function () {
  // Auth guard — must be a worker
  const user = window.VERGOAuth.requireAuth('worker');
  if (!user) return; // redirect already fired

  // DOM refs
  const loadingState   = document.getElementById('loading-state');
  const errorState     = document.getElementById('error-state');
  const errorMsg       = document.getElementById('error-msg');
  const dashContent    = document.getElementById('dashboard-content');
  const headerName     = document.getElementById('header-name');
  const headerTier     = document.getElementById('header-tier');
  const logoutBtn      = document.getElementById('logout-btn');
  const shortlistStrip = document.getElementById('shortlist-strip');
  const jobsGrid       = document.getElementById('jobs-grid');
  const jobsCount      = document.getElementById('jobs-count');
  const appsGrid       = document.getElementById('apps-grid');
  const appsCount      = document.getElementById('apps-count');
  const confirmedShifts = document.getElementById('confirmed-shifts');
  const confirmedGrid  = document.getElementById('confirmed-grid');
  const progressStats  = document.getElementById('progress-stats');
  const progressPathway = document.getElementById('progress-pathway');

  // Set header name immediately from cached token
  if (headerName) headerName.textContent = user.name;

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => window.VERGOAuth.logout());
  }

  // ---- Helpers ----

  function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(t) {
    if (!t) return '';
    return t.slice(0, 5);
  }

  function formatRate(rate, type) {
    if (!rate) return '';
    const fmt = '£' + Number(rate).toFixed(2);
    if (type === 'HOURLY') return fmt + '/hr';
    if (type === 'DAILY') return fmt + '/day';
    return fmt;
  }

  function tierLabel(tier) {
    if (!tier) return 'Standard';
    if (tier === 'ELITE') return 'Gold';
    return tier.charAt(0) + tier.slice(1).toLowerCase();
  }

  function tierClass(tier) {
    if (!tier || tier === 'STANDARD') return 'tier-standard';
    if (tier === 'ELITE') return 'tier-gold';
    return 'tier-standard';
  }

  function jobTierLabel(jt) {
    if (jt === 'SHORTLIST') return 'Shortlist';
    if (jt === 'GOLD') return 'Gold';
    return 'Standard';
  }

  function jobTierClass(jt) {
    if (jt === 'SHORTLIST') return 'tier-shortlist';
    if (jt === 'GOLD') return 'tier-gold';
    return 'tier-standard';
  }

  function statusClass(s) {
    return 'status-' + s.toLowerCase().replace('_', '-');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(msg) {
    loadingState.hidden = true;
    errorState.hidden = false;
    if (errorMsg) errorMsg.textContent = msg;
  }

  // ---- Render jobs ----
  function renderJobs(jobs, appliedJobIds) {
    if (!jobs.length) {
      jobsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon" aria-hidden="true">📋</div>
          <p>No open jobs at the moment. Check back soon.</p>
        </div>`;
      jobsCount.textContent = '';
      return;
    }

    jobsCount.textContent = jobs.length + ' open';

    jobsGrid.innerHTML = jobs.map(job => {
      const isShortlist = job.tier === 'SHORTLIST';
      const isGold = job.tier === 'GOLD';
      const alreadyApplied = appliedJobIds.has(job.id);

      const upliftNote = isShortlist
        ? `<span class="uplift-note" aria-label="Rate uplift">+£1/hr uplift for selected workers</span>`
        : '';

      return `
        <article class="dash-card" data-job-id="${escHtml(job.id)}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <h3 class="dash-card-title">${escHtml(job.title)}</h3>
            <span class="job-tier-tag ${jobTierClass(job.tier)}" aria-label="Job tier">${jobTierLabel(job.tier)}</span>
          </div>
          <div class="dash-card-meta">
            ${job.role ? `<span class="dash-card-meta-item">${escHtml(job.role.name)}</span>` : ''}
            <span class="dash-card-meta-item">${escHtml(job.location)}</span>
            ${job.eventDate ? `<span class="dash-card-meta-item">${formatDate(job.eventDate)}</span>` : ''}
            ${job.shiftStart ? `<span class="dash-card-meta-item">${formatTime(job.shiftStart)}${job.shiftEnd ? '–' + formatTime(job.shiftEnd) : ''}</span>` : ''}
          </div>
          ${upliftNote}
          <div class="dash-card-footer">
            <span class="rate-tag">${formatRate(job.payRate, job.payType)}</span>
            <button
              class="btn-apply${alreadyApplied ? ' applied' : ''}${isGold ? ' btn-gold' : ''}"
              data-job-id="${escHtml(job.id)}"
              data-job-title="${escHtml(job.title)}"
              ${alreadyApplied ? 'disabled aria-disabled="true"' : ''}
            >${alreadyApplied ? 'Applied' : 'Apply'}</button>
          </div>
        </article>`;
    }).join('');

    // Attach apply handlers
    jobsGrid.querySelectorAll('.btn-apply:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => applyToJob(btn.dataset.jobId, btn.dataset.jobTitle, btn));
    });
  }

  // ---- Apply to job ----
  async function applyToJob(jobId, jobTitle, btn) {
    btn.disabled = true;
    btn.textContent = 'Applying…';

    const res = await window.VERGOAuth.authFetch('/api/v1/mobile/job-applications', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });

    if (!res) return; // auth redirect fired

    if (res.ok) {
      btn.textContent = 'Applied';
      btn.classList.add('applied');
      btn.setAttribute('aria-disabled', 'true');
      // Reload applications section
      loadApplications();
    } else {
      const data = await res.json().catch(() => ({}));
      btn.disabled = false;
      btn.textContent = 'Apply';
      alert(data.error || 'Failed to apply. Please try again.');
    }
  }

  // ---- Render applications ----
  function renderApplications(apps) {
    const confirmed = apps.filter(a => a.status === 'CONFIRMED' && a.job?.eventDate && new Date(a.job.eventDate) >= new Date());
    const rest = apps.filter(a => !(a.status === 'CONFIRMED' && a.job?.eventDate && new Date(a.job.eventDate) >= new Date()));

    appsCount.textContent = apps.length ? apps.length + ' total' : '';

    // Confirmed/upcoming shifts
    if (confirmed.length) {
      confirmedShifts.hidden = false;
      confirmedGrid.innerHTML = confirmed.map(app => renderAppCard(app, true)).join('');
    } else {
      confirmedShifts.hidden = true;
    }

    if (!rest.length && !confirmed.length) {
      appsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon" aria-hidden="true">📤</div>
          <p>No applications yet. Browse available jobs above.</p>
        </div>`;
      return;
    }

    appsGrid.innerHTML = rest.length
      ? rest.map(app => renderAppCard(app, false)).join('')
      : '';
  }

  function renderAppCard(app, isConfirmed) {
    const job = app.job || {};
    const statusText = app.status === 'CONFIRMED' ? 'Confirmed' :
      app.status === 'SHORTLISTED' ? 'Shortlisted' :
      app.status === 'REJECTED' ? 'Not Selected' :
      app.status === 'WITHDRAWN' ? 'Withdrawn' :
      app.status === 'REVIEWED' ? 'Reviewed' :
      'Pending';

    const uplift = app.rateUplift ? `<span class="uplift-note">+£${Number(app.rateUplift).toFixed(2)}/hr uplift</span>` : '';

    return `
      <article class="dash-card${isConfirmed ? ' confirmed-shift' : ''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <h3 class="dash-card-title">${escHtml(job.title || 'Unknown role')}</h3>
          <span class="status-badge ${statusClass(app.status)}">${statusText}</span>
        </div>
        <div class="dash-card-meta">
          ${job.location ? `<span class="dash-card-meta-item">${escHtml(job.location)}</span>` : ''}
          ${job.eventDate ? `<span class="dash-card-meta-item">${formatDate(job.eventDate)}</span>` : ''}
          ${job.shiftStart ? `<span class="dash-card-meta-item">${formatTime(job.shiftStart)}${job.shiftEnd ? '–' + formatTime(job.shiftEnd) : ''}</span>` : ''}
        </div>
        ${uplift}
        <div class="dash-card-footer" style="border-top:none;padding-top:0">
          <span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Applied ${formatDate(app.createdAt)}</span>
          ${formatRate(job.payRate, job.payType) ? `<span class="rate-tag">${formatRate(job.payRate, job.payType)}</span>` : ''}
        </div>
      </article>`;
  }

  // ---- Render progression ----
  function renderProgression(workerData) {
    const tier = workerData.staffTier || null;
    const sel = workerData.shortlistSelections || 0;
    const shortlistApps = workerData.shortlistApplications || 0;
    const selRate = shortlistApps > 0 ? Math.round((sel / shortlistApps) * 100) : 0;

    // Update header tier badge
    if (headerTier) {
      headerTier.textContent = tierLabel(tier);
      headerTier.className = 'tier-badge ' + tierClass(tier);
    }

    // Stats row
    progressStats.innerHTML = `
      <div class="stat-box">
        <div class="stat-value">${workerData.totalApplications || 0}</div>
        <div class="stat-label">Total applications</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${sel}</div>
        <div class="stat-label">Shortlist selections</div>
        ${shortlistApps > 0 ? `<div class="stat-sub">${selRate}% selection rate from ${shortlistApps} shortlist ${shortlistApps === 1 ? 'job' : 'jobs'}</div>` : ''}
      </div>
      ${workerData.staffRating ? `
      <div class="stat-box">
        <div class="stat-value">${Number(workerData.staffRating).toFixed(1)}</div>
        <div class="stat-label">Rating</div>
        ${workerData.staffReviewCount ? `<div class="stat-sub">from ${workerData.staffReviewCount} review${workerData.staffReviewCount !== 1 ? 's' : ''}</div>` : ''}
      </div>` : ''}
    `;

    // Pathway messaging
    let pathwayHtml = '';

    if (!tier || tier === 'STANDARD') {
      pathwayHtml = `
        <div class="pathway-box">
          <h3>Your pathway to Shortlist tier</h3>
          <p>Apply to Shortlist-tier jobs to build your selection rate. Workers with consistently strong performance are considered for Shortlist status — earning a <strong>+£1/hr uplift</strong> on every confirmed Shortlist shift.</p>
        </div>`;

      if (sel > 0) {
        const shortlistStripTitle = document.getElementById('shortlist-strip-title');
        const shortlistStripBody  = document.getElementById('shortlist-strip-body');
        shortlistStrip.hidden = false;
        if (shortlistStripTitle) shortlistStripTitle.textContent = 'Your Shortlist performance';
        if (shortlistStripBody) shortlistStripBody.textContent = `You've been selected on ${sel} shortlist ${sel === 1 ? 'job' : 'jobs'}${shortlistApps > 0 ? ` — a ${selRate}% selection rate` : ''}. Keep it up.`;
      }
    } else if (tier === 'ELITE') {
      pathwayHtml = `
        <div class="pathway-box">
          <h3>Gold tier — elite status</h3>
          <p>You're on our top-tier roster. You receive priority booking on Gold and Shortlist roles, and your profile is featured in our premium marketplace. Keep delivering excellent service to maintain your status.</p>
        </div>`;

      if (shortlistStrip) {
        shortlistStrip.hidden = false;
        const shortlistStripTitle = document.getElementById('shortlist-strip-title');
        const shortlistStripBody  = document.getElementById('shortlist-strip-body');
        if (shortlistStripTitle) shortlistStripTitle.textContent = 'Shortlist performance';
        if (shortlistStripBody) shortlistStripBody.textContent = `Selected on ${sel} shortlist ${sel === 1 ? 'job' : 'jobs'}${shortlistApps > 0 ? ` (${selRate}% selection rate from ${shortlistApps} shortlist ${shortlistApps === 1 ? 'job' : 'jobs'})` : ''}.`;
      }
    }

    progressPathway.innerHTML = pathwayHtml;
  }

  // ---- Load data ----
  let appliedJobIds = new Set();

  async function loadApplications() {
    const res = await window.VERGOAuth.authFetch('/api/v1/mobile/job-applications/mine');
    if (!res) return;
    const data = await res.json().catch(() => ({}));
    const apps = data.applications || [];
    appliedJobIds = new Set(apps.map(a => a.jobId));
    renderApplications(apps);
    // Re-render jobs to update apply button states
    const jobCards = jobsGrid.querySelectorAll('[data-job-id]');
    jobCards.forEach(card => {
      const jobId = card.dataset.jobId;
      const btn = card.querySelector('.btn-apply');
      if (btn && appliedJobIds.has(jobId)) {
        btn.disabled = true;
        btn.textContent = 'Applied';
        btn.classList.add('applied');
        btn.setAttribute('aria-disabled', 'true');
      }
    });
  }

  async function loadDashboard() {
    try {
      const [profileRes, jobsRes, appsRes] = await Promise.all([
        window.VERGOAuth.authFetch('/api/v1/web/worker/me'),
        fetch('/api/v1/mobile/jobs?limit=20'),
        window.VERGOAuth.authFetch('/api/v1/mobile/job-applications/mine'),
      ]);

      if (!profileRes || !appsRes) return; // auth redirect

      const [profileData, jobsData, appsData] = await Promise.all([
        profileRes.json().catch(() => ({})),
        jobsRes.json().catch(() => ({})),
        appsRes.json().catch(() => ({})),
      ]);

      if (!profileData.ok) {
        showError(profileData.error || 'Failed to load your profile.');
        return;
      }

      const workerData = profileData.user;
      const jobs = jobsData.jobs || [];
      const apps = appsData.applications || [];

      appliedJobIds = new Set(apps.map(a => a.jobId));

      // Update header name (may be more complete than token)
      if (headerName) headerName.textContent = workerData.name || user.name;

      // Render
      renderJobs(jobs, appliedJobIds);
      renderApplications(apps);
      renderProgression(workerData);

      // Show content
      loadingState.hidden = true;
      dashContent.hidden = false;

    } catch (err) {
      showError('Something went wrong loading your dashboard. Please refresh.');
      console.error('[Worker Dashboard]', err);
    }
  }

  loadDashboard();
})();
