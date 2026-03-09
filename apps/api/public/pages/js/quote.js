document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('quote-form');
  const successMessage = document.getElementById('form-success');
  const submitBtn = form.querySelector('.submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');

  const roleLabels = {
    event_chef: 'Event chefs',
    bar_staff: 'Bar staff',
    foh: 'Front of house',
    catering_assistant: 'Catering assistants',
    barista: 'Baristas',
  };

  const occasionLabels = {
    corporate: 'Corporate event',
    private: 'Private party',
    wedding: 'Wedding',
    festival: 'Festival / outdoor event',
    'product-launch': 'Product launch',
    charity: 'Charity event',
    other: 'Other hospitality event',
  };

  const validators = {
    event_date: (value) => {
      if (!value) return 'Please select an event date';
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) return 'Event date must be in the future';
      return null;
    },
    event_time: (value) => (!value ? 'Please select a start time' : null),
    event_location: (value) => {
      if (!value.trim()) return 'Please enter the event location';
      if (value.trim().length < 3) return 'Please enter a valid location';
      return null;
    },
    event_hours: (value) => {
      if (!value) return 'Please enter estimated hours';
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
        return 'Please enter hours between 1 and 24';
      }
      return null;
    },
    staff_quantity: (value) => {
      if (!value) return 'Please enter the number of staff needed';
      const qty = Number(value);
      if (!Number.isFinite(qty) || qty < 1) return 'Please enter a valid number';
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
      const phoneRegex = /^[\d\s+\-()]{7,}$/;
      if (!phoneRegex.test(value.replace(/\s/g, ''))) return 'Please enter a valid phone number';
      return null;
    },
  };

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

  function showFieldError(fieldName, message) {
    const input = form.querySelector('[name="' + fieldName + '"]');
    const errorEl = document.getElementById(fieldName.replace('_', '-') + '-error');
    if (!input || !errorEl) return;

    if (message) {
      input.classList.add('error');
      errorEl.textContent = message;
      errorEl.classList.add('visible');
      return;
    }

    input.classList.remove('error');
    errorEl.classList.remove('visible');
  }

  function validateField(fieldName) {
    const input = form.querySelector('[name="' + fieldName + '"]');
    if (!input || !validators[fieldName]) return true;
    const error = validators[fieldName](input.value);
    showFieldError(fieldName, error);
    return !error;
  }

  function computeShiftEnd(startTime, durationHours) {
    if (!startTime || !durationHours) return '';
    const parts = startTime.split(':');
    if (parts.length !== 2) return '';

    const startMinutes = Number(parts[0]) * 60 + Number(parts[1]);
    const endMinutes = startMinutes + Math.round(Number(durationHours) * 60);
    const hours = Math.floor((endMinutes / 60) % 24);
    const minutes = endMinutes % 60;

    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  function buildMessage(data) {
    const details = [];
    if (data.special_requirements) {
      details.push('Special requirements: ' + data.special_requirements.trim());
    }
    if (data.how_found) {
      details.push('Lead source: ' + data.how_found);
    }
    return details.join('\n\n');
  }

  function buildPayload() {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const roles = Array.from(form.querySelectorAll('input[name="staff_types"]:checked')).map((checkbox) => checkbox.value);
    const eventType = data.event_type ? occasionLabels[data.event_type] || data.event_type : 'Hospitality staffing request';
    const hours = Number(data.event_hours);
    const shiftStart = data.event_time || '';
    const shiftEnd = computeShiftEnd(shiftStart, hours);

    return {
      name: data.contact_name.trim(),
      email: data.contact_email.trim(),
      phone: data.contact_phone.trim(),
      company: data.company_name ? data.company_name.trim() : '',
      eventType: eventType,
      eventDate: data.event_date || undefined,
      location: data.event_location.trim(),
      requestedLane: data.lane_preference || 'MANAGED',
      staffNeeded: Number(data.staff_quantity),
      roles: roles.map((role) => roleLabels[role] || role),
      shiftStart: shiftStart || undefined,
      shiftEnd: shiftEnd || undefined,
      message: buildMessage(data) || undefined,
    };
  }

  Object.keys(validators).forEach((fieldName) => {
    const input = form.querySelector('[name="' + fieldName + '"]');
    if (!input) return;

    input.addEventListener('blur', function () {
      validateField(fieldName);
    });

    input.addEventListener('input', function () {
      if (input.classList.contains('error')) {
        validateField(fieldName);
      }
    });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    let isValid = true;
    Object.keys(validators).forEach((fieldName) => {
      if (!validateField(fieldName)) isValid = false;
    });
    if (!validateStaffTypes()) isValid = false;

    if (!isValid) {
      const firstError = form.querySelector('.error');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstError.focus();
      }
      return;
    }

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';

    try {
      const response = await fetch('/api/v1/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Quote submission failed');
      }

      form.style.display = 'none';
      successMessage.classList.add('visible');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      window.alert(error.message || 'Quote submission failed. Please try again.');
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  });
});
