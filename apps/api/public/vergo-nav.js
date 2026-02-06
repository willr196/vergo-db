/**
 * VERGO Ltd - Premium Navigation Component
 * Modern, warm design with Inter font and muted gold accents
 *
 * Usage: Add before </body>:
 *   <script src="/vergo-nav.js"></script>
 */

(function() {
  'use strict';

  // Determine current page for active state
  const currentPath = window.location.pathname.replace(/\/$/, '').replace(/\.html$/, '');

  const isActive = (page) => {
    const normalised = page.replace(/\/$/, '').replace(/\.html$/, '');
    if ((normalised === '' || normalised === '/') && (currentPath === '' || currentPath === '/')) return true;
    return currentPath === normalised;
  };

  // Navigation HTML - Premium structure
  const navHTML = `
    <div class="nav-container">
      <a href="/" class="logo" aria-label="VERGO Ltd Home">
        <img src="/logo.png" alt="VERGO Ltd">
      </a>

      <button class="menu-toggle" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="nav-menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav role="navigation" aria-label="Main navigation">
        <ul id="nav-menu">
          <li><a href="/"${isActive('/') ? ' aria-current="page"' : ''}>Home</a></li>
          <li><a href="/hire-staff"${isActive('/hire-staff') ? ' aria-current="page"' : ''}>Hire Event Staff</a></li>
          <li><a href="/pricing"${isActive('/pricing') ? ' aria-current="page"' : ''}>Pricing</a></li>
          <li><a href="/jobs"${isActive('/jobs') ? ' aria-current="page"' : ''}>Job Board</a></li>
          <li><a href="/blog"${isActive('/blog') ? ' aria-current="page"' : ''}>Blog</a></li>
          <li><a href="/apply"${isActive('/apply') ? ' aria-current="page"' : ''}>Join VERGO</a></li>
          <li><a href="/about"${isActive('/about') ? ' aria-current="page"' : ''}>About</a></li>
          <li><a href="/faq"${isActive('/faq') ? ' aria-current="page"' : ''}>FAQ</a></li>
          <li class="nav-cta-wrapper"><a href="/contact"${isActive('/contact') ? ' aria-current="page"' : ''} class="nav-cta">Contact</a></li>
        </ul>
      </nav>
    </div>
  `;

  // Replace existing header
  const header = document.querySelector('header');
  if (header) {
    header.setAttribute('role', 'banner');
    header.innerHTML = navHTML;
  }

  // Inject Inter font globally if missing
  if (!document.getElementById('vergo-font-inter')) {
    const fontLink = document.createElement('link');
    fontLink.id = 'vergo-font-inter';
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(fontLink);
  }

  // Navigation functions
  window.vergoNav = {
    toggleMenu: function() {
      const menu = document.getElementById('nav-menu');
      const toggle = document.querySelector('.menu-toggle');
      if (!menu || !toggle) return;

      const isExpanded = menu.classList.toggle('active');
      toggle.classList.toggle('active', isExpanded);
      toggle.setAttribute('aria-expanded', String(isExpanded));

      // Prevent body scroll when menu is open
      document.body.style.overflow = isExpanded ? 'hidden' : '';
    },

    closeMenu: function() {
      const menu = document.getElementById('nav-menu');
      const toggle = document.querySelector('.menu-toggle');
      if (menu) menu.classList.remove('active');
      if (toggle) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      }
      document.body.style.overflow = '';
    }
  };

  const menuToggle = document.querySelector('.menu-toggle');
  if (menuToggle) {
    const handleToggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.vergoNav.toggleMenu();
    };
    menuToggle.addEventListener('click', handleToggle);
    menuToggle.addEventListener('touchstart', handleToggle, { passive: false });
  }

  // Close menu when clicking outside
  document.addEventListener('click', function(event) {
    const header = document.querySelector('header');
    const menu = document.getElementById('nav-menu');
    if (header && menu && menu.classList.contains('active')) {
      if (!header.contains(event.target)) {
        window.vergoNav.closeMenu();
      }
    }
  });

  // Close menu on escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      window.vergoNav.closeMenu();
    }
  });

  // Close menu when clicking nav links (mobile)
  document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 960) {
        window.vergoNav.closeMenu();
      }
    });
  });

  // Close menu on resize/orientation change to avoid stuck overlays
  window.addEventListener('resize', () => {
    if (window.innerWidth > 960) {
      window.vergoNav.closeMenu();
    }
  });

  window.addEventListener('orientationchange', () => {
    window.vergoNav.closeMenu();
  });

})();
