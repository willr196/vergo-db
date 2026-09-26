/**
 * Behaviour for the shared header on every public page:
 *   - the mobile menu button
 *   - the seasonal banner, header item and homepage section, all by date
 *
 * The seasonal pieces ship hidden with no link in them. Only this script fills
 * and shows them, so without JavaScript nothing seasonal appears, and nothing
 * can go stale: the dates below decide, every time a page loads.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- seasons */

  // Month is 1-12. Both ends inclusive.
  var SEASONS = {
    halloween: {
      banner: { from: [9, 1], to: [10, 31] },
      header: { from: [9, 1], to: [10, 31] },
      label: 'Halloween',
      bannerText: 'Halloween staff and performers: now booking',
      href: '/special-events/halloween'
    },
    christmas: {
      banner: { from: [9, 1], to: [12, 20] },
      header: { from: [11, 1], to: [12, 20] },
      label: 'Christmas',
      bannerText: 'Christmas party staff: now booking',
      href: '/special-events/christmas'
    }
  };
  var ORDER = ['halloween', 'christmas'];

  function inRange(range, date) {
    var md = (date.getMonth() + 1) * 100 + date.getDate();
    return md >= range.from[0] * 100 + range.from[1] && md <= range.to[0] * 100 + range.to[1];
  }

  function activeFor(kind, date) {
    return ORDER.filter(function (key) { return inRange(SEASONS[key][kind], date); });
  }

  var today = new Date();

  function storage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function setupBanner() {
    var banner = document.querySelector('[data-season-banner]');
    if (!banner) return;
    var keys = activeFor('banner', today);
    if (!keys.length) return;

    // Dismissal lasts for the visit, and only for this set of offers.
    var dismissKey = 'vergo-season-dismissed';
    var signature = keys.join('+');
    var store = storage();
    try {
      if (store && store.getItem(dismissKey) === signature) return;
    } catch (e) { /* storage blocked: show the banner */ }

    var holder = banner.querySelector('[data-season-banner-links]');
    // One span per offer; the " · " between them is CSS, so on a phone they
    // can stack one per line instead.
    keys.forEach(function (key) {
      var item = document.createElement('span');
      var a = document.createElement('a');
      a.href = SEASONS[key].href;
      a.textContent = SEASONS[key].bannerText + ' →';
      item.appendChild(a);
      holder.appendChild(item);
    });
    banner.hidden = false;

    var close = banner.querySelector('[data-season-dismiss]');
    if (close) {
      close.addEventListener('click', function () {
        banner.hidden = true;
        try { if (store) store.setItem(dismissKey, signature); } catch (e) { /* ignore */ }
      });
    }
  }

  function setupHeaderItem() {
    var item = document.querySelector('[data-season-item]');
    var link = document.querySelector('[data-season-link]');
    if (!item || !link) return;
    var key = activeFor('header', today)[0];
    if (!key) return;
    link.href = SEASONS[key].href;
    link.textContent = SEASONS[key].label;
    var path = window.location.pathname.replace(/\/$/, '');
    if (path === SEASONS[key].href) link.setAttribute('aria-current', 'page');
    item.hidden = false;
  }

  /** Homepage slot: the Halloween section until 31 October, then Christmas to 20 December. */
  function setupSeasonSections() {
    var key = activeFor('header', today)[0];
    Array.prototype.forEach.call(document.querySelectorAll('[data-season]'), function (el) {
      el.hidden = el.getAttribute('data-season') !== key;
    });
  }

  /* ------------------------------------------------------------- menu */

  function setupMenu() {
    var header = document.querySelector('[data-shared-header]');
    var toggle = header && header.querySelector('.menu-toggle');
    var nav = header && header.querySelector('.site-nav');
    if (!toggle || !nav) return;

    // Without this class the links simply show, stacked, on a phone.
    header.classList.add('has-menu');
    toggle.hidden = false;

    function setOpen(open) {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  function init() {
    setupMenu();
    setupBanner();
    setupHeaderItem();
    setupSeasonSections();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
