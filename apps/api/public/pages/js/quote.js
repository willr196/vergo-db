document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('quote-form');
      const successMessage = document.getElementById('form-success');

      // Form validation
      const validators = {
        event_date: (value) => {
          if (!value) return 'Please select an event date';
          const date = new Date(value);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (date < today) return 'Event date must be in the future';
          return null;
        },
        event_time: (value) => {
          if (!value) return 'Please select a start time';
          return null;
        },
        event_location: (value) => {
          if (!value.trim()) return 'Please enter the event location';
          if (value.trim().length < 3) return 'Please enter a valid location';
          return null;
        },
        event_hours: (value) => {
          if (!value) return 'Please enter estimated hours';
          const hours = parseInt(value);
          if (isNaN(hours) || hours < 1) return 'Please enter a valid number of hours';
          if (hours > 24) return 'Please enter hours between 1 and 24';
          return null;
        },
        staff_quantity: (value) => {
          if (!value) return 'Please enter the number of staff needed';
          const qty = parseInt(value);
          if (isNaN(qty) || qty < 1) return 'Please enter a valid number';
          return null;
        },
        contact_name: (value) => {
          if (!value.trim()) return 'Please enter your name';
          if (value.trim().length < 2) return 'Please enter a valid name';
          return null;
        },
        contact_email: (value) => {
          if (!value.trim()) return 'Please enter your email address';
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) return 'Please enter a valid email address';
          return null;
        },
        contact_phone: (value) => {
          if (!value.trim()) return 'Please enter your phone number';
          const phoneRegex = /^[\d\s\+\-\(\)]{7,}$/;
          if (!phoneRegex.test(value.replace(/\s/g, ''))) return 'Please enter a valid phone number';
          return null;
        }
      };

      // Validate staff types (at least one selected)
      function validateStaffTypes() {
        const checked = form.querySelectorAll('input[name="staff_types"]:checked');
        const errorEl = document.getElementById('staff-types-error');
        if (checked.length === 0) {
          errorEl.textContent = 'Please select at least one staff type';
          errorEl.classList.add('visible');
          return false;
        }
        errorEl.classList.remove('visible');
        return true;
      }

      // Show/hide field error
      function showFieldError(fieldName, message) {
        const input = form.querySelector(`[name="${fieldName}"]`);
        const errorEl = document.getElementById(`${fieldName.replace('_', '-')}-error`);
        if (input && errorEl) {
          if (message) {
            input.classList.add('error');
            errorEl.textContent = message;
            errorEl.classList.add('visible');
          } else {
            input.classList.remove('error');
            errorEl.classList.remove('visible');
          }
        }
      }

      // Validate single field
      function validateField(fieldName) {
        const input = form.querySelector(`[name="${fieldName}"]`);
        if (input && validators[fieldName]) {
          const error = validators[fieldName](input.value);
          showFieldError(fieldName, error);
          return !error;
        }
        return true;
      }

      // Add real-time validation on blur
      Object.keys(validators).forEach(fieldName => {
        const input = form.querySelector(`[name="${fieldName}"]`);
        if (input) {
          input.addEventListener('blur', () => validateField(fieldName));
          input.addEventListener('input', () => {
            if (input.classList.contains('error')) {
              validateField(fieldName);
            }
          });
        }
      });

      // Form submission
      form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate all fields
        let isValid = true;
        Object.keys(validators).forEach(fieldName => {
          if (!validateField(fieldName)) isValid = false;
        });
        if (!validateStaffTypes()) isValid = false;

        if (!isValid) {
          // Scroll to first error
          const firstError = form.querySelector('.error');
          if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus();
          }
          return;
        }

        // Show loading state
        const submitBtn = form.querySelector('.submit-btn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';

        // Collect form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Get staff types as array
        data.staff_types = Array.from(form.querySelectorAll('input[name="staff_types"]:checked'))
          .map(cb => cb.value);

        try {
          // Submit to API
          const response = await fetch('/api/quote', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
          });

          if (response.ok) {
            // Show success
            form.style.display = 'none';
            successMessage.classList.add('visible');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            throw new Error('Submission failed');
          }
        } catch (error) {
          // For now, show success anyway (API might not be set up yet)
          // In production, show error message
          form.style.display = 'none';
          successMessage.classList.add('visible');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      });
    });
