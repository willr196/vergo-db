/**
 * AdminCore — shared utilities for VERGO admin pages.
 * Include via <script src="/js/admin-core.js"></script> before the page script.
 */
(function () {
  'use strict';

  const AdminCore = {};

  // ── Escaping ──────────────────────────────────────────────────────────
  AdminCore.escapeHtml = function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ── Auth ──────────────────────────────────────────────────────────────
  AdminCore.checkAuth = async function () {
    try {
      const res = await fetch('/api/v1/auth/session', { credentials: 'include' });
      const payload = await res.json();
      const data = payload.data ?? payload;
      if (!data.authenticated) {
        window.location.href = 'login.html';
        return null;
      }
      return data;
    } catch (err) {
      window.location.href = 'login.html';
      return null;
    }
  };

  AdminCore.logout = async function () {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) { /* best-effort */ }
    window.location.href = 'login.html';
  };

  // ── Fetch helper ──────────────────────────────────────────────────────
  AdminCore.fetchJSON = async function (url, opts) {
    const res = await fetch(url, { credentials: 'include', ...opts });
    if (!res.ok) {
      const err = await res.json().catch(function () { return { error: res.statusText }; });
      throw new Error(err.error || res.statusText);
    }
    const payload = await res.json();
    return payload && payload.data !== undefined ? payload.data : payload;
  };

  // ── Notifications ─────────────────────────────────────────────────────
  /**
   * Show an alert inside a container element (inline banner style).
   * @param {string} message
   * @param {'success'|'error'} type
   * @param {string} [containerId='alert-container']
   * @param {number} [timeout=5000]
   */
  AdminCore.showAlert = function (message, type, containerId, timeout) {
    var container = document.getElementById(containerId || 'alert-container');
    if (!container) return;
    container.innerHTML =
      '<div class="alert alert-' + type + '">' + AdminCore.escapeHtml(message) + '</div>';
    setTimeout(function () { container.innerHTML = ''; }, timeout || 5000);
  };

  /**
   * Slide-in notification (used by admin.html).
   * Requires an element with id="notification".
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} [timeout=3000]
   */
  AdminCore.notify = function (message, type, timeout) {
    var notif = document.getElementById('notification');
    if (!notif) return;
    notif.textContent = message;
    notif.className = 'notification ' + (type || 'success') + ' show';
    setTimeout(function () { notif.classList.remove('show'); }, timeout || 3000);
  };

  // ── Date formatting ───────────────────────────────────────────────────
  AdminCore.formatDate = function (dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  AdminCore.formatDateTime = function (dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ── Modal helpers ─────────────────────────────────────────────────────
  AdminCore.openModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('d-none');
  };

  AdminCore.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('d-none');
  };

  /**
   * Wire up backdrop-click and Escape-key to close the modal.
   * Call once per modal id after the DOM is ready.
   */
  AdminCore.initModalBehavior = function (id) {
    var el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-backdrop')) {
        AdminCore.closeModal(id);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.classList.contains('d-none')) {
        AdminCore.closeModal(id);
      }
    });
  };

  // ── Debounce ──────────────────────────────────────────────────────────
  AdminCore.debounce = function (fn, wait) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
    };
  };

  // ── Status badge HTML ─────────────────────────────────────────────────
  /**
   * Returns HTML for a status badge.
   * @param {string} status - e.g. 'PENDING', 'APPROVED'
   * @param {'badge'|'pill'} [style='badge'] - CSS class prefix
   */
  AdminCore.statusBadge = function (status, style) {
    var cls = (style === 'pill') ? 'status-pill' : 'status-badge';
    var safe = AdminCore.escapeHtml(status);
    return '<span class="' + cls + ' status-' + safe + '">' + safe + '</span>';
  };

  // ── Table empty / loading states ──────────────────────────────────────
  AdminCore.renderLoadingState = function (colspan, message) {
    return '<tr><td colspan="' + (colspan || 5) + '" class="loading">' +
      AdminCore.escapeHtml(message || 'Loading...') + '</td></tr>';
  };

  AdminCore.renderEmptyState = function (colspan, message) {
    return '<tr><td colspan="' + (colspan || 5) + '" class="empty-state">' +
      AdminCore.escapeHtml(message || 'No results found') + '</td></tr>';
  };

  // ── Expose globally ───────────────────────────────────────────────────
  window.AdminCore = AdminCore;
})();
