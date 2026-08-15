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

    rates: {
      chargeRate: 19.00,
      chargeRateDisplay: '£19.00',
      minimumHours: 4,
      holidayPayPercent: 12.07,
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
  // data-vergo-tel="path" (builds a tel: href) or data-vergo-mailto="path" (builds a mailto: href).
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
  }

  window.applyVergoConfig = applyVergoConfig;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyVergoConfig(); });
  } else {
    applyVergoConfig();
  }
})();
