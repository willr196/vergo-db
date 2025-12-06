/**
 * VERGO Events - JavaScript Utilities
 * Security, Form Handling, and Enhanced Features
 * Version: 2.0
 */

// ============================================
// 1. CSRF PROTECTION
// ============================================
const CSRF = {
  TOKEN_HEADER: 'X-CSRF-Token',
  TOKEN_STORAGE_KEY: 'vergo_csrf_token',
  
  // Get CSRF token from storage or fetch from server
  async getToken() {
  return 'not-used'; // CSRF handled by SameSite cookies
},
  
  // Add CSRF token to fetch options
  async addToFetch(options = {}) {
    const token = await this.getToken();
    
    if (!token) return options;
    
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
    
    // Handle 401 Unauthorized
    if (response.status === 401 && window.location.pathname !== '/login.html') {
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }
    
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// ============================================
// 3. ACCESSIBLE NOTIFICATIONS
// ============================================
class AccessibleNotification {
  constructor() {
    this.createLiveRegion();
    this.notificationQueue = [];
    this.isProcessing = false;
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
  
  async show(message, type = 'info', duration = 7000) {
    // Update ARIA live region for screen readers
    const liveRegion = document.getElementById('aria-live-region');
    if (liveRegion) {
      liveRegion.textContent = message;
    }
    
    // Create visual notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${this.getIcon(type)}</span>
        <span class="notification-message">${this.escapeHtml(message)}</span>
        <button class="notification-close" aria-label="Close notification">×</button>
      </div>
    `;
    
    // Add to container
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'notification-container';
      document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('notification-show');
    });
    
    // Close button handler
    notification.querySelector('.notification-close').addEventListener('click', () => {
      this.hide(notification);
    });
    
    // Auto-hide after duration
    if (duration > 0) {
      setTimeout(() => this.hide(notification), duration);
    }
    
    return notification;
  }
  
  hide(notification) {
    if (!notification) return;
    
    notification.classList.add('notification-hide');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }
  
  getIcon(type) {
    const icons = {
      'success': '✓',
      'error': '✕',
      'warning': '⚠',
      'info': 'ℹ'
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
const notification = new AccessibleNotification();

// ============================================
// 4. FORM VALIDATION
// ============================================
class FormValidator {
  constructor(form, options = {}) {
    this.form = form;
    this.options = {
      validateOnBlur: true,
      validateOnInput: false,
      showInlineErrors: true,
      ...options
    };
    
    this.validators = {
      required: (value) => value.trim() !== '',
      email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      phone: (value) => /^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, '').length >= 10,
      minLength: (value, min) => value.length >= min,
      maxLength: (value, max) => value.length <= max,
      pattern: (value, pattern) => new RegExp(pattern).test(value),
      match: (value, matchFieldName) => {
        const matchField = this.form.querySelector(`[name="${matchFieldName}"]`);
        return matchField && value === matchField.value;
      }
    };
    
    this.init();
  }
  
  init() {
    // Add novalidate to prevent browser validation
    this.form.setAttribute('novalidate', '');
    
    // Get all form fields
    this.fields = this.form.querySelectorAll('input, textarea, select');
    
    // Add event listeners
    this.fields.forEach(field => {
      if (this.options.validateOnBlur) {
        field.addEventListener('blur', () => this.validateField(field));
      }
      
      if (this.options.validateOnInput) {
        field.addEventListener('input', () => this.validateField(field));
      }
    });
    
    // Form submit handler
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }
  
  validateField(field) {
    const errors = [];
    const value = field.value;
    
    // Check required
    if (field.hasAttribute('required') && !this.validators.required(value)) {
      errors.push('This field is required');
    }
    
    // Check email
    if (field.type === 'email' && value && !this.validators.email(value)) {
      errors.push('Please enter a valid email address');
    }
    
    // Check phone
    if (field.type === 'tel' && value && !this.validators.phone(value)) {
      errors.push('Please enter a valid phone number');
    }
    
    // Check min length
    const minLength = field.getAttribute('minlength');
    if (minLength && !this.validators.minLength(value, minLength)) {
      errors.push(`Minimum ${minLength} characters required`);
    }
    
    // Check max length
    const maxLength = field.getAttribute('maxlength');
    if (maxLength && !this.validators.maxLength(value, maxLength)) {
      errors.push(`Maximum ${maxLength} characters allowed`);
    }
    
    // Check pattern
    const pattern = field.getAttribute('pattern');
    if (pattern && value && !this.validators.pattern(value, pattern)) {
      const title = field.getAttribute('title') || 'Please match the required format';
      errors.push(title);
    }
    
    // Check password match
    const match = field.getAttribute('data-match');
    if (match && !this.validators.match(value, match)) {
      errors.push('Passwords do not match');
    }
    
    // Show errors
    if (this.options.showInlineErrors) {
      this.showFieldErrors(field, errors);
    }
    
    return errors.length === 0;
  }
  
  showFieldErrors(field, errors) {
    // Remove existing errors
    const existingError = field.parentElement.querySelector('.field-error-message');
    if (existingError) {
      existingError.remove();
    }
    
    // Remove error class
    field.classList.remove('field-error');
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    
    // Add new errors if any
    if (errors.length > 0) {
      field.classList.add('field-error');
      field.setAttribute('aria-invalid', 'true');
      
      const errorId = `error-${field.name || field.id}`;
      const errorElement = document.createElement('div');
      errorElement.className = 'field-error-message';
      errorElement.id = errorId;
      errorElement.setAttribute('role', 'alert');
      errorElement.textContent = errors[0]; // Show first error only
      
      field.parentElement.appendChild(errorElement);
      field.setAttribute('aria-describedby', errorId);
    }
  }
  
  async handleSubmit(e) {
    e.preventDefault();
    
    // Validate all fields
    let isValid = true;
    this.fields.forEach(field => {
      if (!this.validateField(field)) {
        isValid = false;
      }
    });
    
    if (!isValid) {
      // Focus first error field
      const firstError = this.form.querySelector('.field-error');
      if (firstError) {
        firstError.focus();
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      notification.show('Please fix the errors in the form', 'error');
      return;
    }
    
    // Call custom submit handler if provided
    if (this.options.onSubmit) {
      await this.options.onSubmit(new FormData(this.form));
    }
  }
  
  reset() {
    this.form.reset();
    this.fields.forEach(field => {
      this.showFieldErrors(field, []);
    });
  }
}

// ============================================
// 5. SESSION MANAGEMENT
// ============================================
class SessionManager {
  constructor(options = {}) {
    this.options = {
      checkInterval: 60000, // Check every minute
      warningTime: 5 * 60 * 1000, // Warn 5 minutes before expiry
      logoutUrl: '/api/v1/auth/logout',
      loginUrl: '/login.html',
      ...options
    };
    
    this.startChecking();
  }
  
  async checkSession() {
    try {
      const response = await secureFetch('/api/v1/auth/session');
      if (!response) return;
      
      const data = await response.json();
      
      if (!data.authenticated) {
        this.handleLogout();
      }
      
      return data;
    } catch (error) {
      console.error('Session check failed:', error);
    }
  }
  
  startChecking() {
    // Check immediately
    this.checkSession();
    
    // Set up interval
    this.interval = setInterval(() => {
      this.checkSession();
    }, this.options.checkInterval);
    
    // Listen for activity
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
      document.addEventListener(event, () => this.updateActivity(), { passive: true });
    });
  }
  
  updateActivity() {
    // Debounce activity updates
    clearTimeout(this.activityTimeout);
    this.activityTimeout = setTimeout(() => {
      sessionStorage.setItem('lastActivity', Date.now().toString());
    }, 1000);
  }
  
  async handleLogout() {
    clearInterval(this.interval);
    CSRF.clear();
    
    try {
      await fetch(this.options.logoutUrl, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
    
    window.location.href = this.options.loginUrl;
  }
  
  destroy() {
    clearInterval(this.interval);
    clearTimeout(this.activityTimeout);
  }
}

// ============================================
// 6. JOB BOARD UTILITIES
// ============================================
class JobBoard {
  constructor() {
    this.filters = {
      search: '',
      category: '',
      location: '',
      type: '',
      minPay: null,
      maxPay: null
    };
    
    this.currentPage = 1;
    this.itemsPerPage = 20;
    this.jobs = [];
  }
  
  async loadJobs(filters = {}) {
    try {
      const params = new URLSearchParams({
        ...this.filters,
        ...filters,
        page: this.currentPage,
        limit: this.itemsPerPage
      });
      
      const response = await secureFetch(`/api/v1/jobs?${params}`);
      if (!response) return;
      
      const data = await response.json();
      this.jobs = data.jobs;
      this.totalPages = data.totalPages;
      
      this.renderJobs();
      this.renderPagination();
      
      return data;
    } catch (error) {
      console.error('Failed to load jobs:', error);
      notification.show('Failed to load jobs', 'error');
    }
  }
  
  renderJobs() {
    const container = document.getElementById('job-list');
    if (!container) return;
    
    if (this.jobs.length === 0) {
      container.innerHTML = `
        <div class="no-results">
          <h3>No jobs found</h3>
          <p>Try adjusting your filters or search terms</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.jobs.map(job => `
      <article class="job-card" data-job-id="${job.id}">
        <div class="job-header">
          <h3>
            <a href="/jobs/${job.id}" class="job-title">
              ${this.escapeHtml(job.title)}
            </a>
          </h3>
          ${job.featured ? '<span class="featured-badge">Featured</span>' : ''}
        </div>
        
        <div class="job-company">
          ${job.companyLogo ? `<img src="${job.companyLogo}" alt="${job.company} logo" class="company-logo">` : ''}
          <span>${this.escapeHtml(job.company)}</span>
        </div>
        
        <div class="job-meta">
          <span class="job-location">📍 ${this.escapeHtml(job.location)}</span>
          <span class="job-type">${this.escapeHtml(job.type)}</span>
          ${job.payRate ? `<span class="job-pay">£${job.payRate}/${job.payPeriod}</span>` : ''}
        </div>
        
        <p class="job-description">
          ${this.escapeHtml(job.description.substring(0, 200))}...
        </p>
        
        <div class="job-actions">
          <button onclick="jobBoard.saveJob('${job.id}')" class="btn-save" aria-label="Save job">
            ${job.saved ? '❤️' : '🤍'} Save
          </button>
          <a href="/jobs/${job.id}" class="btn-apply">View Details</a>
        </div>
      </article>
    `).join('');
    
    // Add click tracking
    container.querySelectorAll('.job-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button, a')) {
          const jobId = card.dataset.jobId;
          window.location.href = `/jobs/${jobId}`;
        }
      });
    });
  }
  
  renderPagination() {
    const container = document.getElementById('pagination');
    if (!container || this.totalPages <= 1) return;
    
    const pages = [];
    const maxVisible = 5;
    
    // Previous button
    pages.push(`
      <button 
        onclick="jobBoard.goToPage(${this.currentPage - 1})"
        ${this.currentPage === 1 ? 'disabled' : ''}
        aria-label="Previous page"
      >
        ← Previous
      </button>
    `);
    
    // Page numbers
    for (let i = 1; i <= Math.min(this.totalPages, maxVisible); i++) {
      pages.push(`
        <button 
          onclick="jobBoard.goToPage(${i})"
          class="${i === this.currentPage ? 'active' : ''}"
          aria-label="Go to page ${i}"
          ${i === this.currentPage ? 'aria-current="page"' : ''}
        >
          ${i}
        </button>
      `);
    }
    
    // Next button
    pages.push(`
      <button 
        onclick="jobBoard.goToPage(${this.currentPage + 1})"
        ${this.currentPage === this.totalPages ? 'disabled' : ''}
        aria-label="Next page"
      >
        Next →
      </button>
    `);
    
    container.innerHTML = pages.join('');
  }
  
  async saveJob(jobId) {
    try {
      const response = await secureFetch(`/api/v1/jobs/${jobId}/save`, {
        method: 'POST'
      });
      
      if (response && response.ok) {
        notification.show('Job saved!', 'success');
        // Update UI
        const job = this.jobs.find(j => j.id === jobId);
        if (job) {
          job.saved = !job.saved;
          this.renderJobs();
        }
      }
    } catch (error) {
      console.error('Failed to save job:', error);
      notification.show('Failed to save job', 'error');
    }
  }
  
  goToPage(page) {
    this.currentPage = page;
    this.loadJobs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  applyFilters() {
    // Get filter values from DOM
    const form = document.getElementById('job-filters');
    if (!form) return;
    
    const formData = new FormData(form);
    this.filters = Object.fromEntries(formData);
    this.currentPage = 1;
    
    this.loadJobs();
  }
  
  clearFilters() {
    this.filters = {
      search: '',
      category: '',
      location: '',
      type: '',
      minPay: null,
      maxPay: null
    };
    
    this.currentPage = 1;
    
    // Reset form
    const form = document.getElementById('job-filters');
    if (form) form.reset();
    
    this.loadJobs();
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ============================================
// 7. USER AUTHENTICATION
// ============================================
class UserAuth {
  constructor() {
    this.user = null;
    this.checkAuth();
  }
  
  async checkAuth() {
    try {
      const response = await secureFetch('/api/v1/users/session');
      if (response && response.ok) {
        const data = await response.json();
        this.user = data.user || null;
        this.updateUI();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  }
  
  updateUI() {
    const authLinks = document.getElementById('auth-links');
    if (!authLinks) return;
    
    if (this.user) {
      authLinks.innerHTML = `
        <div class="user-menu">
          <button class="user-menu-toggle" aria-expanded="false">
            ${this.user.firstName} ${this.user.lastName}
          </button>
          <ul class="user-dropdown" role="menu">
            <li><a href="/dashboard" role="menuitem">Dashboard</a></li>
            <li><a href="/dashboard/profile" role="menuitem">Profile</a></li>
            <li><a href="/dashboard/applications" role="menuitem">My Applications</a></li>
            <li><a href="/dashboard/saved" role="menuitem">Saved Jobs</a></li>
            <li><hr></li>
            <li><button onclick="userAuth.logout()" role="menuitem">Logout</button></li>
          </ul>
        </div>
      `;
      
      // Toggle dropdown
      const toggle = authLinks.querySelector('.user-menu-toggle');
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
      });
    } else {
      authLinks.innerHTML = `
        <a href="/login" class="btn-login">Sign In</a>
        <a href="/register" class="btn-register">Register</a>
      `;
    }
  }
  
  async login(email, password) {
    try {
      const response = await secureFetch('/api/v1/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (response && response.ok) {
        const data = await response.json();
        this.user = data.user;
        notification.show('Login successful!', 'success');
        
        // Redirect to intended page or dashboard
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect') || '/dashboard';
        window.location.href = redirect;
      } else {
        const error = await response.json();
        notification.show(error.message || 'Login failed', 'error');
      }
    } catch (error) {
      console.error('Login error:', error);
      notification.show('Login failed', 'error');
    }
  }
  
  async logout() {
    try {
      await secureFetch('/api/v1/users/logout', {
        method: 'POST'
      });
      
      this.user = null;
      CSRF.clear();
      notification.show('Logged out successfully', 'success');
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  async register(formData) {
    try {
      const response = await secureFetch('/api/v1/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData))
      });
      
      if (response && response.ok) {
        notification.show('Registration successful! Please check your email to verify your account.', 'success');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else {
        const error = await response.json();
        notification.show(error.message || 'Registration failed', 'error');
      }
    } catch (error) {
      console.error('Registration error:', error);
      notification.show('Registration failed', 'error');
    }
  }
}

// ============================================
// 8. INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize global instances
  window.userAuth = new UserAuth();
  
  // Initialize job board if on jobs page
  if (window.location.pathname.includes('/jobs')) {
    window.jobBoard = new JobBoard();
    window.jobBoard.loadJobs();
  }
  
  // Initialize session manager for authenticated pages
  if (document.querySelector('[data-requires-auth]')) {
    window.sessionManager = new SessionManager();
  }
  
  // Initialize forms
  document.querySelectorAll('form[data-validate]').forEach(form => {
    new FormValidator(form);
  });
  
  // Add keyboard navigation helpers
  document.addEventListener('keydown', (e) => {
    // Escape key closes modals
    if (e.key === 'Escape') {
      const modal = document.querySelector('[role="dialog"]:not([hidden])');
      if (modal) {
        modal.setAttribute('hidden', '');
        const trigger = document.querySelector('[aria-expanded="true"]');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    }
  });
  
  // Add focus visible polyfill for older browsers
  if (!('CSS' in window) || !CSS.supports('selector(:focus-visible)')) {
    document.documentElement.classList.add('js-focus-visible');
  }
});

// ============================================
// 9. UTILITY FUNCTIONS
// ============================================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

function formatDate(date, format = 'short') {
  const d = new Date(date);
  const options = format === 'short' 
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  
  return d.toLocaleDateString('en-GB', options);
}

function formatCurrency(amount, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

// ============================================
// 10. EXPORT FOR MODULES
// ============================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CSRF,
    secureFetch,
    AccessibleNotification,
    FormValidator,
    SessionManager,
    JobBoard,
    UserAuth,
    notification,
    debounce,
    throttle,
    formatDate,
    formatCurrency
  };
}