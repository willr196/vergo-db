/* /enquire: the quick enquiry. Posts to the same endpoint as the quote page
 * (/api/v1/quotes) as an ENQUIRY with source QUICK; the server holds it to the
 * same rules checked here. Success is shown only once the server accepts it. */
(function () {
  'use strict';

  var form = document.getElementById('enquiryForm');
  if (!form) return;

  var sendBtn = document.getElementById('enquirySend');
  var statusBox = document.getElementById('enquiryStatus');
  var contextInput = document.getElementById('enquiryContext');
  var contextNote = document.getElementById('enquiryContextNote');
  var sending = false;

  // ?for=<page> from a service page's button. A label only, never personal data;
  // anything not in this list is ignored.
  var CONTEXTS = {
    'waiting-staff': 'Waiting staff',
    'bar-staff': 'Bar staff',
    'kitchen-porters': 'Kitchen porters',
    'front-of-house': 'Hosts and front of house',
    'event-chefs': 'Event chefs',
    'cleaners': 'Event cleaners',
    'security': 'Event security',
    'weddings': 'Wedding',
    'private-parties': 'Private party',
    'corporate-events': 'Corporate event',
    'production-catering': 'Production catering',
    'christmas': 'Christmas',
    'new-years-eve': "New Year's Eve",
    'birmingham': 'Birmingham',
    'book-an-event': 'Full event',
    'about': 'About page',
    'home': 'Homepage'
  };

  var contextKey = '';
  try {
    contextKey = new URLSearchParams(window.location.search).get('for') || '';
  } catch (e) { contextKey = ''; }
  var contextLabel = Object.prototype.hasOwnProperty.call(CONTEXTS, contextKey) ? CONTEXTS[contextKey] : '';
  if (contextLabel) {
    contextInput.value = contextLabel;
    contextNote.textContent = 'Asking about: ' + contextLabel + '.';
    contextNote.hidden = false;
  }

  function value(name) {
    var el = form.elements[name];
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  }

  function clearErrors() {
    Array.prototype.slice.call(form.querySelectorAll('.field-invalid')).forEach(function (el) {
      el.classList.remove('field-invalid');
    });
    Array.prototype.slice.call(form.querySelectorAll('.field-error-message')).forEach(function (el) {
      el.parentNode.removeChild(el);
    });
    Array.prototype.slice.call(form.querySelectorAll('[aria-invalid]')).forEach(function (el) {
      el.removeAttribute('aria-invalid');
      var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) {
        return id && !/-error$/.test(id);
      });
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    });
  }

  function markInvalid(name, message) {
    var input = form.elements[name];
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    var wrapper = input.closest ? input.closest('.form-field') : null;
    if (!wrapper) return;
    wrapper.classList.add('field-invalid');
    var msg = document.createElement('p');
    msg.className = 'field-error-message';
    msg.id = name + '-error';
    msg.textContent = message;
    wrapper.appendChild(msg);
    var current = (input.getAttribute('aria-describedby') || '').trim();
    input.setAttribute('aria-describedby', current ? current + ' ' + msg.id : msg.id);
  }

  function showStatus(message, state) {
    statusBox.textContent = message;
    statusBox.dataset.state = state;
    statusBox.hidden = false;
  }

  /** The same rules as the server (routes/quotes.ts, source QUICK). */
  function validate() {
    var problems = [];
    var email = value('email');
    var phone = value('phone');
    if (value('name').length < 2) problems.push(['name', 'Tell us your name.']);
    if (!email && !phone) {
      problems.push(['email', 'Add an email address or a phone number so we can reply.']);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(['email', "That email address doesn't look right."]);
    if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) problems.push(['phone', "That phone number doesn't look right."]);
    if (value('message').length < 5) problems.push(['message', 'Tell us a little about what you need.']);
    var date = value('eventDate');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(['eventDate', 'Pick the date from the calendar, or leave it blank.']);
    return problems;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) return; // a second click while the first is on its way
    if (form.elements.website.value) return; // honeypot: drop it quietly

    clearErrors();
    statusBox.hidden = true;
    var problems = validate();
    if (problems.length) {
      problems.forEach(function (p) { markInvalid(p[0], p[1]); });
      showStatus(problems.length === 1 ? problems[0][1] : 'A couple of things need fixing before this can go.', 'error');
      var first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }

    sending = true;
    sendBtn.disabled = true;
    sendBtn.setAttribute('aria-busy', 'true');
    var label = sendBtn.textContent;
    sendBtn.textContent = 'Sending…';

    var payload = {
      intent: 'ENQUIRY',
      source: 'QUICK',
      name: value('name'),
      email: value('email') || undefined,
      phone: value('phone') || undefined,
      eventDate: value('eventDate') || undefined,
      location: value('location') || undefined,
      message: value('message'),
      context: contextInput.value || undefined,
      honeypot: ''
    };

    fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms && window.VERGO_CONFIG.forms.quoteEndpoint) || '/api/v1/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok && body.ok !== false, status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          // The server's own words when it gives them (a 503 names the phone number);
          // otherwise a plain fallback. What they typed stays in the form.
          var message = result.status === 429
            ? 'Too many messages from here in a short time. Please call or WhatsApp us instead.'
            : (result.body && typeof result.body.error === 'string' && result.status !== 400)
              ? result.body.error
              : result.status === 400
                ? 'Something in the form needs checking. Please look it over and try again.'
                : 'Something went wrong sending that. Please call or WhatsApp us instead.';
          showStatus(message, 'error');
          return;
        }
        form.reset();
        if (contextLabel) contextInput.value = contextLabel;
        showStatus('Thanks, your enquiry has reached us. Nothing has been booked. We\'ll reply as soon as we can, by email or phone, whichever you gave us.', 'success');
        statusBox.focus && statusBox.setAttribute('tabindex', '-1');
        statusBox.focus && statusBox.focus();
        // Counted once, only after the server accepted it, and only if analytics
        // consent was given (gtag exists only then). No names or contact details.
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'generate_lead', { form_name: 'quick_enquiry', enquiry_context: contextKey || 'none' });
        }
      })
      .catch(function () {
        showStatus('Something went wrong sending that. Please call or WhatsApp us instead.', 'error');
      })
      .finally(function () {
        sending = false;
        sendBtn.disabled = false;
        sendBtn.removeAttribute('aria-busy');
        sendBtn.textContent = label;
      });
  });
})();
