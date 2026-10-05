/**
 * Secure document link pages (/d/<token>): acknowledge the KID, agree the
 * employment agreement, accept the Terms of Business. Each form posts JSON to
 * its data-action and reloads to show the recorded result.
 */
(function () {
  'use strict';
  document.querySelectorAll('form[data-action]').forEach(function (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = form.querySelector('.msg');
      var button = form.querySelector('button[type=submit]');
      var body = {};
      form.querySelectorAll('input[name]').forEach(function (input) {
        if (input.type === 'checkbox') body[input.name] = input.checked;
        else body[input.name] = input.value.trim();
      });
      if (msg) msg.textContent = '';
      if (button) button.disabled = true;
      try {
        var res = await fetch(form.dataset.action, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        var payload = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
        location.reload();
      } catch (err) {
        if (msg) msg.textContent = err.message;
        if (button) button.disabled = false;
      }
    });
  });
})();
