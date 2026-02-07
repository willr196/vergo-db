// Aliases for AdminCore
    const escapeHtml = AdminCore.escapeHtml;
    const fetchJSON = AdminCore.fetchJSON;
    const notify = AdminCore.notify;
    const formatDate = AdminCore.formatDateTime;
    const formatDateOnly = AdminCore.formatDate;

    // Global State
    let allApplications = [];
    let allContacts = [];
    let allEvents = [];
    let currentSort = { column: 'createdAt', direction: 'desc' };
    let currentContactSort = { column: 'createdAt', direction: 'desc' };
    let currentEventSort = { column: 'eventDate', direction: 'asc' };

    // Tab Switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
      });
    });

    // CSP-safe: replace inline onclick handlers with delegated listeners.
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      if (action === 'apply-filters') return applyFilters();
      if (action === 'clear-filters') return clearFilters();
      if (action === 'apply-contact-filters') return applyContactFilters();
      if (action === 'clear-contact-filters') return clearContactFilters();
      if (action === 'apply-event-filters') return applyEventFilters();
      if (action === 'clear-event-filters') return clearEventFilters();

      if (action === 'open-cv') {
        return openCV(el.dataset.appId, el.dataset.cvUrl || '');
      }
      if (action === 'update-status') {
        return updateStatus(el.dataset.appId, el.dataset.status);
      }
      if (action === 'update-contact-status') {
        return updateContactStatus(el.dataset.contactId, el.dataset.status);
      }
      if (action === 'update-event-status') {
        return updateEventStatus(el.dataset.eventId, el.dataset.status);
      }
    });

    // Click-to-sort table headers (no inline onclick on <th>).
    document.querySelector('#applications-tab thead')?.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      sortTable(th.dataset.sort, th);
    });
    document.querySelector('#contacts-tab thead')?.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      sortContactTable(th.dataset.sort, th);
    });
    document.querySelector('#events-tab thead')?.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      sortEventTable(th.dataset.sort, th);
    });

    // Load Applications
    async function loadApplications() {
      try {
        const data = await fetchJSON('/api/v1/applications');
        // Handle both formats: {applications: [...]} or [...]
        allApplications = Array.isArray(data) ? data : (data.applications || []);
        
        updateStats();
        renderApplications();
      } catch (e) {
        notify('Failed to load applications: ' + e.message, 'error');
        document.getElementById('applications-body').innerHTML = `
          <tr>
            <td colspan="7" class="empty-state">
              <div class="empty-state-icon">⚠️</div>
              <div>Failed to load applications: ${e.message}</div>
            </td>
          </tr>
        `;
      }
    }

    // Update Stats
    function updateStats() {
      const stats = {
        total: allApplications.length,
        received: allApplications.filter(a => a.status === 'RECEIVED').length,
        reviewing: allApplications.filter(a => a.status === 'REVIEWING').length,
        shortlisted: allApplications.filter(a => a.status === 'SHORTLISTED').length,
        rejected: allApplications.filter(a => a.status === 'REJECTED').length,
        hired: allApplications.filter(a => a.status === 'HIRED').length
      };

      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-received').textContent = stats.received;
      document.getElementById('stat-reviewing').textContent = stats.reviewing;
      document.getElementById('stat-shortlisted').textContent = stats.shortlisted;
      document.getElementById('stat-rejected').textContent = stats.rejected;
      document.getElementById('stat-hired').textContent = stats.hired;
    }

    // Stat Card Filtering
    document.querySelectorAll('#app-stats .stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const filter = card.dataset.filter;
        
        // Update active state
        document.querySelectorAll('#app-stats .stat-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        // Apply filter
        if (filter === 'all') {
          document.getElementById('filter-status').value = '';
        } else {
          document.getElementById('filter-status').value = filter;
        }
        applyFilters();
      });
    });

    // Apply Filters
    function applyFilters() {
      const statusFilter = document.getElementById('filter-status').value;
      const roleFilter = document.getElementById('filter-role').value;
      const searchFilter = document.getElementById('filter-search').value.toLowerCase();

      let filtered = allApplications;

      if (statusFilter) {
        filtered = filtered.filter(app => app.status === statusFilter);
      }

      if (roleFilter) {
        filtered = filtered.filter(app =>
          app.roles && app.roles.some(role =>
            (typeof role === 'string' ? role : role.name) === roleFilter
          )
        );
      }

      if (searchFilter) {
        filtered = filtered.filter(app => {
          const searchText = `${app.firstName} ${app.lastName} ${app.email} ${app.phone || ''}`.toLowerCase();
          return searchText.includes(searchFilter);
        });
      }

      renderApplications(filtered);
    }

    function clearFilters() {
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-role').value = '';
      document.getElementById('filter-search').value = '';
      document.querySelectorAll('#app-stats .stat-card').forEach(c => c.classList.remove('active'));
      renderApplications();
    }

    // Sort Table
    function sortTable(column, th) {
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }

      // Update sort icons
      document.querySelectorAll('#applications-tab th').forEach(th => th.classList.remove('sorted'));
      th?.classList.add('sorted');

      renderApplications();
    }

    // Render Applications
    function renderApplications(apps = allApplications) {
      const tbody = document.getElementById('applications-body');
      
      if (apps.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state">
              <div class="empty-state-icon">📋</div>
              <div>No applications found</div>
            </td>
          </tr>
        `;
        return;
      }

      // Sort applications
      const sorted = [...apps].sort((a, b) => {
        let aVal, bVal;
        
        // Handle name sorting (combine firstName and lastName)
        if (currentSort.column === 'fullName') {
          aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
          bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
        } else if (currentSort.column === 'createdAt') {
          aVal = new Date(a.createdAt);
          bVal = new Date(b.createdAt);
        } else if (currentSort.column === 'roles') {
          aVal = (a.roles || []).map(r => typeof r === 'string' ? r : r.name).join(', ');
          bVal = (b.roles || []).map(r => typeof r === 'string' ? r : r.name).join(', ');
        } else {
          aVal = a[currentSort.column];
          bVal = b[currentSort.column];
        }

        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
      });

      tbody.innerHTML = sorted.map(app => `
        <tr>
          <td><strong>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</strong></td>
          <td>${escapeHtml(app.email)}</td>
          <td>${escapeHtml(app.phone || 'N/A')}</td>
          <td>
            ${(app.roles || []).map(role => {
              if (typeof role === 'string') {
                return `<span class="role-pill">${escapeHtml(role)}</span>`;
              }
              const exp = role.experienceLevel ? ` (${escapeHtml(role.experienceLevel)})` : '';
              return `<span class="role-pill" title="${escapeHtml(role.experienceLevel || 'No experience specified')}">${escapeHtml(role.name)}${exp}</span>`;
            }).join('')}
          </td>
          <td>
            <span class="status-pill status-${escapeHtml(app.status)}">
              ${escapeHtml(app.status)}
            </span>
          </td>
          <td>${formatDate(app.createdAt)}</td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn-action btn-view" data-action="open-cv" data-app-id="${escapeHtml(app.id)}" data-cv-url="${escapeHtml(app.cvUrl || app.cvKey || '')}">
                View CV
              </button>
              ${app.status !== 'REVIEWING' ? `
                <button type="button" class="btn-action btn-reviewing" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="REVIEWING">
                  Review
                </button>
              ` : ''}
              ${app.status !== 'SHORTLISTED' ? `
                <button type="button" class="btn-action btn-shortlist" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="SHORTLISTED">
                  Shortlist
                </button>
              ` : ''}
              ${app.status !== 'REJECTED' ? `
                <button type="button" class="btn-action btn-reject" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="REJECTED">
                  Reject
                </button>
              ` : ''}
              ${app.status !== 'HIRED' ? `
                <button type="button" class="btn-action btn-hire" data-action="update-status" data-app-id="${escapeHtml(app.id)}" data-status="HIRED">
                  Hire
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Open CV
    async function openCV(applicationId, cvUrl) {
      console.log('=== OPEN CV DEBUG ===');
      console.log('Application ID:', applicationId);
      console.log('CV URL:', cvUrl);
      
      if (!cvUrl || cvUrl === 'undefined' || cvUrl === 'null') {
        notify('No CV available for this application', 'warning');
        console.error('CV URL is missing or invalid');
        return;
      }

      try {
        // If it's already a full URL (starts with http), open directly
        if (cvUrl.startsWith('http://') || cvUrl.startsWith('https://')) {
          console.log('Opening URL directly:', cvUrl);
          window.open(cvUrl, '_blank', 'noopener,noreferrer');
          return;
        }

        // Otherwise, fetch the signed URL from the backend using application ID
        notify('Loading CV...', 'info');
        console.log('Requesting signed URL for application:', applicationId);
        
        const response = await fetchJSON(`/api/v1/applications/${applicationId}/cv`);
        console.log('Backend response:', response);
        
        if (response.signedUrl) {
          console.log('Opening signed URL:', response.signedUrl);
          window.open(response.signedUrl, '_blank');
          notify('CV opened in new tab', 'success');
        } else {
          throw new Error('No signed URL received from backend');
        }
      } catch (e) {
        console.error('=== CV ERROR ===');
        console.error('Error details:', e);
        notify('Failed to open CV: ' + e.message, 'error');
      }
    }

    // Update Application Status
    async function updateStatus(appId, status) {
      if (status === 'REJECTED' && !confirm('Move this application to the rejected pile?')) return;
      if (status === 'HIRED' && !confirm('Mark this applicant as hired?')) return;

      try {
        await fetchJSON(`/api/v1/applications/${appId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        
        notify(`Application moved to ${status.toLowerCase()} pile`, 'success');
        await loadApplications();
      } catch (e) {
        notify('Failed to update status: ' + e.message, 'error');
      }
    }

    // Load Contacts
    async function loadContacts() {
      try {
        const data = await fetchJSON('/api/v1/contacts');
        allContacts = Array.isArray(data) ? data : (data.contacts || []);
        updateContactStats();
        renderContacts();
      } catch (e) {
        console.log('Contacts not available:', e);
        allContacts = [];
        document.getElementById('contacts-body').innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              <div class="empty-state-icon">📧</div>
              <div>No contact tracking set up yet</div>
            </td>
          </tr>
        `;
      }
    }

    function updateContactStats() {
      const stats = {
        total: allContacts.length,
        new: allContacts.filter(c => c.status === 'NEW').length,
        quoted: allContacts.filter(c => c.status === 'QUOTED').length,
        booked: allContacts.filter(c => c.status === 'BOOKED').length
      };

      document.getElementById('stat-contacts-total').textContent = stats.total;
      document.getElementById('stat-contacts-new').textContent = stats.new;
      document.getElementById('stat-contacts-quoted').textContent = stats.quoted;
      document.getElementById('stat-contacts-booked').textContent = stats.booked;
    }

    function applyContactFilters() {
      const statusFilter = document.getElementById('filter-contact-status').value;
      const typeFilter = document.getElementById('filter-contact-type').value;
      const searchFilter = document.getElementById('filter-contact-search').value.toLowerCase();

      let filtered = allContacts;

      if (statusFilter) {
        filtered = filtered.filter(c => c.status === statusFilter);
      }

      if (typeFilter) {
        filtered = filtered.filter(c => c.type === typeFilter);
      }

      if (searchFilter) {
        filtered = filtered.filter(c => {
          const searchText = `${c.name} ${c.email} ${c.company || ''}`.toLowerCase();
          return searchText.includes(searchFilter);
        });
      }

      renderContacts(filtered);
    }

    function clearContactFilters() {
      document.getElementById('filter-contact-status').value = '';
      document.getElementById('filter-contact-type').value = '';
      document.getElementById('filter-contact-search').value = '';
      renderContacts();
    }

    function sortContactTable(column, th) {
      if (currentContactSort.column === column) {
        currentContactSort.direction = currentContactSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentContactSort.column = column;
        currentContactSort.direction = 'asc';
      }

      document.querySelectorAll('#contacts-tab th').forEach(th => th.classList.remove('sorted'));
      th?.classList.add('sorted');

      renderContacts();
    }

    function renderContacts(contacts = allContacts) {
      const tbody = document.getElementById('contacts-body');
      
      if (contacts.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              <div class="empty-state-icon">📧</div>
              <div>No contacts found</div>
            </td>
          </tr>
        `;
        return;
      }

      const sorted = [...contacts].sort((a, b) => {
        let aVal = a[currentContactSort.column];
        let bVal = b[currentContactSort.column];

        if (currentContactSort.column === 'createdAt') {
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        }

        if (aVal < bVal) return currentContactSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentContactSort.direction === 'asc' ? 1 : -1;
        return 0;
      });

      tbody.innerHTML = sorted.map(contact => `
        <tr>
          <td><strong>${escapeHtml(contact.name)}</strong></td>
          <td>${escapeHtml(contact.email)}</td>
          <td>${escapeHtml(contact.type)}</td>
          <td>
            <span class="status-pill status-${escapeHtml(contact.status)}">
              ${escapeHtml(contact.status)}
            </span>
          </td>
          <td>${formatDate(contact.createdAt)}</td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn-action btn-reviewing" data-action="update-contact-status" data-contact-id="${contact.id}" data-status="CONTACTED">
                Contacted
              </button>
              <button type="button" class="btn-action btn-shortlist" data-action="update-contact-status" data-contact-id="${contact.id}" data-status="QUOTED">
                Quoted
              </button>
              <button type="button" class="btn-action btn-hire" data-action="update-contact-status" data-contact-id="${contact.id}" data-status="BOOKED">
                Booked
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    async function updateContactStatus(contactId, status) {
      try {
        await fetchJSON(`/api/v1/contacts/${contactId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        
        notify(`Contact status updated to ${status}`, 'success');
        await loadContacts();
      } catch (e) {
        notify('Failed to update contact: ' + e.message, 'error');
      }
    }

    // Load Events
    async function loadEvents() {
      try {
        const data = await fetchJSON('/api/v1/events');
        allEvents = Array.isArray(data) ? data : (data.events || []);
        updateEventStats();
        renderEvents();
      } catch (e) {
        console.log('Events not available:', e);
        allEvents = [];
        document.getElementById('events-body').innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">
              <div class="empty-state-icon">🎉</div>
              <div>No event tracking set up yet</div>
            </td>
          </tr>
        `;
      }
    }

    function updateEventStats() {
      const stats = {
        total: allEvents.length,
        upcoming: allEvents.filter(e => e.status === 'UPCOMING').length,
        confirmed: allEvents.filter(e => e.status === 'CONFIRMED').length,
        completed: allEvents.filter(e => e.status === 'COMPLETED').length
      };

      document.getElementById('stat-events-total').textContent = stats.total;
      document.getElementById('stat-events-upcoming').textContent = stats.upcoming;
      document.getElementById('stat-events-confirmed').textContent = stats.confirmed;
      document.getElementById('stat-events-completed').textContent = stats.completed;
    }

    function applyEventFilters() {
      const statusFilter = document.getElementById('filter-event-status').value;
      const searchFilter = document.getElementById('filter-event-search').value.toLowerCase();

      let filtered = allEvents;

      if (statusFilter) {
        filtered = filtered.filter(e => e.status === statusFilter);
      }

      if (searchFilter) {
        filtered = filtered.filter(e => {
          const searchText = `${e.eventName} ${e.clientName}`.toLowerCase();
          return searchText.includes(searchFilter);
        });
      }

      renderEvents(filtered);
    }

    function clearEventFilters() {
      document.getElementById('filter-event-status').value = '';
      document.getElementById('filter-event-search').value = '';
      renderEvents();
    }

    function sortEventTable(column, th) {
      if (currentEventSort.column === column) {
        currentEventSort.direction = currentEventSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentEventSort.column = column;
        currentEventSort.direction = 'asc';
      }

      document.querySelectorAll('#events-tab th').forEach(th => th.classList.remove('sorted'));
      th?.classList.add('sorted');

      renderEvents();
    }

    function renderEvents(events = allEvents) {
      const tbody = document.getElementById('events-body');
      
      if (events.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">
              <div class="empty-state-icon">🎉</div>
              <div>No events found</div>
            </td>
          </tr>
        `;
        return;
      }

      const sorted = [...events].sort((a, b) => {
        let aVal = a[currentEventSort.column];
        let bVal = b[currentEventSort.column];

        if (currentEventSort.column === 'eventDate') {
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        }

        if (aVal < bVal) return currentEventSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentEventSort.direction === 'asc' ? 1 : -1;
        return 0;
      });

      tbody.innerHTML = sorted.map(event => `
        <tr>
          <td><strong>${escapeHtml(event.eventName)}</strong></td>
          <td>${formatDateOnly(event.eventDate)}</td>
          <td>${escapeHtml(event.clientName)}</td>
          <td>
            <span class="status-pill status-${escapeHtml(event.status)}">
              ${escapeHtml(event.status)}
            </span>
          </td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn-action btn-shortlist" data-action="update-event-status" data-event-id="${event.id}" data-status="CONFIRMED">
                Confirm
              </button>
              <button type="button" class="btn-action btn-hire" data-action="update-event-status" data-event-id="${event.id}" data-status="COMPLETED">
                Complete
              </button>
              <button type="button" class="btn-action btn-reject" data-action="update-event-status" data-event-id="${event.id}" data-status="CANCELLED">
                Cancel
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    async function updateEventStatus(eventId, status) {
      if (status === 'CANCELLED' && !confirm('Cancel this event?')) return;
      if (status === 'COMPLETED' && !confirm('Mark as completed?')) return;

      try {
        await fetchJSON(`/api/v1/events/${eventId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        
        notify(`Event status updated to ${status}`, 'success');
        await loadEvents();
      } catch (e) {
        notify('Failed to update event: ' + e.message, 'error');
      }
    }

    // Logout
    document.getElementById('logout').addEventListener('click', () => AdminCore.logout());

    // Initialize
    async function init() {
      try {
        const session = await AdminCore.checkAuth();
        if (!session) return;

        const adminNameEl = document.getElementById('admin-name');
        if (adminNameEl) adminNameEl.textContent = session.username;
        
        // Load applications (always available)
        await loadApplications();
        
        // Load contacts (optional - will show empty if not available)
        try {
          await loadContacts();
        } catch (e) {
          console.log('Contacts endpoint not available yet:', e);
          document.getElementById('contacts-body').innerHTML = `
            <tr>
              <td colspan="6" class="empty-state">
                <div class="empty-state-icon">📧</div>
                <div>Contacts endpoint not set up yet</div>
              </td>
            </tr>
          `;
        }
        
        // Load events (optional - hide tab if endpoint not available)
        try {
          await loadEvents();
        } catch (e) {
          console.log('Events endpoint not available yet:', e);
          document.getElementById('events-body').innerHTML = `
            <tr>
              <td colspan="5" class="empty-state">
                <div class="empty-state-icon">🎉</div>
                <div>Events endpoint not set up yet</div>
              </td>
            </tr>
          `;
          const eventsTab = document.querySelector('.tab[data-tab="events"]');
          const eventsPanel = document.getElementById('events-tab');
          if (eventsTab) eventsTab.style.display = 'none';
          if (eventsPanel) eventsPanel.style.display = 'none';
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          document.querySelector('.tab[data-tab="applications"]')?.classList.add('active');
          document.getElementById('applications-tab')?.classList.add('active');
        }
        
        notify('Dashboard loaded successfully', 'success');
      } catch (e) {
        notify('Failed to load dashboard: ' + e.message, 'error');
      }
    }

    window.addEventListener('load', init);
