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
      '/hire-us',
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
              <span class="logo-subtitle">Premium staffing, London</span>
            </span>
          </a>
          <p class="lede" style="margin-top: 18px; font-size: 0.98rem; max-width: 30rem;">Premium London event staffing for companies who need reliable teams and workers who want better-run shifts.</p>
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
            <a href="mailto:wrobb@vergoltd.com">wrobb@vergoltd.com</a>
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
