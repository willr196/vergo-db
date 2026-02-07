// State
    let currentUser = null;
    let currentPage = 1;
    let totalPages = 1;
    let filters = { roleId: '', type: '' };
    
    // Check auth status
    async function checkAuth() {
      try {
        const res = await fetch('/api/v1/user/session');
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (data.authenticated) {
          currentUser = data.user;
          renderUserBar();
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      }
    }
    
    // Render user bar
	    function renderUserBar() {
	      const bar = document.getElementById('user-bar');
	      
	      if (currentUser) {
	        bar.className = 'user-bar';
	        bar.innerHTML = `
	          <div class="user-info">
	            Welcome, <strong>${escapeHtml(currentUser.firstName)}</strong>
	          </div>
	          <div class="user-actions">
	            <a href="user-dashboard" class="btn btn-secondary btn-small">My Applications</a>
	            <button type="button" class="btn btn-small btn-logout" data-action="logout">Log Out</button>
	          </div>
	        `;
	      } else {
	        bar.className = 'user-bar logged-out';
	        bar.innerHTML = `
	          <div class="user-actions">
	            <a href="user-login" class="btn btn-secondary btn-small">Log In</a>
	            <a href="user-register" class="btn btn-primary btn-small">Create Account</a>
	          </div>
	        `;
	      }
	    }
    
    // Logout
    async function logout() {
      try {
        await fetch('/api/v1/user/logout', { method: 'POST' });
        currentUser = null;
        renderUserBar();
      } catch (err) {
        console.error('Logout failed:', err);
      }
    }
    
    // Load roles for filter
    async function loadRoles() {
      try {
        const res = await fetch('/api/v1/jobs/meta/roles');
        const payload = await res.json();
        const roles = payload.data ?? payload;
        
        const select = document.getElementById('filter-role');
        roles.forEach(role => {
          const opt = document.createElement('option');
          opt.value = role.id;
          opt.textContent = role.name;
          select.appendChild(opt);
        });
      } catch (err) {
        console.error('Failed to load roles:', err);
      }
    }
    
    // Load jobs
    async function loadJobs(page = 1) {
      const container = document.getElementById('jobs-container');
      container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading jobs...</p></div>';
      
      try {
        const params = new URLSearchParams({ page, limit: 20 });
        if (filters.roleId) params.append('roleId', filters.roleId);
        if (filters.type) params.append('type', filters.type);
        
        const res = await fetch(`/api/v1/jobs?${params}`);
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        currentPage = data.pagination.page;
        totalPages = data.pagination.totalPages;
        
        if (data.jobs.length === 0) {
          container.innerHTML = `
            <div class="empty-state">
              <h3>No jobs available</h3>
              <p>Check back soon for new opportunities!</p>
            </div>
          `;
          document.getElementById('pagination').classList.add('d-none');
          return;
        }
        
        container.innerHTML = '<div class="jobs-grid">' + data.jobs.map(renderJobCard).join('') + '</div>';
        renderPagination();
        
      } catch (err) {
        console.error('Failed to load jobs:', err);
        container.innerHTML = '<div class="empty-state"><h3>Failed to load jobs</h3><p>Please try again later.</p></div>';
      }
    }
    
    // Render job card
    function renderJobCard(job) {
      const date = job.eventDate 
        ? new Date(job.eventDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : 'Flexible';
      
      const time = job.shiftStart && job.shiftEnd 
        ? `${job.shiftStart} - ${job.shiftEnd}` 
        : 'TBC';
      
      const pay = job.payRate 
        ? `£${job.payRate}/${job.payType === 'HOURLY' ? 'hr' : job.payType === 'DAILY' ? 'day' : 'fixed'}`
        : 'Competitive';
      
      const spotsClass = job.spotsLeft <= 2 ? 'urgent' : '';
      const typeClass = job.type === 'INTERNAL' ? 'internal' : 'external';
      const typeLabel = job.type === 'INTERNAL' ? 'VERGO' : job.companyName || 'External';
      
      return `
        <div class="job-card">
          <div class="job-header">
            <div>
              <h3 class="job-title">${escapeHtml(job.title)}</h3>
              <span class="job-role">${escapeHtml(job.role.name)}</span>
            </div>
            <span class="job-type ${typeClass}">${escapeHtml(typeLabel)}</span>
          </div>
          
          <div class="job-meta">
            <span>📍 ${escapeHtml(job.location)}</span>
            <span>📅 ${date}</span>
            <span>⏰ ${time}</span>
          </div>
          
          <p class="job-description">${escapeHtml(job.description)}</p>
          
          <div class="job-footer">
            <div>
              <span class="job-pay">${pay}</span>
              <span class="spots-left ${spotsClass}"> · ${job.spotsLeft} spot${job.spotsLeft !== 1 ? 's' : ''} left</span>
            </div>
            <a href="job-detail.html?id=${job.id}" class="btn btn-primary btn-small">View & Apply</a>
          </div>
        </div>
      `;
    }
    
    // Render pagination
    function renderPagination() {
      const container = document.getElementById('pagination');
      
      if (totalPages <= 1) {
        container.classList.add('d-none');
        return;
      }
      
      container.classList.remove('d-none');
      container.innerHTML = `
        <button type="button" data-action="paginate" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>← Previous</button>
        <span class="current">Page ${currentPage} of ${totalPages}</span>
        <button type="button" data-action="paginate" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>
      `;
    }
    
    // Escape HTML
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    // Filter handlers
    document.getElementById('filter-role').addEventListener('change', (e) => {
      filters.roleId = e.target.value;
      loadJobs(1);
    });
    
    document.getElementById('filter-type').addEventListener('change', (e) => {
      filters.type = e.target.value;
      loadJobs(1);
    });

    // CSP-safe event delegation for dynamically rendered buttons.
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      if (action === 'logout') {
        logout();
        return;
      }
      if (action === 'paginate') {
        const page = Number(el.dataset.page);
        if (Number.isFinite(page)) loadJobs(page);
      }
    });
    
    // Init
    checkAuth();
    loadRoles();
    loadJobs();
