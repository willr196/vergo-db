(function () {
  'use strict';

  const JOB_TYPE_OPTIONS = [
    { value: 'Corporate Events', hint: 'Conferences, launches and brand events' },
    { value: 'Film & TV', hint: 'Production support and set hospitality' },
    { value: 'Music & Festivals', hint: 'Live events, artist areas and guest service' },
    { value: 'Private Events', hint: 'Private dining, parties and premium service' },
    { value: 'Hospitality/Venues', hint: 'Restaurants, venues and front-of-house teams' },
    { value: 'Weddings', hint: 'Ceremony, reception and guest-facing service' },
  ];

  const COMPANY_SIZE_OPTIONS = ['', '1-10', '11-50', '51-200', '200+'];
  const redirectPath = window.location.pathname + window.location.search;
  const content = document.getElementById('profile-content');

  const state = {
    userType: null,
    profile: null,
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
    const checks = [
      { type: 'user', url: '/api/v1/user/session', key: 'user' },
      { type: 'client', url: '/api/v1/client/session', key: 'client' },
    ];

    for (const check of checks) {
      try {
        const result = await apiRequest(check.url);
        const session = result.data || {};

        if (session.authenticated && session[check.key]) {
          return { type: check.type, session: session[check.key] };
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
    window.location.href = `/user-login?redirect=${encodeURIComponent(redirectPath)}`;
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
    const endpoint = type === 'user' ? '/api/v1/user/profile' : '/api/v1/client/profile';
    const result = await apiRequest(endpoint);
    return type === 'user' ? normaliseUserProfile(result.data) : normaliseClientProfile(result.data);
  }

  function renderAvatar(imageSrc, primary, secondary) {
    const safeSrc = resolveImageSrc(imageSrc);

    if (safeSrc) {
      return `<div class="profile-avatar"><img src="${escapeHtml(safeSrc)}" alt=""></div>`;
    }

    return `<div class="profile-avatar" aria-hidden="true">${escapeHtml(getInitials(primary, secondary))}</div>`;
  }

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
        ${renderAvatar(profile.profileImage, profile.firstName, profile.lastName)}
        <div>
          <span class="eyebrow">Job Seeker Profile</span>
          <h2>${escapeHtml(fullName)}</h2>
          <p class="profile-meta">${escapeHtml(profile.email)}</p>
          <div class="profile-submeta">
            <span>${escapeHtml(profile.phone || 'Add a phone number')}</span>
            <span>${escapeHtml(profile.postcode || 'Add your postcode')}</span>
            <span>${escapeHtml(yearsExperience)}</span>
          </div>
        </div>
        <div class="profile-actions">
          <a href="/user-dashboard" class="btn btn-secondary">Applications</a>
          <button type="button" class="btn btn-danger-soft" data-action="logout">Log Out</button>
        </div>
      </section>

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
            <button type="submit" class="btn btn-primary" data-loading-label="Saving personal details...">Save Personal Details</button>
          </div>
        </form>

        <form class="panel profile-card" data-form="user-professional">
          <span class="eyebrow">Professional Details</span>
          <h3>Roles and summary</h3>
          <p class="profile-intro">Registered roles are pulled from your VERGO application history. Preferences and summary can be updated here.</p>
          <div class="form-grid">
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
              <label for="user-experience-summary">Experience summary</label>
              <textarea id="user-experience-summary" name="experienceSummary" maxlength="300" placeholder="Summarise the kind of service environments, events or teams you work best in.">${escapeHtml(profile.experienceSummary)}</textarea>
              <p class="field-help">Keep this concise. It is also used as the base summary for linked staff records.</p>
            </div>
          </div>
          <div class="form-footer">
            <p class="form-status" aria-live="polite"></p>
            <button type="submit" class="btn btn-primary" data-loading-label="Saving professional details...">Save Professional Details</button>
          </div>
        </form>

        <form class="panel profile-card is-wide" data-form="user-password">
          <span class="eyebrow">Security</span>
          <h3>Change password</h3>
          <p class="profile-intro">Use your current password to confirm the change.</p>
          <div class="form-grid">
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
            <button type="submit" class="btn btn-primary" data-loading-label="Updating password...">Update Password</button>
          </div>
        </form>
      </div>
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
          <a href="/client-dashboard" class="btn btn-secondary">Dashboard</a>
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
            <button type="submit" class="btn btn-primary" data-loading-label="Saving company details...">Save Company Details</button>
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
            <button type="submit" class="btn btn-primary" data-loading-label="Saving sector details...">Save Sector Details</button>
          </div>
        </form>

        <form class="panel profile-card is-wide" data-form="client-password">
          <span class="eyebrow">Security</span>
          <h3>Change password</h3>
          <p class="profile-intro">Use your current password to confirm the change.</p>
          <div class="form-grid">
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
            <button type="submit" class="btn btn-primary" data-loading-label="Updating password...">Update Password</button>
          </div>
        </form>
      </div>
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

      if (state.userType === 'user' || (result.data && (result.data.client || result.data.user))) {
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

  async function handleUserPersonalSave(form) {
    const payload = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      phone: form.phone.value.trim(),
      postcode: form.postcode.value.trim(),
      dateOfBirth: form.dateOfBirth.value || '',
    };

    await saveProfileSection(form, '/api/v1/user/profile', payload, 'Personal details saved.');
  }

  async function handleUserProfessionalSave(form) {
    const payload = {
      preferredJobTypes: Array.from(form.querySelectorAll('input[name="preferredJobTypes"]:checked')).map((input) => input.value),
      experienceSummary: form.experienceSummary.value.trim(),
    };

    await saveProfileSection(form, '/api/v1/user/profile', payload, 'Professional details saved.');
  }

  async function handleClientCompanySave(form) {
    const payload = {
      companyName: form.companyName.value.trim(),
      contactName: form.contactName.value.trim(),
      phone: form.phone.value.trim(),
      postcode: form.postcode.value.trim(),
    };

    await saveProfileSection(form, '/api/v1/client/profile', payload, 'Company details saved.');
  }

  async function handleClientSectorSave(form) {
    const payload = {
      industry: form.industry.value.trim(),
      website: form.website.value.trim(),
      companySize: form.companySize.value,
      jobTitle: form.jobTitle.value.trim(),
    };

    await saveProfileSection(form, '/api/v1/client/profile', payload, 'Sector details saved.');
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
    } finally {
      setFormLoading(form, false);
    }
  }

  async function logout() {
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
    if (form.dataset.form === 'user-password') return handlePasswordSave(form, '/api/v1/user/change-password');
    if (form.dataset.form === 'client-password') return handlePasswordSave(form, '/api/v1/client/change-password');
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
      state.profile = await loadProfile(session.type);
      renderProfile();
    } catch (error) {
      console.error('Profile page failed to initialise:', error);
      renderError('Please refresh the page or log in again.');
    }
  }

  document.addEventListener('submit', onSubmit);
  document.addEventListener('click', onClick);

  init();
})();
