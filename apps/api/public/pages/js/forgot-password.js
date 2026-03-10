(function () {
  'use strict';

  const form = document.getElementById('forgot-form');
  const msgBox = document.getElementById('message');

  if (!form || !msgBox) return;

  const params = new URLSearchParams(window.location.search);
  const isClient = params.get('type') === 'client';
  const endpoint = isClient ? '/api/v1/client/forgot-password' : '/api/v1/user/forgot-password';

  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const backLink = document.getElementById('auth-back-link');

  if (isClient) {
    document.title = 'Reset Client Password - VERGO Ltd';
    if (title) title.textContent = 'Reset Client Password';
    if (subtitle) subtitle.textContent = 'Enter the email on your client account and we will send a reset link.';
    if (backLink) {
      backLink.href = '/client-login';
      backLink.textContent = '← Back to Client Login';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('button');
    const emailField = document.getElementById('email');
    const email = String(emailField?.value || '').trim();

    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Sending...';
    msgBox.innerHTML = '';

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      msgBox.innerHTML = '<div class="info-msg">If an account exists with this email, you will receive a password reset link shortly.</div>';
      form.style.display = 'none';
    } catch (_err) {
      msgBox.innerHTML = '<div class="error-msg">Something went wrong. Please try again.</div>';
      btn.disabled = false;
      btn.textContent = 'Send Reset Link';
    }
  });
})();
