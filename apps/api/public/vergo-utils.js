/**
 * Shared frontend utilities used by static VERGO pages.
 */

async function secureFetch(url, options) {
  const requestOptions = options || {};
  const response = await fetch(url, Object.assign({ credentials: 'include' }, requestOptions));

  if (response.status === 401 && !window.location.pathname.startsWith('/portal-login')) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/portal-login?redirect=' + redirect;
    return null;
  }

  return response;
}

function unwrapResponse(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

class AccessibleNotification {
  constructor() {
    this.createLiveRegion();
  }

  createLiveRegion() {
    if (document.getElementById('aria-live-region')) return;

    const liveRegion = document.createElement('div');
    liveRegion.id = 'aria-live-region';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
  }

  show(message, type, duration) {
    const kind = type || 'info';
    const timeout = typeof duration === 'number'
      ? duration
      : kind === 'error'
        ? 8000
        : kind === 'success'
          ? 4500
          : 6000;

    const liveRegion = document.getElementById('aria-live-region');
    if (liveRegion) liveRegion.textContent = message;

    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'notification-container';
      document.body.appendChild(container);
    }

    const notice = document.createElement('div');
    notice.className = 'notification notification-' + kind;
    notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    notice.innerHTML = [
      '<div class="notification-content">',
      '<span class="notification-icon" aria-hidden="true">' + this.iconFor(kind) + '</span>',
      '<span class="notification-message">' + this.escapeHtml(message) + '</span>',
      '<button class="notification-close" type="button" aria-label="Close notification">x</button>',
      '</div>',
    ].join('');

    container.appendChild(notice);
    requestAnimationFrame(() => notice.classList.add('notification-show'));

    const close = () => this.hide(notice);
    notice.querySelector('.notification-close')?.addEventListener('click', close);
    if (timeout > 0) window.setTimeout(close, timeout);

    return notice;
  }

  hide(notice) {
    if (!notice) return;
    notice.classList.add('notification-hide');
    window.setTimeout(() => notice.remove(), 300);
  }

  iconFor(type) {
    if (type === 'success') return 'OK';
    if (type === 'error') return '!';
    if (type === 'warning') return '!';
    return 'i';
  }

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }
}

function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => func.apply(this, args), wait);
  };
}

function throttle(func, limit) {
  let waiting = false;
  return function throttled(...args) {
    if (waiting) return;
    func.apply(this, args);
    waiting = true;
    window.setTimeout(() => {
      waiting = false;
    }, limit);
  };
}

function formatDate(date, format) {
  const value = new Date(date);
  const options = format === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' };

  return value.toLocaleDateString('en-GB', options);
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
  }).format(amount);
}

const notification = new AccessibleNotification();

window.notification = notification;
window.VERGOUtils = {
  secureFetch,
  unwrapResponse,
  AccessibleNotification,
  notification,
  debounce,
  throttle,
  formatDate,
  formatCurrency,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.VERGOUtils;
}
