/**
 * VERGO — WhatsApp links.
 *
 * The header, the mobile menu and each page's closing call to action carry a
 * plain wa.me link (marked data-whatsapp), rendered server-side so it works
 * without JavaScript. This adds a pre-filled opening line to each one.
 *
 * There used to be a floating chat bubble here as well. It was removed so a
 * page has one WhatsApp entry point per view, not two.
 */
(function () {
  'use strict';

  var MESSAGE = "Hi, I'd like to enquire about staff for an event.";

  function decorate() {
    Array.prototype.forEach.call(document.querySelectorAll('a[data-whatsapp]'), function (a) {
      var href = a.getAttribute('href') || '';
      if (!/^https:\/\/wa\.me\/\d+$/.test(href)) return;
      a.setAttribute('href', href + '?text=' + encodeURIComponent(a.getAttribute('data-whatsapp') || MESSAGE));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorate);
  } else {
    decorate();
  }
})();
