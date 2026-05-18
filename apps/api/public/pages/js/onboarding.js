(function () {
  'use strict';

  const JOB_TYPES = [
    { value: 'Corporate Events', hint: 'Conferences, launches, brand events' },
    { value: 'Film & TV', hint: 'Production support, set hospitality' },
    { value: 'Music & Festivals', hint: 'Live events, artist areas' },
    { value: 'Private Events', hint: 'Private dining, parties' },
    { value: 'Hospitality/Venues', hint: 'Restaurants, venues, front-of-house' },
    { value: 'Weddings', hint: 'Ceremony, reception, guest service' },
  ];

  const state = {
    currentStep: 1,
    totalSteps: 4,
    profile: null,
    pendingPhoto: null, // base64 dataUrl awaiting upload
    photoUploaded: false,
  };

  // ---- DOM refs ----
  const loading    = document.getElementById('ob-loading');
  const shell      = document.getElementById('ob-shell');
  const progressEl = document.getElementById('ob-progress');
  const progressFill = document.getElementById('ob-progress-fill');
  const progressLabel = document.getElementById('ob-progress-label');

  // ---- Helpers ----

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function setLoading(btn, isLoading) {
    if (!btn) return;
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent.trim();
    btn.disabled = isLoading;
    btn.textContent = isLoading ? (btn.dataset.loadingLabel || 'Saving…') : btn.dataset.defaultLabel;
  }

  // ---- Toast ----

  let toastTimer = null;

  function showToast(message, variant) {
    let toast = document.getElementById('ob-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ob-toast';
      toast.className = 'ob-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.variant = variant || 'success';
    toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 1800);
  }

  async function apiRequest(url, options) {
    const opts = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, Object.assign({ credentials: 'include', cache: 'no-store' }, opts, { headers }));
    let payload = null;
    try { payload = await res.json(); } catch (_) {}

    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;

    if (!res.ok) {
      const src = (data && typeof data === 'object') ? data : payload;
      const msg = (src && (src.error || src.message)) || 'Request failed';
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return { payload, data };
  }

  // ---- Progress ----
  // Internal step numbers map: 1 = welcome, 2-5 = data steps 1-4 of 4, 'done' = finished.

  function updateProgress(stepIndex) {
    // stepIndex is 1..totalSteps (the data-step index, NOT the internal step number).
    const pct = Math.round((stepIndex / state.totalSteps) * 100);
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLabel) progressLabel.textContent = `Step ${stepIndex} of ${state.totalSteps}`;
    if (progressEl) {
      progressEl.setAttribute('aria-valuenow', stepIndex);
      progressEl.hidden = false;
    }
  }

  function hideProgress() {
    if (progressEl) progressEl.hidden = true;
  }

  // ---- Step navigation ----

  function showStep(n) {
    document.querySelectorAll('.ob-step').forEach((el) => { el.hidden = true; });
    const target = document.getElementById(n === 'done' ? 'step-done' : `step-${n}`);
    if (target) {
      target.hidden = false;
      target.focus && target.focus();
    }
    state.currentStep = n;

    if (n === 'done' || n === 1) {
      // Welcome and done: no progress bar.
      hideProgress();
    } else if (typeof n === 'number') {
      // Internal steps 2..5 map to data-step indices 1..4.
      updateProgress(n - 1);
    }

    // Scroll back to top so the user sees the new step header.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Render sectors ----

  function renderSectors(selected) {
    const grid = document.getElementById('ob-sectors');
    if (!grid) return;
    grid.innerHTML = JOB_TYPES.map((jt) => `
      <label class="ob-sector-card">
        <input type="checkbox" name="preferredJobTypes" value="${escHtml(jt.value)}" ${selected.includes(jt.value) ? 'checked' : ''}>
        <span class="ob-sector-name">${escHtml(jt.value)}</span>
        <span class="ob-sector-hint">${escHtml(jt.hint)}</span>
      </label>
    `).join('');
  }

  // ---- Populate form fields ----

  function populateForms(profile) {
    const phone = document.getElementById('ob-phone');
    const postcode = document.getElementById('ob-postcode');
    const dob = document.getElementById('ob-dob');
    const bio = document.getElementById('ob-bio');
    const avail = document.getElementById('ob-avail-input');

    if (phone) phone.value = profile.phone || '';
    if (postcode) postcode.value = profile.postcode || '';
    if (dob) dob.value = profile.dateOfBirth || '';
    if (bio) {
      bio.value = profile.experienceSummary || '';
      updateBioCount();
    }
    if (avail) avail.checked = !!profile.staffAvailable;

    renderSectors(Array.isArray(profile.preferredJobTypes) ? profile.preferredJobTypes : []);

    const welcomeName = document.getElementById('ob-welcome-name');
    if (welcomeName && profile.firstName) {
      welcomeName.textContent = `Welcome, ${profile.firstName}. Let's set up your profile.`;
    }

    const initialsEl = document.getElementById('ob-photo-initials');
    if (initialsEl) {
      const first = (profile.firstName || 'V').charAt(0);
      const last = (profile.lastName || '').charAt(0);
      initialsEl.textContent = (first + last).toUpperCase().slice(0, 2);
    }

    if (profile.profileImage && /^(data:|https?:\/\/|\/)/.test(profile.profileImage)) {
      const img = document.getElementById('ob-photo-img');
      if (img) {
        img.src = profile.profileImage;
        img.hidden = false;
        if (initialsEl) initialsEl.hidden = true;
        const removeBtn = document.getElementById('ob-photo-remove');
        if (removeBtn) removeBtn.hidden = false;
      }
    }
  }

  function updateBioCount() {
    const bio = document.getElementById('ob-bio');
    const counter = document.getElementById('ob-bio-count');
    if (bio && counter) counter.textContent = bio.value.length;
  }

  // ---- Photo handling ----

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
        img.onerror = function () { reject(new Error('Could not read image')); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.readAsDataURL(file);
    });
  }

  async function selectPhoto(file) {
    if (!file || !file.type.startsWith('image/')) {
      showError('error-photo', 'Please select an image file.');
      return;
    }

    showError('error-photo', '');

    try {
      const dataUrl = await compressImage(file, 800, 0.82);
      if (dataUrl.length > 1400000) {
        showError('error-photo', 'Image is too large after compression. Please try a smaller file.');
        return;
      }

      state.pendingPhoto = dataUrl;
      state.photoUploaded = false;

      const img = document.getElementById('ob-photo-img');
      const initials = document.getElementById('ob-photo-initials');
      if (img) { img.src = dataUrl; img.hidden = false; }
      if (initials) initials.hidden = true;

      const removeBtn = document.getElementById('ob-photo-remove');
      if (removeBtn) removeBtn.hidden = false;
    } catch (error) {
      showError('error-photo', error.message || 'Failed to process image.');
    }
  }

  function clearPhoto() {
    state.pendingPhoto = null;
    state.photoUploaded = false;
    const img = document.getElementById('ob-photo-img');
    const initials = document.getElementById('ob-photo-initials');
    const removeBtn = document.getElementById('ob-photo-remove');
    if (img) { img.src = ''; img.hidden = true; }
    if (initials) initials.hidden = false;
    if (removeBtn) removeBtn.hidden = true;
    showError('error-photo', '');
  }

  async function uploadPendingPhoto() {
    if (!state.pendingPhoto || state.photoUploaded) return;

    await apiRequest('/api/v1/user/profile/avatar', {
      method: 'POST',
      body: JSON.stringify({ dataUrl: state.pendingPhoto }),
    });

    state.photoUploaded = true;
  }

  // ---- Save handlers ----

  async function savePersonal(form) {
    const btn = form.querySelector('[type="submit"]');
    setLoading(btn, true);
    showError('error-personal', '');

    try {
      await apiRequest('/api/v1/user/profile', {
        method: 'PUT',
        body: JSON.stringify({
          phone: form.phone.value.trim(),
          postcode: form.postcode.value.trim(),
          dateOfBirth: form.dateOfBirth.value || '',
        }),
      });
      showToast('Details saved');
      showStep(3);
    } catch (error) {
      showError('error-personal', error.message || 'Could not save. Please try again.');
    } finally {
      setLoading(btn, false);
    }
  }

  async function saveProfessional(form) {
    const btn = form.querySelector('[type="submit"]');
    setLoading(btn, true);
    showError('error-professional', '');

    try {
      const sectors = Array.from(form.querySelectorAll('input[name="preferredJobTypes"]:checked')).map((i) => i.value);
      await apiRequest('/api/v1/user/profile', {
        method: 'PUT',
        body: JSON.stringify({
          experienceSummary: form.experienceSummary.value.trim(),
          preferredJobTypes: sectors,
        }),
      });
      showToast('Bio and sectors saved');
      showStep(4);
    } catch (error) {
      showError('error-professional', error.message || 'Could not save. Please try again.');
    } finally {
      setLoading(btn, false);
    }
  }

  async function proceedFromPhoto() {
    const btn = document.getElementById('ob-photo-next');
    setLoading(btn, true);
    showError('error-photo', '');

    try {
      if (state.pendingPhoto) {
        await uploadPendingPhoto();
        showToast('Photo uploaded');
      }
      showStep(5);
    } catch (error) {
      showError('error-photo', error.message || 'Upload failed. Please try again or skip.');
    } finally {
      setLoading(btn, false);
    }
  }

  async function finish() {
    const btn = document.getElementById('ob-finish');
    setLoading(btn, true);
    showError('error-avail', '');

    try {
      const avail = document.getElementById('ob-avail-input');
      await apiRequest('/api/v1/user/profile', {
        method: 'PUT',
        body: JSON.stringify({ staffAvailable: avail ? avail.checked : false }),
      });
      showToast('Profile complete');
      showStep('done');
    } catch (error) {
      showError('error-avail', error.message || 'Could not save. Please try again.');
    } finally {
      setLoading(btn, false);
    }
  }

  // ---- Init ----

  async function init() {
    try {
      const sessionRes = await apiRequest('/api/v1/user/session');
      const session = (sessionRes.data && typeof sessionRes.data === 'object') ? sessionRes.data : {};

      if (!session.authenticated) {
        window.location.href = '/portal-login.html?expired=1';
        return;
      }

      const profileRes = await apiRequest('/api/v1/user/profile');
      const raw = profileRes.data || {};
      const profile = raw.user || raw;

      state.profile = {
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        phone: profile.phone || '',
        postcode: profile.postcode || '',
        dateOfBirth: profile.dateOfBirth || '',
        experienceSummary: profile.experienceSummary || '',
        preferredJobTypes: Array.isArray(profile.preferredJobTypes) ? profile.preferredJobTypes : [],
        staffAvailable: !!profile.staffAvailable,
        profileImage: profile.profileImage || '',
      };

      if (loading) loading.hidden = true;
      if (shell) shell.hidden = false;

      populateForms(state.profile);
      showStep(1);
      bindDirectButtons();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = '/portal-login.html?expired=1';
      } else {
        if (loading) loading.innerHTML = '<p style="color:var(--muted)">Failed to load. Please <a href="/onboarding">refresh</a>.</p>';
      }
    }
  }

  // Defensive direct binding for critical buttons in case event delegation
  // is interrupted by another listener.
  function bindDirectButtons() {
    const finishBtn = document.getElementById('ob-finish');
    if (finishBtn && !finishBtn.dataset.bound) {
      finishBtn.dataset.bound = '1';
      finishBtn.addEventListener('click', function (e) {
        e.preventDefault();
        finish();
      });
    }
    const photoNextBtn = document.getElementById('ob-photo-next');
    if (photoNextBtn && !photoNextBtn.dataset.bound) {
      photoNextBtn.dataset.bound = '1';
      photoNextBtn.addEventListener('click', function (e) {
        e.preventDefault();
        proceedFromPhoto();
      });
    }
  }

  // ---- Event binding ----

  document.addEventListener('click', function (e) {
    // Use closest so clicks on inner SVG/text inside a button still match.
    const nextBtn = e.target.closest('[data-next]');
    if (nextBtn) { showStep(Number(nextBtn.dataset.next)); return; }

    const backBtn = e.target.closest('[data-back]');
    if (backBtn) { showStep(Number(backBtn.dataset.back)); return; }

    const finishBtn = e.target.closest('#ob-finish');
    if (finishBtn) { finish(); return; }

    const photoNextBtn = e.target.closest('#ob-photo-next');
    if (photoNextBtn) { proceedFromPhoto(); return; }

    const photoChoose = e.target.closest('#ob-photo-choose');
    if (photoChoose) { document.getElementById('ob-photo-input').click(); return; }

    const photoRemove = e.target.closest('#ob-photo-remove');
    if (photoRemove) { clearPhoto(); return; }

    const photoSkip = e.target.closest('#ob-photo-skip');
    if (photoSkip) { showStep(5); return; }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'form-personal') { savePersonal(form); return; }
    if (form.id === 'form-professional') { saveProfessional(form); return; }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'ob-photo-input') {
      const file = e.target.files && e.target.files[0];
      if (file) selectPhoto(file);
      e.target.value = '';
      return;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'ob-bio') updateBioCount();
  });

  init();
})();
