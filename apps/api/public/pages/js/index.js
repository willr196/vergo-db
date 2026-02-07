(function () {
  'use strict';

  function toggleFAQ(button) {
    const item = button.closest('.faq-item');
    const wasActive = item.classList.contains('active');

    // Close all other items
    document.querySelectorAll('.faq-item.active').forEach((el) => {
      el.classList.remove('active');
      el.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
    });

    // Toggle clicked item
    if (!wasActive) {
      item.classList.add('active');
      button.setAttribute('aria-expanded', 'true');
    }
  }

  function initFAQ() {
    document.querySelectorAll('.faq-question').forEach((button) => {
      button.addEventListener('click', () => toggleFAQ(button));
    });
  }

  // Fade in elements when they come into view
  function initScrollAnimations() {
    const fadeElements = document.querySelectorAll('.fade-in');

    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fadeElements.forEach((el) => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    fadeElements.forEach((el) => observer.observe(el));
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(() => {
    initFAQ();
    initScrollAnimations();
  });
})();

