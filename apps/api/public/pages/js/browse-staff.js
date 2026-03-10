(function () {
  'use strict';

  const grid = document.getElementById('staff-grid');
  const emptyState = document.getElementById('staff-empty');
  const status = document.getElementById('results-status');
  const liveRegion = document.getElementById('results-live-region');
  const loadMoreButton = document.getElementById('load-more-button');
  const roleSelect = document.getElementById('staff-role-filter');
  const searchInput = document.getElementById('staff-search-input');
  const tabButtons = Array.from(document.querySelectorAll('[data-tier]'));
  const modal = document.getElementById('profile-modal');
  const modalBody = document.getElementById('profile-modal-body');
  const closeButton = document.getElementById('profile-close-button');

  if (!grid || !emptyState || !status || !liveRegion || !loadMoreButton || !roleSelect || !searchInput || !modal || !modalBody || !closeButton) {
    return;
  }

  const state = {
    tier: '',
    role: '',
    search: '',
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 1,
    items: [],
    loading: false,
    loadingMode: 'replace',
    profileCache: new Map(),
  };

  let searchTimer = null;

  function setStatus(message, announce) {
    status.textContent = message;

    if (announce !== false) {
      liveRegion.textContent = message;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.00$/, '');
  }

  function truncateText(value, maxLength) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return normalized.slice(0, maxLength).trimEnd() + '...';
  }

  function normaliseRole(value) {
    return String(value || '').trim().toLowerCase();
  }

  function roleIncludes(roles, token) {
    return roles.some((role) => normaliseRole(role).includes(token));
  }

  function getGoldRateLabel(roles) {
    if (roleIncludes(roles, 'chef')) return '&pound;26/hr + VAT';
    if (roleIncludes(roles, 'supervisor')) return '&pound;22/hr + VAT';
    return '&pound;20/hr + VAT';
  }

  function getRateLabel(member) {
    const roles = Array.isArray(member.roles) ? member.roles : [];

    if (member.staffTier === 'GOLD') {
      return getGoldRateLabel(roles);
    }

    if (member.hourlyRate != null) {
      return 'From &pound;' + escapeHtml(formatCurrency(member.hourlyRate) || String(member.hourlyRate)) + '/hr + margin + VAT';
    }

    return 'Rate on request';
  }

  function renderRolePills(roles, maxVisible) {
    const visible = roles.slice(0, maxVisible);
    const overflow = roles.length - visible.length;

    return ''
      + visible.map((role) => '<span class="role-pill">' + escapeHtml(role) + '</span>').join('')
      + (overflow > 0 ? '<span class="role-pill more">+' + overflow + ' more</span>' : '');
  }

  function renderRating(member) {
    const rating = Number(member.averageRating);
    if (!Number.isFinite(rating) || rating <= 0) {
      return '<span class="rating-new">New</span>';
    }

    const rounded = Math.max(1, Math.min(5, Math.round(rating)));
    const stars = '★★★★★'.slice(0, rounded) + '☆☆☆☆☆'.slice(0, 5 - rounded);

    return ''
      + '<span class="rating-stars" aria-label="Rated ' + escapeHtml(rating.toFixed(1)) + ' out of 5">' + stars + '</span>'
      + '<span class="rating-score">' + escapeHtml(rating.toFixed(1)) + '</span>';
  }

  function renderCard(member) {
    const firstInitial = String(member.firstName || '').charAt(0).toUpperCase();
    const lastInitial = String(member.lastInitial || '').charAt(0).toUpperCase();
    const initials = (firstInitial + lastInitial) || 'V';
    const roles = Array.isArray(member.roles) ? member.roles : [];
    const bio = truncateText(member.bio, 100) || 'Profile details available on request.';
    const yearsExperience = member.yearsExperience != null
      ? member.yearsExperience + ' year' + (Number(member.yearsExperience) === 1 ? '' : 's') + ' experience'
      : 'Experience not listed yet';
    const bookings = Number(member.totalBookings || 0);
    const bookingsLabel = bookings + ' completed booking' + (bookings === 1 ? '' : 's');

    return ''
      + '<article class="market-staff-card tier-' + escapeHtml((member.staffTier || 'STANDARD').toLowerCase()) + '">'
      + '<div class="staff-card-header">'
      + '<div class="staff-initials ' + escapeHtml((member.staffTier || 'STANDARD').toLowerCase()) + '">' + escapeHtml(initials) + '</div>'
      + '<div class="staff-card-heading">'
      + '<div class="staff-name-row">'
      + '<h3 class="staff-name">' + escapeHtml(member.firstName || 'VERGO') + ' ' + escapeHtml(lastInitial ? lastInitial + '.' : '') + '</h3>'
      + (member.staffTier === 'GOLD'
        ? '<span class="market-tier-badge gold"><span aria-hidden="true">&#9733;</span> Gold</span>'
        : '<span class="market-tier-badge standard">Standard</span>')
      + '</div>'
      + '<div class="role-pills">' + renderRolePills(roles, 3) + '</div>'
      + '</div>'
      + '</div>'
      + '<p class="staff-bio">' + escapeHtml(bio) + '</p>'
      + '<div class="staff-stats">'
      + '<p class="staff-muted-line">' + escapeHtml(yearsExperience) + '</p>'
      + '<div class="staff-rating-row">' + renderRating(member) + '</div>'
      + '<p class="staff-muted-line">' + escapeHtml(bookingsLabel) + '</p>'
      + '<p class="staff-rate">' + getRateLabel(member) + '</p>'
      + '</div>'
      + '<button class="btn btn-secondary staff-action" type="button" data-profile-id="' + escapeHtml(member.id) + '">View Profile</button>'
      + '</article>';
  }

  function renderSkeletons(count) {
    emptyState.hidden = true;
    grid.innerHTML = Array.from({ length: count }).map(() => {
      return ''
        + '<article class="market-staff-card skeleton-card">'
        + '<div class="skeleton-card-header">'
        + '<div class="skeleton-block skeleton-avatar"></div>'
        + '<div class="skeleton-heading">'
        + '<div class="skeleton-block skeleton-title"></div>'
        + '<div class="skeleton-block skeleton-pill"></div>'
        + '</div>'
        + '</div>'
        + '<div class="skeleton-roles">'
        + '<div class="skeleton-block skeleton-role"></div>'
        + '<div class="skeleton-block skeleton-role"></div>'
        + '<div class="skeleton-block skeleton-role"></div>'
        + '</div>'
        + '<div class="skeleton-block skeleton-line"></div>'
        + '<div class="skeleton-block skeleton-line medium"></div>'
        + '<div class="skeleton-block skeleton-line short"></div>'
        + '<div class="skeleton-block skeleton-line medium"></div>'
        + '<div class="skeleton-block skeleton-line short"></div>'
        + '</article>';
    }).join('');
  }

  function renderList() {
    if (!state.items.length) {
      grid.innerHTML = '';
      emptyState.hidden = false;
      setStatus('No staff found matching your filters');
      loadMoreButton.hidden = true;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = 'Load more';
      return;
    }

    emptyState.hidden = true;
    grid.innerHTML = state.items.map(renderCard).join('');

    const showing = state.items.length;
    setStatus('Showing ' + showing + ' of ' + state.total + ' visible staff', false);
    loadMoreButton.hidden = state.page >= state.totalPages;
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = 'Load more';
  }

  function updateQueryString() {
    const params = new URLSearchParams(window.location.search);

    if (state.tier) params.set('tier', state.tier);
    else params.delete('tier');

    if (state.role) params.set('role', state.role);
    else params.delete('role');

    if (state.search) params.set('search', state.search);
    else params.delete('search');

    params.delete('page');

    const query = params.toString();
    const nextUrl = window.location.pathname + (query ? '?' + query : '');
    window.history.replaceState({}, '', nextUrl);
  }

  function syncControls() {
    tabButtons.forEach((button) => {
      const tier = button.getAttribute('data-tier') || '';
      const isActive = tier === state.tier;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    roleSelect.value = state.role;
    searchInput.value = state.search;
  }

  async function fetchStaff(append) {
    if (state.loading) return;

    state.loading = true;
    state.loadingMode = append ? 'append' : 'replace';

    if (!append) {
      state.page = 1;
      state.items = [];
      setStatus('Loading staff profiles...');
      loadMoreButton.hidden = true;
      renderSkeletons(6);
    } else {
      loadMoreButton.disabled = true;
      loadMoreButton.textContent = 'Loading...';
    }

    updateQueryString();

    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
    });

    if (state.tier) params.set('tier', state.tier);
    if (state.role) params.set('role', state.role);
    if (state.search) params.set('search', state.search);

    try {
      const response = await fetch('/api/v1/staff/browse?' + params.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const payload = await response.json();
      const data = payload && payload.data ? payload.data : {};
      const staff = Array.isArray(data.staff) ? data.staff : [];
      const pagination = data.pagination || {};

      state.items = append ? state.items.concat(staff) : staff;
      state.total = Number(pagination.total || state.items.length);
      state.totalPages = Math.max(1, Number(pagination.totalPages || 1));

      renderList();
    } catch (error) {
      if (append && state.items.length) {
        state.page = Math.max(1, state.page - 1);
        renderList();
        setStatus('Unable to load more staff right now');
      } else {
        grid.innerHTML = '';
        emptyState.hidden = false;
        setStatus('Unable to load staff right now');
        loadMoreButton.hidden = true;
      }
      console.error('[browse-staff] failed to load staff', error);
    } finally {
      state.loading = false;
      state.loadingMode = 'replace';
    }
  }

  function profileLoadingHtml() {
    return ''
      + '<div class="profile-loading">'
      + '<div class="profile-loading-bar"></div>'
      + '<div class="profile-loading-bar short"></div>'
      + '<div class="profile-loading-bar"></div>'
      + '<div class="profile-loading-bar"></div>'
      + '</div>';
  }

  function renderProfile(profile) {
    const roles = Array.isArray(profile.roles) ? profile.roles : [];
    const jobTypes = Array.isArray(profile.preferredJobTypes) ? profile.preferredJobTypes : [];
    const firstInitial = String(profile.firstName || '').charAt(0).toUpperCase();
    const lastInitial = String(profile.lastInitial || '').charAt(0).toUpperCase();
    const initials = (firstInitial + lastInitial) || 'V';
    const rating = Number(profile.averageRating);
    const yearsExperience = profile.yearsExperience != null
      ? profile.yearsExperience + ' year' + (Number(profile.yearsExperience) === 1 ? '' : 's')
      : 'Not listed';
    const bookings = Number(profile.totalBookings || 0);
    const ratingLabel = Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) + ' / 5' : 'New';
    const rateLabel = getRateLabel(profile);

    modalBody.innerHTML = ''
      + '<div class="profile-header">'
      + '<div class="staff-initials ' + escapeHtml((profile.staffTier || 'STANDARD').toLowerCase()) + '">' + escapeHtml(initials) + '</div>'
      + '<div class="profile-title-block">'
      + '<div class="staff-name-row">'
      + '<h2 id="profile-modal-title" class="profile-title">' + escapeHtml(profile.firstName || 'VERGO') + ' ' + escapeHtml(lastInitial ? lastInitial + '.' : '') + '</h2>'
      + (profile.staffTier === 'GOLD'
        ? '<span class="market-tier-badge gold"><span aria-hidden="true">&#9733;</span> Gold</span>'
        : '<span class="market-tier-badge standard">Standard</span>')
      + '</div>'
      + '<div class="profile-chip-list">' + roles.map((role) => '<span class="profile-chip">' + escapeHtml(role) + '</span>').join('') + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="profile-section">'
      + '<span class="profile-section-label">Bio</span>'
      + '<p class="profile-copy">' + escapeHtml(profile.bio || 'No bio provided yet.') + '</p>'
      + '</div>'
      + '<div class="profile-meta-grid">'
      + '<div class="profile-stat"><span class="profile-stat-label">Experience</span><strong>' + escapeHtml(yearsExperience) + '</strong></div>'
      + '<div class="profile-stat"><span class="profile-stat-label">Bookings</span><strong>' + bookings + '</strong></div>'
      + '<div class="profile-stat"><span class="profile-stat-label">Rating</span><strong>' + escapeHtml(ratingLabel) + '</strong></div>'
      + '<div class="profile-stat"><span class="profile-stat-label">Rate</span><strong>' + rateLabel + '</strong></div>'
      + '</div>'
      + '<div class="profile-section">'
      + '<span class="profile-section-label">Preferred job types</span>'
      + '<div class="profile-chip-list">'
      + (jobTypes.length
        ? jobTypes.map((jobType) => '<span class="profile-chip gold">' + escapeHtml(jobType) + '</span>').join('')
        : '<span class="profile-chip">Not listed yet</span>')
      + '</div>'
      + '</div>';
  }

  function openModal() {
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  async function openProfile(id) {
    if (!id) return;

    openModal();
    modalBody.innerHTML = profileLoadingHtml();

    if (state.profileCache.has(id)) {
      renderProfile(state.profileCache.get(id));
      return;
    }

    try {
      const response = await fetch('/api/v1/staff/browse/' + encodeURIComponent(id), {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const payload = await response.json();
      const profile = payload && payload.data ? payload.data : null;

      if (!profile) {
        throw new Error('Profile not available');
      }

      state.profileCache.set(id, profile);
      renderProfile(profile);
    } catch (error) {
      modalBody.innerHTML = '<div class="empty-state"><p>Unable to load this profile right now.</p></div>';
      console.error('[browse-staff] failed to load profile', error);
    }
  }

  function applyFilters(nextState) {
    state.tier = nextState.tier;
    state.role = nextState.role;
    state.search = nextState.search;
    syncControls();
    fetchStaff(false);
  }

  function readInitialFilters() {
    const params = new URLSearchParams(window.location.search);
    state.tier = params.get('tier') || '';
    state.role = params.get('role') || '';
    state.search = params.get('search') || '';
    syncControls();
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyFilters({
        tier: button.getAttribute('data-tier') || '',
        role: roleSelect.value,
        search: searchInput.value.trim(),
      });
    });
  });

  roleSelect.addEventListener('change', () => {
    applyFilters({
      tier: state.tier,
      role: roleSelect.value,
      search: searchInput.value.trim(),
    });
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      applyFilters({
        tier: state.tier,
        role: roleSelect.value,
        search: searchInput.value.trim(),
      });
    }, 250);
  });

  loadMoreButton.addEventListener('click', () => {
    if (state.loading || state.page >= state.totalPages) return;
    state.page += 1;
    fetchStaff(true);
  });

  grid.addEventListener('click', (event) => {
    const target = event.target.closest('[data-profile-id]');
    if (!target) return;
    openProfile(target.getAttribute('data-profile-id'));
  });

  modal.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.getAttribute && target.getAttribute('data-close-modal') === 'true') {
      closeModal();
    }
  });

  closeButton.addEventListener('click', closeModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });

  readInitialFilters();
  fetchStaff(false);
})();
