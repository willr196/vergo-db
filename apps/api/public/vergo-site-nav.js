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

  /* Stale-stylesheet guard. Hiding the header links is a stylesheet rule, so a
     phone still holding a cached copy of vergo-site.css from before that rule
     existed gets this menu *and* the original links — the same nav twice. CSS
     and JS ship as separate files and cannot be assumed to be the same vintage,
     so check the rule actually applies and fall back to inline styles if it
     does not. `null` means not yet tested; the test only means anything at
     phone widths, where the rule is supposed to bite. */
  var staleCss = null;
  var FALLBACK_PROPS = ['display', 'padding', 'flexDirection', 'justifyContent', 'gap', 'width', 'height', 'background', 'border', 'borderRadius', 'flexBasis', 'borderTop', 'marginTop', 'paddingTop'];

  function applyFallback() {
    actions.style.display = 'none';
    toggle.style.display = 'inline-flex';
    toggle.style.flexDirection = 'column';
    toggle.style.justifyContent = 'center';
    toggle.style.gap = '5px';
    toggle.style.width = '44px';
    toggle.style.height = '44px';
    toggle.style.background = 'none';
    toggle.style.border = '1px solid currentColor';
    toggle.style.borderRadius = '8px';
    toggle.style.padding = '10px';
    Array.prototype.forEach.call(toggle.children, function (bar) {
      bar.style.display = 'block';
      bar.style.width = '100%';
      bar.style.height = '1.5px';
      bar.style.background = 'currentColor';
    });
    panel.style.flexBasis = '100%';
    panel.style.borderTop = '1px solid currentColor';
    panel.style.marginTop = '12px';
    panel.style.paddingTop = '12px';
    panelNav.style.display = 'flex';
    panelNav.style.flexDirection = 'column';
    panelNav.style.gap = '2px';
    Array.prototype.forEach.call(panelNav.children, function (link) {
      link.style.padding = '13px 4px';
    });
  }

  function clearFallback() {
    FALLBACK_PROPS.forEach(function (prop) {
      actions.style[prop] = '';
      toggle.style[prop] = '';
      panel.style[prop] = '';
      panelNav.style[prop] = '';
    });
    Array.prototype.forEach.call(toggle.children, function (bar) {
      bar.style.display = '';
      bar.style.width = '';
      bar.style.height = '';
      bar.style.background = '';
    });
    Array.prototype.forEach.call(panelNav.children, function (link) {
      link.style.padding = '';
    });
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
    if (media.matches) {
      // Test before anything inline is set, or the fallback would read as proof
      // that the stylesheet works.
      if (staleCss === null) staleCss = window.getComputedStyle(actions).display !== 'none';
      if (staleCss) applyFallback();
    } else {
      if (staleCss) clearFallback();
      close();
    }
  };

  window.addEventListener('resize', syncToViewport);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', syncToViewport);
  } else if (typeof media.addListener === 'function') {
    media.addListener(syncToViewport);
  }

  syncToViewport();
})();
