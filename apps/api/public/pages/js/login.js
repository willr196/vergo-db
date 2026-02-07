'use strict';

    // Safe notification wrapper – won't crash if notify / notify.show is missing
    function safeNotify(message, type = 'info') {
      try {
        if (window.notify && typeof notify.show === 'function') {
          notify.show(message, type);
        } else if (typeof notify === 'function') {
          notify(message, type);
        } else {
          console.log(`[${type}] ${message}`);
        }
      } catch (e) {
        console.warn('Notification failed:', e);
      }
    }

    function secureFetch(url, options = {}) {
      const headers = options.headers ? { ...options.headers } : {};
      return fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers
      });
    }

    // Configuration
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_DURATION = 60; // seconds
    const STORAGE_KEY = 'vergo_login_attempts';
    
    // State
    let attemptCount = 0;
    let lockoutUntil = null;
    let retryInterval = null;
    
    // Elements
    const form = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = form.querySelector('button[type="submit"]');
    const buttonText = document.getElementById('button-text');
    const rateLimitWarning = document.getElementById('rate-limit-warning');
    const retryTimeSpan = document.getElementById('retry-time');
    const formStatus = document.getElementById('form-status');
    
    // Check for existing lockout on page load
    checkLockoutStatus();
    
    // Form submission handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Check if locked out
      if (isLockedOut()) {
        showRateLimitWarning();
        return;
      }
      
      // Validate form
      if (!validateForm()) {
        return;
      }
      
      // Check honeypot
      if (document.getElementById('website').value) {
        console.warn('Bot detected');
        return;
      }
      
      await handleLogin();
    });
    
    // Validation
    function validateForm() {
      let isValid = true;
      
      // Username validation
      if (!usernameInput.value.trim()) {
        showFieldError(usernameInput, 'Username is required');
        isValid = false;
      } else {
        clearFieldError(usernameInput);
      }
      
      // Password validation
      if (!passwordInput.value) {
        showFieldError(passwordInput, 'Password is required');
        isValid = false;
      } else if (passwordInput.value.length < 8) {
        showFieldError(passwordInput, 'Password must be at least 8 characters');
        isValid = false;
      } else {
        clearFieldError(passwordInput);
      }
      
      if (!isValid) {
        updateFormStatus('Please correct the errors in the form');
        const firstError = form.querySelector('.field-error');
        if (firstError) firstError.focus();
      }
      
      return isValid;
    }
    
    function showFieldError(field, message) {
      field.classList.add('field-error');
      field.setAttribute('aria-invalid', 'true');
      
      let errorEl = document.getElementById(`${field.id}-error`);
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.id = `${field.id}-error`;
        errorEl.className = 'field-error-message';
        errorEl.setAttribute('role', 'alert');
        field.parentElement.appendChild(errorEl);
      }
      
      errorEl.textContent = message;
    }
    
    function clearFieldError(field) {
      field.classList.remove('field-error');
      field.removeAttribute('aria-invalid');
      
      const errorEl = document.getElementById(`${field.id}-error`);
      if (errorEl) errorEl.remove();
    }
    
    // Login handler
    async function handleLogin() {
      submitBtn.disabled = true;
      buttonText.textContent = 'Signing in...';
      updateFormStatus('Authenticating...');
      
      const credentials = {
        username: usernameInput.value.trim(),
        password: passwordInput.value
      };
      
      try {
        const response = await secureFetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials)
        });
        
        const contentType = response.headers.get('content-type');
        let data = {};
        
        if (contentType && contentType.includes('application/json')) {
          const payload = await response.json();
          data = payload.data ?? payload;
        }
        
        if (response.ok) {
          updateFormStatus('Login successful! Redirecting...');
          
          // Clear login attempts first
          clearLoginAttempts();
          
          // Schedule redirect – this will always run once response.ok is true
          setTimeout(() => {
            window.location.href = '/admin-jobs.html'; // or '/admin.html' if you prefer
          }, 500);
          
          // Non-critical notification
          safeNotify('Login successful!', 'success');
        } else {
          handleLoginError(response, data);
        }
        
      } catch (err) {
        console.error('Login error:', err);
        safeNotify('Connection error. Please check your internet and try again.', 'error');
        updateFormStatus('Connection error occurred');
      } finally {
        submitBtn.disabled = false;
        buttonText.textContent = 'Login';
      }
    }
    
    function handleLoginError(response, data) {
      incrementAttempts();
      
      if (response.status === 423) {
        const lockDuration = data.lockDuration || 900;
        setLockout(lockDuration);
        showRateLimitWarning();
        safeNotify(data.error || 'Account temporarily locked', 'error');
        updateFormStatus('Account locked due to too many failed attempts');
      } else if (response.status === 429) {
        setLockout(LOCKOUT_DURATION);
        showRateLimitWarning();
        safeNotify('Too many attempts. Please wait before trying again.', 'warning');
        updateFormStatus('Rate limit exceeded');
      } else if (response.status === 401) {
        const remaining = MAX_ATTEMPTS - attemptCount;
        if (remaining > 0) {
          safeNotify(`Invalid credentials. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`, 'error');
          updateFormStatus(`Invalid username or password. ${remaining} attempts remaining`);
        } else {
          setLockout(LOCKOUT_DURATION);
          showRateLimitWarning();
          safeNotify('Account locked due to too many failed attempts', 'error');
          updateFormStatus('Account locked');
        }
        
        usernameInput.focus();
        usernameInput.select();
      } else {
        safeNotify(data.error || 'Login failed. Please try again.', 'error');
        updateFormStatus('Login failed');
      }
    }
    
    // Attempt tracking
    function incrementAttempts() {
      attemptCount++;
      saveAttempts();
      
      if (attemptCount >= MAX_ATTEMPTS) {
        setLockout(LOCKOUT_DURATION);
      }
    }
    
    function saveAttempts() {
      const data = {
        count: attemptCount,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    
    function loadAttempts() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          const age = Date.now() - data.timestamp;
          
          if (age > 900000) {
            clearLoginAttempts();
            return 0;
          }
          
          return data.count || 0;
        }
      } catch (e) {
        console.error('Error loading attempts:', e);
      }
      return 0;
    }
    
    function clearLoginAttempts() {
      attemptCount = 0;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('vergo_lockout_until');
    }
    
    // Lockout handling
    function setLockout(seconds) {
      lockoutUntil = Date.now() + (seconds * 1000);
      localStorage.setItem('vergo_lockout_until', lockoutUntil.toString());
      showRateLimitWarning();
    }
    
    function isLockedOut() {
      if (!lockoutUntil) return false;
      return Date.now() < lockoutUntil;
    }
    
    function checkLockoutStatus() {
      attemptCount = loadAttempts();
      
      const storedLockout = localStorage.getItem('vergo_lockout_until');
      if (storedLockout) {
        lockoutUntil = parseInt(storedLockout, 10);
        
        if (isLockedOut()) {
          showRateLimitWarning();
        } else {
          lockoutUntil = null;
          clearLoginAttempts();
        }
      }
    }
    
    function showRateLimitWarning() {
      if (!isLockedOut()) return;
      
      rateLimitWarning.classList.add('show');
      submitBtn.disabled = true;
      
      clearInterval(retryInterval);
      retryInterval = setInterval(() => {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        
        if (remaining <= 0) {
          clearInterval(retryInterval);
          rateLimitWarning.classList.remove('show');
          submitBtn.disabled = false;
          lockoutUntil = null;
          clearLoginAttempts();
          updateFormStatus('You may try logging in again');
          safeNotify('You may try logging in again', 'info');
        } else {
          retryTimeSpan.textContent = remaining;
        }
      }, 1000);
    }
    
    // Accessibility helper
    function updateFormStatus(message) {
      formStatus.textContent = message;
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(retryInterval);
    });
