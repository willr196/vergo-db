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
    specialEvents: ['/special-events', '/special-events/halloween'],
  };

  const isCurrent = (group) => {
    const matches = routeGroups[group] || [];
    return matches.includes(currentPath);
  };

  const withCurrent = (group) => (isCurrent(group) ? ' aria-current="page"' : '');
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
              <li><a href="/work"${withCurrent('work')}>Apply for work</a></li>
              <li><a href="/special-events" class="nav-feature"${withCurrent('specialEvents')}>Special events</a></li>
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
          <a href="/work"${withCurrent('work')}>Apply for work</a>
          <a href="/special-events" class="nav-feature"${withCurrent('specialEvents')}>Special events</a>
        </nav>
      </div>
    </div>
  `;

  // vergo-site-config.js is the single source of truth for contact details.
  // Fall back to the previous literals so a page that does not load the config
  // (or loads it after this file) still renders a working link.
  const shellContact = (window.VERGO_CONFIG && window.VERGO_CONFIG.contact) || {};
  const footerPhoneDisplay = shellContact.phoneDisplay || '07944 505783';
  const footerWhatsAppNumber = (shellContact.phone || '+44 7944 505783').replace(/[^0-9]/g, '');

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
            <a href="/work">Apply for work</a>
            <a href="/special-events">Special events</a>
            <a href="/about">About us</a>
            <a href="/gallery">Gallery</a>
            <a href="/blog">Blog</a>
          </div>
        </div>
        <div>
          <p class="footer-title">Contact</p>
          <div class="footer-links">
            <a href="https://wa.me/${footerWhatsAppNumber}?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20staffing%20for%20an%20event" target="_blank" rel="noopener">WhatsApp: ${footerPhoneDisplay}</a>
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


  if (header) {
    header.classList.add('site-header');
    header.setAttribute('role', 'banner');
    header.innerHTML = headerHTML;
  }

  if (footer) {
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = footerHTML;
  }

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

// Hide proof briefs block if the list has no items
(function () {
  var list = document.querySelector('.proof-briefs__list');
  if (!list) return;
  if (!list.querySelector('li')) {
    var block = list.closest('.proof-briefs');
    if (block) block.classList.add('is-hidden');
  }
})();
