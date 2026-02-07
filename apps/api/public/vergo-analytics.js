/**
 * VERGO Ltd - Google Analytics 4 Integration
 *
 * Privacy/Security:
 * - Loads GA only after user consent (localStorage: "vergo_cookie_consent" = "accepted").
 * - Never sends full URLs with query strings (avoids leaking tokens like reset links).
 * - Avoids sending PII (email addresses / phone numbers) as event labels.
 */

(function () {
  'use strict';

  // ========================================
  // CONFIGURATION
  // ========================================
  const GA_MEASUREMENT_ID = 'G-L4XRTDYMTZ';
  const CONSENT_KEY = 'vergo_cookie_consent'; // "accepted" | "rejected"

  // Don't run on admin pages or login flows.
  const pathname = String(window.location.pathname || '');
  if (pathname.includes('admin') || pathname.includes('login')) return;

  // Respect Do Not Track.
  const dnt = (navigator.doNotTrack === '1' || window.doNotTrack === '1');
  if (dnt) return;

  function readConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  }

  function writeConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Ignore storage failures (private mode, etc.)
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function getSanitizedPageLocation() {
    // Never include query params or hash fragments (may contain tokens/PII).
    return window.location.origin + window.location.pathname;
  }

  // Provide a safe no-op API even when analytics is disabled.
  window.vergoAnalytics = window.vergoAnalytics || {
    track: function () {},
    conversion: function () {},
    pageView: function () {},
  };

  function ensureGtagScript() {
    const src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  function initGtag() {
    // Initialize gtag (queue until the GA script loads)
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      page_title: document.title,
      page_location: getSanitizedPageLocation(),
    });

    return gtag;
  }

  function initTracking(gtag) {
    onReady(function () {
      // ========================================
      // FORM TRACKING
      // ========================================
      document.querySelectorAll('form').forEach(function (form) {
        form.addEventListener('submit', function () {
          const formId = form.id || form.getAttribute('name') || 'unknown_form';
          gtag('event', 'form_submission', {
            event_category: 'forms',
            event_label: formId,
          });

          // Track specific conversion types
          if (formId.includes('quote') || formId.includes('event')) {
            gtag('event', 'quote_request', { event_category: 'conversion' });
          }
          if (formId.includes('staff') || formId.includes('hire')) {
            gtag('event', 'staff_request', { event_category: 'conversion' });
          }
          if (formId.includes('apply') || formId.includes('application')) {
            gtag('event', 'job_application', { event_category: 'conversion' });
          }
          if (formId.includes('contact') || formId.includes('general')) {
            gtag('event', 'contact_form', { event_category: 'conversion' });
          }
        });
      });

      // ========================================
      // CLICK TRACKING (no PII)
      // ========================================
      document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
        link.addEventListener('click', function () {
          gtag('event', 'phone_click', {
            event_category: 'contact',
            event_label: 'tel',
          });
        });
      });

      document.querySelectorAll('a[href^="mailto:"]').forEach(function (link) {
        link.addEventListener('click', function () {
          gtag('event', 'email_click', {
            event_category: 'contact',
            event_label: 'mailto',
          });
        });
      });

      document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(function (link) {
        link.addEventListener('click', function () {
          gtag('event', 'whatsapp_click', {
            event_category: 'contact',
            event_label: 'whatsapp',
          });
        });
      });

      document.querySelectorAll('.cta-button, .btn-primary, [class*="cta"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          gtag('event', 'cta_click', {
            event_category: 'engagement',
            event_label: String(btn.textContent || '').trim().substring(0, 50),
          });
        });
      });

      // ========================================
      // CALCULATOR TRACKING
      // ========================================
      const calculator = document.querySelector('#calculator, .calculator, [class*="calculator"]');
      if (calculator) {
        let calculatorUsed = false;
        calculator.addEventListener('input', function () {
          if (!calculatorUsed) {
            calculatorUsed = true;
            gtag('event', 'calculator_started', {
              event_category: 'engagement',
              event_label: 'pricing_calculator',
            });
          }
        });

        const calcBtn = calculator.querySelector('button, [type="submit"]');
        if (calcBtn) {
          calcBtn.addEventListener('click', function () {
            gtag('event', 'calculator_used', {
              event_category: 'engagement',
              event_label: 'pricing_calculator',
            });
          });
        }
      }

      // ========================================
      // JOB BOARD TRACKING
      // ========================================
      if (window.location.pathname.includes('job')) {
        const jobTitle = document.querySelector('h1, .job-title');
        if (jobTitle) {
          gtag('event', 'job_view', {
            event_category: 'jobs',
            event_label: String(jobTitle.textContent || '').trim().substring(0, 120),
          });
        }
      }

      document.querySelectorAll('.job-card, [class*="job-item"]').forEach(function (card) {
        card.addEventListener('click', function () {
          const title = card.querySelector('h2, h3, .title');
          gtag('event', 'job_click', {
            event_category: 'jobs',
            event_label: title ? String(title.textContent || '').trim().substring(0, 120) : 'unknown',
          });
        });
      });

      // ========================================
      // BLOG TRACKING
      // ========================================
      if (window.location.pathname.includes('blog')) {
        setTimeout(function () {
          gtag('event', 'article_read', {
            event_category: 'blog',
            event_label: document.title,
          });
        }, 30000);
      }

      // ========================================
      // SCROLL DEPTH TRACKING
      // ========================================
      let scrollMarks = {};
      window.addEventListener(
        'scroll',
        throttle(function () {
          const denom = (document.body.scrollHeight - window.innerHeight) || 1;
          const scrollPercent = Math.round((window.scrollY / denom) * 100);

          [25, 50, 75, 90].forEach(function (mark) {
            if (scrollPercent >= mark && !scrollMarks[mark]) {
              scrollMarks[mark] = true;
              gtag('event', 'scroll_depth', {
                event_category: 'engagement',
                event_label: mark + '%',
                non_interaction: true,
              });
            }
          });
        }, 500),
        { passive: true }
      );
    });

    // Public API
    window.vergoAnalytics = {
      track: function (eventName, params) {
        gtag('event', eventName, params || {});
      },
      conversion: function (eventName, value) {
        gtag('event', eventName, {
          event_category: 'conversion',
          value: value || 1,
          currency: 'GBP',
        });
      },
      pageView: function (path, title) {
        const safePath = String(path || '').startsWith('/') ? path : '/';
        gtag('config', GA_MEASUREMENT_ID, {
          page_path: safePath,
          page_title: title || document.title,
          page_location: window.location.origin + safePath,
        });
      },
    };
  }

  function initAnalytics() {
    ensureGtagScript();
    const gtag = initGtag();
    initTracking(gtag);
  }

  function showConsentBanner() {
    onReady(function () {
      if (document.getElementById('vergo-cookie-banner')) return;

      const banner = document.createElement('div');
      banner.id = 'vergo-cookie-banner';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-live', 'polite');
      banner.style.position = 'fixed';
      banner.style.left = '16px';
      banner.style.right = '16px';
      banner.style.bottom = '16px';
      banner.style.zIndex = '9999';
      banner.style.background = '#1c1c1c';
      banner.style.color = '#fff';
      banner.style.borderRadius = '12px';
      banner.style.padding = '14px 16px';
      banner.style.boxShadow = '0 10px 30px rgba(0,0,0,0.35)';
      banner.style.fontFamily = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      banner.style.display = 'flex';
      banner.style.gap = '12px';
      banner.style.alignItems = 'center';
      banner.style.justifyContent = 'space-between';

      banner.innerHTML =
        '<div style="line-height:1.35; font-size:13px; max-width: 880px;">' +
        'We use optional analytics cookies to understand site usage. ' +
        '<a href="/privacy.html" style="color:#D4AF37; text-decoration:none;">Privacy Policy</a>' +
        '</div>' +
        '<div style="display:flex; gap:8px; flex-shrink:0;">' +
        '<button id="vergo-cookie-reject" style="border:1px solid rgba(255,255,255,0.25); background:transparent; color:#fff; border-radius:10px; padding:10px 12px; font-size:13px; cursor:pointer;">Reject</button>' +
        '<button id="vergo-cookie-accept" style="border:0; background:#D4AF37; color:#111; border-radius:10px; padding:10px 12px; font-size:13px; cursor:pointer; font-weight:700;">Accept</button>' +
        '</div>';

      document.body.appendChild(banner);

      const acceptBtn = document.getElementById('vergo-cookie-accept');
      const rejectBtn = document.getElementById('vergo-cookie-reject');

      if (acceptBtn) {
        acceptBtn.addEventListener('click', function () {
          writeConsent('accepted');
          banner.remove();
          initAnalytics();
        });
      }

      if (rejectBtn) {
        rejectBtn.addEventListener('click', function () {
          writeConsent('rejected');
          banner.remove();
        });
      }
    });
  }

  // Throttle helper
  function throttle(fn, wait) {
    let lastTime = 0;
    return function () {
      const now = Date.now();
      if (now - lastTime >= wait) {
        lastTime = now;
        fn.apply(this, arguments);
      }
    };
  }

  const consent = readConsent();
  if (consent === 'accepted') {
    initAnalytics();
  } else if (consent === 'rejected') {
    // Do nothing.
  } else {
    showConsentBanner();
  }
})();
