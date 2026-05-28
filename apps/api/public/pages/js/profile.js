(function () {
  'use strict';

  const JOB_TYPE_OPTIONS = [
    { value: 'Corporate Events', hint: 'Conferences, launches and brand events' },
    { value: 'Film & TV', hint: 'Production support and set hospitality' },
    { value: 'Music & Festivals', hint: 'Live events, artist areas and guest service' },
    { value: 'Private Events', hint: 'Private dining, parties and guest-facing service' },
    { value: 'Hospitality/Venues', hint: 'Restaurants, venues and front-of-house teams' },
    { value: 'Weddings', hint: 'Ceremony, reception and guest-facing service' },
  ];

  const COMPANY_SIZE_OPTIONS = ['', '1-10', '11-50', '51-200', '200+'];
  const redirectPath = window.location.pathname + window.location.search;
  const content = document.getElementById('profile-content');

  const state = {
    userType: null,
    profile: null,
    isJwt: false,
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function notify(message, type) {
    if (typeof notification !== 'undefined' && notification && typeof notification.show === 'function') {
      notification.show(message, type || 'info');
      return;
    }
    window.alert(message);
  }

  function getInitials(primary, secondary) {
    return `${(primary || 'V').charAt(0)}${(secondary || '').charAt(0)}`.trim().slice(0, 2).toUpperCase();
  }

  function resolveImageSrc(value) {
    if (!value) return '';
    return /^(data:|https?:\/\/|\/)/i.test(value) ? value : '';
  }

  function renderLoading() {
    content.innerHTML = `
      <div class="loading profile-loading">
        <div class="loading-spinner"></div>
        <p>Loading your profile...</p>
      </div>
    `;
  }

  function renderError(message) {
    content.innerHTML = `
      <div class="panel profile-error">
        <span class="eyebrow">Profile</span>
        <h2>We could not load this page.</h2>
        <p class="profile-copy">${escapeHtml(message)}</p>
        <div class="button-row">
          <button type="button" class="btn btn-secondary" data-action="retry">Try Again</button>
          <a href="/jobs" class="btn btn-primary">Back to Jobs</a>
        </div>
      </div>
    `;
  }

  async function apiRequest(url, options) {
    const requestOptions = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, requestOptions.headers || {});

    // Include JWT Bearer token when present (required for /api/v1/web/* endpoints)
    const jwtToken = localStorage.getItem('vergo_jwt');
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    if (requestOptions.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, Object.assign({
      credentials: 'include',
      cache: 'no-store',
    }, requestOptions, { headers }));

    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    const data = payload && typeof payload === 'object' && 'data' in payload
      ? payload.data
      : payload;

    if (!response.ok) {
      const source = data && typeof data === 'object' ? data : payload;
      const details = source && Array.isArray(source.details) ? source.details : null;
      const message = (source && (source.error || source.message)) || (details && details[0]) || 'Request failed';
      const error = new Error(message);
      error.status = response.status;
      error.payload = source;
      throw error;
    }

    return { response, payload, data };
  }

  async function detectUserType() {
    // 1. Try JWT first (portal-login auth)
    const jwtToken = localStorage.getItem('vergo_jwt');
    if (jwtToken) {
      try {
        const part = jwtToken.split('.')[1];
        if (part) {
          const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
          const payload = JSON.parse(atob(padded));
          if (payload && payload.tokenType === 'access' && payload.exp && Date.now() / 1000 < payload.exp) {
            return { type: payload.type === 'user' ? 'user' : 'client', isJwt: true };
          }
        }
      } catch (_e) {
        // fall through to session check
      }
    }

    // 2. Fall back to session-based auth
    const checks = [
      { type: 'user', url: '/api/v1/user/session', key: 'user' },
      { type: 'client', url: '/api/v1/client/session', key: 'client' },
    ];

    for (const check of checks) {
      try {
        const result = await apiRequest(check.url);
        const session = result.data || {};

        if (session.authenticated && session[check.key]) {
          return { type: check.type, isJwt: false };
        }
      } catch (error) {
        if (error.status !== 401 && error.status !== 403) {
          console.error(`Profile session check failed for ${check.type}:`, error);
        }
      }
    }

    return null;
  }

  function redirectToLogin() {
    const redirect = encodeURIComponent(redirectPath);
    // Prefer portal-login for JWT users; fall back to legacy user-login for session users
    const hasJwt = !!localStorage.getItem('vergo_jwt');
    window.location.href = hasJwt
      ? `/portal-login.html?redirect=${redirect}`
      : `/user-login?redirect=${redirect}`;
  }

  function extractProfile(data, type) {
    if (!data || typeof data !== 'object') return {};
    if (type === 'user' && data.user) return data.user;
    if (type === 'client' && data.client) return data.client;
    return data;
  }

  function normaliseUserProfile(raw) {
    const profile = extractProfile(raw, 'user');

    return {
      id: profile.id || '',
      email: profile.email || '',
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phone: profile.phone || '',
      profileImage: profile.profileImage || '',
      postcode: profile.postcode || '',
      dateOfBirth: profile.dateOfBirth || '',
      preferredJobTypes: Array.isArray(profile.preferredJobTypes) ? profile.preferredJobTypes : [],
      experienceSummary: profile.experienceSummary || '',
      registeredRoles: Array.isArray(profile.registeredRoles) ? profile.registeredRoles : [],
      yearsExperience: profile.yearsExperience ?? null,
      staffAvailable: !!profile.staffAvailable,
    };
  }

  function normaliseClientProfile(raw) {
    const profile = extractProfile(raw, 'client');

    return {
      id: profile.id || '',
      companyName: profile.companyName || '',
      contactName: profile.contactName || '',
      email: profile.email || '',
      phone: profile.phone || '',
      postcode: profile.postcode || '',
      industry: profile.industry || '',
      website: profile.website || '',
      companySize: profile.companySize || '',
      jobTitle: profile.jobTitle || '',
    };
  }

  async function loadProfile(type) {
    let endpoint;
    if (state.isJwt) {
      endpoint = type === 'user' ? '/api/v1/web/worker/profile' : '/api/v1/web/client/profile';
    } else {
      endpoint = type === 'user' ? '/api/v1/user/profile' : '/api/v1/client/profile';
    }
    const result = await apiRequest(endpoint);
    return type === 'user' ? normaliseUserProfile(result.data) : normaliseClientProfile(result.data);
  }

  // ---- Completeness ----

  function computeCompleteness(profile) {
    const checks = [
      { label: 'Phone number', done: !!profile.phone },
      { label: 'Postcode', done: !!profile.postcode },
      { label: 'Date of birth', done: !!profile.dateOfBirth },
      { label: 'Bio', done: profile.experienceSummary.length >= 10 },
      { label: 'Profile photo', done: !!profile.profileImage },
      { label: 'Preferred sectors', done: profile.preferredJobTypes.length > 0 },
    ];
    const done = checks.filter((c) => c.done).length;
    return { done, total: checks.length, checks };
  }

  function renderCompletenessBar(profile) {
    const { done, total } = computeCompleteness(profile);
    if (done === total) return '';
    const pct = Math.round((done / total) * 100);
    return `
      <div class="profile-completeness">
        <div class="completeness-header">
          <span class="completeness-label">Profile completeness</span>
          <span class="completeness-fraction">${done} of ${total}</span>
        </div>
        <div class="completeness-track" role="progressbar" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}" aria-label="${done} of ${total} sections complete">
          <div class="completeness-fill" style="width:${pct}%"></div>
        </div>
        <p class="completeness-hint">A complete profile helps VERGO match you to the right shifts.</p>
      </div>
    `;
  }

  // ---- Avatar ----

  function renderAvatarWithUpload(imageSrc, primary, secondary) {
    const safeSrc = resolveImageSrc(imageSrc);
    const inner = safeSrc
      ? `<img src="${escapeHtml(safeSrc)}" alt="Profile photo">`
      : `<span aria-hidden="true">${escapeHtml(getInitials(primary, secondary))}</span>`;

    return `
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">${inner}</div>
        <button type="button" class="avatar-upload-btn" data-action="upload-avatar" aria-label="Upload profile photo" title="Upload photo">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1v9M4 5l4-4 4 4M1.5 14h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-hidden="true" tabindex="-1">
      </div>
    `;
  }

  function renderAvatar(imageSrc, primary, secondary) {
    const safeSrc = resolveImageSrc(imageSrc);

    if (safeSrc) {
      return `<div class="profile-avatar"><img src="${escapeHtml(safeSrc)}" alt=""></div>`;
    }

    return `<div class="profile-avatar" aria-hidden="true">${escapeHtml(getInitials(primary, secondary))}</div>`;
  }

  // ---- Avatar upload ----

  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = function () { reject(new Error('Failed to read image')); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarUpload(file) {
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file.', 'error');
      return;
    }

    const uploadBtn = content.querySelector('[data-action="upload-avatar"]');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.setAttribute('aria-label', 'Uploading...');
    }

    try {
      const dataUrl = await compressImage(file, 800, 0.82);

      if (dataUrl.length > 1400000) {
        notify('Image is too large after compression. Please choose a smaller photo.', 'error');
        return;
      }

      const avatarEndpoint = state.isJwt ? '/api/v1/web/worker/profile/avatar' : '/api/v1/user/profile/avatar';
      const result = await apiRequest(avatarEndpoint, {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });

      state.profile.profileImage = (result.data && result.data.profileImage) || dataUrl;
      renderProfile();
      notify('Profile photo updated.', 'success');
    } catch (error) {
      notify(error.message || 'Failed to upload photo.', 'error');
    } finally {
      const btn = content.querySelector('[data-action="upload-avatar"]');
      if (btn) {
        btn.disabled = false;
        btn.setAttribute('aria-label', 'Upload profile photo');
      }
    }
  }

  // ---- Render helpers ----

  function renderRegisteredRoles(roles) {
    if (!roles.length) {
      return '<p class="profile-empty">No linked VERGO roles yet. Update your preferences below so your profile stays useful.</p>';
    }

    return `<div class="chip-row profile-chip-row">${roles.map((role) => `<span class="chip">${escapeHtml(role)}</span>`).join('')}</div>`;
  }

  function renderJobTypeCheckboxes(selectedValues) {
    return JOB_TYPE_OPTIONS.map((option) => `
      <label class="checkbox-card">
        <input
          type="checkbox"
          name="preferredJobTypes"
          value="${escapeHtml(option.value)}"
          ${selectedValues.includes(option.value) ? 'checked' : ''}
        >
        <span class="checkbox-copy">
          <strong>${escapeHtml(option.value)}</strong>
          <span>${escapeHtml(option.hint)}</span>
        </span>
      </label>
    `).join('');
  }

  function renderCompanySizeOptions(selectedValue) {
    return COMPANY_SIZE_OPTIONS.map((value) => {
      const label = value || 'Select company size';
      const selected = value === selectedValue ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function renderUserProfile() {
    const profile = state.profile;
    const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Your profile';
    const yearsExperience = profile.yearsExperience != null
      ? `${profile.yearsExperience} year${Number(profile.yearsExperience) === 1 ? '' : 's'} experience`
      : 'Experience not set';

    return `
      <section class="panel profile-overview">
        ${renderAvatarWithUpload(profile.profileImage, profile.firstName, profile.lastName)}
        <div>
          <span class="eyebrow">Job Seeker Profile</span>
          <h2>${escapeHtml(fullName)}</h2>
          <p class="profile-meta">${escapeHtml(profile.email)}</p>
          <div class="profile-submeta">
            <span>${escapeHtml(profile.phone || 'Add a phone number')}</span>
            <span>${escapeHtml(profile.postcode || 'Add your postcode')}</span>
            <span>${escapeHtml(yearsExperience)}</span>
            ${profile.staffAvailable
              ? '<span class="availability-pill is-available">Available for work</span>'
              : '<span class="availability-pill">Not available</span>'}
          </div>
        </div>
        <div class="profile-actions">
          <a href="/dashboard-worker" class="btn btn-secondary">Applications</a>
          <button type="button" class="btn btn-danger-soft" data-action="logout">Log Out</button>
        </div>
      </section>

      ${renderCompletenessBar(profile)}

      <div class="profile-grid">
        <form class="panel profile-card" data-form="user-personal">
          <span class="eyebrow">Personal Details</span>
          <h3>Contact and identity</h3>
          <p class="profile-intro">These details are used across your account and roster profile.</p>
          <div class="form-grid">
            <div class="field">
              <label for="user-first-name">First name</label>
              <input id="user-first-name" name="firstName" type="text" maxlength="100" required value="${escapeHtml(profile.firstName)}">
            </div>
            <div class="field">
              <label for="user-last-name">Last name</label>
              <input id="user-last-name" name="lastName" type="text" maxlength="100" required value="${escapeHtml(profile.lastName)}">
            </div>
            <div class="field">
              <label for="user-phone">Phone number</label>
              <input id="user-phone" name="phone" type="tel" maxlength="20" autocomplete="tel" value="${escapeHtml(profile.phone)}">
            </div>
            <div class="field">
              <label for="user-email">Email</label>
              <input id="user-email" name="email" type="email" readonly value="${escapeHtml(profile.email)}">
            </div>
            <div class="field">
              <label for="user-postcode">Postcode</label>
              <input id="user-postcode" name="postcode" type="text" maxlength="24" autocomplete="postal-code" value="${escapeHtml(profile.postcode)}">
            </div>
            <div class="field">
              <label for="user-dob">Date of birth</label>
              <input id="user-dob" name="dateOfBirth" type="date" value="${escapeHtml(profile.dateOfBirth)}">
            </div>
          </div>
          <div class="form-footer">
            <p class="form-status" aria-live="polite"></p>
            <button type="submit" class="btn btn-primary" data-loading-label="Saving...">Save Personal Details</button>
          </div>
        </form>

        <form class="panel profile-card" data-form="user-professional">
          <span class="eyebrow">Professional Details</span>
          <h3>Roles, bio and availability</h3>
          <p class="profile-intro">Your bio and sector preferences inform which jobs you're matched to and how you appear to clients.</p>
          <div class="form-grid">
            <div class="field is-full">
              <div class="availability-row">
                <div>
                  <span class="field-label">Available for work</span>
                  <p class="field-help">Let VERGO know you're open to shifts right now.</p>
                </div>
                <label class="toggle-switch" aria-label="Toggle availability">
                  <input type="checkbox" name="staffAvailable" ${profile.staffAvailable ? 'checked' : ''}>
                  <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
                </label>
              </div>
            </div>
            <div class="chip-stack">
              <span class="field-label">Registered roles</span>
              ${renderRegisteredRoles(profile.registeredRoles)}
            </div>
            <div class="checkbox-stack">
              <span class="field-label">Preferred sectors</span>
              <div class="checkbox-grid">
                ${renderJobTypeCheckboxes(profile.preferredJobTypes)}
              </div>
            </div>
            <div class="field is-full">
              <label for="user-experience-summary">Bio</label>
              <textarea id="user-experience-summary" name="experienceSummary" maxlength="500" placeholder="Summarise the kind of service environments, events or teams you work best in.">${escapeHtml(profile.experienceSummary)}</textarea>
              <p class="field-help">Up to 500 characters. Shown on your staff profile and used to match you to relevant roles.</p>
            </div>
          </div>
          <div class="form-footer">
            <p class="form-status" aria-live="polite"></p>
            <button type="submit" class="btn btn-primary" data-loading-label="Saving...">Save Professional Details</button>
          </div>
        </form>

      </div>

      <form class="panel profile-card profile-card--password" data-form="user-password">
        <span class="eyebrow">Security</span>
        <h3>Change password</h3>
        <p class="profile-intro">Use your current password to confirm the change.</p>
        <div class="password-fields">
          <div class="field">
            <label for="user-current-password">Current password</label>
            <input id="user-current-password" name="currentPassword" type="password" autocomplete="current-password" minlength="8" required>
          </div>
          <div class="field">
            <label for="user-new-password">New password</label>
            <input id="user-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" required>
          </div>
          <div class="field">
            <label for="user-confirm-password">Confirm new password</label>
            <input id="user-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required>
          </div>
        </div>
        <div class="form-footer">
          <p class="form-note">Passwords must be at least 8 characters.</p>
          <p class="form-status" aria-live="polite"></p>
          <button type="submit" class="btn btn-secondary" data-loading-label="Updating...">Update Password</button>
        </div>
      </form>
    `;
  }

  function renderClientProfile() {
    const profile = state.profile;

    return `
      <section class="panel profile-overview">
        ${renderAvatar('', profile.companyName, '')}
        <div>
          <span class="eyebrow">Client Profile</span>
          <h2>${escapeHtml(profile.companyName || 'Company profile')}</h2>
          <p class="profile-meta">${escapeHtml(profile.email)}</p>
          <div class="profile-submeta">
            <span>${escapeHtml(profile.contactName || 'Add a contact name')}</span>
            <span>${escapeHtml(profile.phone || 'Add a phone number')}</span>
            <span>${escapeHtml(profile.postcode || 'Add a postcode')}</span>
          </div>
        </div>
        <div class="profile-actions">
          <a href="/dashboard-client" class="btn btn-secondary">Dashboard</a>
          <button type="button" class="btn btn-danger-soft" data-action="logout">Log Out</button>
        </div>
      </section>

      <div class="profile-grid">
        <form class="panel profile-card" data-form="client-company">
          <span class="eyebrow">Company Details</span>
          <h3>Primary contact details</h3>
          <p class="profile-intro">Keep the main company and contact information current for quote requests and bookings.</p>
          <div class="form-grid">
            <div class="field">
              <label for="client-company-name">Company name</label>
              <input id="client-company-name" name="companyName" type="text" maxlength="200" required value="${escapeHtml(profile.companyName)}">
            </div>
            <div class="field">
              <label for="client-contact-name">Contact name</label>
              <input id="client-contact-name" name="contactName" type="text" maxlength="100" required value="${escapeHtml(profile.contactName)}">
            </div>
            <div class="field">
              <label for="client-phone">Phone number</label>
              <input id="client-phone" name="phone" type="tel" maxlength="20" autocomplete="tel" value="${escapeHtml(profile.phone)}">
            </div>
            <div class="field">
              <label for="client-email">Contact email</label>
              <input id="client-email" name="email" type="email" readonly value="${escapeHtml(profile.email)}">
            </div>
            <div class="field">
              <label for="client-postcode">Postcode</label>
              <input id="client-postcode" name="postcode" type="text" maxlength="24" autocomplete="postal-code" value="${escapeHtml(profile.postcode)}">
            </div>
          </div>
          <div class="form-footer">
            <p class="form-status" aria-live="polite"></p>
            <button type="submit" class="btn btn-primary" data-loading-label="Saving...">Save Company Details</button>
          </div>
        </form>

        <form class="panel profile-card" data-form="client-sector">
          <span class="eyebrow">Industry & Sector</span>
          <h3>Context for your bookings</h3>
          <p class="profile-intro">Add sector and company context so your requests stay consistent across the platform.</p>
          <div class="form-grid">
            <div class="field">
              <label for="client-industry">Industry / sector</label>
              <input id="client-industry" name="industry" type="text" maxlength="100" value="${escapeHtml(profile.industry)}">
            </div>
            <div class="field">
              <label for="client-job-title">Job title</label>
              <input id="client-job-title" name="jobTitle" type="text" maxlength="100" value="${escapeHtml(profile.jobTitle)}">
            </div>
            <div class="field">
              <label for="client-website">Website</label>
              <input id="client-website" name="website" type="url" placeholder="https://example.com" value="${escapeHtml(profile.website)}">
            </div>
            <div class="field">
              <label for="client-company-size">Company size</label>
              <select id="client-company-size" name="companySize">
                ${renderCompanySizeOptions(profile.companySize)}
              </select>
            </div>
          </div>
          <div class="form-footer">
            <p class="form-status" aria-live="polite"></p>
            <button type="submit" class="btn btn-primary" data-loading-label="Saving...">Save Sector Details</button>
          </div>
        </form>

      </div>

      <form class="panel profile-card profile-card--password" data-form="client-password">
        <span class="eyebrow">Security</span>
        <h3>Change password</h3>
        <p class="profile-intro">Use your current password to confirm the change.</p>
        <div class="password-fields">
          <div class="field">
            <label for="client-current-password">Current password</label>
            <input id="client-current-password" name="currentPassword" type="password" autocomplete="current-password" minlength="8" required>
          </div>
          <div class="field">
            <label for="client-new-password">New password</label>
            <input id="client-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" required>
          </div>
          <div class="field">
            <label for="client-confirm-password">Confirm new password</label>
            <input id="client-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required>
          </div>
        </div>
        <div class="form-footer">
          <p class="form-note">Passwords must be at least 8 characters.</p>
          <p class="form-status" aria-live="polite"></p>
          <button type="submit" class="btn btn-secondary" data-loading-label="Updating...">Update Password</button>
        </div>
      </form>
    `;
  }

  function renderProfile() {
    content.innerHTML = state.userType === 'user' ? renderUserProfile() : renderClientProfile();
  }

  function setFormLoading(form, isLoading) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? (button.dataset.loadingLabel || 'Saving...') : button.dataset.defaultLabel;
  }

  function setFormStatus(form, message, type) {
    const status = form.querySelector('.form-status');
    if (!status) return;

    status.textContent = message || '';
    status.classList.remove('is-error', 'is-success');
    if (type === 'error') status.classList.add('is-error');
    if (type === 'success') status.classList.add('is-success');
  }

  async function refreshProfile(type) {
    state.profile = await loadProfile(type);
    renderProfile();
  }

  async function saveProfileSection(form, url, payload, successMessage) {
    const formName = form.dataset.form;
    setFormStatus(form, '', null);
    setFormLoading(form, true);

    try {
      const result = await apiRequest(url, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

    // Always refresh to re-render with saved data
    if (result) {
      await refreshProfile(state.userType);
    }

      const currentForm = content.querySelector(`form[data-form="${formName}"]`) || form;
      setFormStatus(currentForm, successMessage, 'success');
      notify(successMessage, 'success');
    } catch (error) {
      const message = error.message || 'Unable to save changes';
      setFormStatus(form, message, 'error');
      notify(message, 'error');
    } finally {
      const currentForm = content.querySelector(`form[data-form="${formName}"]`) || form;
      setFormLoading(currentForm, false);
    }
  }

  function userProfileUrl() {
    return state.isJwt ? '/api/v1/web/worker/profile' : '/api/v1/user/profile';
  }

  function clientProfileUrl() {
    return state.isJwt ? '/api/v1/web/client/profile' : '/api/v1/client/profile';
  }

  async function handleUserPersonalSave(form) {
    const payload = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      phone: form.phone.value.trim(),
      postcode: form.postcode.value.trim(),
      dateOfBirth: form.dateOfBirth.value || '',
    };

    await saveProfileSection(form, userProfileUrl(), payload, 'Personal details saved.');
  }

  async function handleUserProfessionalSave(form) {
    const availableInput = form.querySelector('input[name="staffAvailable"]');
    const payload = {
      preferredJobTypes: Array.from(form.querySelectorAll('input[name="preferredJobTypes"]:checked')).map((input) => input.value),
      experienceSummary: form.experienceSummary.value.trim(),
      staffAvailable: availableInput ? availableInput.checked : false,
    };

    await saveProfileSection(form, userProfileUrl(), payload, 'Professional details saved.');
  }

  async function handleClientCompanySave(form) {
    const payload = {
      companyName: form.companyName.value.trim(),
      contactName: form.contactName.value.trim(),
      phone: form.phone.value.trim(),
      postcode: form.postcode.value.trim(),
    };

    await saveProfileSection(form, clientProfileUrl(), payload, 'Company details saved.');
  }

  async function handleClientSectorSave(form) {
    const payload = {
      industry: form.industry.value.trim(),
      website: form.website.value.trim(),
      companySize: form.companySize.value,
      jobTitle: form.jobTitle.value.trim(),
    };

    await saveProfileSection(form, clientProfileUrl(), payload, 'Sector details saved.');
  }

  async function handlePasswordSave(form, url) {
    const currentPassword = form.currentPassword.value;
    const newPassword = form.newPassword.value;
    const confirmPassword = form.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      const message = 'New password and confirmation do not match.';
      setFormStatus(form, message, 'error');
      notify(message, 'error');
      return;
    }

    setFormStatus(form, '', null);
    setFormLoading(form, true);

    try {
      const result = await apiRequest(url, {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const message = (result.data && result.data.message) || 'Password updated successfully.';
      form.reset();
      setFormStatus(form, message, 'success');
      notify(message, 'success');
    } catch (error) {
      const message = error.message || 'Unable to update password';
      setFormStatus(form, message, 'error');
      notify(message, 'error');
      if (/current password/i.test(message)) {
        const current = form.querySelector('input[name="currentPassword"]');
        if (current) {
          current.value = '';
          current.focus();
        }
      }
    } finally {
      setFormLoading(form, false);
    }
  }

  async function logout() {
    // JWT logout: clear localStorage and hit the web logout endpoint
    if (state.isJwt) {
      const refreshToken = localStorage.getItem('vergo_refresh');
      if (refreshToken) {
        fetch('/api/v1/web/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => {});
      }
      localStorage.removeItem('vergo_jwt');
      localStorage.removeItem('vergo_refresh');
      localStorage.removeItem('vergo_user');
      window.location.href = '/portal-login.html';
      return;
    }

    // Session logout
    const isUser = state.userType === 'user';
    const url = isUser ? '/api/v1/user/logout' : '/api/v1/client/logout';
    const redirect = isUser ? '/user-login' : '/client-login';

    try {
      await apiRequest(url, { method: 'POST' });
    } catch (error) {
      console.error('Profile logout failed:', error);
    } finally {
      window.location.href = redirect;
    }
  }

  async function onSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;

    event.preventDefault();

    if (form.dataset.form === 'user-personal') return handleUserPersonalSave(form);
    if (form.dataset.form === 'user-professional') return handleUserProfessionalSave(form);
    if (form.dataset.form === 'client-company') return handleClientCompanySave(form);
    if (form.dataset.form === 'client-sector') return handleClientSectorSave(form);
    if (form.dataset.form === 'user-password') {
      return handlePasswordSave(form, state.isJwt ? '/api/v1/web/worker/change-password' : '/api/v1/user/change-password');
    }
    if (form.dataset.form === 'client-password') {
      return handlePasswordSave(form, state.isJwt ? '/api/v1/web/client/change-password' : '/api/v1/client/change-password');
    }
  }

  async function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'retry') {
      event.preventDefault();
      return init();
    }

    if (action === 'logout') {
      event.preventDefault();
      return logout();
    }

    if (action === 'upload-avatar') {
      event.preventDefault();
      const fileInput = document.getElementById('avatar-file-input');
      if (fileInput) fileInput.click();
    }
  }

  function onFileChange(event) {
    const input = event.target;
    if (input.id !== 'avatar-file-input') return;
    const file = input.files && input.files[0];
    if (!file) return;
    handleAvatarUpload(file);
    input.value = '';
  }

  async function init() {
    renderLoading();

    try {
      const session = await detectUserType();

      if (!session) {
        redirectToLogin();
        return;
      }

      state.userType = session.type;
      state.isJwt = session.isJwt || false;
      state.profile = await loadProfile(session.type);
      renderProfile();
    } catch (error) {
      console.error('Profile page failed to initialise:', error);
      renderError('Please refresh the page or log in again.');
    }
  }

  document.addEventListener('submit', onSubmit);
  document.addEventListener('click', onClick);
  document.addEventListener('change', onFileChange);

  init();
})();
