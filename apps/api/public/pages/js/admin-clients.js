let clients = [];
    let currentPage = 1;
    let totalPages = 1;
    let pendingRejectId = null;
    var debounceSearch = AdminCore.debounce(() => loadClients(1), 300);
    
    // Load stats
    async function loadStats() {
      try {
        const res = await fetch('/api/v1/admin/clients/stats');
        const payload = await res.json();
        const stats = payload.data ?? payload;
        
        document.getElementById('stat-pending').textContent = stats.pending;
        document.getElementById('stat-approved').textContent = stats.approved;
        document.getElementById('stat-rejected').textContent = stats.rejected;
        document.getElementById('stat-total').textContent = stats.total;
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }
    
    // Load clients
    async function loadClients(page = 1) {
      currentPage = page;
      const status = document.getElementById('filter-status').value;
      const search = document.getElementById('filter-search').value;
      
      const params = new URLSearchParams({ page, limit: 20 });
      if (status) params.append('status', status);
      if (search) params.append('search', search);
      
      const tbody = document.getElementById('clients-table');
      tbody.innerHTML = AdminCore.renderLoadingState(5);
      
      try {
        const res = await fetch(`/api/v1/admin/clients?${params}`);
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        clients = data.clients;
        totalPages = data.pagination.pages;
        
        if (clients.length === 0) {
          tbody.innerHTML = AdminCore.renderEmptyState(5, 'No clients found');
          updatePagination();
          return;
        }
        
        tbody.innerHTML = clients.map(client => `
          <tr>
            <td class="company-cell">
              <div class="company-name">${AdminCore.escapeHtml(client.companyName)}</div>
              <div class="company-industry">${AdminCore.escapeHtml(client.industry || 'Not specified')}</div>
            </td>
            <td class="contact-cell">
              <div class="contact-name">
                ${AdminCore.escapeHtml(client.contactName)}
                ${client.emailVerified 
                  ? '<span class="verified-badge" title="Email verified">✓</span>' 
                  : '<span class="unverified-badge" title="Email not verified">✗</span>'}
              </div>
              <div class="contact-email">${AdminCore.escapeHtml(client.email)}</div>
            </td>
            <td>
              <span class="status-badge status-${client.status}">${client.status}</span>
            </td>
            <td>${AdminCore.formatDate(client.createdAt)}</td>
            <td class="actions">
              ${getActionButtons(client)}
            </td>
          </tr>
        `).join('');
        
        updatePagination();
        
      } catch (err) {
        console.error('Failed to load clients:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Failed to load clients</td></tr>';
      }
    }
    
    function getActionButtons(client) {
      let buttons = `<button type="button" class="btn btn-view" data-action="view-client" data-client-id="${client.id}">View</button>`;
      
      if (client.status === 'PENDING' && client.emailVerified) {
        buttons += `
          <button type="button" class="btn btn-approve" data-action="approve-client" data-client-id="${client.id}">Approve</button>
          <button type="button" class="btn btn-reject" data-action="open-reject" data-client-id="${client.id}">Reject</button>
        `;
      } else if (client.status === 'APPROVED') {
        buttons += `<button type="button" class="btn btn-suspend" data-action="suspend-client" data-client-id="${client.id}">Suspend</button>`;
      } else if (client.status === 'SUSPENDED' || client.status === 'REJECTED') {
        buttons += `<button type="button" class="btn btn-reinstate" data-action="reinstate-client" data-client-id="${client.id}">Reinstate</button>`;
      }
      
      return buttons;
    }
    
    function updatePagination() {
      const pagination = document.getElementById('pagination');
      pagination.innerHTML = `
        <button type="button" data-action="paginate" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${currentPage} of ${totalPages || 1}</span>
        <button type="button" data-action="paginate" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>
      `;
    }
    
    // View client details
    async function viewClient(id) {
      try {
        const res = await fetch(`/api/v1/admin/clients/${id}`);
        const payload = await res.json();
        const client = payload.data ?? payload;
        
        document.getElementById('modal-title').textContent = client.companyName;
        document.getElementById('modal-body').innerHTML = `
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value"><span class="status-badge status-${client.status}">${client.status}</span></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email Verified:</span>
            <span class="detail-value">${client.emailVerified ? 'Yes ✓' : 'No ✗'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Industry:</span>
            <span class="detail-value">${AdminCore.escapeHtml(client.industry || 'Not specified')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Company Size:</span>
            <span class="detail-value">${AdminCore.escapeHtml(client.companySize || 'Not specified')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Website:</span>
            <span class="detail-value">${client.website && /^https?:\/\//i.test(client.website) ? `<a href="${AdminCore.escapeHtml(client.website)}" target="_blank" rel="noopener noreferrer" class="text-gold">${AdminCore.escapeHtml(client.website)}</a>` : AdminCore.escapeHtml(client.website || 'Not specified')}</span>
          </div>
          
          <div class="modal-section">
            <h3>Contact Details</h3>
            <div class="detail-row">
              <span class="detail-label">Name:</span>
              <span class="detail-value">${AdminCore.escapeHtml(client.contactName)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Email:</span>
              <span class="detail-value">${AdminCore.escapeHtml(client.email)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone:</span>
              <span class="detail-value">${AdminCore.escapeHtml(client.phone || 'Not specified')}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Job Title:</span>
              <span class="detail-value">${AdminCore.escapeHtml(client.jobTitle || 'Not specified')}</span>
            </div>
          </div>
          
          <div class="modal-section">
            <h3>Account Info</h3>
            <div class="detail-row">
              <span class="detail-label">Registered:</span>
              <span class="detail-value">${AdminCore.formatDate(client.createdAt)}</span>
            </div>
            ${client.approvedAt ? `
            <div class="detail-row">
              <span class="detail-label">Approved:</span>
              <span class="detail-value">${AdminCore.formatDate(client.approvedAt)} by ${AdminCore.escapeHtml(client.approvedBy || 'Admin')}</span>
            </div>
            ` : ''}
            ${client.rejectionReason ? `
            <div class="detail-row">
              <span class="detail-label">Rejection Reason:</span>
              <span class="detail-value">${AdminCore.escapeHtml(client.rejectionReason)}</span>
            </div>
            ` : ''}
            ${client.lastLoginAt ? `
            <div class="detail-row">
              <span class="detail-label">Last Login:</span>
              <span class="detail-value">${AdminCore.formatDate(client.lastLoginAt)}</span>
            </div>
            ` : ''}
          </div>
          
          <div class="modal-section">
            <h3>Admin Notes</h3>
            <textarea id="admin-notes-${client.id}" placeholder="Add notes about this client...">${AdminCore.escapeHtml(client.adminNotes || '')}</textarea>
            <button type="button" class="btn btn-view mt-2" data-action="save-notes" data-client-id="${client.id}">Save Notes</button>
          </div>
        `;
        
        AdminCore.openModal('client-modal');
        
      } catch (err) {
        AdminCore.showAlert('Failed to load client details', 'error');
      }
    }
    
    function closeModal() {
      AdminCore.closeModal('client-modal');
    }
    
    // Client actions
    async function approveClient(id) {
      if (!confirm('Approve this client? They will be able to log in and request quotes.')) return;
      
      try {
        const res = await fetch(`/api/v1/admin/clients/${id}/approve`, { method: 'POST' });
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok) throw new Error(data.error);
        
        AdminCore.showAlert('Client approved successfully', 'success');
        loadClients(currentPage);
        loadStats();
        
      } catch (err) {
        AdminCore.showAlert(err.message || 'Failed to approve client', 'error');
      }
    }
    
    function openRejectModal(id) {
      pendingRejectId = id;
      document.getElementById('reject-reason').value = '';
      AdminCore.openModal('reject-modal');
    }
    
    function closeRejectModal() {
      pendingRejectId = null;
      AdminCore.closeModal('reject-modal');
    }
    
    async function confirmReject() {
      if (!pendingRejectId) return;
      
      const reason = document.getElementById('reject-reason').value.trim();
      
      try {
        const res = await fetch(`/api/v1/admin/clients/${pendingRejectId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        
        const payload = await res.json();
        const data = payload.data ?? payload;
        if (!res.ok) throw new Error(data.error);
        
        AdminCore.showAlert('Client rejected', 'success');
        closeRejectModal();
        loadClients(currentPage);
        loadStats();
        
      } catch (err) {
        AdminCore.showAlert(err.message || 'Failed to reject client', 'error');
      }
    }
    
    async function suspendClient(id) {
      if (!confirm('Suspend this client? They will no longer be able to log in.')) return;
      
      try {
        const res = await fetch(`/api/v1/admin/clients/${id}/suspend`, { method: 'POST' });
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok) throw new Error(data.error);
        
        AdminCore.showAlert('Client suspended', 'success');
        loadClients(currentPage);
        loadStats();
        
      } catch (err) {
        AdminCore.showAlert(err.message || 'Failed to suspend client', 'error');
      }
    }
    
    async function reinstateClient(id) {
      if (!confirm('Reinstate this client? They will be able to log in again.')) return;
      
      try {
        const res = await fetch(`/api/v1/admin/clients/${id}/reinstate`, { method: 'POST' });
        const payload = await res.json();
        const data = payload.data ?? payload;
        
        if (!res.ok) throw new Error(data.error);
        
        AdminCore.showAlert('Client reinstated', 'success');
        loadClients(currentPage);
        loadStats();
        
      } catch (err) {
        AdminCore.showAlert(err.message || 'Failed to reinstate client', 'error');
      }
    }
    
    async function saveNotes(id) {
      const notes = document.getElementById(`admin-notes-${id}`).value;
      
      try {
        const res = await fetch(`/api/v1/admin/clients/${id}/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes })
        });
        
        const payload = await res.json();
        const data = payload.data ?? payload;
        if (!res.ok) throw new Error(data.error);
        
        AdminCore.showAlert('Notes saved', 'success');
        
      } catch (err) {
        AdminCore.showAlert(err.message || 'Failed to save notes', 'error');
      }
    }
    
    // CSP-safe handlers (no inline onclick / onchange / onkeyup)
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      const clientId = el.dataset.clientId;

      if (action === 'paginate') {
        const page = Number(el.dataset.page);
        if (Number.isFinite(page)) loadClients(page);
        return;
      }
      if (action === 'view-client') return clientId && viewClient(clientId);
      if (action === 'approve-client') return clientId && approveClient(clientId);
      if (action === 'open-reject') return clientId && openRejectModal(clientId);
      if (action === 'suspend-client') return clientId && suspendClient(clientId);
      if (action === 'reinstate-client') return clientId && reinstateClient(clientId);
      if (action === 'save-notes') return clientId && saveNotes(clientId);
      if (action === 'confirm-reject') return confirmReject();

      if (action === 'close-modal') {
        const id = el.dataset.modalId;
        if (id === 'reject-modal') return closeRejectModal();
        if (id === 'client-modal') return closeModal();
        if (id) AdminCore.closeModal(id);
      }
    });

    document.getElementById('filter-status')?.addEventListener('change', () => loadClients(1));
    document.getElementById('filter-search')?.addEventListener('input', debounceSearch);

    // Initialize
    AdminCore.checkAuth();
    loadStats();
    loadClients();
