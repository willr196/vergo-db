(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
      return;
    }

    fn();
  }

  function initRevealAnimations() {
    const elements = Array.from(document.querySelectorAll('.reveal, [data-reveal]'));

    if (!elements.length) {
      return;
    }

    const visibleClassFor = (element) => (
      element.classList.contains('reveal') ? 'visible' : 'is-visible'
    );

    const revealAll = () => {
      elements.forEach((element) => {
        element.classList.add(visibleClassFor(element));
      });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealAll();
      return;
    }

    if (typeof window.IntersectionObserver !== 'function') {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add(visibleClassFor(entry.target));
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -60px 0px'
    });

    elements.forEach((element) => observer.observe(element));
  }

  onReady(() => {
    if (document.body.classList.contains('homepage')) {
      document.documentElement.classList.add('homepage-root');
      document.documentElement.classList.add('homepage-enhanced');
    }

    initRevealAnimations();
  });
})();
