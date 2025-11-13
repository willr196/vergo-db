/**
 * VERGO Shared Utilities
 * Security, Accessibility, and GDPR compliance helpers
 */

// ============================================
// 1. CSRF PROTECTION
// ============================================
const CSRF = {
  TOKEN_HEADER: 'X-CSRF-Token',
  TOKEN_STORAGE_KEY: 'vergo_csrf_token',
  
  // Get CSRF token from storage or fetch from server
  async getToken() {
    let token = sessionStorage.getItem(this.TOKEN_STORAGE_KEY);
    
    if (!token) {
      try {
        const response = await fetch('/api/v1/csrf-token', {
          credentials: 'include'
        });
        const data = await response.json();
        token = data.token;
        sessionStorage.setItem(this.TOKEN_STORAGE_KEY, token);
      } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
        return null;
      }
    }
    
    return token;
  },
  
  // Add CSRF token to fetch options
  async addToFetch(options = {}) {
    const token = await this.getToken();
    
    return {
      ...options,
      headers: {
        ...options.headers,
        [this.TOKEN_HEADER]: token
      },
      credentials: 'include'
    };
  },
  
  // Clear token (call on logout)
  clear() {
    sessionStorage.removeItem(this.TOKEN_STORAGE_KEY);
  }
};

// ============================================
// 2. SECURE FETCH WRAPPER
// ============================================
async function secureFetch(url, options = {}) {
  const secureOptions = await CSRF.addToFetch(options);
  
  try {
    const response = await fetch(url, secureOptions);
    
    // Handle 419 CSRF token mismatch
    if (response.status === 419) {
      CSRF.clear();
      const retryOptions = await CSRF.addToFetch(options);
      return fetch(url, retryOptions);
    }
    
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// ============================================
// 3. ACCESSIBLE ERROR HANDLING
// ============================================
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
  
  show(message, type = 'info', duration = 7000) {
    // Update ARIA live region for screen readers
    const liveRegion = document.getElementById('aria-live-region');
    if (liveRegion) {
      liveRegion.textContent = `${type}: ${message}`;
    }
    
    // Show visual toast
    const toast = document.createElement('div');
    toast.className = `vergo-toast vergo-toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    
    const icon = this.getIcon(type);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'vergo-toast-close';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => this.dismiss(toast);
    
    const content = document.createElement('div');
    content.className = 'vergo-toast-content';
    content.innerHTML = `
      <span class="vergo-toast-icon" aria-hidden="true">${icon}</span>
      <span class="vergo-toast-message">${this.escapeHtml(message)}</span>
    `;
    
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);
    
    // Auto dismiss
    setTimeout(() => this.dismiss(toast), duration);
    
    return toast;
  }
  
  dismiss(toast) {
    toast.style.animation = 'vergoSlideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }
  
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global notification instance
const notify = new AccessibleNotification();

// ============================================
// 4. GDPR COOKIE CONSENT
// ============================================
class CookieConsent {
  constructor() {
    this.CONSENT_KEY = 'vergo_cookie_consent';
    this.PREFERENCES_KEY = 'vergo_cookie_preferences';
    this.init();
  }
  
  init() {
    if (!this.hasConsent()) {
      this.showBanner();
    } else {
      this.loadScripts();
    }
  }
  
  hasConsent() {
    return localStorage.getItem(this.CONSENT_KEY) === 'true';
  }
  
  getPreferences() {
    const prefs = localStorage.getItem(this.PREFERENCES_KEY);
    return prefs ? JSON.parse(prefs) : {
      necessary: true,
      analytics: false,
      marketing: false
    };
  }
  
  setConsent(preferences) {
    localStorage.setItem(this.CONSENT_KEY, 'true');
    localStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(preferences));
    this.loadScripts();
    this.hideBanner();
  }
  
  showBanner() {
    if (document.getElementById('cookie-consent-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'cookie-consent-title');
    banner.setAttribute('aria-describedby', 'cookie-consent-desc');
    
    banner.innerHTML = `
      <div class="cookie-consent-content">
        <h2 id="cookie-consent-title" class="cookie-consent-title">We use cookies</h2>
        <p id="cookie-consent-desc" class="cookie-consent-desc">
          We use necessary cookies to make our site work. We'd also like to set optional analytics cookies to help us improve it.
          We won't set optional cookies unless you enable them. 
          <a href="/privacy.html#cookies" class="cookie-consent-link">Learn more</a>
        </p>
        <div class="cookie-consent-actions">
          <button id="cookie-accept-all" class="btn-cookie btn-cookie-primary">
            Accept all cookies
          </button>
          <button id="cookie-accept-necessary" class="btn-cookie btn-cookie-secondary">
            Necessary only
          </button>
          <button id="cookie-manage" class="btn-cookie btn-cookie-tertiary">
            Manage preferences
          </button>
        </div>
      </div>
      <div id="cookie-preferences-panel" class="cookie-preferences-panel" style="display: none;">
        <h3 class="cookie-preferences-title">Cookie Preferences</h3>
        <div class="cookie-preference-item">
          <label class="cookie-preference-label">
            <input type="checkbox" checked disabled>
            <span class="cookie-preference-text">
              <strong>Necessary cookies</strong> - Required for the website to function
            </span>
          </label>
        </div>
        <div class="cookie-preference-item">
          <label class="cookie-preference-label">
            <input type="checkbox" id="cookie-analytics">
            <span class="cookie-preference-text">
              <strong>Analytics cookies</strong> - Help us understand how visitors use our site
            </span>
          </label>
        </div>
        <div class="cookie-consent-actions">
          <button id="cookie-save-prefs" class="btn-cookie btn-cookie-primary">
            Save preferences
          </button>
          <button id="cookie-cancel-prefs" class="btn-cookie btn-cookie-secondary">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(banner);
    this.attachEventListeners();
  }
  
  attachEventListeners() {
    document.getElementById('cookie-accept-all')?.addEventListener('click', () => {
      this.setConsent({ necessary: true, analytics: true, marketing: false });
    });
    
    document.getElementById('cookie-accept-necessary')?.addEventListener('click', () => {
      this.setConsent({ necessary: true, analytics: false, marketing: false });
    });
    
    document.getElementById('cookie-manage')?.addEventListener('click', () => {
      document.querySelector('.cookie-consent-content').style.display = 'none';
      document.getElementById('cookie-preferences-panel').style.display = 'block';
    });
    
    document.getElementById('cookie-save-prefs')?.addEventListener('click', () => {
      const analytics = document.getElementById('cookie-analytics').checked;
      this.setConsent({ necessary: true, analytics, marketing: false });
    });
    
    document.getElementById('cookie-cancel-prefs')?.addEventListener('click', () => {
      document.querySelector('.cookie-consent-content').style.display = 'block';
      document.getElementById('cookie-preferences-panel').style.display = 'none';
    });
  }
  
  hideBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) {
      banner.style.animation = 'vergoSlideDown 0.3s ease';
      setTimeout(() => banner.remove(), 300);
    }
  }
  
  loadScripts() {
    const prefs = this.getPreferences();
    
    // Load analytics if consented
    if (prefs.analytics && typeof gtag === 'undefined') {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=YOUR_GA_ID';
      document.head.appendChild(script);
      
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'YOUR_GA_ID', {
        anonymize_ip: true,
        cookie_flags: 'SameSite=None;Secure'
      });
    }
  }
}

// ============================================
// 5. FORM VALIDATION WITH VISUAL FEEDBACK
// ============================================
class FormValidator {
  constructor(form) {
    this.form = form;
    this.init();
  }
  
  init() {
    // Add aria-live region for form errors
    this.createErrorRegion();
    
    // Add event listeners
    this.form.querySelectorAll('input, select, textarea').forEach(field => {
      field.addEventListener('blur', () => this.validateField(field));
      field.addEventListener('input', () => this.clearFieldError(field));
    });
    
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }
  
  createErrorRegion() {
    if (!document.getElementById('form-error-region')) {
      const region = document.createElement('div');
      region.id = 'form-error-region';
      region.setAttribute('role', 'alert');
      region.setAttribute('aria-live', 'polite');
      region.className = 'sr-only';
      this.form.insertBefore(region, this.form.firstChild);
    }
  }
  
  validateField(field) {
    const error = this.getFieldError(field);
    
    if (error) {
      this.showFieldError(field, error);
      return false;
    } else {
      this.clearFieldError(field);
      return true;
    }
  }
  
  getFieldError(field) {
    if (!field.required && !field.value) return null;
    
    if (field.required && !field.value.trim()) {
      return `${this.getFieldLabel(field)} is required`;
    }
    
    if (field.type === 'email' && field.value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(field.value)) {
        return 'Please enter a valid email address';
      }
    }
    
    if (field.type === 'tel' && field.value) {
      const phoneRegex = /^[\d\s\+\-\(\)]+$/;
      if (!phoneRegex.test(field.value)) {
        return 'Please enter a valid phone number';
      }
    }
    
    if (field.type === 'date' && field.value) {
      const date = new Date(field.value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (date < today) {
        return 'Date must be in the future';
      }
    }
    
    return null;
  }
  
  getFieldLabel(field) {
    const label = this.form.querySelector(`label[for="${field.id}"]`);
    return label ? label.textContent.trim() : field.name;
  }
  
  showFieldError(field, message) {
    // Add error class
    field.classList.add('field-error');
    field.setAttribute('aria-invalid', 'true');
    
    // Create or update error message
    let errorEl = field.parentElement.querySelector('.field-error-message');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'field-error-message';
      errorEl.id = `${field.id}-error`;
      field.setAttribute('aria-describedby', errorEl.id);
      field.parentElement.appendChild(errorEl);
    }
    
    errorEl.textContent = message;
    errorEl.setAttribute('role', 'alert');
  }
  
  clearFieldError(field) {
    field.classList.remove('field-error');
    field.removeAttribute('aria-invalid');
    
    const errorEl = field.parentElement.querySelector('.field-error-message');
    if (errorEl) {
      errorEl.remove();
      field.removeAttribute('aria-describedby');
    }
  }
  
  handleSubmit(e) {
    let isValid = true;
    const errors = [];
    
    this.form.querySelectorAll('input, select, textarea').forEach(field => {
      if (!this.validateField(field)) {
        isValid = false;
        errors.push(this.getFieldLabel(field));
      }
    });
    
    if (!isValid) {
      e.preventDefault();
      
      // Update ARIA live region
      const errorRegion = document.getElementById('form-error-region');
      if (errorRegion) {
        errorRegion.textContent = `Please correct the following fields: ${errors.join(', ')}`;
      }
      
      // Focus first error
      const firstError = this.form.querySelector('.field-error');
      if (firstError) {
        firstError.focus();
      }
      
      notify.show('Please correct the errors in the form', 'error');
    }
    
    return isValid;
  }
}

// ============================================
// 6. ACCESSIBILITY HELPERS
// ============================================
const A11y = {
  // Add skip link
  addSkipLink() {
    if (document.getElementById('skip-link')) return;
    
    const skipLink = document.createElement('a');
    skipLink.id = 'skip-link';
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link';
    skipLink.textContent = 'Skip to main content';
    
    document.body.insertBefore(skipLink, document.body.firstChild);
  },
  
  // Add main landmark
  addMainLandmark() {
    const container = document.querySelector('.container, .hero-section');
    if (container && !container.closest('main')) {
      const main = document.createElement('main');
      main.id = 'main-content';
      container.parentNode.insertBefore(main, container);
      main.appendChild(container);
    }
  },
  
  // Trap focus in modal
  trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    element.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          lastFocusable.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          firstFocusable.focus();
          e.preventDefault();
        }
      }
    });
  }
};

// ============================================
// 7. INITIALIZE ON LOAD
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  // Add accessibility features
  A11y.addSkipLink();
  A11y.addMainLandmark();
  
  // Initialize cookie consent
  new CookieConsent();
  
  // Initialize form validation on all forms
  document.querySelectorAll('form').forEach(form => {
    if (!form.classList.contains('no-validation')) {
      new FormValidator(form);
    }
  });
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CSRF, secureFetch, notify, CookieConsent, FormValidator, A11y };
}