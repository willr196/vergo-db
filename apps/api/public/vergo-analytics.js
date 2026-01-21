/**
 * VERGO Ltd - Google Analytics 4 Integration
 * 
 * SETUP:
 * 1. Replace 'G-XXXXXXXXXX' below with your actual GA4 Measurement ID
 * 2. Add this to all pages before </body>:
 *    <script src="/vergo-analytics.js"></script>
 */

(function() {
  'use strict';

  // ========================================
  // CONFIGURATION - UPDATE THIS!
  // ========================================
  const GA_MEASUREMENT_ID = 'G-L4XRTDYMTZ'; 
  // ========================================

  // Don't run on admin pages
  if (window.location.pathname.includes('admin') || window.location.pathname.includes('login')) {
    return;
  }

  // Load Google Analytics
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
  document.head.appendChild(script);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    page_title: document.title,
    page_location: window.location.href
  });

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // FORM TRACKING
    // ========================================
    
    // Track all form submissions
    document.querySelectorAll('form').forEach(function(form) {
      form.addEventListener('submit', function() {
        const formId = form.id || form.getAttribute('name') || 'unknown_form';
        gtag('event', 'form_submission', {
          event_category: 'forms',
          event_label: formId
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
    // CLICK TRACKING
    // ========================================

    // Phone clicks
    document.querySelectorAll('a[href^="tel:"]').forEach(function(link) {
      link.addEventListener('click', function() {
        gtag('event', 'phone_click', {
          event_category: 'contact',
          event_label: link.href
        });
      });
    });

    // Email clicks
    document.querySelectorAll('a[href^="mailto:"]').forEach(function(link) {
      link.addEventListener('click', function() {
        gtag('event', 'email_click', {
          event_category: 'contact',
          event_label: link.href
        });
      });
    });

    // WhatsApp clicks
    document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(function(link) {
      link.addEventListener('click', function() {
        gtag('event', 'whatsapp_click', {
          event_category: 'contact',
          event_label: 'whatsapp'
        });
      });
    });

    // CTA button clicks
    document.querySelectorAll('.cta-button, .btn-primary, [class*="cta"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        gtag('event', 'cta_click', {
          event_category: 'engagement',
          event_label: btn.textContent.trim().substring(0, 50)
        });
      });
    });

    // ========================================
    // CALCULATOR TRACKING
    // ========================================

    // Track calculator interactions
    const calculator = document.querySelector('#calculator, .calculator, [class*="calculator"]');
    if (calculator) {
      let calculatorUsed = false;
      calculator.addEventListener('input', function() {
        if (!calculatorUsed) {
          calculatorUsed = true;
          gtag('event', 'calculator_started', {
            event_category: 'engagement',
            event_label: 'pricing_calculator'
          });
        }
      });

      // Track calculate button click
      const calcBtn = calculator.querySelector('button, [type="submit"]');
      if (calcBtn) {
        calcBtn.addEventListener('click', function() {
          gtag('event', 'calculator_used', {
            event_category: 'engagement',
            event_label: 'pricing_calculator'
          });
        });
      }
    }

    // ========================================
    // JOB BOARD TRACKING
    // ========================================

    // Track job views
    if (window.location.pathname.includes('job')) {
      const jobTitle = document.querySelector('h1, .job-title');
      if (jobTitle) {
        gtag('event', 'job_view', {
          event_category: 'jobs',
          event_label: jobTitle.textContent.trim()
        });
      }
    }

    // Track job card clicks
    document.querySelectorAll('.job-card, [class*="job-item"]').forEach(function(card) {
      card.addEventListener('click', function() {
        const title = card.querySelector('h2, h3, .title');
        gtag('event', 'job_click', {
          event_category: 'jobs',
          event_label: title ? title.textContent.trim() : 'unknown'
        });
      });
    });

    // ========================================
    // BLOG TRACKING
    // ========================================

    // Track blog article reads (30 seconds on page)
    if (window.location.pathname.includes('blog')) {
      setTimeout(function() {
        gtag('event', 'article_read', {
          event_category: 'blog',
          event_label: document.title
        });
      }, 30000);
    }

    // ========================================
    // SCROLL DEPTH TRACKING
    // ========================================

    let scrollMarks = {};
    window.addEventListener('scroll', throttle(function() {
      const scrollPercent = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );

      [25, 50, 75, 90].forEach(function(mark) {
        if (scrollPercent >= mark && !scrollMarks[mark]) {
          scrollMarks[mark] = true;
          gtag('event', 'scroll_depth', {
            event_category: 'engagement',
            event_label: mark + '%',
            non_interaction: true
          });
        }
      });
    }, 500));

    console.log('VERGO Analytics loaded - ID:', GA_MEASUREMENT_ID);
  });

  // Throttle helper
  function throttle(fn, wait) {
    let lastTime = 0;
    return function() {
      const now = Date.now();
      if (now - lastTime >= wait) {
        lastTime = now;
        fn.apply(this, arguments);
      }
    };
  }

  // ========================================
  // PUBLIC API (optional use)
  // ========================================

  window.vergoAnalytics = {
    // Track custom event
    track: function(eventName, params) {
      gtag('event', eventName, params || {});
    },

    // Track conversion with value
    conversion: function(eventName, value) {
      gtag('event', eventName, {
        event_category: 'conversion',
        value: value || 1,
        currency: 'GBP'
      });
    },

    // Manual page view (for SPAs)
    pageView: function(path, title) {
      gtag('config', GA_MEASUREMENT_ID, {
        page_path: path,
        page_title: title
      });
    }
  };

})();
