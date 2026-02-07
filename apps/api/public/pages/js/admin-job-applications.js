let applications = [];
    let jobs = [];
    let currentApplication = null;
    
    // Load jobs for filter dropdown
    async function loadJobs() {
      try {
        const res = await fetch('/api/v1/jobs/admin/all?limit=100');
        const payload = await res.json();
        const data = payload.data ?? payload;
        jobs = data.jobs || [];
        
        const select = document.getElementById('filter-job');
        jobs.forEach(job => {
          const opt = document.createElement('option');
          opt.value = job.id;
          opt.textContent = job.title;
          select.appendChild(opt);
        });
      } catch (err) {
        console.error('Failed to load jobs:', err);
      }
    }
    
    // Load applications
    async function loadApplications() {
      const status = document.getElementById('filter-status').value;
      const jobId = document.getElementById('filter-job').value;
      
      const params = new URLSearchParams({ limit: '100' });
      if (status) params.append('status', status);
      if (jobId) params.append('jobId', jobId);
      
      try {
        const res = await fetch(`/api/v1/job-applications?${params}`);
        const payload = await res.json();
        const data = payload.data ?? payload;
        console.log('[ADMIN] Job applications response:', data);
        applications = data.applications || [];
        updateStats();
        renderTable();
      } catch (err) {
        console.error('Failed to load applications:', err);
        document.getElementById('applications-table').innerHTML = 
          '<tr><td colspan="6" class="empty-state">Failed to load applications</td></tr>';
      }
    }
    
    // Update stats
    function updateStats() {
      const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'PENDING').length,
        shortlisted: applications.filter(a => a.status === 'SHORTLISTED').length,
        confirmed: applications.filter(a => a.status === 'CONFIRMED').length,
        rejected: applications.filter(a => a.status === 'REJECTED').length
      };
      
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-pending').textContent = stats.pending;
      document.getElementById('stat-shortlisted').textContent = stats.shortlisted;
      document.getElementById('stat-confirmed').textContent = stats.confirmed;
      document.getElementById('stat-rejected').textContent = stats.rejected;
    }
    
    // Render table
    function renderTable() {
      const tbody = document.getElementById('applications-table');
      
      if (applications.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              <h3>No applications found</h3>
              <p>Try adjusting your filters</p>
            </td>
          </tr>
        `;
        return;
      }
      
      tbody.innerHTML = applications.map(app => {
        const appliedDate = new Date(app.createdAt).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short'
        });
        
        const eventDate = app.job.eventDate 
          ? new Date(app.job.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : 'Flexible';
        
        const hasRosterApp = app.user.applicantId;
        
        const coverPreview = app.coverNote 
          ? escapeHtml(app.coverNote.substring(0, 60)) + (app.coverNote.length > 60 ? '...' : '')
          : '<span class="text-muted">-</span>';
        
        return `
          <tr>
            <td>
              <div class="applicant-info">
                <span class="applicant-name">${escapeHtml(app.user.firstName)} ${escapeHtml(app.user.lastName)}</span>
                <span class="applicant-email"><a href="mailto:${escapeHtml(app.user.email)}">${escapeHtml(app.user.email)}</a></span>
                ${app.user.phone ? `<span class="applicant-email">${escapeHtml(app.user.phone)}</span>` : ''}
                ${hasRosterApp ? '<span class="roster-badge">On Roster</span>' : ''}
              </div>
            </td>
            <td>
              <div class="job-info">
                <span class="job-title"><a href="admin-jobs">${escapeHtml(app.job.title)}</a></span>
                <span class="job-meta">${escapeHtml(app.job.location)} • ${eventDate}</span>
                <span class="job-type ${app.job.type === 'INTERNAL' ? 'internal' : 'external'}">
                  ${app.job.type === 'INTERNAL' ? 'VERGO' : 'External'}
                </span>
              </div>
            </td>
            <td>
              <span class="status-badge ${app.status.toLowerCase()}">${formatStatus(app.status)}</span>
            </td>
            <td class="hide-mobile">
              <div class="cover-note">
                ${app.coverNote ? `<span class="cover-note-preview" data-action="open-detail" data-app-id="${escapeHtml(app.id)}">${coverPreview}</span>` : '-'}
              </div>
            </td>
            <td class="date-cell">${appliedDate}</td>
            <td>
              <div class="actions">
                <button type="button" class="btn btn-secondary btn-small" data-action="open-detail" data-app-id="${escapeHtml(app.id)}">View</button>
                ${app.status === 'PENDING' ? `
                  <button type="button" class="btn btn-shortlist btn-small" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="SHORTLISTED">Shortlist</button>
                ` : ''}
                ${app.status === 'SHORTLISTED' ? `
                  <button type="button" class="btn btn-confirm btn-small" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="CONFIRMED">Confirm</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    
    // Format status
    function formatStatus(status) {
      const labels = {
        PENDING: 'Pending',
        REVIEWED: 'Reviewed',
        SHORTLISTED: 'Shortlisted',
        CONFIRMED: 'Confirmed',
        REJECTED: 'Rejected',
        WITHDRAWN: 'Withdrawn'
      };
      return labels[status] || status;
    }
    
    // Open detail modal
    async function openDetail(id) {
      currentApplication = applications.find(a => a.id === id);
      if (!currentApplication) return;
      
      const app = currentApplication;
      const eventDate = app.job.eventDate 
        ? new Date(app.job.eventDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
        : 'Flexible';
      
      const appliedDate = new Date(app.createdAt).toLocaleDateString('en-GB', { 
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      
      document.getElementById('modal-body').innerHTML = `
        <div class="detail-row">
          <div class="detail-label">Applicant</div>
          <div class="detail-value">
            <div class="detail-inline">
              <strong>${escapeHtml(app.user.firstName)} ${escapeHtml(app.user.lastName)}</strong>
              ${app.user.applicantId ? '<span class="roster-badge roster-badge-inline">On Roster</span>' : ''}
            </div>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Email</div>
          <div class="detail-value"><a href="mailto:${escapeHtml(app.user.email)}" class="detail-link">${escapeHtml(app.user.email)}</a></div>
        </div>
        ${app.user.phone ? `
        <div class="detail-row">
          <div class="detail-label">Phone</div>
          <div class="detail-value"><a href="tel:${escapeHtml(app.user.phone)}" class="detail-link">${escapeHtml(app.user.phone)}</a></div>
        </div>
        ` : ''}
        <div class="detail-row">
          <div class="detail-label">Job</div>
          <div class="detail-value"><strong>${escapeHtml(app.job.title)}</strong></div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Location</div>
          <div class="detail-value">${escapeHtml(app.job.location)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Event Date</div>
          <div class="detail-value">${eventDate}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Applied</div>
          <div class="detail-value">${appliedDate}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Status</div>
          <div class="detail-value"><span class="status-badge ${app.status.toLowerCase()}">${formatStatus(app.status)}</span></div>
        </div>
        ${app.coverNote ? `
        <div class="detail-row detail-row-vertical">
          <div class="detail-label">Cover Note</div>
          <div class="detail-value cover-note-content">${escapeHtml(app.coverNote)}</div>
        </div>
        ` : ''}
        
        <div class="notes-section">
          <h4>Admin Notes</h4>
          <textarea id="admin-notes" placeholder="Add internal notes about this applicant...">${escapeHtml(app.adminNotes || '')}</textarea>
          <button type="button" class="btn btn-secondary mt-1" data-action="save-notes" data-app-id="${escapeHtml(app.id)}">Save Notes</button>
        </div>
      `;
      
      // Footer with status actions
      const footerActions = [];
      
      if (app.status !== 'CONFIRMED' && app.status !== 'WITHDRAWN') {
        if (app.status !== 'REVIEWED') footerActions.push(`<button type="button" class="btn btn-secondary" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="REVIEWED" data-from-modal="true">Mark Reviewed</button>`);
        if (app.status !== 'SHORTLISTED') footerActions.push(`<button type="button" class="btn btn-shortlist" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="SHORTLISTED" data-from-modal="true">Shortlist</button>`);
        footerActions.push(`<button type="button" class="btn btn-confirm" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="CONFIRMED" data-from-modal="true">Confirm</button>`);
        if (app.status !== 'REJECTED') footerActions.push(`<button type="button" class="btn btn-reject" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="REJECTED" data-from-modal="true">Reject</button>`);
      }
      
      document.getElementById('modal-footer').innerHTML = `
        <div class="status-actions">${footerActions.join('')}</div>
        <button type="button" class="btn btn-secondary" data-action="close-modal">Close</button>
      `;
      
      AdminCore.openModal('detail-modal');
    }
    
    // Close modal
    function closeModal() {
      AdminCore.closeModal('detail-modal');
      currentApplication = null;
    }
    
    // Update status
    async function updateStatus(id, status, fromModal = false) {
      if (status === 'REJECTED' && !confirm('Reject this application?')) return;
      if (status === 'CONFIRMED' && !confirm('Confirm this applicant for the job?')) return;
      
      try {
        const res = await fetch(`/api/v1/job-applications/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        
        if (!res.ok) {
          const payload = await res.json();
          const data = payload.data ?? payload;
          throw new Error(data.error || 'Failed to update status');
        }
        
        showAlert(`Application ${formatStatus(status).toLowerCase()}`, 'success');
        await loadApplications();
        
        if (fromModal) {
          closeModal();
        }
        
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }
    
    // Save notes
    async function saveNotes(id) {
      const notes = document.getElementById('admin-notes').value;
      
      try {
        const res = await fetch(`/api/v1/job-applications/${id}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes })
        });
        
        if (!res.ok) {
          const payload = await res.json();
          const data = payload.data ?? payload;
          throw new Error(data.error || 'Failed to save notes');
        }
        
        showAlert('Notes saved', 'success');
        
        // Update local data
        const app = applications.find(a => a.id === id);
        if (app) app.adminNotes = notes;
        
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }
    
    // Aliases for AdminCore
    const escapeHtml = AdminCore.escapeHtml;
    const showAlert = AdminCore.showAlert;
    const logout = AdminCore.logout;

    // CSP-safe handlers (no inline onclick / onchange)
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      const appId = el.dataset.appId;

      if (action === 'logout') return logout();
      if (action === 'close-modal') return closeModal();
      if (action === 'open-detail') return appId && openDetail(appId);
      if (action === 'save-notes') return appId && saveNotes(appId);
      if (action === 'update-status') {
        const status = el.dataset.status;
        const fromModal = el.dataset.fromModal === 'true';
        return appId && status && updateStatus(appId, status, fromModal);
      }
    });

    document.getElementById('filter-status')?.addEventListener('change', loadApplications);
    document.getElementById('filter-job')?.addEventListener('change', loadApplications);
    
    // Modal backdrop + Escape behavior (uses local closeModal to reset currentApplication)
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Init
    AdminCore.checkAuth();
    loadJobs();
    loadApplications();
