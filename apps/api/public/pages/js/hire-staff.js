(function () {
  'use strict';

  const grid = document.getElementById('staff-grid');
  const status = document.getElementById('staff-status');
  const searchInput = document.getElementById('staff-search');
  const tierSelect = document.getElementById('staff-tier');
  const refreshButton = document.getElementById('staff-refresh');

  if (!grid || !status || !searchInput || !tierSelect || !refreshButton) return;

  let searchTimer = null;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tierBadge(tier) {
    const safeTier = tier === 'ELITE' ? 'elite' : 'standard';
    const label = tier === 'ELITE' ? 'Elite' : 'Standard';
    return '<span class="staff-tier-badge ' + safeTier + '">' + label + '</span>';
  }

  function renderStaff(staff) {
    if (!staff.length) {
      grid.hidden = true;
      grid.innerHTML = '';
      status.textContent = 'No staff matched this search. Try a different keyword or view all staff.';
      return;
    }

    grid.hidden = false;
    status.textContent = 'Showing ' + staff.length + ' live marketplace profiles.';
    grid.innerHTML = staff.map((member) => {
      const highlights = member.highlights
        ? '<p class="staff-highlights">' + escapeHtml(member.highlights) + '</p>'
        : '<p class="staff-highlights">Highlights added case by case by VERGO.</p>';
      const bio = member.bio
        ? '<p class="staff-copy">' + escapeHtml(member.bio) + '</p>'
        : '<p class="staff-copy">Profile details available on request.</p>';
      const rating = member.rating != null
        ? 'Rating ' + Number(member.rating).toFixed(1) + ' from ' + Number(member.reviewCount || 0) + ' reviews'
        : 'Fresh profile or ratings pending';
      const visibilityNote = member.tier === 'ELITE'
        ? 'Visible to all clients. Premium booking access only.'
        : 'Available to Standard and Premium clients.';

      return ''
        + '<article class="staff-card">'
        + '<div class="staff-card-head">'
        + '<h3>' + escapeHtml(member.name || 'VERGO Staff') + '</h3>'
        + tierBadge(member.tier)
        + '</div>'
        + '<p class="staff-rating">' + escapeHtml(rating) + '</p>'
        + highlights
        + bio
        + '<div class="staff-card-footer">'
        + '<span class="staff-visibility-note">' + escapeHtml(visibilityNote) + '</span>'
        + '<a href="/pricing.html" class="cta-button secondary">View pricing</a>'
        + '</div>'
        + '</article>';
    }).join('');
  }

  async function loadStaff() {
    const params = new URLSearchParams({ page: '1', limit: '9' });
    const search = searchInput.value.trim();
    const tier = tierSelect.value;

    if (search) params.set('search', search);
    if (tier) params.set('tier', tier);

    status.textContent = 'Loading roster...';
    grid.hidden = true;

    try {
      const response = await fetch('/api/v1/marketplace/staff?' + params.toString(), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const payload = await response.json();
      const staff = payload && payload.data && Array.isArray(payload.data.staff)
        ? payload.data.staff
        : [];

      renderStaff(staff);
    } catch (error) {
      grid.hidden = true;
      grid.innerHTML = '';
      status.textContent = 'Unable to load the live roster right now. Please try again or contact VERGO directly.';
      console.error('[hire-staff] failed to load roster', error);
    }
  }

  function scheduleReload() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(loadStaff, 250);
  }

  searchInput.addEventListener('input', scheduleReload);
  tierSelect.addEventListener('change', loadStaff);
  refreshButton.addEventListener('click', loadStaff);

  loadStaff();
})();
