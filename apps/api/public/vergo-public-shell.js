(function () {
  'use strict';

  const normalisePath = (value) => {
    if (!value) {
      return '/';
    }

    let path = value.replace(/\/index(?:\.html)?$/i, '/').replace(/\.html$/i, '');

    if (path.length > 1) {
      path = path.replace(/\/$/, '');
    }

    return path || '/';
  };

  const currentPath = normalisePath(window.location.pathname);
  const header = document.getElementById('site-header');
  const footer = document.querySelector('footer[role="contentinfo"], footer');

  const routeGroups = {
    home: ['/'],
    hire: [
      '/hire-staff',
      '/browse-staff',
      '/event-chefs-london',
      '/front-of-house-staff-london',
      '/kitchen-porters-london',
      '/temporary-bar-staff-london',
      '/client-login',
      '/client-register',
      '/client-dashboard',
      '/quote',
    ],
    jobs: [
      '/jobs',
      '/job-detail',
      '/user-dashboard',
    ],
    profile: ['/profile'],
    pricing: ['/pricing'],
    contact: ['/contact'],
    join: ['/apply', '/staff-roles', '/user-login', '/user-register'],
  };

  const isCurrent = (group) => {
    const matches = routeGroups[group] || [];
    return matches.includes(currentPath);
  };

  const withCurrent = (group) => (isCurrent(group) ? ' aria-current="page"' : '');

  const ensureFonts = () => {
    const hasPublicFonts = document.querySelector('link[href*="family=Manrope"]');

    if (hasPublicFonts) {
      return;
    }

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@500;600;700&display=swap';
    document.head.appendChild(fontLink);
  };

  const DASH_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

  const normalizeCopyValue = (value) => {
    if (!value || !/[—–]|--/.test(value)) {
      return value;
    }

    return value.replace(/\s(?:--|—|–)\s/g, ', ');
  };

  const normalizeTitleValue = (value) => {
    if (!value || !/[—–]|--/.test(value)) {
      return value;
    }

    return value.replace(/\s(?:--|—|–)\s/g, ', ');
  };

  const normalizeTextNode = (node) => {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const parent = node.parentElement;
    if (!parent || DASH_SKIP_TAGS.has(parent.tagName) || parent.closest('[data-preserve-dashes]')) {
      return;
    }

    const current = node.nodeValue;
    const next = normalizeCopyValue(current);

    if (next !== current) {
      node.nodeValue = next;
    }
  };

  const normalizeCopyTree = (root) => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (DASH_SKIP_TAGS.has(root.tagName) || (root.matches && root.matches('[data-preserve-dashes]'))) {
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();

    while (currentNode) {
      normalizeTextNode(currentNode);
      currentNode = walker.nextNode();
    }
  };

  const normalizeMetadata = () => {
    const nextTitle = normalizeTitleValue(document.title);
    if (nextTitle !== document.title) {
      document.title = nextTitle;
    }

    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach((meta) => {
      const current = meta.getAttribute('content') || '';
      const next = normalizeTitleValue(current);
      if (next !== current) {
        meta.setAttribute('content', next);
      }
    });

    document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach((meta) => {
      const current = meta.getAttribute('content') || '';
      const next = normalizeCopyValue(current);
      if (next !== current) {
        meta.setAttribute('content', next);
      }
    });
  };

  const startDashNormalization = () => {
    normalizeMetadata();
    if (document.body) {
      normalizeCopyTree(document.body);
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          normalizeTextNode(mutation.target);
          continue;
        }

        if (mutation.type === 'attributes') {
          if (mutation.target instanceof HTMLMetaElement || mutation.target instanceof HTMLTitleElement) {
            normalizeMetadata();
          }
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            normalizeTextNode(node);
            return;
          }

          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }

          if (node instanceof HTMLMetaElement || node instanceof HTMLTitleElement) {
            normalizeMetadata();
            return;
          }

          normalizeCopyTree(node);
        });
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['content'],
    });
  };

  // Decode JWT payload client-side (no verification — display only)
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

  const doLogout = () => {
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
  };

  const injectProfileLinks = async () => {
    if (!header) return;

    const closeShellMenu = () => {
      const toggle = document.getElementById('mobile-menu-button');
      const mobileMenu = document.getElementById('mobile-menu');
      if (toggle) { toggle.classList.remove('is-active'); toggle.setAttribute('aria-expanded', 'false'); }
      if (mobileMenu) { mobileMenu.classList.remove('is-open'); mobileMenu.hidden = true; }
      document.body.classList.remove('menu-open');
    };

    // 1. JWT-based (new portal auth)
    const jwtUser = getJwtUser();
    if (jwtUser) {
      const desktopNav = header.querySelector('.site-nav ul');
      if (desktopNav && !desktopNav.querySelector('[data-nav-auth]')) {
        const dashItem = document.createElement('li');
        dashItem.innerHTML = `<a href="${jwtUser.dashboardHref}" data-nav-auth>Dashboard</a>`;
        desktopNav.appendChild(dashItem);

        const logoutItem = document.createElement('li');
        logoutItem.innerHTML = `<a href="#" data-nav-auth>Sign out</a>`;
        logoutItem.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
        desktopNav.appendChild(logoutItem);
      }

      const mobileNav = header.querySelector('#mobile-menu nav');
      if (mobileNav && !mobileNav.querySelector('[data-nav-auth]')) {
        const dashLink = document.createElement('a');
        dashLink.href = jwtUser.dashboardHref;
        dashLink.setAttribute('data-nav-auth', 'true');
        dashLink.textContent = 'Dashboard';
        dashLink.addEventListener('click', closeShellMenu);
        mobileNav.appendChild(dashLink);

        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.setAttribute('data-nav-auth', 'true');
        logoutLink.textContent = 'Sign out';
        logoutLink.addEventListener('click', (e) => { e.preventDefault(); closeShellMenu(); doLogout(); });
        mobileNav.appendChild(logoutLink);
      }
      return;
    }

    // 2. Session-based fallback (existing auth pages)
    const checks = [
      { url: '/api/v1/user/session', key: 'user', href: '/user-dashboard' },
      { url: '/api/v1/client/session', key: 'client', href: '/client-dashboard' },
    ];

    for (const check of checks) {
      try {
        const res = await fetch(check.url, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) continue;
        const payload = await res.json().catch(() => null);
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
        if (!data || !data.authenticated || !data[check.key]) continue;

        const desktopNav = header.querySelector('.site-nav ul');
        if (desktopNav && !desktopNav.querySelector('[data-nav-auth]')) {
          const item = document.createElement('li');
          item.innerHTML = `<a href="${check.href}" data-nav-auth>Dashboard</a>`;
          desktopNav.appendChild(item);
        }

        const mobileNav = header.querySelector('#mobile-menu nav');
        if (mobileNav && !mobileNav.querySelector('[data-nav-auth]')) {
          const link = document.createElement('a');
          link.href = check.href;
          link.setAttribute('data-nav-auth', 'true');
          link.textContent = 'Dashboard';
          link.addEventListener('click', closeShellMenu);
          mobileNav.appendChild(link);
        }
        return;
      } catch {
        // ignore
      }
    }

    // 3. Not logged in — show Login link
    const desktopNav = header.querySelector('.site-nav ul');
    if (desktopNav && !desktopNav.querySelector('[data-nav-auth]')) {
      const item = document.createElement('li');
      item.innerHTML = `<a href="/portal-login.html" data-nav-auth>Login</a>`;
      desktopNav.appendChild(item);
    }

    const mobileNav = header.querySelector('#mobile-menu nav');
    if (mobileNav && !mobileNav.querySelector('[data-nav-auth]')) {
      const link = document.createElement('a');
      link.href = '/portal-login.html';
      link.setAttribute('data-nav-auth', 'true');
      link.textContent = 'Login';
      link.addEventListener('click', closeShellMenu);
      mobileNav.appendChild(link);
    }
  };

  const headerHTML = `
    <div class="page-shell">
      <div class="nav-container">
        <a href="/" class="logo" aria-label="VERGO home">
          <span class="logo-mark">V</span>
          <span class="logo-copy">
            <span class="logo-title">VERGO</span>
            <span class="logo-subtitle">London hospitality staffing</span>
          </span>
        </a>

        <div class="nav-frame">
          <nav class="site-nav" aria-label="Primary">
            <ul>
              <li><a href="/"${withCurrent('home')}>Home</a></li>
              <li><a href="/jobs"${withCurrent('jobs')}>Job Board</a></li>
              <li><a href="/pricing"${withCurrent('pricing')}>Pricing</a></li>
              <li><a href="/about"${withCurrent('about')}>About</a></li>
              <li><a href="/contact"${withCurrent('contact')}>Contact</a></li>
            </ul>
          </nav>
          <div class="nav-actions">
            <a href="/apply" class="btn btn-secondary"${withCurrent('join')}>Join VERGO</a>
            <a href="/hire-staff" class="btn btn-primary"${withCurrent('hire')}>Hire Staff</a>
          </div>
        </div>

        <button id="mobile-menu-button" class="menu-toggle" type="button" aria-label="Toggle navigation menu" aria-controls="mobile-menu" aria-expanded="false">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <div id="mobile-menu" class="mobile-menu" hidden>
        <nav aria-label="Mobile">
          <a href="/"${withCurrent('home')}>Home</a>
          <a href="/jobs"${withCurrent('jobs')}>Job Board</a>
          <a href="/pricing"${withCurrent('pricing')}>Pricing</a>
          <a href="/about"${withCurrent('about')}>About</a>
          <a href="/contact"${withCurrent('contact')}>Contact</a>
        </nav>
        <div class="nav-actions">
          <a href="/apply" class="btn btn-secondary"${withCurrent('join')}>Join VERGO</a>
          <a href="/hire-staff" class="btn btn-primary"${withCurrent('hire')}>Hire Staff</a>
        </div>
      </div>
    </div>
  `;

  const footerHTML = `
    <div class="page-shell">
      <div class="footer-grid">
        <div>
          <a href="/" class="logo" aria-label="VERGO home">
            <span class="logo-mark">V</span>
            <span class="logo-copy">
              <span class="logo-title">VERGO</span>
              <span class="logo-subtitle">Event staffing, London</span>
            </span>
          </a>
          <p class="lede" style="margin-top: 18px; font-size: 0.98rem; max-width: 30rem;">London event staffing for companies that need reliable teams and workers who want well-run shifts.</p>
        </div>
        <div>
          <p class="footer-title">Navigate</p>
          <div class="footer-links">
            <a href="/">Home</a>
            <a href="/hire-staff">Hire Staff</a>
            <a href="/pricing">Pricing</a>
            <a href="/contact">Contact</a>
          </div>
        </div>
        <div>
          <p class="footer-title">Work With Us</p>
          <div class="footer-links">
            <a href="/jobs">Job Board</a>
            <a href="/apply">Join VERGO</a>
            <a href="/staff-roles">Role Guide</a>
            <a href="/contact?tab=staff#contact-forms">Request Staff</a>
            <a href="/about">About VERGO</a>
          </div>
        </div>
        <div>
          <p class="footer-title">Contact</p>
          <div class="footer-links">
            <a href="/contact">Contact VERGO</a>
            <a href="https://wa.me/447506615242?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20staffing%20for%20an%20event" target="_blank" rel="noopener">WhatsApp: 07506615242</a>
            <p>Replies within 24 hours for most enquiries.</p>
            <p>London and surrounding areas.</p>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <p>&copy; ${new Date().getFullYear()} VERGO Ltd. All rights reserved.</p>
        <div class="footer-bottom-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </div>
      </div>
    </div>
  `;

  ensureFonts();

  if (header) {
    header.classList.add('site-header');
    header.setAttribute('role', 'banner');
    header.innerHTML = headerHTML;
  }

  if (footer) {
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = footerHTML;
  }

  injectProfileLinks();
  startDashNormalization();

  const button = document.getElementById('mobile-menu-button');
  const menu = document.getElementById('mobile-menu');

  if (header) {
    const syncHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
    };

    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
  }

  if (!button || !menu || !header) {
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
    if (header.contains(event.target)) {
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
