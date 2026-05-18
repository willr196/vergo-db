'use strict';

(function () {
  const SELECTED_STATUS = ['SHORT', 'LISTED'].join('');
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
  const jobsGrid       = document.getElementById('jobs-grid');
  const jobsCount      = document.getElementById('jobs-count');
  const appsGrid       = document.getElementById('apps-grid');
  const appsCount      = document.getElementById('apps-count');
  const confirmedShifts = document.getElementById('confirmed-shifts');
  const confirmedGrid  = document.getElementById('confirmed-grid');
  const progressStats  = document.getElementById('progress-stats');
  const progressPathway = document.getElementById('progress-pathway');
  const profileNudge   = document.getElementById('profile-nudge');
  const nudgeDismiss   = document.getElementById('nudge-dismiss');

  // Set header name immediately from cached token
  if (headerName) headerName.textContent = user.name;

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => window.VERGOAuth.logout());
  }

  // ---- Helpers ----

  function formatDate(d) {
    if (!d) return 'TBC';
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
    if (jt === 'GOLD') return 'Gold';
    return 'Standard';
  }

  function jobTierClass(jt) {
    if (jt === 'GOLD') return 'tier-gold';
    return 'tier-standard';
  }

  function statusClass(s) {
    if (s === SELECTED_STATUS) return 'status-selected';
    return 'status-' + s.toLowerCase().replace('_', '-');
  }

  function applicationStatusLabel(status) {
    if (status === 'CONFIRMED') return 'Confirmed';
    if (status === 'REJECTED') return 'Not Selected';
    if (status === 'WITHDRAWN') return 'Withdrawn';
    if (status === 'REVIEWED') return 'Reviewed';
    if (status === 'PENDING') return 'Pending';
    return 'Selected';
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

  function notify(message, type) {
    if (typeof notification !== 'undefined' && notification && typeof notification.show === 'function') {
      notification.show(message, type || 'info');
      return;
    }
    window.alert(message);
  }

  // ---- Render jobs ----
  function renderJobs(jobs, appliedJobIds) {
    if (!jobs.length) {
      jobsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">📋</div>
          <p>No open jobs at the moment. Check back soon.</p>
        </div>`;
      jobsCount.textContent = '';
      return;
    }

    jobsCount.textContent = jobs.length + ' open';

    jobsGrid.innerHTML = jobs.map(job => {
      const isGold = job.tier === 'GOLD';
      const alreadyApplied = appliedJobIds.has(job.id);

      return `
        <article class="dash-card" data-job-id="${escHtml(job.id)}">
          <div class="dash-card-header">
            <h3 class="dash-card-title">${escHtml(job.title)}</h3>
            <span class="job-tier-tag ${jobTierClass(job.tier)}" aria-label="Job tier">${jobTierLabel(job.tier)}</span>
          </div>
          <div class="dash-card-meta">
            ${job.role ? `<span class="dash-card-meta-item">${escHtml(job.role.name)}</span>` : ''}
            <span class="dash-card-meta-item">${escHtml(job.location)}</span>
            ${job.eventDate ? `<span class="dash-card-meta-item">${formatDate(job.eventDate)}</span>` : ''}
            ${job.shiftStart ? `<span class="dash-card-meta-item">${formatTime(job.shiftStart)}${job.shiftEnd ? '–' + formatTime(job.shiftEnd) : ''}</span>` : ''}
          </div>
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
      notify(`Application sent for ${jobTitle}.`, 'success');
      // Reload applications section
      loadApplications();
    } else {
      const data = await res.json().catch(() => ({}));
      btn.disabled = false;
      btn.textContent = 'Apply';
      notify(data.error || 'Failed to apply. Please try again.', 'error');
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
        <div class="empty-state">
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
    const statusText = applicationStatusLabel(app.status);
    const canWithdraw = !['CONFIRMED', 'WITHDRAWN', 'REJECTED'].includes(app.status);

    return `
      <article class="dash-card${isConfirmed ? ' confirmed-shift' : ''}">
        <div class="dash-card-header">
          <h3 class="dash-card-title">${escHtml(job.title || 'Unknown role')}</h3>
          <span class="status-badge ${statusClass(app.status)}">${statusText}</span>
        </div>
        <div class="dash-card-meta">
          ${job.location ? `<span class="dash-card-meta-item">${escHtml(job.location)}</span>` : ''}
          ${job.eventDate ? `<span class="dash-card-meta-item">${formatDate(job.eventDate)}</span>` : ''}
          ${job.shiftStart ? `<span class="dash-card-meta-item">${formatTime(job.shiftStart)}${job.shiftEnd ? '–' + formatTime(job.shiftEnd) : ''}</span>` : ''}
        </div>
        <div class="dash-card-footer is-tight">
          <span class="dash-card-stamp">Applied ${formatDate(app.createdAt)}</span>
          <div class="dash-card-footer-group">
            ${formatRate(job.payRate, job.payType) ? `<span class="rate-tag">${formatRate(job.payRate, job.payType)}</span>` : ''}
            ${canWithdraw ? `<button class="btn-logout" type="button" data-action="withdraw-app" data-app-id="${escHtml(app.id)}">Withdraw</button>` : ''}
          </div>
        </div>
      </article>`;
  }

  async function withdrawApplication(appId, btn) {
    if (!appId) return;
    if (!window.confirm('Withdraw this application? This cannot be undone.')) return;

    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Withdrawing…';
    }

    const res = await window.VERGOAuth.authFetch(`/api/v1/mobile/job-applications/${encodeURIComponent(appId)}/withdraw`, {
      method: 'POST',
    });

    if (!res) return; // auth redirect

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      notify('Application withdrawn.', 'success');
      loadApplications();
    } else {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      notify(data.error || 'Could not withdraw application.', 'error');
    }
  }

  // ---- Render progression ----
  function renderProgression(workerData) {
    checkProfileNudge(workerData);
    const tier = workerData.staffTier || null;

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
          <h3>Your pathway to Gold</h3>
          <p>Everyone joins through the marketplace first. Strong performance, reliability and repeat client requests can open the path to Gold, which is employed work through VERGO.</p>
        </div>`;
    } else if (tier === 'ELITE') {
      pathwayHtml = `
        <div class="pathway-box">
          <h3>Gold team</h3>
          <p>You're part of VERGO's employed team. Keep delivering strong service, staying reliable and representing VERGO well on shift.</p>
        </div>`;
    }

    progressPathway.innerHTML = pathwayHtml;
  }

  // ---- Load data ----
  let appliedJobIds = new Set();

  async function loadApplications() {
    const res = await window.VERGOAuth.authFetch('/api/v1/mobile/job-applications/mine');
    if (!res) return;
    const data = await res.json().catch(() => ({}));
    const apps = data.applications || data.data || [];
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
    // Safety net: if something silently stalls for >12s, surface an error
    // instead of leaving the spinner running forever.
    const stallTimer = setTimeout(() => {
      if (loadingState && !loadingState.hidden) {
        showError('This is taking longer than expected. Please refresh the page.');
      }
    }, 12000);

    try {
      const [profileRes, jobsRes, appsRes] = await Promise.all([
        window.VERGOAuth.authFetch('/api/v1/web/worker/me'),
        fetch('/api/v1/mobile/jobs?limit=20'),
        window.VERGOAuth.authFetch('/api/v1/mobile/job-applications/mine'),
      ]);

      // authFetch returns null only when a redirect to login has been triggered.
      // Don't leave the loading spinner up if we're about to navigate away.
      if (!profileRes || !appsRes) {
        clearTimeout(stallTimer);
        return;
      }

      const [profileData, jobsData, appsData] = await Promise.all([
        profileRes.json().catch(() => ({})),
        jobsRes.json().catch(() => ({})),
        appsRes.json().catch(() => ({})),
      ]);

      if (!profileRes.ok || !profileData.ok) {
        showError(profileData.error || 'Failed to load your profile.');
        return;
      }

      const workerData = profileData.user;
      const jobs = jobsData.jobs || jobsData.data || [];
      const apps = appsData.applications || appsData.data || [];

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
    } finally {
      clearTimeout(stallTimer);
    }
  }

  function checkProfileNudge(workerData) {
    if (!profileNudge) return;
    const dismissed = localStorage.getItem('vergo_nudge_dismissed');
    if (dismissed) return;
    const incomplete = !workerData.staffBio || !workerData.staffAvatar || !workerData.staffAvailable;
    if (incomplete) profileNudge.hidden = false;
  }

  if (nudgeDismiss) {
    nudgeDismiss.addEventListener('click', () => {
      localStorage.setItem('vergo_nudge_dismissed', '1');
      if (profileNudge) profileNudge.hidden = true;
    });
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action="withdraw-app"]');
    if (!target) return;
    e.preventDefault();
    withdrawApplication(target.dataset.appId, target);
  });

  loadDashboard();
})();
