let currentUser = null;
    let applications = [];
    
    // Check auth
    async function checkAuth() {
      try {
        const res = await fetch('/api/v1/user/session');
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!data.authenticated) {
          showLoginRequired();
          return;
        }
        
        currentUser = data.user;
        loadApplications();
        
      } catch (err) {
        showLoginRequired();
      }
    }
    
    // Show login required
    function showLoginRequired() {
      document.getElementById('content').innerHTML = `
        <div class="login-required">
          <h2>Please Log In</h2>
          <p>You need to be logged in to view your applications.</p>
          <a href="user-login.html?redirect=${encodeURIComponent(window.location.href)}" class="btn btn-primary">Log In</a>
          <a href="user-register" class="btn btn-secondary">Create Account</a>
        </div>
      `;
    }
    
    // Load applications
    async function loadApplications() {
      try {
        const res = await fetch('/api/v1/job-applications/mine');
        const payload = await res.json();
        const data = payload.data ?? payload;
        applications = data.applications ?? data;
        renderDashboard();
      } catch (err) {
        console.error('Failed to load applications:', err);
        document.getElementById('content').innerHTML = '<div class="loading"><p>Failed to load applications.</p></div>';
      }
    }
    
    // Render dashboard
    function renderDashboard() {
      const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'PENDING').length,
        confirmed: applications.filter(a => a.status === 'CONFIRMED').length,
        active: applications.filter(a => !['WITHDRAWN', 'REJECTED'].includes(a.status)).length
      };
      
      let html = `
        <div class="page-header">
          <h1>My Applications</h1>
          <div class="user-info">
            <span>Logged in as <strong>${escapeHtml(currentUser.firstName)} ${escapeHtml(currentUser.lastName)}</strong></span>
            <button type="button" class="btn btn-secondary btn-small" data-action="logout">Log Out</button>
          </div>
        </div>
        
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-number">${stats.total}</div>
            <div class="stat-label">Total Applications</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${stats.pending}</div>
            <div class="stat-label">Pending</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${stats.confirmed}</div>
            <div class="stat-label">Confirmed</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${stats.active}</div>
            <div class="stat-label">Active</div>
          </div>
        </div>
      `;
      
      if (applications.length === 0) {
        html += `
          <div class="empty-state">
            <h3>No applications yet</h3>
            <p>Browse available jobs and apply to get started!</p>
            <a href="jobs" class="btn btn-primary">Browse Jobs</a>
          </div>
        `;
      } else {
        html += `<div class="applications-list">${applications.map(renderApplicationCard).join('')}</div>`;
      }
      
      document.getElementById('content').innerHTML = html;
    }
    
    // Render application card
    function renderApplicationCard(app) {
      const job = app.job;
      const date = job.eventDate 
        ? new Date(job.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Flexible';
      
      const appliedDate = new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      
      const statusClass = `status-${app.status.toLowerCase()}`;
      const statusLabel = {
        PENDING: 'Pending',
        REVIEWED: 'Reviewed',
        SHORTLISTED: 'Shortlisted',
        CONFIRMED: 'Confirmed',
        REJECTED: 'Not Selected',
        WITHDRAWN: 'Withdrawn'
      }[app.status] || app.status;
      
      const canWithdraw = !['CONFIRMED', 'WITHDRAWN', 'REJECTED'].includes(app.status);
      
      return `
        <div class="application-card">
          <div class="application-info">
            <div class="application-title">${escapeHtml(job.title)}</div>
            <div class="application-meta">
              <span>📍 ${escapeHtml(job.location)}</span>
              <span>📅 ${date}</span>
              <span>🏷️ ${escapeHtml(job.role?.name || '')}</span>
              <span>Applied: ${appliedDate}</span>
            </div>
          </div>
          <div class="application-actions">
            <span class="status-badge ${statusClass}">${statusLabel}</span>
            ${canWithdraw ? `<button type="button" class="btn btn-danger btn-small" data-action="withdraw" data-app-id="${app.id}">Withdraw</button>` : ''}
            ${job.status === 'OPEN' ? `<a href="job-detail.html?id=${job.id}" class="btn btn-secondary btn-small">View Job</a>` : ''}
          </div>
        </div>
      `;
    }
    
    // Withdraw application
    async function withdrawApplication(id) {
      if (!confirm('Are you sure you want to withdraw this application?')) return;
      
      try {
        const res = await fetch(`/api/v1/job-applications/${id}/withdraw`, { method: 'POST' });
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok) throw new Error(data.error);
        
        // Update local state
        const app = applications.find(a => a.id === id);
        if (app) app.status = 'WITHDRAWN';
        renderDashboard();
        
      } catch (err) {
        alert(err.message || 'Failed to withdraw application');
      }
    }
    
    // Logout
    async function logout() {
      try {
        await fetch('/api/v1/user/logout', { method: 'POST' });
        window.location.href = 'jobs.html';
      } catch (err) {
        console.error('Logout failed:', err);
      }
    }
    
    // Escape HTML
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    // Mobile menu
    function toggleMenu() {
      document.getElementById('nav-menu').classList.toggle('active');
    }

    // UI event delegation (CSP-safe: no inline handlers)
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      if (action === 'logout') {
        logout();
        return;
      }
      if (action === 'withdraw') {
        const id = target.dataset.appId;
        if (id) withdrawApplication(id);
      }
    });

    // Header menu button
    document.querySelector('.menu-toggle')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMenu();
    });
    
    // Init
    checkAuth();
