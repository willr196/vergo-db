(function () {
  'use strict';

  let clientData = null;

  const modal = document.getElementById('quote-modal');
  const quoteForm = document.getElementById('quote-form');

  // Check authentication on load
  async function checkAuth() {
    try {
      const res = await fetch('/api/v1/clients/session');
      const payload = await res.json();
      const data = payload.data ?? payload;

      if (!data.authenticated) {
        window.location.href = '/client-login.html';
        return;
      }

      clientData = data.client;
      document.getElementById('company-name').textContent = clientData.companyName;
      loadDashboard();
    } catch (err) {
      console.error('Auth check failed:', err);
      window.location.href = '/client-login.html';
    }
  }

  // Load dashboard content
  async function loadDashboard() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
      <h1 class="page-title">Welcome back!</h1>

      <div class="stats-grid">
        <div class="stat-card">
          <h3>Quote Requests</h3>
          <div class="value" id="stat-quotes">0</div>
        </div>
        <div class="stat-card">
          <h3>Pending Quotes</h3>
          <div class="value" id="stat-pending">0</div>
        </div>
        <div class="stat-card">
          <h3>Completed Events</h3>
          <div class="value" id="stat-completed">0</div>
        </div>
      </div>

      <div class="actions-section">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <a href="#" class="action-card" data-action="open-quote-modal">
            <span class="action-icon">📝</span>
            <div class="action-content">
              <h3>Request a Quote</h3>
              <p>Get a custom quote for your upcoming event staffing needs.</p>
            </div>
          </a>
          <a href="pricing" class="action-card">
            <span class="action-icon">💰</span>
            <div class="action-content">
              <h3>Pricing Calculator</h3>
              <p>Estimate costs for your event using our interactive calculator.</p>
            </div>
          </a>
          <a href="mailto:wrobb@vergoltd.com" class="action-card">
            <span class="action-icon">💬</span>
            <div class="action-content">
              <h3>Contact Us</h3>
              <p>Speak directly with our team about your requirements.</p>
            </div>
          </a>
        </div>
      </div>

      <div class="activity-section">
        <h2>Recent Activity</h2>
        <div class="activity-list" id="activity-list">
          <div class="empty-state">
            <p>No recent activity</p>
            <a href="#" data-action="open-quote-modal">Request your first quote →</a>
          </div>
        </div>
      </div>
    `;

    // Load quote requests stats (would need API endpoint)
    // For now, just showing placeholders
  }

  // Sidebar navigation
  document.querySelectorAll('.sidebar a[data-page]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = e.currentTarget.dataset.page;

      document.querySelectorAll('.sidebar a').forEach((l) => l.classList.remove('active'));
      e.currentTarget.classList.add('active');

      if (page === 'dashboard') loadDashboard();
      else if (page === 'quotes') loadQuotes();
      else if (page === 'profile') loadProfile();
    });
  });

  // Load quotes page
  async function loadQuotes() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="d-flex justify-between align-center gap-2 mb-3">
        <h1 class="page-title mb-0">Quote Requests</h1>
        <button type="button" class="btn btn-primary" data-action="open-quote-modal">+ New Request</button>
      </div>
      <div class="activity-list">
        <div class="empty-state">
          <p>No quote requests yet</p>
          <a href="#" data-action="open-quote-modal">Submit your first request →</a>
        </div>
      </div>
    `;
  }

  // Load profile page
  async function loadProfile() {
    const main = document.getElementById('main-content');

    try {
      const res = await fetch('/api/v1/clients/profile');
      const payload = await res.json();
      const profile = payload.data ?? payload;

      const websiteHtml = profile.website && /^https?:\/\//i.test(profile.website)
        ? `<a href="${escapeHtml(profile.website)}" target="_blank" rel="noopener noreferrer" class="profile-link">${escapeHtml(profile.website)}</a>`
        : escapeHtml(profile.website || 'Not specified');

      main.innerHTML = `
        <h1 class="page-title">Company Profile</h1>
        <div class="action-card profile-card">
          <div class="action-content profile-content">
            <div class="profile-section">
              <h3>Company Details</h3>
              <p class="profile-row"><strong class="profile-label">Company:</strong> ${escapeHtml(profile.companyName)}</p>
              <p class="profile-row"><strong class="profile-label">Industry:</strong> ${escapeHtml(profile.industry || 'Not specified')}</p>
              <p class="profile-row"><strong class="profile-label">Website:</strong> ${websiteHtml}</p>
            </div>
            <div class="profile-section profile-section-last">
              <h3>Contact Details</h3>
              <p class="profile-row"><strong class="profile-label">Name:</strong> ${escapeHtml(profile.contactName)}</p>
              <p class="profile-row"><strong class="profile-label">Email:</strong> ${escapeHtml(profile.email)}</p>
              <p class="profile-row"><strong class="profile-label">Phone:</strong> ${escapeHtml(profile.phone || 'Not specified')}</p>
              <p class="profile-row"><strong class="profile-label">Job Title:</strong> ${escapeHtml(profile.jobTitle || 'Not specified')}</p>
            </div>
          </div>
        </div>
      `;
    } catch (_err) {
      main.innerHTML = '<div class="error-msg">Failed to load profile</div>';
    }
  }

  function openQuoteModal() {
    modal?.classList.remove('d-none');
  }

  function closeModal() {
    modal?.classList.add('d-none');
    quoteForm?.reset();
  }

  async function submitQuote(e) {
    e.preventDefault();

    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitting...';
    }

    const formData = new FormData(form);
    const _data = Object.fromEntries(formData);

    try {
      // For now, just show success (would need API endpoint)
      alert('Quote request submitted! We\\'ll get back to you within 24 hours.');
      closeModal();
    } catch (err) {
      const message = (err && typeof err === 'object' && 'message' in err) ? String(err.message) : 'Unknown error';
      alert('Failed to submit quote: ' + message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Submit Request';
      }
    }
  }

  // Logout
  async function logout() {
    try {
      await fetch('/api/v1/clients/logout', { method: 'POST' });
      window.location.href = '/client-login.html';
    } catch (err) {
      console.error('Logout failed:', err);
      window.location.href = '/client-login.html';
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;
    if (action === 'open-quote-modal') {
      e.preventDefault();
      openQuoteModal();
      return;
    }
    if (action === 'close-modal') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (action === 'logout') {
      e.preventDefault();
      logout();
    }
  });

  quoteForm?.addEventListener('submit', submitQuote);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Initialize
  checkAuth();
})();

