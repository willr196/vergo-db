/**
 * /staff/profile: the signed-in worker's photo, details, roles, availability,
 * emergency contact and password. Reads and saves through /api/v1/user/profile
 * (session auth). A missing or expired session sends them to /staff/login.
 *
 * Without a photo the page is in setup mode: pre-filled from their
 * application, the photo is required, and saving takes them on to /staff.
 */
(function () {
  'use strict';

  var body = document.getElementById('accountBody');
  var heading = document.getElementById('accountHeading');
  var lede = document.getElementById('accountLede');
  var profileForm = document.getElementById('profileForm');
  var passwordForm = document.getElementById('passwordForm');
  var rolesSection = document.getElementById('rolesSection');
  var rolesBox = document.getElementById('roles');
  var emergency = document.getElementById('emergencySection');
  var profile = null;

  function show(id, message, state) {
    var box = document.getElementById(id);
    box.textContent = message;
    box.dataset.state = state;
    box.hidden = false;
  }

  function toLogin(expired) {
    window.location.replace('/staff/login' + (expired ? '?expired=1' : ''));
  }

  function request(method, url, payload) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          // Only say "you were logged out" when a session actually timed out.
          toLogin(data.code === 'SESSION_EXPIRED' || data.code === 'SESSION_IDLE');
          throw new Error('signed-out');
        }
        return { status: res.status, body: data };
      });
    });
  }

  /** One box per role the API offers (roleOptions), ticked from their record
   *  or, until they have saved, from the roles they applied with. */
  function renderRoles(options, selected, experience) {
    experience = experience || {};
    rolesBox.textContent = '';
    options.forEach(function (role, i) {
      var label = document.createElement('label');
      label.className = 'checkbox-line';
      label.setAttribute('for', 'role' + i);
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'role' + i;
      box.name = 'role';
      box.value = role;
      box.checked = selected.indexOf(role) !== -1;
      var text = document.createElement('span');
      text.textContent = role;
      // What they told us when they applied, so they can see where the ticks came from.
      if (experience[role]) {
        var note = document.createElement('span');
        note.className = 'label-note';
        note.textContent = ' ' + experience[role] + ' when you applied';
        text.appendChild(note);
      }
      label.appendChild(box);
      label.appendChild(text);
      rolesBox.appendChild(label);
    });
  }

  // Setup: their first visit, before there is a photo. The other staff pages
  // send them here until the photo is in (staff-common.js).
  var setup = false;

  function fill(p) {
    profile = p;
    if (!p.profileImage) setup = true;
    heading.textContent = setup ? 'Set up your profile' : 'Your profile';
    document.getElementById('profileSave').textContent = setup ? 'Save and finish' : 'Save my details';
    lede.textContent = setup
      ? 'We have filled this in from your application. Add your photo, check the rest, then save.'
      : p.isStaff
        ? 'Keep these up to date, so we can reach you and offer you the right shifts.'
        : 'Your VERGO login. Once you are on the team, your staff details appear here too.';
    profileForm.elements.firstName.value = p.firstName || '';
    profileForm.elements.lastName.value = p.lastName || '';
    document.getElementById('accountEmail').value = p.email || '';
    document.getElementById('passwordUsername').value = p.email || '';
    profileForm.elements.phone.value = p.phone || '';
    profileForm.elements.postcode.value = p.postcode || '';
    profileForm.elements.experienceSummary.value = p.experienceSummary || '';
    showPhoto(p.profileImage);
    // Roles and the emergency contact live on the staff record, so they only
    // show for someone who has one.
    rolesSection.hidden = !p.isStaff;
    if (p.isStaff) renderRoles(p.roleOptions || [], p.roles || [], p.roleExperience);
    document.getElementById('availabilityField').hidden = !p.isStaff;
    if (p.isStaff) profileForm.elements.availability.value = p.availability || '';
    emergency.hidden = !p.isStaff;
    if (p.isStaff) {
      profileForm.elements.emergencyContactName.value = p.emergencyContactName || '';
      profileForm.elements.emergencyContactPhone.value = p.emergencyContactPhone || '';
    }
    body.hidden = false;
  }

  request('GET', '/api/v1/user/profile')
    .then(function (r) {
      var p = r.body && (r.body.user || r.body.data);
      if (r.status !== 200 || !p) {
        lede.textContent = 'We could not load your details. Refresh the page to try again.';
        return;
      }
      fill(p);
    })
    .catch(function (err) {
      if (err && err.message === 'signed-out') return;
      lede.textContent = 'Could not reach VERGO. Check your connection and refresh the page.';
    });

  profileForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var f = profileForm.elements;
    var firstName = f.firstName.value.trim();
    var lastName = f.lastName.value.trim();
    if (!firstName || !lastName) return show('profileStatus', 'Your first and last name are both needed.', 'error');
    if (setup && !hasPhoto) {
      show('photoStatus', 'Add your photo to finish setting up.', 'error');
      show('profileStatus', 'Your photo is still missing. Add it at the top of the page.', 'error');
      photoButton.focus();
      if (photoButton.scrollIntoView) photoButton.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    var payload = {
      firstName: firstName,
      lastName: lastName,
      phone: f.phone.value.trim(),
      postcode: f.postcode.value.trim(),
      experienceSummary: f.experienceSummary.value.trim()
    };
    if (profile && profile.isStaff) {
      payload.roles = Array.prototype.slice.call(rolesBox.querySelectorAll('input:checked')).map(function (b) { return b.value; });
      if (!payload.roles.length) return show('profileStatus', 'Tick at least one role, so we know what work to offer you.', 'error');
      payload.emergencyContactName = f.emergencyContactName.value.trim();
      payload.emergencyContactPhone = f.emergencyContactPhone.value.trim();
      payload.availability = f.availability.value.trim();
    }

    var button = document.getElementById('profileSave');
    button.disabled = true;
    document.getElementById('profileStatus').hidden = true;
    request('PUT', '/api/v1/user/profile', payload)
      .then(function (r) {
        var p = r.body && (r.body.user || r.body.data);
        if (r.status === 200 && p) {
          if (setup) {
            // Set up: on to their account, which is now open to them.
            window.location.assign('/staff?welcome=1');
            return;
          }
          fill(p);
          show('profileStatus', 'Saved.', 'success');
        } else {
          show('profileStatus', (r.body.details && r.body.details[0]) || r.body.error || 'That did not save. Try again.', 'error');
        }
      })
      .catch(function (err) {
        if (err && err.message === 'signed-out') return;
        show('profileStatus', 'Could not reach VERGO. Your changes are still here; try saving again.', 'error');
      })
      .finally(function () { button.disabled = false; });
  });

  passwordForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var f = passwordForm.elements;
    var current = f.currentPassword.value;
    var next = f.newPassword.value;
    if (!current) return show('passwordStatus', 'Enter your current password.', 'error');
    if (next.length < 8) return show('passwordStatus', 'Use at least 8 characters for the new one.', 'error');
    if (next !== f.confirmPassword.value) return show('passwordStatus', 'The two new passwords are different.', 'error');
    if (next === current) return show('passwordStatus', 'The new password is the same as the old one.', 'error');

    var button = passwordForm.querySelector('button[type="submit"]');
    button.disabled = true;
    document.getElementById('passwordStatus').hidden = true;
    request('PUT', '/api/v1/user/change-password', { currentPassword: current, newPassword: next })
      .then(function (r) {
        if (r.status === 200 && r.body.ok) {
          passwordForm.reset();
          show('passwordStatus', 'Password changed.', 'success');
        } else {
          show('passwordStatus', r.body.error === 'Invalid input' ? 'Check both passwords and try again.' : (r.body.error || 'That did not work. Try again.'), 'error');
        }
      })
      .catch(function (err) {
        if (err && err.message === 'signed-out') return;
        show('passwordStatus', 'Could not reach VERGO. Try again.', 'error');
      })
      .finally(function () { button.disabled = false; });
  });

  // ── Photo ─────────────────────────────────────────────────────────────
  // Shrunk in the browser to a 640px JPEG, so a phone camera shot uploads
  // quickly and sits well under the API's size cap.
  var photoInput = document.getElementById('photoInput');
  var photoButton = document.getElementById('photoButton');

  var hasPhoto = false;

  function showPhoto(src) {
    hasPhoto = !!src;
    var img = document.getElementById('photoPreview');
    img.hidden = !src;
    if (src) img.src = src;
    document.getElementById('photoBlank').hidden = !!src;
    photoButton.textContent = src ? 'Change photo' : 'Choose a photo';
  }

  function shrink(file) {
    // Read as a data: URL, not a blob: one: the site's CSP allows data: images
    // (img-src 'self' data: https:) and would block a blob: URL.
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('unreadable')); };
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 640;
          var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = function () { reject(new Error('unreadable')); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  photoInput.addEventListener('change', function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      show('photoStatus', 'Use a JPEG, PNG or WebP photo.', 'error');
      return;
    }
    document.getElementById('photoStatus').hidden = true;
    photoButton.textContent = 'Uploading…';
    shrink(file)
      .then(function (dataUrl) { return request('POST', '/api/v1/user/profile/avatar', { dataUrl: dataUrl }); })
      .then(function (r) {
        if (r.status === 200 && r.body.ok) {
          showPhoto(r.body.data.profileImage);
          show('photoStatus', 'Photo saved.', 'success');
          // A "your photo is still missing" from an earlier save is now wrong.
          var saveStatus = document.getElementById('profileStatus');
          if (saveStatus.dataset.state === 'error' && /photo/i.test(saveStatus.textContent)) saveStatus.hidden = true;
        } else {
          showPhoto(profile && profile.profileImage);
          show('photoStatus', r.body.error || 'That photo did not save. Try another.', 'error');
        }
      })
      .catch(function (err) {
        if (err && err.message === 'signed-out') return;
        showPhoto(profile && profile.profileImage);
        show('photoStatus', err && err.message === 'unreadable' ? 'We could not read that file. Try another photo.' : 'Could not reach VERGO. Try again.', 'error');
      })
      .finally(function () { photoInput.value = ''; });
  });
})();
