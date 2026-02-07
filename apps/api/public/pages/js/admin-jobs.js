let jobs = [];
    let roles = [];
    let editingId = null;
    let pendingCount = 0;
    
    // Load roles
    async function loadRoles() {
      try {
        const res = await fetch('/api/v1/jobs/meta/roles');
        const payload = await res.json();
        roles = payload.data ?? payload;
        
        const select = document.getElementById('role-select');
        select.innerHTML = '<option value="">Select role...</option>';
        roles.forEach(role => {
          select.innerHTML += `<option value="${role.id}">${escapeHtml(role.name)}</option>`;
        });
        
        if (roles.length === 0) {
          showAlert('No roles found. Please seed your roles first.', 'error');
        }
      } catch (err) {
        console.error('Failed to load roles:', err);
      }
    }
    
    // Load jobs
    async function loadJobs() {
      const status = document.getElementById('filter-status').value;
      const type = document.getElementById('filter-type').value;
      
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.append('status', status);
      if (type) params.append('type', type);
      
      try {
        const res = await fetch(`/api/v1/jobs/admin/list?${params}`);
        const payload = await res.json();
        const data = payload.data ?? payload;
        jobs = data.jobs || [];
        
        // Count pending jobs
        pendingCount = jobs.filter(j => j.status === 'PENDING').length;
        updatePendingBanner();
        
        renderTable();
      } catch (err) {
        console.error('Failed to load jobs:', err);
        document.getElementById('jobs-table').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load jobs</td></tr>';
      }
    }
    
    // Update pending banner
    function updatePendingBanner() {
      const banner = document.getElementById('pending-banner');
      const countEl = document.getElementById('pending-count');
      
      if (pendingCount > 0) {
        banner.classList.remove('hidden');
        countEl.textContent = pendingCount;
      } else {
        banner.classList.add('hidden');
      }
    }
    
    // Filter to pending jobs
    function filterPending() {
      document.getElementById('filter-status').value = 'PENDING';
      loadJobs();
    }
    
    // Render table
    function renderTable() {
      const tbody = document.getElementById('jobs-table');
      
      if (jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><h3>No jobs yet</h3><p>Click "Add Job" to create your first listing</p></td></tr>';
        return;
      }
      
      tbody.innerHTML = jobs.map(job => {
        const date = job.eventDate 
          ? new Date(job.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '-';
        
        const pay = job.payRate 
          ? `£${Number(job.payRate).toFixed(0)}/${job.payType === 'HOURLY' ? 'hr' : job.payType === 'DAILY' ? 'day' : 'fee'}`
          : '-';
        
        const roleName = job.role?.name || 'Unknown';
        const companyDisplay = job.companyName || (job.type === 'INTERNAL' ? 'VERGO' : '-');
        const posterEmail = job.posterEmail ? `<span class="poster-email">${escapeHtml(job.posterEmail)}</span>` : '';
        
        // Determine which action buttons to show
        let actionButtons = '';
        
        if (job.status === 'PENDING') {
          actionButtons = `
            <button type="button" class="btn btn-small btn-approve" data-action="approve-job" data-job-id="${job.id}">✓ Approve</button>
            <button type="button" class="btn btn-small btn-reject" data-action="reject-job" data-job-id="${job.id}">✗ Reject</button>
            <button type="button" class="btn btn-small btn-edit" data-action="edit-job" data-job-id="${job.id}">Edit</button>
          `;
        } else {
          actionButtons = `
            <button type="button" class="btn btn-small btn-edit" data-action="edit-job" data-job-id="${job.id}">Edit</button>
            <button type="button" class="btn btn-small btn-delete" data-action="delete-job" data-job-id="${job.id}">Delete</button>
          `;
        }
        
        return `
          <tr>
            <td class="job-title-cell">
              <strong>${escapeHtml(job.title)}</strong>
              <span>${escapeHtml(roleName)}</span>
            </td>
            <td>
              ${escapeHtml(companyDisplay)}
              ${posterEmail}
            </td>
            <td>${date}</td>
            <td class="hide-mobile">${pay}</td>
            <td class="hide-mobile">${job._count?.applications || 0}</td>
            <td><span class="status status-${job.status.toLowerCase()}">${job.status}</span></td>
            <td class="actions">${actionButtons}</td>
          </tr>
        `;
      }).join('');
    }
    
    // Open create modal
    function openCreateModal() {
      editingId = null;
      document.getElementById('modal-title').textContent = 'Add New Job';
      document.getElementById('job-form').reset();
      document.getElementById('form-alert').innerHTML = '';
      AdminCore.openModal('job-modal');
    }
    
    // Edit job
    function editJob(id) {
      const job = jobs.find(j => j.id === id);
      if (!job) return;
      
      editingId = id;
      document.getElementById('modal-title').textContent = 'Edit Job';
      document.getElementById('form-alert').innerHTML = '';
      
      const form = document.getElementById('job-form');
      form.title.value = job.title;
      form.roleId.value = job.roleId;
      form.type.value = job.type;
      form.companyName.value = job.companyName || '';
      form.location.value = job.location;
      form.venue.value = job.venue || '';
      form.eventDate.value = job.eventDate ? job.eventDate.split('T')[0] : '';
      form.shiftStart.value = job.shiftStart || '';
      form.shiftEnd.value = job.shiftEnd || '';
      form.payRate.value = job.payRate || '';
      form.payType.value = job.payType;
      form.staffNeeded.value = job.staffNeeded;
      form.status.value = job.status === 'PENDING' ? 'DRAFT' : job.status; // Can't set to PENDING manually
      form.description.value = job.description;
      form.requirements.value = job.requirements || '';
      form.closingDate.value = job.closingDate ? job.closingDate.split('T')[0] : '';
      
      AdminCore.openModal('job-modal');
    }
    
    // Close modal
    function closeModal() {
      AdminCore.closeModal('job-modal');
      editingId = null;
    }
    
    // Save job
    async function saveJob(e) {
      e.preventDefault();
      
      const form = e.target;
      const formAlert = document.getElementById('form-alert');
      const btn = document.getElementById('save-btn');
      
      const data = {
        title: form.title.value.trim(),
        roleId: form.roleId.value,
        type: form.type.value,
        companyName: form.companyName.value.trim() || null,
        location: form.location.value.trim(),
        venue: form.venue.value.trim() || null,
        eventDate: form.eventDate.value || null,
        shiftStart: form.shiftStart.value || null,
        shiftEnd: form.shiftEnd.value || null,
        payRate: form.payRate.value ? parseFloat(form.payRate.value) : null,
        payType: form.payType.value,
        staffNeeded: parseInt(form.staffNeeded.value) || 1,
        status: form.status.value,
        description: form.description.value.trim(),
        requirements: form.requirements.value.trim() || null,
        closingDate: form.closingDate.value || null
      };
      
      btn.disabled = true;
      btn.textContent = 'Saving...';
      
      try {
        const url = editingId ? `/api/v1/jobs/${editingId}` : '/api/v1/jobs';
        const method = editingId ? 'PATCH' : 'POST';
        
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const payload = await res.json();
        const result = payload.data ?? payload;
        
        if (!res.ok) {
          throw new Error(result.error || 'Failed to save job');
        }
        
        closeModal();
        showAlert(editingId ? 'Job updated successfully' : 'Job created successfully', 'success');
        loadJobs();
        
      } catch (err) {
        formAlert.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Job';
      }
    }
    
    // Approve pending job
    async function approveJob(id) {
      const job = jobs.find(j => j.id === id);
      if (!confirm(`Approve "${job?.title}"?\n\nThis will make it visible to job seekers.`)) return;
      
      try {
        const res = await fetch(`/api/v1/jobs/${id}/approve`, { method: 'POST' });
        
        if (!res.ok) {
          const payload = await res.json();
          const data = payload.data ?? payload;
          throw new Error(data.error || 'Failed to approve');
        }
        
        showAlert('Job approved and now visible to job seekers', 'success');
        loadJobs();
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }
    
    // Reject pending job
    async function rejectJob(id) {
      const job = jobs.find(j => j.id === id);
      const reason = prompt(`Reject "${job?.title}"?\n\nOptionally enter a reason (will be emailed to submitter):`);
      
      if (reason === null) return; // User cancelled
      
      try {
        const res = await fetch(`/api/v1/jobs/${id}/reject`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || undefined })
        });
        
        if (!res.ok) {
          const payload = await res.json();
          const data = payload.data ?? payload;
          throw new Error(data.error || 'Failed to reject');
        }
        
        showAlert('Job rejected and removed', 'success');
        loadJobs();
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }
    
    // Delete job
    async function deleteJob(id) {
      if (!confirm('Are you sure you want to delete this job? This cannot be undone.')) return;
      
      try {
        const res = await fetch(`/api/v1/jobs/${id}`, { method: 'DELETE' });
        
        if (!res.ok) {
          const payload = await res.json();
          const data = payload.data ?? payload;
          throw new Error(data.error || 'Failed to delete');
        }
        
        showAlert('Job deleted', 'success');
        loadJobs();
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }
    
    // Aliases for AdminCore
    const escapeHtml = AdminCore.escapeHtml;
    const showAlert = AdminCore.showAlert;
    const logout = AdminCore.logout;

    // CSP-safe handlers (no inline onclick / onchange / onsubmit)
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      const jobId = el.dataset.jobId;

      if (action === 'logout') return logout();
      if (action === 'filter-pending') return filterPending();
      if (action === 'open-create-modal') return openCreateModal();
      if (action === 'close-modal') return closeModal();
      if (action === 'approve-job') return jobId && approveJob(jobId);
      if (action === 'reject-job') return jobId && rejectJob(jobId);
      if (action === 'edit-job') return jobId && editJob(jobId);
      if (action === 'delete-job') return jobId && deleteJob(jobId);
    });

    document.getElementById('filter-status')?.addEventListener('change', loadJobs);
    document.getElementById('filter-type')?.addEventListener('change', loadJobs);
    document.getElementById('job-form')?.addEventListener('submit', saveJob);
    
    // Modal backdrop + Escape behavior (uses local closeModal to reset editingId)
    document.getElementById('job-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Init
    AdminCore.checkAuth();
    loadRoles();
    loadJobs();
