(function () {
  'use strict';

  const header = document.getElementById('site-header');
  const button = document.getElementById('mobile-menu-button');
  const menu = document.getElementById('mobile-menu');

  if (header) {
    const syncHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
    };

    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
  }

  if (!button || !menu) {
    return;
  }

  const closeMenu = () => {
    button.classList.remove('is-active');
    button.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    menu.hidden = true;
    document.body.classList.remove('menu-open');
  };

  const openMenu = () => {
    button.classList.add('is-active');
    button.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    menu.classList.add('is-open');
    document.body.classList.add('menu-open');
  };

  button.addEventListener('click', () => {
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
    if (header && header.contains(event.target)) {
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
    if (window.innerWidth > 960) {
      closeMenu();
    }
  });
})();
