document.querySelectorAll('.pw-toggle').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var input = btn.previousElementSibling;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

const form = document.getElementById('register-form');
const msgBox = document.getElementById('message');
const params = new URLSearchParams(window.location.search);
const prefillEmail = params.get('email');
const hasApplied = params.get('applied') === '1';

if (prefillEmail) {
  document.getElementById('email').value = prefillEmail;
}

if (hasApplied) {
  msgBox.innerHTML = '<div class="info-msg">Application received. Create your account with the same email you used on the application form.</div>';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = form.querySelector('button');
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (password !== confirmPassword) {
    msgBox.innerHTML = '<div class="error-msg">Passwords do not match</div>';
    return;
  }

  if (password.length < 8) {
    msgBox.innerHTML = '<div class="error-msg">Password must be at least 8 characters</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  msgBox.innerHTML = '';

  try {
    const res = await fetch('/api/v1/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, phone: phone || undefined, password })
    });

    const payload = await res.json();
    const data = payload.data ?? payload;

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    const verificationUrl = typeof data.verificationUrl === 'string' ? data.verificationUrl : '';
    const successMessage = data.message || 'Please check your email to verify your account before logging in.';

    msgBox.innerHTML = verificationUrl
      ? `
        <div class="success-msg">
          <strong>Account created!</strong><br>
          ${escapeHtml(successMessage)}<br>
          <a class="btn-link" href="${escapeHtml(verificationUrl)}">Verify account now</a>
        </div>
      `
      : `
        <div class="success-msg">
          <strong>Account created!</strong><br>
          ${escapeHtml(successMessage)}
        </div>
      `;
    form.style.display = 'none';
  } catch (err) {
    msgBox.innerHTML = `<div class="error-msg">${escapeHtml(err.message)}</div>`;
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
