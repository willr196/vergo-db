(function () {
  'use strict';

  var esc  = AdminCore.escapeHtml;
  var get  = AdminCore.fetchJSON;
  var toast = function (m, t) { AdminCore.toast(m, t); };

  // ── Tabs ────────────────────────────────────────────────
  AdminCore.initTabs('.as-tabs');


  // ── Push notifications ────────────────────────────────────
  async function sendPush() {
    var title    = document.getElementById('push-title').value.trim();
    var body     = document.getElementById('push-body').value.trim();
    var audience = document.getElementById('push-audience').value;

    if (!title) { toast('Title is required', 'warning'); return; }
    if (!body)  { toast('Message is required', 'warning'); return; }

    var btn = document.querySelector('[data-action="send-push"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    var resultEl = document.getElementById('push-result');
    try {
      var data = await get('/api/v1/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message: body, audience })
      });
      toast('Sent to ' + data.sent + ' device' + (data.sent !== 1 ? 's' : ''), 'success');
      if (resultEl) {
        resultEl.innerHTML = '<div class="alert-success alert">Sent to ' + esc(String(data.sent)) + ' / ' + esc(String(data.total)) + ' devices.</div>';
      }
      document.getElementById('push-title').value = '';
      document.getElementById('push-body').value  = '';
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
      if (resultEl) resultEl.innerHTML = '<div class="alert-error alert">' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Push Notification'; }
    }
  }

  // ── Email broadcast ───────────────────────────────────────
  async function sendEmail() {
    var subject  = document.getElementById('email-subject').value.trim();
    var body     = document.getElementById('email-body').value.trim();
    var audience = document.getElementById('email-audience').value;

    if (!subject) { toast('Subject is required', 'warning'); return; }
    if (!body)    { toast('Body is required', 'warning'); return; }

    if (!confirm('Send this email to ' + audience.replace('_', ' ') + '? This cannot be undone.')) return;

    var btn = document.querySelector('[data-action="send-email"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    var resultEl = document.getElementById('email-result');
    try {
      var data = await get('/api/v1/admin/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, audience })
      });
      toast('Sent to ' + data.sent + ' recipient' + (data.sent !== 1 ? 's' : ''), 'success');
      if (resultEl) {
        resultEl.innerHTML = '<div class="alert-success alert">Sent to ' + esc(String(data.sent)) + ' / ' + esc(String(data.total)) + ' recipients.</div>';
      }
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
      if (resultEl) resultEl.innerHTML = '<div class="alert-error alert">' + esc(e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Email Broadcast'; }
    }
  }

  // ── Delegated events ────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'send-push')      return sendPush();
    if (action === 'send-email')     return sendEmail();
  });

  // ── Init ────────────────────────────────────────────────
  async function init() {
    await AdminCore.checkAuth();
  }

  window.addEventListener('load', init);
}());
