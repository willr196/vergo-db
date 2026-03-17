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
  const isHomepage = document.body.classList.contains('homepage');

  const isActive = (page) => {
    const normalised = page.replace(/\/$/, '').replace(/\.html$/, '');
    if ((normalised === '' || normalised === '/') && (currentPath === '' || currentPath === '/')) return true;
    return currentPath === normalised;
  };

  const homepageLinks = `
          <li><a href="/#roles">Roles</a></li>
          <li><a href="/#event-types">Event Types</a></li>
          <li><a href="/about"${isActive('/about') ? ' aria-current="page"' : ''}>About</a></li>
          <li class="nav-cta-wrapper nav-cta-secondary"><a href="/apply"${isActive('/apply') ? ' aria-current="page"' : ''} class="nav-cta nav-cta-outline">Join VERGO</a></li>
          <li class="nav-cta-wrapper"><a href="/contact?tab=staff#contact-forms"${isActive('/contact') ? ' aria-current="page"' : ''} class="nav-cta">Request Staff</a></li>
  `;

  const defaultLinks = `
          <li><a href="/"${isActive('/') ? ' aria-current="page"' : ''}>Home</a></li>
          <li><a href="/about"${isActive('/about') ? ' aria-current="page"' : ''}>About</a></li>
          <li><a href="/faq"${isActive('/faq') ? ' aria-current="page"' : ''}>FAQ</a></li>
          <li class="nav-cta-wrapper nav-cta-secondary"><a href="/apply"${isActive('/apply') ? ' aria-current="page"' : ''} class="nav-cta nav-cta-outline">Join VERGO</a></li>
          <li class="nav-cta-wrapper"><a href="/contact?tab=staff#contact-forms"${isActive('/contact') ? ' aria-current="page"' : ''} class="nav-cta">Request Staff</a></li>
  `;

  // Navigation HTML - Premium structure
  const navHTML = `
    <div class="nav-container">
      <a href="/" class="logo" aria-label="VERGO Ltd Home">
        <img src="/vergo-logo.svg" alt="VERGO Ltd" decoding="async" width="160" height="48">
      </a>

      <button class="menu-toggle" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="nav-menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav role="navigation" aria-label="Main navigation">
        <ul id="nav-menu">
          ${isHomepage ? homepageLinks : defaultLinks}
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

  // Decode a JWT payload without verifying the signature (client-side only).
  const decodeJwtPayload = (token) => {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return null;
    }
  };

  const getJwtUser = () => {
    try {
      const token = localStorage.getItem('vergo_jwt');
      if (!token) return null;
      const payload = decodeJwtPayload(token);
      if (!payload || payload.tokenType !== 'access') return null;
      if (payload.exp && Date.now() / 1000 > payload.exp) return null;
      return {
        userType: payload.type === 'user' ? 'worker' : 'client',
        dashboardHref: payload.type === 'user' ? '/dashboard-worker.html' : '/dashboard-client.html',
      };
    } catch {
      return null;
    }
  };

  const injectAuthLinks = async () => {
    const menu = document.getElementById('nav-menu');
    if (!menu || menu.querySelector('[data-nav-auth]')) return;

    // 1. Try JWT first (new portal auth)
    const jwtUser = getJwtUser();
    if (jwtUser) {
      const dashItem = document.createElement('li');
      dashItem.innerHTML = `<a href="${jwtUser.dashboardHref}" data-nav-auth${isActive(jwtUser.dashboardHref) ? ' aria-current="page"' : ''}>Dashboard</a>`;
      dashItem.querySelector('a').addEventListener('click', () => {
        if (window.innerWidth <= 960 && window.vergoNav) window.vergoNav.closeMenu();
      });
      menu.appendChild(dashItem);

      const logoutItem = document.createElement('li');
      logoutItem.innerHTML = `<button type="button" data-nav-auth class="nav-logout-btn" aria-label="Sign out">Sign out</button>`;
      logoutItem.querySelector('button').addEventListener('click', () => {
        const refreshToken = localStorage.getItem('vergo_refresh');
        if (refreshToken) {
          fetch('/api/v1/web/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          }).catch(() => {});
        }
        localStorage.removeItem('vergo_jwt');
        localStorage.removeItem('vergo_refresh');
        localStorage.removeItem('vergo_user');
        window.location.href = '/portal-login.html';
      });
      menu.appendChild(logoutItem);
      return;
    }

    // 2. Fall back to session-based auth check (existing pages)
    const sessionChecks = [
      { url: '/api/v1/user/session', key: 'user', href: '/user-dashboard' },
      { url: '/api/v1/client/session', key: 'client', href: '/client-dashboard' },
    ];

    for (const check of sessionChecks) {
      try {
        const res = await fetch(check.url, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) continue;
        const payload = await res.json().catch(() => null);
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
        if (!data || !data.authenticated || !data[check.key]) continue;

        const item = document.createElement('li');
        item.innerHTML = `<a href="${check.href}" data-nav-auth${isActive(check.href) ? ' aria-current="page"' : ''}>Dashboard</a>`;
        item.querySelector('a').addEventListener('click', () => {
          if (window.innerWidth <= 960 && window.vergoNav) window.vergoNav.closeMenu();
        });
        menu.appendChild(item);
        return;
      } catch {
        // ignore
      }
    }

    // 3. No session or JWT — show Login link
    const loginItem = document.createElement('li');
    loginItem.innerHTML = `<a href="/portal-login.html" data-nav-auth${isActive('/portal-login') ? ' aria-current="page"' : ''}>Login</a>`;
    loginItem.querySelector('a').addEventListener('click', () => {
      if (window.innerWidth <= 960 && window.vergoNav) window.vergoNav.closeMenu();
    });
    menu.appendChild(loginItem);
  };

  // Inject shared navigation font if missing
  if (!document.getElementById('vergo-font-manrope')) {
    const fontLink = document.createElement('link');
    fontLink.id = 'vergo-font-manrope';
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(fontLink);
  }

  injectAuthLinks();

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
