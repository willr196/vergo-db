let currentUser = null;
    let currentJob = null;
    let hasApplied = false;
    
    // Get job ID from URL
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('id');
    
    if (!jobId) {
      window.location.href = 'jobs.html';
    }
    
    // Check auth
    async function checkAuth() {
      try {
        const res = await fetch('/api/v1/user/session');
        const payload = await res.json();
        const data = payload.data ?? payload;
        if (data.authenticated) {
          currentUser = data.user;
          checkIfApplied();
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      }
    }
    
    // Check if already applied
    async function checkIfApplied() {
      if (!currentUser) return;
      
      try {
        const res = await fetch(`/api/v1/job-applications/check/${jobId}`);
        const payload = await res.json();
        const data = payload.data ?? payload;
        hasApplied = data.applied;
        renderApplySection();
      } catch (err) {
        console.error('Check applied failed:', err);
      }
    }
    
    // Load job
    async function loadJob() {
      try {
        const res = await fetch(`/api/v1/jobs/${jobId}`);
        
        if (!res.ok) {
          document.getElementById('job-content').innerHTML = `
            <div class="loading">
              <h3>Job not found</h3>
              <p>This job may have been filled or removed.</p>
              <a href="jobs" class="btn btn-primary" style="margin-top: 20px;">View All Jobs</a>
            </div>
          `;
          return;
        }
        
        const payload = await res.json();
        currentJob = payload.data ?? payload;
        renderJob();
        
      } catch (err) {
        console.error('Failed to load job:', err);
        document.getElementById('job-content').innerHTML = '<div class="loading"><p>Failed to load job details.</p></div>';
      }
    }
    
    // Render job
    function renderJob() {
      const job = currentJob;
      
      const date = job.eventDate 
        ? new Date(job.eventDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : 'Flexible';
      
      const time = job.shiftStart && job.shiftEnd ? `${job.shiftStart} - ${job.shiftEnd}` : 'To be confirmed';
      
      const pay = job.payRate 
        ? `£${job.payRate}/${job.payType === 'HOURLY' ? 'hr' : job.payType === 'DAILY' ? 'day' : 'fixed'}`
        : 'Competitive';
      
      const typeClass = job.type === 'INTERNAL' ? 'internal' : 'external';
      const typeLabel = job.type === 'INTERNAL' ? 'VERGO Job' : 'External';
      const company = job.type === 'EXTERNAL' && job.companyName ? job.companyName : 'VERGO Ltd';
      
      document.title = `${job.title} - VERGO Ltd`;
      
      document.getElementById('job-content').innerHTML = `
        <div class="job-container">
          <div class="job-header">
            <div class="job-badges">
              <span class="badge badge-role">${escapeHtml(job.role.name)}</span>
              <span class="badge badge-${typeClass}">${typeLabel}</span>
            </div>
            <h1 class="job-title">${escapeHtml(job.title)}</h1>
            <p class="job-company">${escapeHtml(company)}</p>
          </div>
          
          <div class="job-meta-grid">
            <div class="meta-item">
              <span class="meta-label">Location</span>
              <span class="meta-value">📍 ${escapeHtml(job.location)}${job.venue ? ' - ' + escapeHtml(job.venue) : ''}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Date</span>
              <span class="meta-value">📅 ${date}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Time</span>
              <span class="meta-value">⏰ ${time}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Pay</span>
              <span class="meta-value highlight">${pay}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Spots Available</span>
              <span class="meta-value">${job.spotsLeft} of ${job.staffNeeded}</span>
            </div>
          </div>
          
          <div class="job-body">
            <div class="section">
              <h3>Description</h3>
              <p>${escapeHtml(job.description).replace(/\n/g, '<br>')}</p>
            </div>
            
            ${job.requirements ? `
              <div class="section">
                <h3>Requirements</h3>
                <p>${escapeHtml(job.requirements).replace(/\n/g, '<br>')}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="apply-section">
            <div id="apply-box" class="apply-box">
              <!-- Rendered by JS -->
            </div>
          </div>
        </div>
      `;
      
      renderApplySection();
    }
    
    // Render apply section
    function renderApplySection() {
      const box = document.getElementById('apply-box');
      if (!box) return;
      
      // External job - redirect
      if (currentJob.type === 'EXTERNAL' && currentJob.externalUrl && /^https?:\/\//i.test(currentJob.externalUrl)) {
        box.innerHTML = `
          <h3>Apply for this position</h3>
          <p style="color: var(--color-text-muted); margin-bottom: 20px;">This is an external opportunity. Click below to apply on the employer's website.</p>
          <a href="${escapeHtml(currentJob.externalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block">Apply on External Site →</a>
        `;
        return;
      }
      
      // Already applied
      if (hasApplied) {
        box.innerHTML = `
          <div class="apply-status applied">
            ✓ You've already applied for this job
          </div>
          <a href="user-dashboard" class="btn btn-secondary btn-block">View My Applications</a>
        `;
        return;
      }
      
      // Not logged in
      if (!currentUser) {
        box.innerHTML = `
          <h3>Apply for this position</h3>
          <div class="apply-status login-required">
            Please log in or create an account to apply
          </div>
          <div style="display: flex; gap: 15px;">
            <a href="user-login.html?redirect=${encodeURIComponent(window.location.href)}" class="btn btn-primary" style="flex: 1; text-align: center;">Log In</a>
            <a href="user-register.html?redirect=${encodeURIComponent(window.location.href)}" class="btn btn-secondary" style="flex: 1; text-align: center;">Create Account</a>
          </div>
        `;
        return;
      }
      
      // Logged in - show apply form
      box.innerHTML = `
        <h3>Apply for this position</h3>
        <div id="apply-message"></div>
        <form id="apply-form">
          <div class="form-group">
            <label>Cover Note (optional)</label>
            <textarea id="cover-note" placeholder="Tell us why you're a great fit for this role..."></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Submit Application</button>
        </form>
      `;
      
      document.getElementById('apply-form').addEventListener('submit', handleApply);
    }
    
    // Handle apply
    async function handleApply(e) {
      e.preventDefault();
      
      const btn = e.target.querySelector('button');
      const msgBox = document.getElementById('apply-message');
      const coverNote = document.getElementById('cover-note').value.trim();
      
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      msgBox.innerHTML = '';
      
      try {
        const res = await fetch('/api/v1/job-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, coverNote: coverNote || undefined })
        });
        
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to submit application');
        }
        
        hasApplied = true;
        renderApplySection();
        
      } catch (err) {
        msgBox.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Submit Application';
      }
    }
    
    // Escape HTML
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    // Mobile menu
    function toggleMenu() {
      document.getElementById('nav-menu').classList.toggle('active');
    }
    
    // Init
    checkAuth();
    loadJob();
