(function () {
  'use strict';

  var form = document.getElementById('quoteForm');
  if (!form) return;

  var statusBox = document.getElementById('quoteStatus');
  var submitBtn = document.getElementById('quoteSubmit');

  function getConfig() {
    return (window.VERGO_CONFIG && window.VERGO_CONFIG.rates) || { chargeRate: 18.50, minimumHours: 4 };
  }

  function hoursBetween(start, end) {
    if (!start || !end) return 0;
    var s = start.split(':').map(Number);
    var e = end.split(':').map(Number);
    if (s.length < 2 || e.length < 2) return 0;
    var startMinutes = s[0] * 60 + s[1];
    var endMinutes = e[0] * 60 + e[1];
    var diff = endMinutes - startMinutes;
    if (diff <= 0) diff += 24 * 60; // shift crosses midnight
    return diff / 60;
  }

  function showStatus(message, state) {
    statusBox.textContent = message;
    statusBox.dataset.state = state;
    statusBox.hidden = false;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (form.website.value) return; // honeypot triggered, silently drop

    var roles = Array.prototype.slice.call(form.querySelectorAll('input[name="roles"]:checked')).map(function (el) {
      return el.value;
    });

    var rates = getConfig();
    var actualHours = hoursBetween(form.shiftStart.value, form.shiftEnd.value);
    var billableHours = actualHours > 0 ? Math.max(actualHours, rates.minimumHours) : rates.minimumHours;
    var staffCount = parseInt(form.staffNeeded.value, 10) || 0;
    var estimatedTotal = Math.round(billableHours * rates.chargeRate * staffCount * 100) / 100;

    var payload = {
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      company: form.company.value || undefined,
      eventType: form.eventType.value,
      eventDate: form.eventDate.value || undefined,
      location: form.venuePostcode.value || undefined,
      shiftStart: form.shiftStart.value || undefined,
      shiftEnd: form.shiftEnd.value || undefined,
      staffNeeded: staffCount,
      roles: roles,
      message: form.message.value || undefined,
      estimatedTotal: estimatedTotal,
      honeypot: form.website.value || ''
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.quoteEndpoint) || '/api/v1/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request-failed');
        return res.json();
      })
      .then(function () {
        form.reset();
        showStatus("Thanks. We've got your enquiry and will come back to you quickly during our 8am to 10pm hours.", 'success');
      })
      .catch(function () {
        showStatus('Something went wrong sending that. Please call or WhatsApp us instead.', 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send enquiry';
      });
  });
})();
