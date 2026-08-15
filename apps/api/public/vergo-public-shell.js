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
    hire: ['/hire'],
    work: ['/work'],
  };

  const isCurrent = (group) => {
    const matches = routeGroups[group] || [];
    return matches.includes(currentPath);
  };

  const withCurrent = (group) => (isCurrent(group) ? ' aria-current="page"' : '');
  const withCurrentHref = (href) => (normalisePath(href) === currentPath ? ' aria-current="page"' : '');

  const ensureFonts = () => {
    // Skip if the page already manages its own Google Fonts (e.g. index.html uses DM Sans)
    if (document.querySelector('link[href*="fonts.googleapis.com"]')) {
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

  const normalizeTitleValue = normalizeCopyValue;

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
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
      return JSON.parse(atob(padded));
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

  const escHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getStoredUserInfo = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('vergo_user') || 'null');
      const label = stored && (stored.name || stored.companyName || stored.contactName);
      if (label) {
        return { label: String(label).trim().split(/\s+/)[0] || 'Profile' };
      }
    } catch {
      // ignore
    }

    try {
      const token = localStorage.getItem('vergo_jwt');
      const payload = token ? decodeJwtPayload(token) : null;
      if (payload && payload.email) {
        return { label: String(payload.email).split('@')[0] || 'Profile' };
      }
    } catch {
      // ignore
    }

    return { label: 'Profile' };
  };

  const doLogout = (userType) => {
    const refreshToken = localStorage.getItem('vergo_refresh');
    if (refreshToken) {
      fetch('/api/v1/web/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    } else if (userType) {
      const sessionLogoutUrl = userType === 'client' ? '/api/v1/client/logout' : '/api/v1/user/logout';
      fetch(sessionLogoutUrl, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
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

    const addDesktopProfileMenu = (dashboardHref, userType) => {
      const desktopNav = header.querySelector('.site-nav ul');
      if (!desktopNav || desktopNav.querySelector('[data-nav-auth]')) return;

      const info = getStoredUserInfo();
      const profileItem = document.createElement('li');
      profileItem.className = 'nav-profile-dropdown';
      profileItem.setAttribute('data-nav-auth', 'true');
      profileItem.innerHTML = `
        <button type="button" class="nav-profile-trigger" aria-expanded="false" aria-haspopup="true">
          <span class="nav-profile-label">${escHtml(info.label)}</span>
          <span class="nav-profile-chevron" aria-hidden="true"></span>
        </button>
        <ul class="nav-profile-menu" role="menu" hidden>
          <li role="none"><a href="${dashboardHref}" role="menuitem"${withCurrentHref(dashboardHref)}>Dashboard</a></li>
          <li role="none"><a href="/profile" role="menuitem"${withCurrentHref('/profile')}>Edit Profile</a></li>
          <li role="none"><button type="button" class="nav-profile-signout" role="menuitem">Sign out</button></li>
        </ul>
      `;

      const trigger = profileItem.querySelector('.nav-profile-trigger');
      const menu = profileItem.querySelector('.nav-profile-menu');
      const signout = profileItem.querySelector('.nav-profile-signout');
      if (!trigger || !menu || !signout) return;

      const closeProfileMenu = () => {
        profileItem.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
      };

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = menu.hidden;
        profileItem.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
        menu.hidden = !willOpen;
      });

      profileItem.querySelectorAll('.nav-profile-menu a').forEach((link) => {
        link.addEventListener('click', closeProfileMenu);
      });

      signout.addEventListener('click', () => {
        closeProfileMenu();
        doLogout(userType);
      });

      document.addEventListener('click', (event) => {
        if (!profileItem.contains(event.target)) {
          closeProfileMenu();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeProfileMenu();
        }
      });

      desktopNav.appendChild(profileItem);
    };

    const addMobileProfileLinks = (dashboardHref, userType) => {
      const mobileNav = header.querySelector('#mobile-menu nav');
      if (!mobileNav || mobileNav.querySelector('[data-nav-auth]')) return;

      [
        { href: dashboardHref, label: 'Dashboard' },
        { href: '/profile', label: 'Edit Profile' },
      ].forEach((item) => {
        const link = document.createElement('a');
        link.href = item.href;
        link.setAttribute('data-nav-auth', 'true');
        link.textContent = item.label;
        if (normalisePath(item.href) === currentPath) {
          link.setAttribute('aria-current', 'page');
        }
        link.addEventListener('click', closeShellMenu);
        mobileNav.appendChild(link);
      });

      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.setAttribute('data-nav-auth', 'true');
      logoutLink.textContent = 'Sign out';
      logoutLink.addEventListener('click', (event) => {
        event.preventDefault();
        closeShellMenu();
        doLogout(userType);
      });
      mobileNav.appendChild(logoutLink);
    };

    // 1. JWT-based (new portal auth)
    const jwtUser = getJwtUser();
    if (jwtUser) {
      addDesktopProfileMenu(jwtUser.dashboardHref, jwtUser.userType);
      addMobileProfileLinks(jwtUser.dashboardHref, jwtUser.userType);
      return;
    }

    // 2. Session-based fallback (existing auth pages)
    const checks = [
      { url: '/api/v1/user/session', key: 'user', href: '/dashboard-worker', type: 'worker' },
      { url: '/api/v1/client/session', key: 'client', href: '/dashboard-client', type: 'client' },
    ];

    for (const check of checks) {
      try {
        const res = await fetch(check.url, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) continue;
        const payload = await res.json().catch(() => null);
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
        if (!data || !data.authenticated || !data[check.key]) continue;

        addDesktopProfileMenu(check.href, check.type);
        addMobileProfileLinks(check.href, check.type);
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
              <li><a href="/hire"${withCurrent('hire')}>For clients</a></li>
              <li><a href="/work"${withCurrent('work')}>For workers</a></li>
            </ul>
          </nav>
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
          <a href="/hire"${withCurrent('hire')}>For clients</a>
          <a href="/work"${withCurrent('work')}>For workers</a>
        </nav>
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
          <p class="lede" style="margin-top: 18px; font-size: 0.98rem; max-width: 30rem;">Event staffing for private events, corporate hospitality, venues and productions across London.</p>
        </div>
        <div>
          <p class="footer-title">Navigate</p>
          <div class="footer-links">
            <a href="/">Home</a>
            <a href="/hire">For clients</a>
            <a href="/work">For workers</a>
          </div>
        </div>
        <div>
          <p class="footer-title">Contact</p>
          <div class="footer-links">
            <a href="https://wa.me/447944505783?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20staffing%20for%20an%20event" target="_blank" rel="noopener">WhatsApp: 07944 505783</a>
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
          <a href="/legal">Legal</a>
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
  const mobileMenuMedia = window.matchMedia('(max-width: 1023px)');

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
    if (!mobileMenuMedia.matches) {
      closeMenu();
      return;
    }

    button.classList.add('is-active');
    button.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    menu.classList.add('is-open');
    document.body.classList.add('menu-open');
  };

  button.addEventListener('click', () => {
    if (!mobileMenuMedia.matches) {
      closeMenu();
      return;
    }

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

  const syncMenuToViewport = () => {
    if (!mobileMenuMedia.matches) {
      closeMenu();
    }
  };

  window.addEventListener('resize', syncMenuToViewport);
  if (typeof mobileMenuMedia.addEventListener === 'function') {
    mobileMenuMedia.addEventListener('change', syncMenuToViewport);
  } else if (typeof mobileMenuMedia.addListener === 'function') {
    mobileMenuMedia.addListener(syncMenuToViewport);
  }
  syncMenuToViewport();
})();

// Load WhatsApp floating widget on all public pages
(function () {
  var s = document.createElement('script');
  s.src = '/vergo-whatsapp.js';
  s.defer = true;
  document.body.appendChild(s);
})();

// Hide proof briefs block if the list has no items
(function () {
  var list = document.querySelector('.proof-briefs__list');
  if (!list) return;
  if (!list.querySelector('li')) {
    var block = list.closest('.proof-briefs');
    if (block) block.classList.add('is-hidden');
  }
})();

// GDPR cookie consent banner
(function () {
  if (localStorage.getItem('vergo_cookie_consent')) return;
  if (document.querySelector('.vergo-cookie-banner')) return;

  var style = document.createElement('style');
  style.textContent = [
    '.vergo-cookie-banner{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#1a1a1a;color:#d8d3cb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:0.88rem;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:1px solid rgba(255,255,255,0.08);}',
    '.vergo-cookie-banner p{margin:0;line-height:1.5;flex:1;min-width:200px;}',
    '.vergo-cookie-banner a{color:#C4A24E;text-decoration:underline;}',
    '.vergo-cookie-banner-btns{display:flex;gap:8px;flex-shrink:0;}',
    '.vergo-cookie-btn{padding:8px 20px;border:none;border-radius:3px;font-size:0.82rem;font-weight:500;cursor:pointer;letter-spacing:0.04em;text-transform:uppercase;}',
    '.vergo-cookie-btn-accept{background:#C4A24E;color:#0c0b0a;}',
    '.vergo-cookie-btn-decline{background:transparent;color:#7a756d;border:1px solid #4a463f;}'
  ].join('');
  document.head.appendChild(style);

  var banner = document.createElement('div');
  banner.className = 'vergo-cookie-banner';
  banner.setAttribute('data-nosnippet', '');
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.innerHTML = '<p>We use cookies to improve your experience. See our <a href="/privacy">Privacy Policy</a>.</p><div class="vergo-cookie-banner-btns"><button class="vergo-cookie-btn vergo-cookie-btn-accept" data-cookie="accept">Accept</button><button class="vergo-cookie-btn vergo-cookie-btn-decline" data-cookie="decline">Decline</button></div>';

  document.body.appendChild(banner);

  banner.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cookie]');
    if (!btn) return;
    localStorage.setItem('vergo_cookie_consent', btn.dataset.cookie);
    banner.remove();
  });
})();
