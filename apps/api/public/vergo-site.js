/**
 * Behaviour for the shared header on every public page:
 *   - the mobile menu button
 *   - the Hire staff dropdown's caret
 *   - the seasonal banner's close button
 *
 * Which season shows, in the banner, the header and on the homepage, is
 * decided on the server from the stored promo dates (src/site/view.ts), so
 * pages arrive complete and nothing here depends on today's date.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ banner */

  function storage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  /** A dismissal lasts for the visit, and only for this set of offers. */
  function setupBannerDismiss() {
    var banner = document.querySelector('[data-season-banner]');
    if (!banner) return;
    var dismissKey = 'vergo-season-dismissed';
    var signature = banner.getAttribute('data-season-keys') || '';
    var store = storage();
    try {
      if (store && store.getItem(dismissKey) === signature) {
        banner.hidden = true;
        return;
      }
    } catch (e) { /* storage blocked: leave the banner up */ }

    var close = banner.querySelector('[data-season-dismiss]');
    if (close) {
      close.addEventListener('click', function () {
        banner.hidden = true;
        try { if (store) store.setItem(dismissKey, signature); } catch (e) { /* ignore */ }
      });
    }
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

  /** The caret beside Hire staff: opens its dropdown, or folds it open in the phone menu. */
  function setupSubmenus() {
    var items = document.querySelectorAll('[data-nav-menu]');
    if (!items.length) return;

    function setSubOpen(item, open) {
      item.classList.toggle('is-sub-open', open);
      var toggle = item.querySelector('.nav-sub-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    Array.prototype.forEach.call(items, function (item) {
      var toggle = item.querySelector('.nav-sub-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        setSubOpen(item, !item.classList.contains('is-sub-open'));
      });
    });

    function closeAll(except) {
      Array.prototype.forEach.call(items, function (item) {
        if (item !== except && item.classList.contains('is-sub-open')) setSubOpen(item, false);
      });
    }

    document.addEventListener('click', function (e) {
      var inside = e.target.closest && e.target.closest('[data-nav-menu]');
      closeAll(inside);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('[data-nav-menu].is-sub-open');
      if (open) {
        setSubOpen(open, false);
        open.querySelector('.nav-sub-toggle').focus();
      }
    });
  }

  function init() {
    setupMenu();
    setupSubmenus();
    setupBannerDismiss();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
