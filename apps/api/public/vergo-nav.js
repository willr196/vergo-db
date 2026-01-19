/**
 * VERGO Events - Shared Navigation Component
 * Include this script on all pages to ensure consistent navigation
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

  // Navigation HTML
  const navHTML = `
    <a href="/index.html" class="logo" aria-label="VERGO Events Home">
      <img src="/logo.png" alt="VERGO Events Logo">
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
        <li><a href="/contact.html"${isActive('contact.html') ? ' aria-current="page"' : ''}>Contact</a></li>
      </ul>
    </nav>
  `;

  // Navigation CSS (injected once)
  const navCSS = `
    <style id="vergo-nav-styles">
      header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: rgba(10, 10, 10, 0.98);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(212, 175, 55, 0.2);
        padding: 15px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 1000;
      }
      
      .logo {
        display: flex;
        align-items: center;
        text-decoration: none;
      }
      
      .logo img {
        height: 45px;
        width: auto;
        transition: transform 0.3s ease;
        border: none !important;
        background: transparent !important;
        display: block;
      }
      
      .logo:hover img {
        transform: scale(1.05);
      }
      
      nav ul {
        display: flex;
        gap: 30px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      
      nav li {
        position: relative;
      }
      
      nav a {
        color: #ffffff;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        transition: color 0.3s ease;
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
        background: #D4AF37;
        transition: width 0.3s ease;
      }
      
      nav a:hover { color: #D4AF37; }
      nav a:hover::after { width: 100%; }
      nav a[aria-current="page"] { color: #D4AF37; }
      nav a[aria-current="page"]::after { width: 100%; }

      /* Mobile toggle */
      .menu-toggle {
        display: none;
        flex-direction: column;
        gap: 5px;
        cursor: pointer;
        border: none;
        background: transparent;
        padding: 8px;
      }
      .menu-toggle span {
        width: 24px;
        height: 2px;
        background: #D4AF37;
        transition: all 0.3s ease;
      }

      .menu-toggle.active span:nth-child(1) {
        transform: rotate(45deg) translate(5px, 5px);
      }

      .menu-toggle.active span:nth-child(2) {
        opacity: 0;
      }

      .menu-toggle.active span:nth-child(3) {
        transform: rotate(-45deg) translate(5px, -5px);
      }
      
      /* Mobile styles */
      @media (max-width: 900px) {
        header { padding: 12px 20px; }
        .logo img { height: 38px; }

        nav ul {
          position: fixed;
          top: 65px;
          left: 0;
          right: 0;
          background: rgba(10, 10, 10, 0.98);
          flex-direction: column;
          padding: 20px;
          gap: 0;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          border-bottom: 1px solid rgba(212, 175, 55, 0.2);
          max-height: calc(100vh - 65px);
          overflow-y: auto;
        }
        nav ul.active { transform: translateX(0); }

        nav li {
          border-bottom: 1px solid rgba(212, 175, 55, 0.1);
        }

        nav li:last-child {
          border-bottom: none;
        }

        nav a {
          padding: 15px 10px;
        }

        .menu-toggle { display: flex; }
      }
    </style>
  `;

  // Replace existing header
  const header = document.querySelector('header');
  if (header) {
    header.setAttribute('role', 'banner');
    header.innerHTML = navHTML;
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
    }
  };

  // Close menu when clicking outside
  document.addEventListener('click', function(event) {
    const header = document.querySelector('header');
    if (header && !header.contains(event.target)) {
      const menu = document.getElementById('nav-menu');
      if (menu) menu.classList.remove('active');

      const toggle = document.querySelector('.menu-toggle');
      if (toggle) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      }
    }
  });

})();
