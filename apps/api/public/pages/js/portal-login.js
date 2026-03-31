'use strict';

(function () {
  document.querySelectorAll('.pw-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.previousElementSibling;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
  // If already logged in, redirect to correct dashboard
  const existingUser = window.VERGOAuth && window.VERGOAuth.getUser();
  if (existingUser) {
    window.location.replace(
      existingUser.userType === 'worker' ? '/dashboard-worker.html' : '/dashboard-client.html'
    );
  }

  // Show expired/error message from URL params
  const params = new URLSearchParams(window.location.search);
  const msgEl = document.getElementById('message');

  function showMsg(text, type) {
    if (!msgEl) return;
    msgEl.className = type + '-msg';
    msgEl.textContent = text;
  }

  if (params.get('expired') === '1') {
    showMsg('Your session has expired. Please sign in again.', 'info');
  } else if (params.get('error') === 'missing_token') {
    showMsg('You must be signed in to access that page.', 'info');
  }

  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnLabel = document.getElementById('btn-label');
  const setPasswordForm = document.getElementById('set-password-form');
  const setPasswordBtn = document.getElementById('set-password-btn');
  const setPasswordBtnLabel = document.getElementById('set-password-btn-label');

  // Stored during login for the force-change-password call
  let pendingEmail = '';
  let pendingTempPassword = '';

  function storeSessionAndRedirect(data) {
    localStorage.setItem('vergo_jwt', data.token);
    if (data.refreshToken) localStorage.setItem('vergo_refresh', data.refreshToken);
    localStorage.setItem('vergo_user', JSON.stringify({
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      userType: data.userType,
      companyName: data.user.companyName || null,
    }));
    const dest = data.userType === 'worker' ? '/dashboard-worker.html' : '/dashboard-client.html';
    window.location.replace(dest);
  }

  function showSetPasswordPanel() {
    if (form) form.hidden = true;
    if (setPasswordForm) setPasswordForm.hidden = false;
    const h1 = document.querySelector('.auth-box h1');
    if (h1) h1.textContent = 'Set Your Password';
    if (msgEl) msgEl.className = '';
  }

  if (!form) return;

  // ─── LOGIN ───
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showMsg('Please enter your email and password.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    if (btnLabel) btnLabel.textContent = 'Signing in…';
    if (msgEl) msgEl.className = '';

    try {
      const res = await fetch('/api/v1/web/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (res.status === 403 && data.code === 'MUST_CHANGE_PASSWORD') {
          pendingEmail = email;
          pendingTempPassword = password;
          showSetPasswordPanel();
          return;
        }

        let msg = data.error || 'Login failed. Please try again.';
        let type = 'error';

        if (res.status === 423) {
          type = 'warning';
        } else if (res.status === 403) {
          type = 'info';
          if (data.code === 'PENDING_APPROVAL') {
            msg = 'Your account is awaiting admin approval. We\'ll email you once it\'s reviewed.';
          } else if (data.code === 'REJECTED') {
            type = 'error';
          } else if (data.code === 'SUSPENDED') {
            type = 'warning';
          } else if (data.code === 'EMAIL_NOT_VERIFIED') {
            msg = 'Please verify your email address before signing in. Check your inbox for the verification link.';
          }
        }

        showMsg(msg, type);
        return;
      }

      storeSessionAndRedirect(data);
    } catch {
      showMsg('A network error occurred. Please check your connection and try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.setAttribute('aria-busy', 'false');
      if (btnLabel) btnLabel.textContent = 'Sign In';
    }
  });

  // ─── SET PASSWORD ───
  if (setPasswordForm) {
    setPasswordForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      if (!newPassword || newPassword.length < 8) {
        showMsg('Password must be at least 8 characters.', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showMsg('Passwords do not match.', 'error');
        return;
      }

      setPasswordBtn.disabled = true;
      setPasswordBtn.setAttribute('aria-busy', 'true');
      if (setPasswordBtnLabel) setPasswordBtnLabel.textContent = 'Saving…';
      if (msgEl) msgEl.className = '';

      try {
        const res = await fetch('/api/v1/web/force-change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingEmail,
            currentPassword: pendingTempPassword,
            newPassword,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          showMsg(data.error || 'Could not set password. Please try again.', 'error');
          return;
        }

        storeSessionAndRedirect(data);
      } catch {
        showMsg('A network error occurred. Please check your connection and try again.', 'error');
      } finally {
        setPasswordBtn.disabled = false;
        setPasswordBtn.setAttribute('aria-busy', 'false');
        if (setPasswordBtnLabel) setPasswordBtnLabel.textContent = 'Set Password & Sign In';
      }
    });
  }
})();
