(function () {
  'use strict';

  function closeFAQItem(item) {
    item.classList.remove('active');
    item.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');

    const answer = item.querySelector('.faq-answer');
    if (answer) {
      answer.style.maxHeight = '0px';
    }
  }

  function openFAQItem(item, button) {
    const answer = item.querySelector('.faq-answer');

    item.classList.add('active');
    button.setAttribute('aria-expanded', 'true');

    if (answer) {
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    }
  }

  function toggleFAQ(button) {
    const item = button.closest('.faq-item');
    if (!item) {
      return;
    }

    const wasActive = item.classList.contains('active');

    // Close all other items
    document.querySelectorAll('.faq-item.active').forEach((el) => {
      closeFAQItem(el);
    });

    // Toggle clicked item
    if (!wasActive) {
      openFAQItem(item, button);
    }
  }

  function initFAQ() {
    document.querySelectorAll('.faq-question').forEach((button) => {
      button.addEventListener('click', () => toggleFAQ(button));
    });
  }

  function initHeroSpotlight() {
    const hero = document.querySelector('.hero');
    if (!hero) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (!window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    let frameId = null;

    hero.addEventListener('pointermove', (event) => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;

        hero.style.setProperty('--hero-pointer-x', `${x}%`);
        hero.style.setProperty('--hero-pointer-y', `${y}%`);
        frameId = null;
      });
    });

    hero.addEventListener('pointerleave', () => {
      hero.style.removeProperty('--hero-pointer-x');
      hero.style.removeProperty('--hero-pointer-y');
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
    initHeroSpotlight();
    initScrollAnimations();
  });
})();
