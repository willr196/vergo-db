/**
 * VERGO — mobile navigation for the main site pages.
 *
 * These pages (home, hire, work, special events, quote, apply, legal…) carry
 * their header markup inline rather than through vergo-public-shell.js, and had
 * no mobile menu at all: the stylesheet just let the header wrap, so on a phone
 * the brand, three nav links and the phone pill stacked into three rows of
 * sticky header on every scroll.
 *
 * This progressively enhances that existing markup — it reads the links already
 * in .header-actions rather than restating them, so the nav still has exactly
 * one definition per page. With JS off the header falls back to wrapping, which
 * is what it did before.
 */
(function () {
  'use strict';

  var header = document.querySelector('.site-header .site-header-inner');
  if (!header) return;

  var actions = header.querySelector('.header-actions');
  if (!actions || header.querySelector('.site-menu-toggle')) return;

  var links = actions.querySelectorAll('a');
  if (links.length < 2) return;

  var media = window.matchMedia('(max-width: 860px)');

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'site-menu-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation menu');
  toggle.setAttribute('aria-controls', 'site-mobile-menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span></span><span></span><span></span>';

  var panel = document.createElement('div');
  panel.id = 'site-mobile-menu';
  panel.className = 'site-mobile-menu';
  panel.hidden = true;

  var panelNav = document.createElement('nav');
  panelNav.setAttribute('aria-label', 'Mobile');

  // Clone rather than move: the desktop header keeps its own links, and the
  // clones inherit href, aria-current and the data-vergo-* hooks that
  // vergo-site-config.js fills in.
  Array.prototype.forEach.call(links, function (link) {
    panelNav.appendChild(link.cloneNode(true));
  });

  panel.appendChild(panelNav);
  header.appendChild(toggle);
  header.appendChild(panel);
  // Gates the CSS: without it the header keeps the wrapping fallback, so a page
  // where this script fails to run never ends up with no navigation at all.
  header.classList.add('has-mobile-nav');

  // The cloned phone link carries data-vergo-tel/data-vergo, so let the config
  // pass fill it in if it has already run.
  if (typeof window.applyVergoConfig === 'function') {
    window.applyVergoConfig(panel);
  }

  function close() {
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    panel.classList.remove('is-open');
    panel.hidden = true;
    document.body.classList.remove('menu-open');
  }

  function open() {
    if (!media.matches) return close();
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('menu-open');
  }

  toggle.addEventListener('click', function (event) {
    event.stopPropagation();
    if (panel.classList.contains('is-open')) close(); else open();
  });

  panel.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', close);
  });

  document.addEventListener('click', function (event) {
    if (!header.contains(event.target)) close();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
  });

  var syncToViewport = function () {
    if (!media.matches) close();
  };

  window.addEventListener('resize', syncToViewport);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', syncToViewport);
  } else if (typeof media.addListener === 'function') {
    media.addListener(syncToViewport);
  }

  syncToViewport();
})();
