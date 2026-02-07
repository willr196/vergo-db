(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const msgBox = document.getElementById('message');
  const resendSection = document.getElementById('resend-section');
  const resendBtn = document.getElementById('resend-verification-btn');

  if (!form || !msgBox || !resendSection) return;

  const params = new URLSearchParams(window.location.search);
  const defaultRedirect = '/client-dashboard.html';
  let redirect = defaultRedirect;
  const redirectParam = params.get('redirect');
  if (redirectParam) {
    try {
      const url = new URL(redirectParam, window.location.origin);
      if (url.origin === window.location.origin) {
        redirect = url.pathname + url.search + url.hash;
      }
    } catch {
      redirect = defaultRedirect;
    }
  }

  // Show success if just verified
  if (params.get('verified') === 'true') {
    msgBox.innerHTML = '<div class="success-msg">Email verified! You can now log in.</div>';
  }

  let lastEmail = '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('button[type="submit"]');
    const email = String(document.getElementById('email')?.value || '').trim();
    const password = String(document.getElementById('password')?.value || '');

    lastEmail = email;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Logging in...';
    }
    msgBox.innerHTML = '';
    resendSection.classList.add('d-none');

    try {
      const res = await fetch('/api/v1/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const payload = await res.json();
      const data = payload.data ?? payload;

      if (!res.ok) {
        // Show resend option if email not verified
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          resendSection.classList.remove('d-none');
        }
        // Show pending approval message
        if (data.code === 'PENDING_APPROVAL') {
          msgBox.innerHTML = '<div class="warning-msg">Your account is pending approval. Our team will review and activate your client access shortly.</div>';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Log In';
          }
          return;
        }
        throw new Error(data.error || 'Login failed');
      }

      // Success - redirect to client dashboard
      window.location.href = redirect;
    } catch (err) {
      const message = (err && typeof err === 'object' && 'message' in err) ? String(err.message) : 'Login failed';
      msgBox.innerHTML = `<div class="error-msg">${escapeHtml(message)}</div>`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Log In';
      }
    }
  });

  async function resendVerification() {
    if (!lastEmail) {
      msgBox.innerHTML = '<div class="error-msg">Please enter your email first</div>';
      return;
    }

    try {
      await fetch('/api/v1/client/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lastEmail })
      });

      msgBox.innerHTML = '<div class="info-msg">If your email is registered and unverified, a new verification link has been sent.</div>';
      resendSection.classList.add('d-none');
    } catch (_err) {
      msgBox.innerHTML = '<div class="error-msg">Failed to resend. Please try again.</div>';
    }
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      resendVerification();
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();

