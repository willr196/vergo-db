/**
 * Staff sign-in pages: /staff/login, /staff/forgot-password and
 * /staff/set-password. Each form says which it is in data-staff-form.
 *
 * Session auth: the API sets the vergo.sid cookie (SameSite=Strict) on login,
 * so nothing is kept in the browser's storage here.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-staff-form]');
  if (!form) return;
  var kind = form.getAttribute('data-staff-form');
  var statusBox = document.getElementById('staffStatus');
  var button = form.querySelector('button[type="submit"]');

  function show(message, state) {
    statusBox.textContent = message;
    statusBox.dataset.state = state;
    statusBox.hidden = false;
  }

  /** Posts JSON and hands back { status, body }, never throwing on a 4xx. */
  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, body: body };
      });
    });
  }

  function busy(on, label) {
    button.disabled = on;
    // A message from the last try would read as the answer to this one.
    if (on) statusBox.hidden = true;
    if (label) button.textContent = label;
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  // ── Log in ────────────────────────────────────────────────────────────
  if (kind === 'login') {
    // Already signed in: straight to the account.
    fetch('/api/v1/user/session', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (body) { if (body && body.authenticated) window.location.replace('/staff'); })
      .catch(function () {});

    var params = new URLSearchParams(window.location.search);
    if (params.get('set') === '1') show('Password saved. Log in with it now.', 'success');
    if (params.get('verified') === 'true') show('Email address confirmed. You can log in.', 'success');
    if (params.get('expired') === '1') show('You were logged out. Log in again to carry on.', 'info');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = form.elements.email.value.trim();
      var password = form.elements.password.value;
      if (!looksLikeEmail(email)) return show('Enter the email address you sign in with.', 'error');
      if (password.length < 8) return show('Passwords are at least 8 characters.', 'error');

      var label = button.textContent;
      busy(true, 'Logging in…');
      post('/api/v1/user/login', { email: email, password: password })
        .then(function (r) {
          if (r.status === 200 && r.body.ok) {
            window.location.assign('/staff');
            return;
          }
          var code = r.body.code;
          if (code === 'MUST_CHANGE_PASSWORD' && r.body.token) {
            // A temporary password: choose a real one before going any further.
            window.location.assign('/staff/set-password?token=' + encodeURIComponent(r.body.token) + '&invite=1');
            return;
          }
          if (code === 'EMAIL_NOT_VERIFIED') {
            show('Your login is not set up yet. Use the link in the email we sent you, or choose "Forgot your password?" to get a new one.', 'error');
          } else if (r.status === 423 || r.status === 401 || r.status === 400) {
            show(r.body.error || 'That email and password do not match.', 'error');
          } else if (r.status === 429) {
            show('Too many tries. Wait a few minutes and try again.', 'error');
          } else {
            show('Something went wrong. Try again in a moment.', 'error');
          }
          busy(false, label);
        })
        .catch(function () {
          show('Could not reach VERGO. Check your connection and try again.', 'error');
          busy(false, label);
        });
    });
    return;
  }

  // ── Forgot password ──────────────────────────────────────────────────
  if (kind === 'forgot') {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = form.elements.email.value.trim();
      if (!looksLikeEmail(email)) return show('Enter the email address you sign in with.', 'error');
      var label = button.textContent;
      busy(true, 'Sending…');
      post('/api/v1/user/forgot-password', { email: email })
        .then(function (r) {
          if (r.status === 429) {
            show('Too many requests. Wait a few minutes and try again.', 'error');
            busy(false, label);
            return;
          }
          // Same answer whether or not the address has an account.
          show('If that address has a VERGO login, a link is on its way. It works for an hour. Check your junk folder too.', 'success');
          busy(false, 'Send again');
        })
        .catch(function () {
          show('Could not reach VERGO. Check your connection and try again.', 'error');
          busy(false, label);
        });
    });
    return;
  }

  // ── Set password (invite, reset or forced change) ─────────────────────
  if (kind === 'set-password') {
    var query = new URLSearchParams(window.location.search);
    var token = query.get('token') || '';
    var invite = query.get('invite') === '1';
    // The token is a key to the account: keep it out of the address bar, the
    // history and any Referer once it has been read.
    if (token && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + (invite ? '?invite=1' : ''));
    }
    if (invite) {
      document.getElementById('setPasswordHeading').textContent = 'Set up your login';
      document.getElementById('setPasswordLede').textContent = 'Choose a password for your VERGO staff account. At least 8 characters, and something you don\'t use anywhere else.';
    }
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      busy(true);
      show('This link is missing its code or has been cut short. Open it straight from the email, or ask for a new one from "Forgot your password?".', 'error');
      return;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var password = form.elements.password.value;
      var confirm = form.elements.confirm.value;
      if (password.length < 8) return show('Use at least 8 characters.', 'error');
      if (password.length > 72) return show('Use 72 characters or fewer.', 'error');
      if (password !== confirm) return show('The two passwords are different. Type them again.', 'error');

      var label = button.textContent;
      busy(true, 'Saving…');
      post('/api/v1/user/reset-password', { token: token, password: password })
        .then(function (r) {
          if (r.status === 200 && r.body.ok) {
            window.location.assign('/staff/login?set=1');
            return;
          }
          if (r.status === 400) {
            show('This link has expired or has already been used. Get a new one from "Forgot your password?".', 'error');
          } else if (r.status === 429) {
            show('Too many tries. Wait a few minutes and try again.', 'error');
          } else {
            show('Something went wrong. Try again in a moment.', 'error');
          }
          busy(false, label);
        })
        .catch(function () {
          show('Could not reach VERGO. Check your connection and try again.', 'error');
          busy(false, label);
        });
    });
  }
})();
