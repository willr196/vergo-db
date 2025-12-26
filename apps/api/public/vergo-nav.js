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
  
  const isServicePage = currentPath === 'hire-staff.html' || currentPath === 'hire-us.html';

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
        <li class="nav-dropdown" id="services-dropdown">
          <a href="#" onclick="window.vergoNav.toggleDropdown(event, 'services-dropdown'); return false;" aria-haspopup="true" aria-expanded="false"${isServicePage ? ' aria-current="page"' : ''}>Services</a>
          <ul class="dropdown-menu" role="menu">
            <li><a href="/hire-staff.html" role="menuitem"${isActive('hire-staff.html') ? ' aria-current="page"' : ''}>Hire Staff</a></li>
            <li><a href="/hire-us.html" role="menuitem"${isActive('hire-us.html') ? ' aria-current="page"' : ''}>Event Management</a></li>
          </ul>
        </li>
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
        height: 50px;
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
      
      /* Dropdown */
      .nav-dropdown { position: relative; }
      .nav-dropdown > a { cursor: pointer; }
      .nav-dropdown > a::before {
        content: '▼';
        font-size: 0.6rem;
        margin-left: 5px;
        display: inline-block;
        transition: transform 0.3s ease;
      }
      
      .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        background: rgba(10, 10, 10, 0.98);
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 4px;
        min-width: 200px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.3s ease;
        margin-top: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      
      .nav-dropdown:hover .dropdown-menu,
      .nav-dropdown.active .dropdown-menu {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      
      .dropdown-menu li { list-style: none; }
      .dropdown-menu a {
        padding: 12px 20px;
        display: block;
        color: #ffffff;
        border-bottom: 1px solid rgba(212, 175, 55, 0.1);
        font-size: 0.9rem;
      }
      .dropdown-menu a::after { display: none; }
      .dropdown-menu li:last-child a { border-bottom: none; }
      .dropdown-menu a:hover {
        background: rgba(212, 175, 55, 0.1);
        color: #D4AF37;
      }
      
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
        width: 25px;
        height: 2px;
        background: #D4AF37;
        transition: all 0.3s ease;
      }
      
      /* Mobile styles */
      @media (max-width: 1024px) {
        nav ul {
          position: fixed;
          top: 80px;
          left: 0;
          right: 0;
          background: rgba(10, 10, 10, 0.98);
          flex-direction: column;
          padding: 30px;
          gap: 20px;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
        }
        nav ul.active { transform: translateX(0); }
        .menu-toggle { display: flex; }
        
        .dropdown-menu {
          position: static;
          opacity: 1;
          visibility: visible;
          transform: none;
          margin: 0;
          padding-left: 15px;
          display: none;
          border: none;
          box-shadow: none;
          background: transparent;
        }
        .nav-dropdown.active .dropdown-menu { display: block; }
        .dropdown-menu a { padding: 12px 10px; border-bottom: none; }
      }
      
      @media (max-width: 768px) {
        header { padding: 15px 20px; }
        .logo img { height: 40px; }
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
      const isExpanded = menu.classList.toggle('active');
      toggle.setAttribute('aria-expanded', isExpanded);
    },
    
    toggleDropdown: function(event, dropdownId) {
      event.preventDefault();
      event.stopPropagation();
      
      const dropdown = document.getElementById(dropdownId);
      const isActive = dropdown.classList.toggle('active');
      
      const link = dropdown.querySelector('a[aria-haspopup]');
      if (link) link.setAttribute('aria-expanded', isActive);
      
      // Close other dropdowns
      document.querySelectorAll('.nav-dropdown').forEach(item => {
        if (item.id !== dropdownId) {
          item.classList.remove('active');
          const otherLink = item.querySelector('a[aria-haspopup]');
          if (otherLink) otherLink.setAttribute('aria-expanded', 'false');
        }
      });
    }
  };

  // Close menu when clicking outside
  document.addEventListener('click', function(event) {
    const header = document.querySelector('header');
    if (header && !header.contains(event.target)) {
      const menu = document.getElementById('nav-menu');
      if (menu) menu.classList.remove('active');
      
      const toggle = document.querySelector('.menu-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      
      document.querySelectorAll('.nav-dropdown').forEach(item => {
        item.classList.remove('active');
        const link = item.querySelector('a[aria-haspopup]');
        if (link) link.setAttribute('aria-expanded', 'false');
      });
    }
  });

})();
