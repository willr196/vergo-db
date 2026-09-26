/**
 * Quote page — live estimate plus two ways to send it.
 *
 * The estimate is worked out on the page as the client fills the form, so they
 * see the number before committing to anything. The same form then submits under
 * one of two intents:
 *   BOOKING — "book this", so every detail we need to staff the job is required.
 *   ENQUIRY — "I have a question", so the only thing required is a way to reply.
 * The intent travels with the payload; the API validates each one differently.
 */
(function () {
  'use strict';

  var form = document.getElementById('quoteForm');
  if (!form) return;

  var statusBox = document.getElementById('quoteStatus');
  var bookBtn = document.getElementById('quoteBook');
  var askBtn = document.getElementById('quoteAsk');

  var panel = document.getElementById('estimatePanel');
  var totalEl = document.getElementById('estimateTotal');
  var breakdownEl = document.getElementById('estimateBreakdown');
  var baseLabelEl = document.getElementById('estimateBaseLabel');
  var baseEl = document.getElementById('estimateBase');
  var upliftRowEl = document.getElementById('estimateUpliftRow');
  var upliftLabelEl = document.getElementById('estimateUpliftLabel');
  var upliftEl = document.getElementById('estimateUplift');
  var sumEl = document.getElementById('estimateSum');
  var notesEl = document.getElementById('estimateNotes');
  var updateBtn = document.getElementById('estimateUpdate');
  var nextDayEl = document.getElementById('shiftEndsNextDay');
  var shiftSummaryEl = document.getElementById('shiftSummary');

  // What has to be there before we will take a booking. Order matters — it
  // decides which field we scroll to when something is missing. Headcount is not
  // in the list: it comes from the per-role numbers, checked separately below.
  // Start and finish times are left out on purpose: plenty of clients don't know
  // them yet, and we agree them when we confirm. They only drive the estimate.
  var BOOKING_FIELDS = [
    { name: 'eventDate', label: 'the event date' },
    { name: 'eventType', label: 'the event type' },
    { name: 'venuePostcode', label: 'the venue postcode' },
    { name: 'name', label: 'your name' },
    { name: 'email', label: 'your email address' },
    { name: 'phone', label: 'your phone number' }
  ];

  /** The rate card from /vergo-site-config.js, or null if it is not there. No
   *  fallback figure lives in this file: a wrong price shown confidently is
   *  worse than no price, and the rate has exactly one home (config/pricing.ts). */
  function getConfig() {
    var rates = window.VERGO_CONFIG && window.VERGO_CONFIG.rates;
    if (!rates || typeof rates.standardRate !== 'number' || typeof rates.minimumHours !== 'number' || !window.VergoQuoteCalc) {
      return null;
    }
    return rates;
  }

  function serviceLevel() {
    var picked = form.querySelector('input[name="serviceLevel"]:checked');
    return picked && picked.value === 'premium' ? 'premium' : 'standard';
  }

  function minutesOf(value) {
    if (!value) return null;
    var parts = value.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  }

  /** True when the clock alone says the shift must run past midnight — the end
   *  time is at or before the start. Used to tick the next-day box for the
   *  client, not to overrule them once they have had a say. */
  function impliesNextDay(start, end) {
    var s = minutesOf(start);
    var e = minutesOf(end);
    if (s === null || e === null) return false;
    return e <= s;
  }

  function endsNextDay() {
    return !!(nextDayEl && nextDayEl.checked);
  }

  function hoursBetween(start, end, nextDay) {
    var s = minutesOf(start);
    var e = minutesOf(end);
    if (s === null || e === null) return 0;
    var diff = e - s;
    if (nextDay) diff += 24 * 60;
    if (diff <= 0) return 0; // same-day shift that ends before it starts — nonsense
    return diff / 60;
  }

  function money(value) {
    return '£' + value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatHours(value) {
    var rounded = Math.round(value * 100) / 100;
    return rounded + (rounded === 1 ? ' hour' : ' hours');
  }

  function plural(count, singular, pluralForm) {
    return count + ' ' + (count === 1 ? singular : pluralForm);
  }

  /** "Sat 12 Sep" from a yyyy-mm-dd value, parsed as a plain calendar date so a
   *  timezone can never shunt it onto the day before. */
  function formatDay(iso, addDays) {
    if (!iso) return null;
    var parts = iso.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    var date = new Date(parts[0], parts[1] - 1, parts[2] + (addDays || 0));
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** Spells the shift back out, so an overnight reads as two dates rather than a
   *  pair of times the client has to work out for themselves. */
  function renderShiftSummary() {
    if (!shiftSummaryEl) return;

    var start = form.elements.shiftStart.value;
    var end = form.elements.shiftEnd.value;
    if (!start || !end) {
      shiftSummaryEl.hidden = true;
      shiftSummaryEl.textContent = '';
      return;
    }

    var nextDay = endsNextDay();
    var hours = hoursBetween(start, end, nextDay);

    if (!hours) {
      shiftSummaryEl.hidden = false;
      shiftSummaryEl.dataset.state = 'warn';
      shiftSummaryEl.textContent = 'That end time is before the start time. Tick "finishes the next day" if the shift runs into the morning.';
      return;
    }

    var startDay = formatDay(form.elements.eventDate.value, 0);
    var endDay = formatDay(form.elements.eventDate.value, nextDay ? 1 : 0);
    var text;
    if (startDay && endDay) {
      text = startDay + ', ' + start + ' → ' + endDay + ', ' + end;
    } else {
      text = start + ' → ' + end + (nextDay ? ' the next day' : '');
    }

    shiftSummaryEl.hidden = false;
    shiftSummaryEl.dataset.state = nextDay ? 'overnight' : 'ok';
    shiftSummaryEl.textContent = text + ' · ' + formatHours(hours) + ' on shift';
  }

  /** Ticks the next-day box the first time the times imply it. Once the client
   *  has touched the box themselves we leave it alone — they may well mean a
   *  10am-to-2pm shift, and we should not keep arguing with them about it. */
  var nextDayTouched = false;
  function syncNextDay() {
    if (!nextDayEl || nextDayTouched) return;
    var implied = impliesNextDay(form.elements.shiftStart.value, form.elements.shiftEnd.value);
    if (nextDayEl.checked !== implied) nextDayEl.checked = implied;
  }

  /** Every role row that has a number in it, in page order. `kind` is 'senior'
   *  (quoted individually, so outside the estimate), 'other' (estimated at the
   *  standard rate, but the real rate depends on the role) or undefined for the
   *  roles that price at the standard rate outright. */
  function roleCounts() {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="roleCount"]'))
      .map(function (el) {
        var count = parseInt(el.value, 10);
        return {
          role: el.getAttribute('data-role'),
          kind: el.getAttribute('data-role-kind') || undefined,
          count: count > 0 ? count : 0
        };
      })
      .filter(function (entry) {
        return entry.count > 0;
      });
  }

  function sumCounts(entries) {
    return entries.reduce(function (total, entry) {
      return total + entry.count;
    }, 0);
  }

  function describeRoles(entries) {
    return entries.map(function (entry) {
      return entry.count + ' × ' + entry.role.toLowerCase();
    }).join(', ');
  }

  /** The figure itself comes from quote-calc.js, the browser copy of
   *  quoteShift() in config/pricing.ts. This gathers the form into its input. */
  function calculate() {
    var rates = getConfig();
    var nextDay = endsNextDay();
    var counts = roleCounts();
    var staffCount = sumCounts(counts);
    var base = {
      counts: counts,
      staffCount: staffCount,
      endsNextDay: nextDay,
      level: serviceLevel(),
      hasSenior: counts.some(function (entry) { return entry.kind === 'senior'; }),
      hasOther: counts.some(function (entry) { return entry.kind === 'other'; })
    };
    if (!rates) { base.unavailable = true; base.complete = false; return base; }

    var quote = window.VergoQuoteCalc.quoteShift({
      start: form.elements.shiftStart.value,
      end: form.elements.shiftEnd.value,
      finishesNextDay: nextDay,
      level: base.level,
      staff: counts.map(function (entry) {
        return { role: entry.role, count: entry.count, senior: entry.kind === 'senior' };
      })
    }, rates);

    base.rates = rates;
    base.quote = quote;
    base.complete = Boolean(quote) && staffCount > 0;
    base.billableCount = quote ? quote.pricedPeople : 0;
    base.total = base.complete ? quote.total : 0;
    return base;
  }

  function note(text) {
    var p = document.createElement('p');
    p.textContent = text;
    return p;
  }

  function showPrompt(text) {
    panel.dataset.state = 'empty';
    totalEl.textContent = '—';
    breakdownEl.hidden = true;
    notesEl.textContent = '';
    notesEl.appendChild(note(text));
  }

  /** What is still standing between the form and a figure, in the order the
   *  fields appear. Fed to the prompt so the panel names the gap rather than
   *  repeating the same sentence whatever is missing. */
  function missingForEstimate() {
    var gaps = [];
    if (!form.elements.shiftStart.value) gaps.push('a start time');
    if (!form.elements.shiftEnd.value) gaps.push('an end time');
    if (!roleCounts().length) gaps.push('how many of each role you need');
    return gaps;
  }

  function renderEstimate() {
    renderShiftSummary();
    var result = calculate();

    if (result.unavailable) {
      showPrompt('We cannot show the live figure just now. Send this over and we will price it by hand — nothing is booked either way.');
      return;
    }

    if (!result.complete) {
      var gaps = missingForEstimate();
      if (!gaps.length) {
        // Times and staff are all in, so the only way through here is an end
        // time sitting before the start on the same day.
        showPrompt('Those times do not add up to a shift. Tick "finishes the next day" if it runs into the morning.');
        return;
      }
      showPrompt('Add ' + gaps.join(', ').replace(/, ([^,]*)$/, ' and $1') + ', and the price appears here.');
      return;
    }

    // A brief made up only of senior roles has nothing to price at the standard
    // rate, so there is no figure to show — just the reason why.
    if (!result.billableCount) {
      showPrompt('Senior roles are quoted individually, so there is no standard-rate figure to show. Send this over and we will come back with a price.');
      return;
    }

    var q = result.quote;
    var rates = result.rates;
    var billedHours = q.billedMinutes / 60;
    panel.dataset.state = 'ready';
    totalEl.textContent = money(q.total);
    breakdownEl.hidden = false;
    baseLabelEl.textContent = plural(q.pricedPeople, 'person', 'people') + ' × ' + formatHours(billedHours) + ' × ' + money(q.rate);
    baseEl.textContent = money(q.base);
    upliftRowEl.hidden = !q.afterMidnightMinutes;
    if (q.afterMidnightMinutes) {
      upliftLabelEl.textContent = '+' + Math.round((rates.afterMidnightMultiplier - 1) * 100) + '% on ' +
        formatHours(q.afterMidnightMinutes / 60) + ' after midnight';
      upliftEl.textContent = money(q.uplift);
    }
    sumEl.textContent = money(q.total);

    notesEl.textContent = '';
    if (q.billedMinutes > q.workedMinutes) {
      notesEl.appendChild(note(
        q.workedMinutes < rates.minimumHours * 60
          ? 'The ' + rates.minimumHours + '-hour minimum applies: ' + formatHours(billedHours) + ' billed per person.'
          : 'Billed in ' + rates.overrunBlockMinutes + '-minute blocks: ' + formatHours(billedHours) + ' per person.'
      ));
    }
    if (result.level === 'premium') {
      notesEl.appendChild(note('Premium: ' + rates.premiumDefinition));
    }
    if (result.hasSenior) {
      notesEl.appendChild(note('Senior roles quoted individually, not included in this figure.'));
    }
    if (result.hasOther) {
      notesEl.appendChild(note('"Something else" is estimated at this rate until we confirm the role.'));
    }
    notesEl.appendChild(note('An estimate, not an invoice. We confirm the figure before anything is charged.'));
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
    });
  }

  function markInvalid(name, message) {
    var input = form.elements[name];
    if (input && input.setAttribute) input.setAttribute('aria-invalid', 'true');
    var wrapper = input && input.closest ? input.closest('.form-field') : null;
    if (!wrapper) return;
    wrapper.classList.add('field-invalid');
    var msg = document.createElement('p');
    msg.className = 'field-error-message';
    msg.textContent = message;
    wrapper.appendChild(msg);
  }

  function markRolesInvalid(message) {
    var fieldset = document.getElementById('rolesField');
    if (!fieldset) return;
    fieldset.classList.add('field-invalid');
    var msg = document.createElement('p');
    msg.className = 'field-error-message';
    msg.textContent = message;
    fieldset.appendChild(msg);
  }

  function focusFirstInvalid() {
    var first = form.querySelector('.field-invalid input, .field-invalid select, .field-invalid textarea');
    if (!first) return;
    first.focus();
    if (first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validate(intent) {
    clearErrors();

    var email = form.elements.email.value.trim();

    if (intent === 'BOOKING') {
      var missing = [];
      BOOKING_FIELDS.forEach(function (field) {
        if (!(form.elements[field.name].value || '').trim()) {
          markInvalid(field.name, 'Needed to book.');
          missing.push(field.label);
        }
      });
      if (!roleCounts().length) {
        markRolesInvalid('Put a number next to at least one role.');
        missing.push('how many staff you need, by role');
      }
      if (missing.length) {
        return 'To book we still need ' + missing.join(', ') + '.';
      }
      if (!looksLikeEmail(email)) {
        markInvalid('email', 'Check this email address.');
        return 'That email address does not look right.';
      }
      return null;
    }

    // ENQUIRY — everything optional except a way of getting back to them.
    if (!email && !form.elements.phone.value.trim()) {
      markInvalid('email', 'Email or phone — either will do.');
      return 'Leave us an email address or a phone number so we can reply.';
    }
    if (email && !looksLikeEmail(email)) {
      markInvalid('email', 'Check this email address.');
      return 'That email address does not look right.';
    }
    return null;
  }

  function showStatus(message, state) {
    statusBox.textContent = message;
    statusBox.dataset.state = state;
    statusBox.hidden = false;
  }

  function buildPayload(intent) {
    var result = calculate();
    var counts = result.counts;

    return {
      intent: intent,
      name: form.elements.name.value.trim() || undefined,
      email: form.elements.email.value.trim() || undefined,
      phone: form.elements.phone.value.trim() || undefined,
      company: form.elements.company.value.trim() || undefined,
      eventType: form.elements.eventType.value || undefined,
      eventDate: form.elements.eventDate.value || undefined,
      location: form.elements.venuePostcode.value.trim() || undefined,
      shiftStart: form.elements.shiftStart.value || undefined,
      shiftEnd: form.elements.shiftEnd.value || undefined,
      shiftEndsNextDay: result.endsNextDay || undefined,
      serviceLevel: document.getElementById('serviceLevelField') ? result.level.toUpperCase() : undefined,
      staffNeeded: result.staffCount || undefined,
      roles: counts.length
        ? counts.map(function (entry) { return entry.role; })
        : undefined,
      staffByRole: counts.length
        ? counts.map(function (entry) { return { role: entry.role, count: entry.count }; })
        : undefined,
      dressCode: form.elements.dressCode.value.trim() || undefined,
      message: form.elements.message.value.trim() || undefined,
      estimatedTotal: result.total || undefined,
      honeypot: form.elements.website.value || ''
    };
  }

  // Which button was pressed decides the intent. Both are submit buttons, so the
  // keyboard path (Enter inside a field) still works and picks the first one, Book.
  var pendingIntent = 'BOOKING';
  [bookBtn, askBtn].forEach(function (btn) {
    btn.addEventListener('click', function () {
      pendingIntent = btn.dataset.intent;
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (form.elements.website.value) return; // honeypot triggered, silently drop

    var intent = pendingIntent;
    var problem = validate(intent);
    if (problem) {
      showStatus(problem, 'error');
      focusFirstInvalid();
      return;
    }

    var button = intent === 'BOOKING' ? bookBtn : askBtn;
    var originalLabel = button.textContent;
    bookBtn.disabled = true;
    askBtn.disabled = true;
    button.textContent = 'Sending…';
    statusBox.hidden = true;

    fetch((window.VERGO_CONFIG && window.VERGO_CONFIG.forms.quoteEndpoint) || '/api/v1/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(intent))
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request-failed');
        return res.json();
      })
      .then(function () {
        form.reset();
        clearErrors();
        nextDayTouched = false;
        refresh();
        showStatus(
          intent === 'BOOKING'
            ? 'Booking request sent. Nothing is confirmed until we come back with names. ' + ((window.VERGO_CONFIG && window.VERGO_CONFIG.terms.confirmationPromise) || '')
            : 'Message sent. Nothing has been booked. We will reply as soon as we can.',
          'success'
        );
      })
      .catch(function () {
        showStatus('Something went wrong sending that. Please call or WhatsApp us instead.', 'error');
      })
      .finally(function () {
        bookBtn.disabled = false;
        askBtn.disabled = false;
        button.textContent = originalLabel;
        pendingIntent = 'BOOKING';
      });
  });

  // A redraw is cheap and happens on every keystroke, so one bad value must not
  // be able to take the panel down for the rest of the session.
  function refresh() {
    try {
      syncNextDay();
      renderEstimate();
    } catch (err) {
      if (window.console && console.error) console.error('[quote] estimate redraw failed', err);
    }
  }

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);

  // Once the client has decided for themselves whether this runs into the next
  // day, we stop guessing on their behalf.
  if (nextDayEl) {
    nextDayEl.addEventListener('change', function () {
      nextDayTouched = true;
    });
  }

  // The explicit ask. Nothing here that typing does not already do — its job is
  // to confirm out loud that the figure on screen is the current one, and to say
  // what is missing when there is no figure yet.
  if (updateBtn) {
    updateBtn.addEventListener('click', function () {
      refresh();
      var result = calculate();
      if (result.unavailable) {
        showStatus('The live rate card has not loaded, so there is no figure to show. Send it over and we will price it by hand.', 'info');
        return;
      }
      if (result.complete && result.billableCount) {
        showStatus('Estimate updated: ' + money(result.total) + ' for the shift.', 'success');
      } else {
        var gaps = missingForEstimate();
        showStatus(
          gaps.length
            ? 'Nothing to price yet — add ' + gaps.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.'
            : 'Nothing to price yet. Send it over and we will come back with a figure.',
          gaps.length ? 'error' : 'info'
        );
      }
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  window.addEventListener('load', refresh);
  refresh();
})();
