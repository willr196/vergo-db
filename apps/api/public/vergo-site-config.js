/**
 * VERGO — single source of truth for rates, copy figures and contact details.
 * Edit values here; pages read them via data-vergo="<key>" and the applyVergoConfig() call
 * at the bottom of this file. Don't hardcode rates/contact details elsewhere in markup.
 */
(function () {
  'use strict';

  window.VERGO_CONFIG = {
    company: {
      legalName: 'Vergo Ltd',
      number: '16627585',
      jurisdiction: 'England and Wales',
      registeredOffice: '96 Sulivan Court, London, SW6 3DB',
    },

    contact: {
      phone: '+44 7944 505783',
      phoneDisplay: '07944 505783',
      email: 'wrobb@vergoltd.com',
    },

    social: {
      instagram: 'https://www.instagram.com/vergo.ltd/',
      instagramHandle: '@vergo.ltd',
    },

    // Google Business review link. While it's empty every "Google reviews" link
    // stays hidden; paste the share link from the Business Profile to show them.
    reviews: {
      google: 'https://share.google/ej5Ce91xOfUCqbyfp',
    },

    rates: {
      chargeRate: 18.50,
      chargeRateDisplay: '£18.50',
      minimumHours: 4,
      holidayPayPercent: 12.07,
    },

    // Special Events charge rates, £/hour per person. Mirrors the
    // specialEvents block in apps/api/src/config/pricing.ts, which is the real
    // source of truth — these are the fallback until /api/v1/rates resolves.
    // The display strings are what /special-events/halloween renders.
    specialEvents: {
      themedHospitality: 22.00,
      themedHospitalityDisplay: '£22',
      characterPerformer: 30.00,
      characterPerformerDisplay: '£30',
      makeupArtist: 40.00,
      makeupArtistDisplay: '£40',
      minimumHours: 4,
    },

    guarantees: {
      confirmationWindow: '8am–10pm',
      replacementMinutes: 60,
    },

    terms: {
      paymentTermsDays: 14,
      cancellation: {
        freeHours: 48,
        halfChargeHours: 24,
        fullChargeHours: 12,
      },
    },

    forms: {
      quoteEndpoint: '/api/v1/quotes',
      applicationsEndpoint: '/api/v1/applications',
      applicationsPresignEndpoint: '/api/v1/applications/presign',
      applicationsVerifyUploadEndpoint: '/api/v1/applications/verify-upload',
      applicationsDirectUploadEndpoint: '/api/v1/applications/direct-upload',
    },

    // Legal-page placeholders. These are first-draft values only — confirm each
    // with a solicitor before the /terms, /privacy and /legal pages are treated
    // as final. See the "first draft" banner on each of those pages.
    legal: {
      transferFeeExtendedHireWeeks: '[TO CONFIRM]',
      transferFeeAmount: '[TO CONFIRM]',
      icoRegistrationNumber: '[TO CONFIRM]',
      insurerName: '[TO CONFIRM]',
      liabilityCapNote: '[TO CONFIRM]',
      quoteEnquiryRetention: '12 months from your last contact with us',
      unsuccessfulApplicationRetention: '12 months from the date of your application',
      complaintsResponseTarget: '5 working days',
    },
  };

  function readPath(path) {
    return path.split('.').reduce(function (acc, key) {
      return acc && acc[key] !== undefined ? acc[key] : undefined;
    }, window.VERGO_CONFIG);
  }

  // Fill any element carrying data-vergo="path.to.value" (textContent),
  // data-vergo-tel="path" (builds a tel: href), data-vergo-mailto="path" (builds a mailto: href)
  // or data-vergo-href="path" (plain URL; the element is hidden while the value is empty).
  function applyVergoConfig(root) {
    var scope = root || document;

    scope.querySelectorAll('[data-vergo]').forEach(function (node) {
      var value = readPath(node.getAttribute('data-vergo'));
      if (value !== undefined) node.textContent = value;
    });

    scope.querySelectorAll('[data-vergo-tel]').forEach(function (node) {
      var value = readPath(node.getAttribute('data-vergo-tel'));
      if (value !== undefined) node.setAttribute('href', 'tel:' + String(value).replace(/\s+/g, ''));
    });

    scope.querySelectorAll('[data-vergo-mailto]').forEach(function (node) {
      var value = readPath(node.getAttribute('data-vergo-mailto'));
      if (value !== undefined) node.setAttribute('href', 'mailto:' + value);
    });

    scope.querySelectorAll('[data-vergo-href]').forEach(function (node) {
      var value = readPath(node.getAttribute('data-vergo-href'));
      if (value === undefined) return;
      if (value) node.setAttribute('href', value);
      node.hidden = !value;
    });
  }

  window.applyVergoConfig = applyVergoConfig;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyVergoConfig(); });
  } else {
    applyVergoConfig();
  }

  // The rates block above is a fallback only, used until this resolves (or if
  // it fails) — /api/v1/rates, backed by config/pricing.ts, is the actual
  // source of truth. Re-applies once loaded so any figure already rendered
  // from the fallback gets corrected rather than left stale.
  fetch('/api/v1/rates')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (body) {
      if (!body || !body.ok || !body.data) return;
      var rate = body.data.standardRate;
      window.VERGO_CONFIG.rates.chargeRate = rate;
      window.VERGO_CONFIG.rates.chargeRateDisplay = '£' + Number(rate).toFixed(2);
      window.VERGO_CONFIG.rates.minimumHours = body.data.minimumChargeHours;
      window.VERGO_CONFIG.rates.holidayPayPercent = body.data.holidayPayPercent;

      // Special-events rates, when the API is new enough to serve them. Whole
      // pounds: these are round rate-card figures, not computed totals, so
      // "£22" reads better than "£22.00" at display size.
      var se = body.data.specialEvents;
      if (se) {
        var target = window.VERGO_CONFIG.specialEvents;
        ['themedHospitality', 'characterPerformer', 'makeupArtist'].forEach(function (key) {
          if (typeof se[key] !== 'number') return;
          target[key] = se[key];
          target[key + 'Display'] = '£' + (se[key] % 1 === 0 ? se[key] : se[key].toFixed(2));
        });
        if (typeof se.minimumChargeHours === 'number') target.minimumHours = se.minimumChargeHours;
      }

      applyVergoConfig();

      // Anything that derives a figure from the rate card (the quote estimate,
      // the special-events pricing) has to redraw now that the real rates are
      // in. Pages used to guess at this with a timer, which showed the fallback
      // rate as though it were final whenever the request took longer.
      window.dispatchEvent(new CustomEvent('vergo:rates'));
    })
    .catch(function () {
      // Offline or the API is unreachable — the fallback above stands.
    });
})();
