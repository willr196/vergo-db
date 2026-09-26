/**
 * Special events brief forms — "Build your Halloween team" on
 * /special-events/halloween and the general brief on /special-events.
 * (The file name predates the second form; both pages load this script.)
 *
 * Each form opts in with data-se-brief. data-event-type tags the lead; a form
 * with a "concept" radio group (the general brief) tags it with the concept
 * picked instead, so a Christmas brief reads as one in the inbox.
 *
 * There is no new backend here. The brief is posted to the existing quote
 * endpoint as an ENQUIRY, which is the intent that matches what this form
 * actually is: a conversation starter with no price attached and nothing
 * committed. That means the only hard requirement is a way of replying.
 *
 * Two fields on this page have no column of their own in the quote payload —
 * atmosphere and interaction level. They travel in `special_requirements`,
 * which the API already folds into the message body, so the notification email
 * carries them without a schema change. Approximate hours travels the same way
 * via `event_hours`.
 */
(function () {
  'use strict';

  document.querySelectorAll('form[data-se-brief]').forEach(initBrief);

  // "Send us the brief" links on the concept cards pick the matching concept
  // before jumping to the form.
  document.querySelectorAll('a[data-concept]').forEach(function (link) {
    link.addEventListener('click', function () {
      var radio = document.querySelector('input[name="concept"][value="' + link.dataset.concept + '"]');
      if (radio) radio.checked = true;
    });
  });

  function initBrief(form) {
    var statusBox = form.querySelector('.form-status');
    var submitBtn = form.querySelector('button[type="submit"]');

    function clearErrors() {
      form.querySelectorAll('.field-invalid').forEach(function (node) {
        node.classList.remove('field-invalid');
      });
      form.querySelectorAll('.field-error-message').forEach(function (node) {
        node.remove();
      });
      form.querySelectorAll('[aria-invalid]').forEach(function (node) {
        node.removeAttribute('aria-invalid');
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
      msg.textContent = message;
      wrapper.appendChild(msg);
    }

    function focusFirstInvalid() {
      var first = form.querySelector('.field-invalid input, .field-invalid textarea');
      if (!first) return;
      first.focus();
      if (first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function looksLikeEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function value(name) {
      var el = form.elements[name];
      return el && typeof el.value === 'string' ? el.value.trim() : '';
    }

    function checkedValues(name) {
      return Array.prototype.map.call(
        form.querySelectorAll('input[name="' + name + '"]:checked'),
        function (input) { return input.value; }
      );
    }

    function checkedValue(name) {
      var picked = checkedValues(name);
      return picked.length ? picked[0] : '';
    }

    function wholeNumber(name, max) {
      var raw = value(name);
      if (!raw) return undefined;
      var parsed = Number(raw);
      if (!isFinite(parsed)) return undefined;
      parsed = Math.round(parsed);
      if (parsed < 1 || parsed > max) return undefined;
      return parsed;
    }

    function showStatus(message, state) {
      statusBox.textContent = message;
      statusBox.dataset.state = state;
      statusBox.hidden = false;
    }

    /** An enquiry only has to be answerable. Everything else on this page is a
     *  bonus, because half the point of it is "tell us even if you don't know". */
    function validate() {
      clearErrors();

      var email = value('email');
      var phone = value('phone');

      if (!email && !phone) {
        markInvalid('email', 'Email or phone — either will do.');
        return 'Leave us an email address or a phone number so we can reply.';
      }
      if (email && !looksLikeEmail(email)) {
        markInvalid('email', 'Check this email address.');
        return 'That email address does not look right.';
      }
      return null;
    }

    /** The bits of the brief with nowhere structured to sit, written out in the
     *  order someone reading the email would want them. */
    function buildRequirements() {
      var parts = [];
      var atmosphere = checkedValue('atmosphere');
      var interaction = checkedValue('interaction');
      var guests = wholeNumber('guestCount', 100000);

      parts.push(form.dataset.briefLabel || 'Special events brief');
      var concept = checkedValue('concept');
      if (concept) parts.push('Concept: ' + concept);
      var decor = checkedValue('decorTheme');
      if (decor) parts.push('Decor theme: ' + decor);
      if (atmosphere) parts.push('Atmosphere: ' + atmosphere);
      if (interaction) parts.push('Interaction level: ' + interaction);
      if (guests) parts.push('Approx guests: ' + guests);
      return parts.join(' · ');
    }

    function eventType() {
      var tag = form.dataset.eventType || 'Special Events';
      var concept = checkedValue('concept');
      if (concept) return concept + ' (' + tag + ')';
      return tag;
    }

    function buildPayload() {
      var needs = checkedValues('need');

      return {
        intent: 'ENQUIRY',
        name: value('name') || undefined,
        email: value('email') || undefined,
        phone: value('phone') || undefined,
        company: value('company') || undefined,
        // Tags the lead in the notification email and the quote log, so a
        // special events brief is never mistaken for a standard staffing request.
        eventType: eventType(),
        eventDate: value('eventDate') || undefined,
        location: value('location') || undefined,
        guestCount: wholeNumber('guestCount', 100000),
        // What they ticked, in the field the API already renders as "Roles".
        roles: needs.length ? needs : undefined,
        // Folded into the message body server-side.
        special_requirements: buildRequirements(),
        event_hours: wholeNumber('hours', 24),
        message: value('message') || undefined,
        honeypot: value('website') || ''
      };
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (value('website')) return; // honeypot triggered, silently drop

      var problem = validate();
      if (problem) {
        showStatus(problem, 'error');
        focusFirstInvalid();
        return;
      }

      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      statusBox.hidden = true;

      fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.quoteEndpoint) || '/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
        .then(function (res) {
          if (!res.ok) throw new Error('request-failed');
          return res.json();
        })
        .then(function () {
          form.reset();
          clearErrors();
          showStatus(
            'Got it. Nothing is booked. We will read the brief and come back with a suggested team as soon as we can, usually the same day.',
            'success'
          );
          if (statusBox.scrollIntoView) statusBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
        })
        .catch(function () {
          showStatus('Something went wrong sending that. Please call or email us instead.', 'error');
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        });
    });
  }
})();
