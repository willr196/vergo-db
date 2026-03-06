(function () {
  'use strict';

  const get = AdminCore.fetchJSON;
  const esc = AdminCore.escapeHtml;
  const toast = (message, type) => AdminCore.toast(message, type || 'info');

  let activeTab = 'staff';

  let staffRows = [];
  let staffPage = 1;
  let staffPages = 1;
  let staffLoaded = false;

  let pricingRows = [];
  let planRows = [];
  let pricingOriginal = new Map();
  let planOriginal = new Map();
  let pricingLoaded = false;

  let subscriptionRows = [];
  let subscriptionPage = 1;
  let subscriptionPages = 1;
  let subscriptionsLoaded = false;

  function formatDate(value) {
    if (!value) return '-';
    if (AdminCore.formatDateTime) return AdminCore.formatDateTime(value);
    return AdminCore.formatDate(value);
  }

  function money(value) {
    if (value == null || value === '') return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return '£' + num.toFixed(2);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function tierBadge(tier) {
    if (!tier) return '<span class="badge tier-null">UNASSIGNED</span>';
    return '<span class="badge tier-' + esc(tier) + '">' + esc(tier) + '</span>';
  }

  function boolBadge(value) {
    if (value) return '<span class="badge badge-CONFIRMED">YES</span>';
    return '<span class="badge badge-CANCELLED">NO</span>';
  }

  function switchTab(tab) {
    activeTab = tab;

    document.querySelectorAll('#marketplace-tabs .as-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach((panel) => {
      panel.classList.toggle('active', panel.id === tab + '-tab');
    });

    if (tab === 'staff' && !staffLoaded) {
      loadStaff(1);
    } else if (tab === 'pricing' && !pricingLoaded) {
      loadPricingData();
    } else if (tab === 'subscriptions' && !subscriptionsLoaded) {
      loadSubscriptions(1);
    }
  }

  function staffFilterParams(page) {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    const tier = document.getElementById('filter-staff-tier').value;
    const available = document.getElementById('filter-staff-availability').value;
    const search = document.getElementById('filter-staff-search').value.trim();

    if (tier) params.set('tier', tier);
    if (available) params.set('available', available);
    if (search) params.set('search', search);
    return params;
  }

  async function loadStaff(page) {
    staffPage = page || 1;
    const tbody = document.getElementById('staff-table');
    tbody.innerHTML = '<tr><td colspan="8" class="loading"><div class="as-skeleton" style="margin:auto;max-width:220px"></div></td></tr>';

    try {
      const params = staffFilterParams(staffPage);
      const data = await get('/api/v1/admin/marketplace/staff?' + params.toString());
      const list = data.staff || [];
      const stats = data.stats || {};
      const pagination = data.pagination || {};

      staffRows = list;
      staffPages = pagination.totalPages || pagination.pages || 1;
      staffLoaded = true;

      renderStaffStats(stats);
      renderStaffTable();
      renderStaffPagination();

      setText('staff-count', (pagination.total || 0) + ' staff member' + ((pagination.total || 0) === 1 ? '' : 's'));
    } catch (err) {
      console.error('[ADMIN] Failed to load marketplace staff', err);
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load staff</td></tr>';
      toast('Failed to load staff: ' + err.message, 'error');
    }
  }

  function renderStaffStats(stats) {
    setText('stat-staff-total', stats.totalMarketplace ?? 0);
    setText('stat-staff-standard', stats.standardCount ?? 0);
    setText('stat-staff-elite', stats.eliteCount ?? 0);
    setText('stat-staff-unassigned', stats.unassignedCount ?? 0);
  }

  function renderStaffTable() {
    const tbody = document.getElementById('staff-table');

    if (!staffRows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No staff found for this filter</td></tr>';
      return;
    }

    tbody.innerHTML = staffRows.map((staff) => {
      const fullName = (staff.firstName || '') + ' ' + (staff.lastName || '');
      const rating = staff.staffRating != null ? Number(staff.staffRating).toFixed(1) : '-';
      const reviews = staff.staffReviewCount != null ? staff.staffReviewCount : 0;
      const highlights = staff.staffHighlights
        ? '<span class="feature-text" title="' + esc(staff.staffHighlights) + '">' + esc(staff.staffHighlights) + '</span>'
        : '<span class="text-muted">-</span>';

      const actions = [];
      if (staff.staffTier !== 'STANDARD') {
        actions.push('<button class="btn btn-ghost btn-sm" data-action="set-tier" data-id="' + esc(staff.id) + '" data-tier="STANDARD">Set Standard</button>');
      }
      if (staff.staffTier !== 'ELITE') {
        actions.push('<button class="btn btn-warning btn-sm" data-action="set-tier" data-id="' + esc(staff.id) + '" data-tier="ELITE">Set Elite</button>');
      }
      actions.push('<button class="btn btn-secondary btn-sm" data-action="toggle-available" data-id="' + esc(staff.id) + '">' + (staff.staffAvailable ? 'Set Unavailable' : 'Set Available') + '</button>');
      actions.push('<button class="btn btn-info btn-sm" data-action="open-staff-edit" data-id="' + esc(staff.id) + '">Edit</button>');

      return '<tr>'
        + '<td><strong>' + esc(fullName.trim()) + '</strong></td>'
        + '<td class="fs-sm">' + esc(staff.email || '-') + '</td>'
        + '<td>' + tierBadge(staff.staffTier) + '</td>'
        + '<td>' + boolBadge(Boolean(staff.staffAvailable)) + '</td>'
        + '<td>' + esc(rating) + '</td>'
        + '<td>' + esc(String(reviews)) + '</td>'
        + '<td>' + highlights + '</td>'
        + '<td><div class="table-actions">' + actions.join('') + '</div></td>'
        + '</tr>';
    }).join('');
  }

  function renderStaffPagination() {
    const el = document.getElementById('staff-pagination');
    if (!el) return;

    el.innerHTML = ''
      + '<span class="as-pagination-info">Page ' + staffPage + ' of ' + (staffPages || 1) + '</span>'
      + '<div class="as-pagination-controls">'
      + '<button data-action="staff-page" data-page="' + (staffPage - 1) + '" ' + (staffPage <= 1 ? 'disabled' : '') + '>Prev</button>'
      + '<button data-action="staff-page" data-page="' + (staffPage + 1) + '" ' + (staffPage >= staffPages ? 'disabled' : '') + '>Next</button>'
      + '</div>';
  }

  async function updateStaff(id, payload) {
    const body = {
      staffTier: payload.staffTier,
      staffAvailable: payload.staffAvailable,
      staffBio: payload.staffBio,
      staffHighlights: payload.staffHighlights,
    };

    console.log('[ADMIN] Updating staff marketplace profile', { id: id, payload: body });

    await get('/api/v1/admin/marketplace/staff/' + encodeURIComponent(id) + '/tier', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    toast('Staff profile updated', 'success');
    await loadStaff(staffPage);
  }

  async function quickSetTier(id, tier) {
    if (!confirm('Set staff tier to ' + tier + '?')) return;
    const current = staffRows.find((row) => row.id === id);
    if (!current) return;

    try {
      await updateStaff(id, {
        staffTier: tier,
        staffAvailable: current.staffAvailable,
        staffBio: current.staffBio,
        staffHighlights: current.staffHighlights,
      });
    } catch (err) {
      toast('Failed to update tier: ' + err.message, 'error');
    }
  }

  async function toggleAvailability(id) {
    const current = staffRows.find((row) => row.id === id);
    if (!current) return;

    const nextValue = !current.staffAvailable;
    if (!confirm('Set this staff member as ' + (nextValue ? 'available' : 'unavailable') + '?')) return;

    try {
      await updateStaff(id, {
        staffTier: current.staffTier,
        staffAvailable: nextValue,
        staffBio: current.staffBio,
        staffHighlights: current.staffHighlights,
      });
    } catch (err) {
      toast('Failed to toggle availability: ' + err.message, 'error');
    }
  }

  function openStaffEditModal(id) {
    const staff = staffRows.find((row) => row.id === id);
    if (!staff) return;

    document.getElementById('staff-form-id').value = staff.id;
    document.getElementById('staff-form-tier').value = staff.staffTier || '';
    document.getElementById('staff-form-available').checked = Boolean(staff.staffAvailable);
    document.getElementById('staff-form-bio').value = staff.staffBio || '';
    document.getElementById('staff-form-highlights').value = staff.staffHighlights || '';

    AdminCore.openModal('staff-modal');
  }

  function closeStaffEditModal() {
    AdminCore.closeModal('staff-modal');
  }

  async function submitStaffEditForm(event) {
    event.preventDefault();

    const id = document.getElementById('staff-form-id').value;
    if (!id) return;

    const tierValue = document.getElementById('staff-form-tier').value;
    const payload = {
      staffTier: tierValue || null,
      staffAvailable: document.getElementById('staff-form-available').checked,
      staffBio: document.getElementById('staff-form-bio').value.trim(),
      staffHighlights: document.getElementById('staff-form-highlights').value.trim(),
    };

    try {
      await updateStaff(id, payload);
      closeStaffEditModal();
    } catch (err) {
      toast('Failed to save staff profile: ' + err.message, 'error');
    }
  }

  function normalizePricing(row) {
    return {
      hourlyRate: Number(row.hourlyRate || 0),
      staffPayRate: row.staffPayRate == null ? null : Number(row.staffPayRate),
      isBookable: Boolean(row.isBookable),
    };
  }

  function normalizePlan(row) {
    return {
      weeklyPrice: Number(row.weeklyPrice || 0),
      monthlyPrice: row.monthlyPrice == null ? null : Number(row.monthlyPrice),
      annualPrice: row.annualPrice == null ? null : Number(row.annualPrice),
      features: row.features || '',
      isActive: Boolean(row.isActive),
    };
  }

  async function loadPricingData() {
    const pricingContainer = document.getElementById('pricing-cards');
    const planContainer = document.getElementById('plan-cards');

    pricingContainer.innerHTML = '<div class="market-card text-muted">Loading pricing...</div>';
    planContainer.innerHTML = '<div class="market-card text-muted">Loading plans...</div>';

    try {
      const data = await get('/api/v1/admin/marketplace/pricing');
      pricingRows = data.pricingTiers || [];
      planRows = data.subscriptionPlans || [];

      pricingOriginal = new Map(pricingRows.map((row) => [row.id, normalizePricing(row)]));
      planOriginal = new Map(planRows.map((row) => [row.id, normalizePlan(row)]));

      pricingLoaded = true;
      renderPricingCards();
      renderPlanCards();
    } catch (err) {
      console.error('[ADMIN] Failed to load pricing data', err);
      pricingContainer.innerHTML = '<div class="market-card">Failed to load pricing data</div>';
      planContainer.innerHTML = '<div class="market-card">Failed to load plan data</div>';
      toast('Failed to load pricing data: ' + err.message, 'error');
    }
  }

  function renderPricingCards() {
    const container = document.getElementById('pricing-cards');

    if (!pricingRows.length) {
      container.innerHTML = '<div class="market-card">No pricing rows found</div>';
      return;
    }

    container.innerHTML = pricingRows.map((row) => {
      const payValue = row.staffPayRate == null ? '' : String(row.staffPayRate);
      return '<div class="market-card" data-pricing-id="' + esc(row.id) + '">'
        + '<h3>' + esc(row.clientTier) + ' × ' + esc(row.staffTier) + '</h3>'
        + '<div class="market-meta">Bookable: ' + (row.isBookable ? 'Yes' : 'No') + '</div>'
        + '<div class="form-group">'
        + '<label class="as-label">Hourly Rate (£)</label>'
        + '<input type="number" min="0" step="0.01" class="as-input pricing-hourly" value="' + esc(String(row.hourlyRate)) + '">'
        + '</div>'
        + '<div class="form-group mt-1">'
        + '<label class="as-label">Staff Pay Rate (£)</label>'
        + '<input type="number" min="0" step="0.01" class="as-input pricing-pay" value="' + esc(payValue) + '">'
        + '</div>'
        + '<div class="switch-row">'
        + '<label>Bookable</label>'
        + '<input type="checkbox" class="pricing-bookable" ' + (row.isBookable ? 'checked' : '') + '>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function renderPlanCards() {
    const container = document.getElementById('plan-cards');

    if (!planRows.length) {
      container.innerHTML = '<div class="market-card">No subscription plans found</div>';
      return;
    }

    container.innerHTML = planRows.map((plan) => {
      const monthly = plan.monthlyPrice == null ? '' : String(plan.monthlyPrice);
      const annual = plan.annualPrice == null ? '' : String(plan.annualPrice);
      return '<div class="market-card" data-plan-id="' + esc(plan.id) + '">'
        + '<h3>' + esc(plan.name) + ' (' + esc(plan.tier) + ')</h3>'
        + '<div class="form-group">'
        + '<label class="as-label">Weekly (£)</label>'
        + '<input type="number" min="0" step="0.01" class="as-input plan-weekly" value="' + esc(String(plan.weeklyPrice)) + '">'
        + '</div>'
        + '<div class="form-row mt-1">'
        + '<div class="form-group">'
        + '<label class="as-label">Monthly (£)</label>'
        + '<input type="number" min="0" step="0.01" class="as-input plan-monthly" value="' + esc(monthly) + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="as-label">Annual (£)</label>'
        + '<input type="number" min="0" step="0.01" class="as-input plan-annual" value="' + esc(annual) + '">'
        + '</div>'
        + '</div>'
        + '<div class="form-group mt-1">'
        + '<label class="as-label">Features</label>'
        + '<textarea class="plan-features" rows="4" maxlength="2000">' + esc(plan.features || '') + '</textarea>'
        + '</div>'
        + '<div class="switch-row">'
        + '<label>Plan Active</label>'
        + '<input type="checkbox" class="plan-active" ' + (plan.isActive ? 'checked' : '') + '>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function readNumberInput(input, name) {
    const raw = input.value.trim();
    if (!raw) return null;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error(name + ' must be a valid positive number');
    }
    return num;
  }

  function sameNumber(a, b) {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  }

  async function savePricing() {
    const cards = Array.from(document.querySelectorAll('#pricing-cards .market-card[data-pricing-id]'));
    const changes = [];

    try {
      cards.forEach((card) => {
        const id = card.dataset.pricingId;
        const original = pricingOriginal.get(id);
        if (!original) return;

        const hourlyRate = readNumberInput(card.querySelector('.pricing-hourly'), 'Hourly rate');
        if (hourlyRate == null || hourlyRate <= 0) {
          throw new Error('Hourly rate is required and must be greater than 0');
        }

        const payInput = card.querySelector('.pricing-pay');
        const payRead = readNumberInput(payInput, 'Staff pay rate');
        const staffPayRate = payRead == null ? original.staffPayRate : payRead;
        const isBookable = card.querySelector('.pricing-bookable').checked;

        const changed = !sameNumber(hourlyRate, original.hourlyRate)
          || !sameNumber(staffPayRate, original.staffPayRate)
          || isBookable !== original.isBookable;

        if (changed) {
          changes.push({
            id: id,
            body: {
              hourlyRate: hourlyRate,
              staffPayRate: staffPayRate == null ? undefined : staffPayRate,
              isBookable: isBookable,
            },
          });
        }
      });

      if (!changes.length) {
        toast('No pricing changes to save', 'info');
        return;
      }

      for (const change of changes) {
        console.log('[ADMIN] Saving pricing row', change.id, change.body);
        await get('/api/v1/admin/marketplace/pricing/' + encodeURIComponent(change.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(change.body),
        });
      }

      toast('Saved ' + changes.length + ' pricing update(s)', 'success');
      await loadPricingData();
    } catch (err) {
      toast('Failed to save pricing: ' + err.message, 'error');
    }
  }

  async function savePlans() {
    const cards = Array.from(document.querySelectorAll('#plan-cards .market-card[data-plan-id]'));
    const changes = [];

    try {
      cards.forEach((card) => {
        const id = card.dataset.planId;
        const original = planOriginal.get(id);
        if (!original) return;

        const weeklyValue = readNumberInput(card.querySelector('.plan-weekly'), 'Weekly price');
        if (weeklyValue == null) {
          throw new Error('Weekly price is required');
        }

        const monthlyInput = card.querySelector('.plan-monthly');
        const annualInput = card.querySelector('.plan-annual');
        const featuresInput = card.querySelector('.plan-features');
        const activeInput = card.querySelector('.plan-active');

        const monthlyValue = readNumberInput(monthlyInput, 'Monthly price');
        const annualValue = readNumberInput(annualInput, 'Annual price');

        const monthlyFinal = monthlyValue == null ? original.monthlyPrice : monthlyValue;
        const annualFinal = annualValue == null ? original.annualPrice : annualValue;

        const next = {
          weeklyPrice: weeklyValue,
          monthlyPrice: monthlyFinal,
          annualPrice: annualFinal,
          features: featuresInput.value,
          isActive: activeInput.checked,
        };

        const changed = !sameNumber(next.weeklyPrice, original.weeklyPrice)
          || !sameNumber(next.monthlyPrice, original.monthlyPrice)
          || !sameNumber(next.annualPrice, original.annualPrice)
          || next.features !== original.features
          || next.isActive !== original.isActive;

        if (changed) {
          const body = {
            weeklyPrice: next.weeklyPrice,
            features: next.features,
            isActive: next.isActive,
          };
          if (next.monthlyPrice != null) body.monthlyPrice = next.monthlyPrice;
          if (next.annualPrice != null) body.annualPrice = next.annualPrice;
          changes.push({ id: id, body: body });
        }
      });

      if (!changes.length) {
        toast('No plan changes to save', 'info');
        return;
      }

      for (const change of changes) {
        console.log('[ADMIN] Saving plan', change.id, change.body);
        await get('/api/v1/admin/marketplace/plans/' + encodeURIComponent(change.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(change.body),
        });
      }

      toast('Saved ' + changes.length + ' plan update(s)', 'success');
      await loadPricingData();
    } catch (err) {
      toast('Failed to save plans: ' + err.message, 'error');
    }
  }

  function subscriptionFilterParams(page) {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    const tier = document.getElementById('filter-sub-tier').value;
    const subStatus = document.getElementById('filter-sub-status').value;
    const search = document.getElementById('filter-sub-search').value.trim();

    if (tier) params.set('subscriptionTier', tier);
    if (subStatus) params.set('subscriptionStatus', subStatus);
    if (search) params.set('search', search);
    return params;
  }

  async function loadSubscriptions(page) {
    subscriptionPage = page || 1;

    const tbody = document.getElementById('subs-table');
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><div class="as-skeleton" style="margin:auto;max-width:220px"></div></td></tr>';

    try {
      const params = subscriptionFilterParams(subscriptionPage);
      const data = await get('/api/v1/admin/clients?' + params.toString());

      subscriptionRows = data.clients || [];
      const pagination = data.pagination || {};
      subscriptionPages = pagination.totalPages || pagination.pages || 1;
      subscriptionsLoaded = true;

      renderSubscriptionsTable();
      renderSubscriptionsPagination();

      setText('sub-count', (pagination.total || 0) + ' client' + ((pagination.total || 0) === 1 ? '' : 's'));
    } catch (err) {
      console.error('[ADMIN] Failed to load subscription clients', err);
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load clients</td></tr>';
      toast('Failed to load client subscriptions: ' + err.message, 'error');
    }
  }

  function renderSubscriptionsTable() {
    const tbody = document.getElementById('subs-table');

    if (!subscriptionRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No clients found</td></tr>';
      return;
    }

    tbody.innerHTML = subscriptionRows.map((client) => {
      const actions = [];
      if (client.subscriptionTier !== 'PREMIUM') {
        actions.push('<button class="btn btn-success btn-sm" data-action="upgrade-client" data-id="' + esc(client.id) + '">Grant Premium Pilot</button>');
      }
      if (client.subscriptionTier !== 'STANDARD') {
        actions.push('<button class="btn btn-warning btn-sm" data-action="downgrade-client" data-id="' + esc(client.id) + '">Return to Standard</button>');
      }
      if (!actions.length) {
        actions.push('<span class="text-muted fs-sm">No actions</span>');
      }

      const tierClass = client.subscriptionTier ? 'tier-' + esc(client.subscriptionTier) : 'tier-null';
      const subStatus = client.subscriptionStatus || 'UNKNOWN';
      const subStatusClass = 'badge-' + subStatus.replace(/[^A-Z_]/g, '');

      return '<tr>'
        + '<td><strong>' + esc(client.companyName || '-') + '</strong></td>'
        + '<td>' + esc(client.contactName || '-') + '</td>'
        + '<td><span class="badge ' + tierClass + '">' + esc(client.subscriptionTier || 'STANDARD') + '</span></td>'
        + '<td><span class="badge ' + esc(subStatusClass) + '">' + esc(subStatus) + '</span></td>'
        + '<td class="fs-sm">' + esc(formatDate(client.subscriptionStartedAt)) + '</td>'
        + '<td class="fs-sm">' + esc(formatDate(client.subscriptionExpiresAt)) + '</td>'
        + '<td><div class="table-actions">' + actions.join('') + '</div></td>'
        + '</tr>';
    }).join('');
  }

  function renderSubscriptionsPagination() {
    const el = document.getElementById('subs-pagination');
    if (!el) return;

    el.innerHTML = ''
      + '<span class="as-pagination-info">Page ' + subscriptionPage + ' of ' + (subscriptionPages || 1) + '</span>'
      + '<div class="as-pagination-controls">'
      + '<button data-action="subs-page" data-page="' + (subscriptionPage - 1) + '" ' + (subscriptionPage <= 1 ? 'disabled' : '') + '>Prev</button>'
      + '<button data-action="subs-page" data-page="' + (subscriptionPage + 1) + '" ' + (subscriptionPage >= subscriptionPages ? 'disabled' : '') + '>Next</button>'
      + '</div>';
  }

  async function updateClientSubscription(clientId, nextTier) {
    const confirmMsg = nextTier === 'PREMIUM'
      ? 'Grant this client Premium pilot access? Billing and onboarding are still handled manually.'
      : 'Return this client to the Standard tier?';

    if (!confirm(confirmMsg)) return;

    try {
      console.log('[ADMIN] Updating client subscription', { clientId: clientId, subscriptionTier: nextTier });
      await get('/api/v1/admin/marketplace/clients/' + encodeURIComponent(clientId) + '/subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionTier: nextTier }),
      });

      toast('Client subscription updated', 'success');
      await loadSubscriptions(subscriptionPage);
    } catch (err) {
      toast('Failed to update subscription: ' + err.message, 'error');
    }
  }

  async function refreshCurrentTab() {
    if (activeTab === 'staff') return loadStaff(staffPage);
    if (activeTab === 'pricing') return loadPricingData();
    return loadSubscriptions(subscriptionPage);
  }

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;
    const id = el.dataset.id;

    if (action === 'switch-tab') return switchTab(el.dataset.tab);
    if (action === 'refresh-current') return refreshCurrentTab();

    if (action === 'apply-staff-filters') return loadStaff(1);
    if (action === 'clear-staff-filters') {
      document.getElementById('filter-staff-tier').value = '';
      document.getElementById('filter-staff-availability').value = '';
      document.getElementById('filter-staff-search').value = '';
      return loadStaff(1);
    }
    if (action === 'staff-page') {
      const page = Number(el.dataset.page || '1');
      if (Number.isFinite(page) && page >= 1 && page <= staffPages) return loadStaff(page);
      return;
    }
    if (action === 'set-tier') return quickSetTier(id, el.dataset.tier);
    if (action === 'toggle-available') return toggleAvailability(id);
    if (action === 'open-staff-edit') return openStaffEditModal(id);
    if (action === 'close-staff-modal') return closeStaffEditModal();

    if (action === 'save-pricing') return savePricing();
    if (action === 'save-plans') return savePlans();

    if (action === 'apply-sub-filters') return loadSubscriptions(1);
    if (action === 'clear-sub-filters') {
      document.getElementById('filter-sub-tier').value = '';
      document.getElementById('filter-sub-status').value = '';
      document.getElementById('filter-sub-search').value = '';
      return loadSubscriptions(1);
    }
    if (action === 'subs-page') {
      const page = Number(el.dataset.page || '1');
      if (Number.isFinite(page) && page >= 1 && page <= subscriptionPages) return loadSubscriptions(page);
      return;
    }
    if (action === 'upgrade-client') return updateClientSubscription(id, 'PREMIUM');
    if (action === 'downgrade-client') return updateClientSubscription(id, 'STANDARD');
  });

  document.getElementById('staff-form').addEventListener('submit', submitStaffEditForm);

  document.getElementById('filter-staff-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadStaff(1);
    }
  });

  document.getElementById('filter-sub-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadSubscriptions(1);
    }
  });

  (async function init() {
    const session = await AdminCore.checkAuth();
    if (!session) return;

    AdminCore.initModalBehavior('staff-modal');
    switchTab('staff');
  })();
})();
