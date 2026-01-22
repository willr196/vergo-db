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
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  const isActive = (page) => {
    if (page === 'index.html' && (currentPath === '' || currentPath === 'index.html')) return true;
    return currentPath === page;
  };

  // Navigation HTML - Premium structure
  const navHTML = `
    <div class="nav-container">
      <a href="/index.html" class="logo" aria-label="VERGO Ltd Home">
        <img src="/logo.png" alt="VERGO Ltd">
      </a>

      <button class="menu-toggle" onclick="window.vergoNav.toggleMenu()" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="nav-menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav role="navigation" aria-label="Main navigation">
        <ul id="nav-menu">
          <li><a href="/index.html"${isActive('index.html') ? ' aria-current="page"' : ''}>Home</a></li>
          <li><a href="/hire-staff.html"${isActive('hire-staff.html') ? ' aria-current="page"' : ''}>Hire Staff</a></li>
          <li><a href="/pricing.html"${isActive('pricing.html') ? ' aria-current="page"' : ''}>Pricing</a></li>
          <li><a href="/jobs.html"${isActive('jobs.html') ? ' aria-current="page"' : ''}>Job Board</a></li>
          <li><a href="/blog.html"${isActive('blog.html') ? ' aria-current="page"' : ''}>Blog</a></li>
          <li><a href="/apply.html"${isActive('apply.html') ? ' aria-current="page"' : ''}>Join VERGO</a></li>
          <li><a href="/about.html"${isActive('about.html') ? ' aria-current="page"' : ''}>About</a></li>
          <li><a href="/faq.html"${isActive('faq.html') ? ' aria-current="page"' : ''}>FAQ</a></li>
          <li class="nav-cta-wrapper"><a href="/contact.html"${isActive('contact.html') ? ' aria-current="page"' : ''} class="nav-cta">Contact</a></li>
        </ul>
      </nav>
    </div>
  `;

  // Navigation CSS - Premium design with Inter font
  const navCSS = `
    <style id="vergo-nav-styles">
      /* CSS Variables for consistency */
      :root {
        --nav-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        --nav-bg: rgba(250, 248, 245, 0.98);
        --nav-text: #1C1C1C;
        --nav-text-muted: #6B6B6B;
        --nav-gold: #C9A24D;
        --nav-gold-hover: #B8963D;
        --nav-border: rgba(28, 28, 28, 0.08);
        --nav-transition: 0.25s ease;
      }

      header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: var(--nav-bg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--nav-border);
        z-index: 1000;
      }

      .nav-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 16px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Logo */
      .logo {
        display: flex;
        align-items: center;
        text-decoration: none;
        flex-shrink: 0;
      }

      .logo img {
        height: 38px;
        width: auto;
        transition: transform var(--nav-transition);
        border: none !important;
        background: transparent !important;
        display: block;
      }

      .logo:hover img {
        transform: scale(1.02);
      }

      /* Navigation */
      nav ul {
        display: flex;
        gap: 36px;
        list-style: none;
        margin: 0;
        padding: 0;
        align-items: center;
      }

      nav li {
        position: relative;
      }

      nav a {
        color: var(--nav-text);
        text-decoration: none;
        font-family: var(--nav-font);
        font-size: 0.9rem;
        font-weight: 500;
        letter-spacing: -0.01em;
        transition: color var(--nav-transition);
        position: relative;
        display: block;
        padding: 8px 0;
      }

      nav a::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 0;
        height: 2px;
        background: var(--nav-gold);
        transition: width var(--nav-transition);
      }

      nav a:hover {
        color: var(--nav-gold);
      }

      nav a:hover::after {
        width: 100%;
      }

      nav a[aria-current="page"] {
        color: var(--nav-gold);
      }

      nav a[aria-current="page"]::after {
        width: 100%;
      }

      /* CTA Button in Nav */
      .nav-cta-wrapper {
        margin-left: 8px;
      }

      nav a.nav-cta {
        background: var(--nav-gold);
        color: var(--nav-text);
        padding: 12px 28px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.85rem;
        letter-spacing: 0;
        transition: all var(--nav-transition);
        border: 2px solid var(--nav-gold);
      }

      nav a.nav-cta::after {
        display: none;
      }

      nav a.nav-cta:hover {
        background: var(--nav-gold-hover);
        border-color: var(--nav-gold-hover);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(201, 162, 77, 0.25);
      }

      nav a.nav-cta[aria-current="page"] {
        background: var(--nav-text);
        border-color: var(--nav-text);
        color: #fff;
      }

      /* Mobile toggle button */
      .menu-toggle {
        display: none;
        flex-direction: column;
        gap: 5px;
        cursor: pointer;
        border: none;
        background: transparent;
        padding: 8px;
        z-index: 1001;
      }

      .menu-toggle span {
        width: 24px;
        height: 2px;
        background: var(--nav-text);
        transition: all var(--nav-transition);
        border-radius: 1px;
      }

      .menu-toggle.active span:nth-child(1) {
        transform: rotate(45deg) translate(5px, 5px);
      }

      .menu-toggle.active span:nth-child(2) {
        opacity: 0;
        transform: translateX(-10px);
      }

      .menu-toggle.active span:nth-child(3) {
        transform: rotate(-45deg) translate(5px, -5px);
      }

      /* Mobile styles */
      @media (max-width: 960px) {
        .nav-container {
          padding: 14px 24px;
        }

        .logo img {
          height: 34px;
        }

        nav ul {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--nav-bg);
          flex-direction: column;
          padding: 100px 32px 40px;
          gap: 0;
          justify-content: flex-start;
          transform: translateX(100%);
          transition: transform 0.35s ease;
          overflow-y: auto;
        }

        nav ul.active {
          transform: translateX(0);
        }

        nav li {
          width: 100%;
          border-bottom: 1px solid var(--nav-border);
        }

        nav li:last-child {
          border-bottom: none;
          margin-top: 24px;
        }

        nav a {
          padding: 18px 0;
          font-size: 1.1rem;
        }

        nav a::after {
          display: none;
        }

        nav a[aria-current="page"] {
          color: var(--nav-gold);
        }

        .nav-cta-wrapper {
          margin-left: 0;
        }

        nav a.nav-cta {
          text-align: center;
          display: block;
          padding: 16px 28px;
          font-size: 1rem;
        }

        .menu-toggle {
          display: flex;
        }
      }

      @media (max-width: 480px) {
        .nav-container {
          padding: 12px 16px;
        }

        .logo img {
          height: 30px;
        }

        nav ul {
          padding: 90px 24px 32px;
        }

        nav a {
          padding: 16px 0;
          font-size: 1rem;
        }
      }
    </style>
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

  // Inject styles if not already present
  if (!document.getElementById('vergo-nav-styles')) {
    document.head.insertAdjacentHTML('beforeend', navCSS);
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

})();
