(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
      return;
    }

    fn();
  }

  function initMobileMenu() {
    const button = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('mobile-menu');

    if (!button || !menu) {
      return;
    }

    const closeMenu = () => {
      button.classList.remove('is-active');
      menu.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    const openMenu = () => {
      button.classList.add('is-active');
      menu.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    };

    button.addEventListener('click', (event) => {
      event.preventDefault();

      if (menu.classList.contains('is-open')) {
        closeMenu();
        return;
      }

      openMenu();
    });

    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (button.contains(target) || menu.contains(target)) {
        return;
      }

      closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768) {
        closeMenu();
      }
    });
  }

  function initRevealAnimations() {
    const elements = document.querySelectorAll('[data-reveal]');

    if (!elements.length) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.16,
      rootMargin: '0px 0px -40px 0px'
    });

    elements.forEach((element) => observer.observe(element));
  }

  function initHeroSpotlight() {
    const hero = document.querySelector('.hero-stage');

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

        hero.style.setProperty('--pointer-x', `${x}%`);
        hero.style.setProperty('--pointer-y', `${y}%`);
        frameId = null;
      });
    });

    hero.addEventListener('pointerleave', () => {
      hero.style.removeProperty('--pointer-x');
      hero.style.removeProperty('--pointer-y');
    });
  }

  function initHeaderState() {
    const header = document.getElementById('site-header');

    if (!header) {
      return;
    }

    const syncState = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
    };

    syncState();
    window.addEventListener('scroll', syncState, { passive: true });
  }

  onReady(() => {
    // Fallback: add .homepage-root to <html> for browsers without :has() support
    if (document.body.classList.contains('homepage')) {
      document.documentElement.classList.add('homepage-root');
    }

    initMobileMenu();
    initRevealAnimations();
    initHeroSpotlight();
    initHeaderState();
  });
})();
