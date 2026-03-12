(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const isClient = params.get('type') === 'client';
  const endpoint = isClient ? '/api/v1/client/reset-password' : '/api/v1/user/reset-password';
  const forgotHref = isClient ? '/forgot-password?type=client' : '/forgot-password';
  const loginHref = isClient ? '/client-login' : '/user-login';

  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const content = document.getElementById('content');

  if (isClient) {
    document.title = 'Set New Client Password | VERGO Events — Premium Event Staffing in London';
    if (title) title.textContent = 'Set New Client Password';
    if (subtitle) subtitle.textContent = 'Enter a new password for your client account below.';
  }

  if (!content) return;

  // Check if token exists
  if (!token) {
    content.innerHTML = `
      <div class="invalid-token">
        <h2>Invalid Link</h2>
        <p>This password reset link is invalid or has expired.</p>
        <a href="${forgotHref}" class="btn">Request New Link</a>
      </div>
    `;
    return;
  }

  const form = document.getElementById('reset-form');
  const msgBox = document.getElementById('message');

  if (!form || !msgBox) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('button');
    const password = String(document.getElementById('password')?.value || '');
    const confirmPassword = String(document.getElementById('confirmPassword')?.value || '');

    if (password !== confirmPassword) {
      msgBox.innerHTML = '<div class="error-msg">Passwords do not match</div>';
      return;
    }

    if (password.length < 8) {
      msgBox.innerHTML = '<div class="error-msg">Password must be at least 8 characters</div>';
      return;
    }

    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Resetting...';
    msgBox.innerHTML = '';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const payload = await res.json();
      const data = payload.data ?? payload;

      if (!res.ok) {
        throw new Error(data.error || 'Reset failed');
      }

      content.innerHTML = `
        <div class="reset-success">
          <h1>Password Reset</h1>
          <p>Your password has been successfully reset.</p>
          <a href="${loginHref}" class="btn">Log In</a>
        </div>
      `;
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Reset failed';
      msgBox.innerHTML = '';
      const el = document.createElement('div');
      el.className = 'error-msg';
      el.textContent = message;
      msgBox.appendChild(el);
      btn.disabled = false;
      btn.textContent = 'Reset Password';
    }
  });
})();
