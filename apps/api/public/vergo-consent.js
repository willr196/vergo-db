/**
 * Cookie consent gate for Google Analytics.
 *
 * Analytics is not loaded until the visitor actively accepts. This file exists as
 * an external script on purpose: the site's CSP sets script-src without
 * 'unsafe-inline', so the usual inline gtag snippet is blocked outright. Styles
 * are injected inline because style-src does allow 'unsafe-inline', and several
 * public pages (404, blog) do not load vergo-site.css.
 */
(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-FKTFYMF597';
  var STORAGE_KEY = 'vergo.consent';
  var loaded = false;

  // localStorage throws in some privacy modes; consent must never break the page.
  function read() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function write(status) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        status: status,
        at: new Date().toISOString()
      }));
    } catch (e) {
      /* Session-only consent is an acceptable fallback. */
    }
  }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(s);

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID);
  }

  /** Best effort: drop the _ga cookies so withdrawing consent actually clears them. */
  function clearAnalyticsCookies() {
    var host = window.location.hostname;
    var domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));

    document.cookie.split(';').forEach(function (entry) {
      var name = entry.split('=')[0].trim();
      if (name.indexOf('_ga') !== 0 && name.indexOf('_gid') !== 0) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('vergo-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 'vergo-consent-styles';
    style.textContent = [
      '.vergo-consent{position:fixed;left:0;right:0;bottom:0;z-index:9999;',
      'background:var(--footer-bg,#120f0c);color:var(--text,#f2efe8);',
      'border-top:1px solid var(--hairline,rgba(242,239,232,0.12));',
      'font-family:var(--font-sans,"Work Sans",Helvetica,Arial,sans-serif);',
      'padding:16px;box-shadow:0 -8px 32px rgba(0,0,0,0.35)}',
      '.vergo-consent-inner{max-width:var(--max-width,1180px);margin:0 auto;display:flex;',
      'gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between}',
      '.vergo-consent-text{margin:0;font-size:0.9rem;line-height:1.5;',
      'color:var(--text-secondary,#cfc9bd);flex:1 1 320px;min-width:0}',
      '.vergo-consent-text a{color:var(--accent,#4fc46f)}',
      '.vergo-consent-actions{display:flex;gap:10px;flex-wrap:wrap}',
      '.vergo-consent-btn{font:inherit;font-size:0.875rem;font-weight:600;cursor:pointer;',
      'padding:10px 18px;border-radius:999px;border:1px solid transparent;white-space:nowrap}',
      '.vergo-consent-accept{background:var(--accent,#4fc46f);color:var(--accent-ink,#1a1410)}',
      '.vergo-consent-accept:hover{background:var(--accent-hover,#7fe098)}',
      '.vergo-consent-decline{background:transparent;color:var(--text,#f2efe8);',
      'border-color:var(--hairline-strong,rgba(242,239,232,0.14))}',
      '.vergo-consent-decline:hover{border-color:var(--accent,#4fc46f);color:var(--accent,#4fc46f)}',
      '.vergo-consent-btn:focus-visible{outline:2px solid var(--accent,#4fc46f);outline-offset:2px}',
      '@media (max-width:560px){.vergo-consent-actions{width:100%}',
      '.vergo-consent-btn{flex:1 1 auto}}'
    ].join('');
    document.head.appendChild(style);
  }

  function removeBanner() {
    var el = document.getElementById('vergo-consent');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showBanner() {
    if (document.getElementById('vergo-consent')) return;
    injectStyles();

    var banner = document.createElement('div');
    banner.id = 'vergo-consent';
    banner.className = 'vergo-consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie choices');

    var inner = document.createElement('div');
    inner.className = 'vergo-consent-inner';

    var text = document.createElement('p');
    text.className = 'vergo-consent-text';
    text.appendChild(document.createTextNode(
      'We use analytics cookies to understand how the site is used. They are only set if you accept. See our '
    ));
    var link = document.createElement('a');
    link.href = '/privacy';
    link.textContent = 'privacy policy';
    text.appendChild(link);
    text.appendChild(document.createTextNode('.'));

    var actions = document.createElement('div');
    actions.className = 'vergo-consent-actions';

    var decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'vergo-consent-btn vergo-consent-decline';
    decline.textContent = 'Decline';
    decline.addEventListener('click', function () {
      write('denied');
      clearAnalyticsCookies();
      removeBanner();
    });

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'vergo-consent-btn vergo-consent-accept';
    accept.textContent = 'Accept';
    accept.addEventListener('click', function () {
      write('granted');
      removeBanner();
      loadAnalytics();
    });

    actions.appendChild(decline);
    actions.appendChild(accept);
    inner.appendChild(text);
    inner.appendChild(actions);
    banner.appendChild(inner);
    document.body.appendChild(banner);
    accept.focus();
  }

  /**
   * Withdrawing consent has to be as easy as giving it, so every page with a
   * footer gets a link back to the banner without needing its own markup.
   */
  function addFooterLink() {
    // The shared footer renders the link itself (so it is there without
    // JavaScript and on every page); this only wires it up. A page without the
    // shared footer gets one appended to its link list instead.
    var a = document.getElementById('vergo-consent-link');
    if (!a) {
      var links = document.querySelector('.footer-links');
      if (!links) return;
      a = document.createElement('a');
      a.id = 'vergo-consent-link';
      a.href = '#cookie-settings';
      a.textContent = 'Cookie settings';
      links.appendChild(a);
    }
    a.addEventListener('click', function (e) {
      e.preventDefault();
      showBanner();
    });
  }

  function init() {
    addFooterLink();
    var stored = read();
    if (stored && stored.status === 'granted') {
      loadAnalytics();
    } else if (!stored) {
      showBanner();
    }
  }

  window.vergoConsent = {
    status: function () { var s = read(); return s ? s.status : null; },
    show: showBanner,
    grant: function () { write('granted'); removeBanner(); loadAnalytics(); },
    deny: function () { write('denied'); clearAnalyticsCookies(); removeBanner(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
