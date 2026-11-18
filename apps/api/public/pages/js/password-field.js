/**
 * Every password box on the staff pages gets a Show/Hide button and a
 * caps-lock warning. Loaded on /staff/login, /staff/set-password and
 * /staff/profile; works on any input[type=password] it finds.
 */
(function () {
  'use strict';

  function enhance(input) {
    if (input.dataset.pwEnhanced) return;
    input.dataset.pwEnhanced = '1';

    var wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pw-toggle';
    toggle.textContent = 'Show';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.setAttribute('aria-pressed', 'false');
    wrap.appendChild(toggle);

    var caps = document.createElement('p');
    caps.className = 'pw-caps';
    caps.id = (input.id || 'pw') + '-caps';
    caps.setAttribute('aria-live', 'polite');
    caps.hidden = true;
    caps.textContent = 'Caps Lock is on.';
    wrap.parentNode.insertBefore(caps, wrap.nextSibling);

    toggle.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'Show' : 'Hide';
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      toggle.setAttribute('aria-pressed', showing ? 'false' : 'true');
      input.focus();
    });

    function checkCaps(event) {
      if (!event.getModifierState) return;
      caps.hidden = !event.getModifierState('CapsLock');
    }
    input.addEventListener('keydown', checkCaps);
    input.addEventListener('keyup', checkCaps);
    input.addEventListener('blur', function () { caps.hidden = true; });

    // Never submit a password while it is showing as text: browsers and
    // password managers treat a visible field differently.
    var form = input.form;
    if (form) form.addEventListener('submit', function () {
      if (input.type === 'text') { input.type = 'password'; toggle.textContent = 'Show'; toggle.setAttribute('aria-pressed', 'false'); }
    }, true);
  }

  /**
   * A rough strength score, 0 to 4, from length and variety. Nothing leaves the
   * browser. The server still decides what it accepts (8 to 72 characters).
   */
  var COMMON = /^(password|passw0rd|qwerty|letmein|welcome|iloveyou|abc123|vergo|monkey|dragon|football|123456|12345678|123456789|111111)/i;
  function score(value) {
    if (!value) return -1;
    if (value.length < 8 || COMMON.test(value)) return 0;
    var kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (re) { return re.test(value); }).length;
    var s = value.length >= 16 ? 3 : value.length >= 12 ? 2 : 1;
    if (kinds >= 3) s += 1;
    if (/(.)\1\1/.test(value)) s -= 1;
    return Math.max(0, Math.min(4, s));
  }
  var LABELS = ['Too weak', 'Weak', 'OK', 'Strong', 'Very strong'];

  function meter(input) {
    var wrap = input.closest('.pw-wrap') || input;
    var box = document.createElement('div');
    box.className = 'pw-meter';
    box.innerHTML = '<div class="pw-meter-bar"><span></span></div><p class="pw-meter-label" aria-live="polite"></p>';
    wrap.parentNode.insertBefore(box, wrap.nextSibling);
    var bar = box.querySelector('span');
    var label = box.querySelector('p');
    function update() {
      var s = score(input.value);
      box.dataset.score = s;
      bar.style.width = s < 0 ? '0' : ((s + 1) * 20) + '%';
      label.textContent = s < 0 ? 'Use 8 or more characters. A short sentence is easy to remember and hard to guess.' : 'Strength: ' + LABELS[s] + (s < 2 ? '. Try a longer one, or a few random words.' : '');
    }
    input.addEventListener('input', update);
    update();
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[type="password"]'), enhance);
  // One meter per form, under its first new-password box.
  Array.prototype.forEach.call(document.querySelectorAll('form'), function (form) {
    var first = form.querySelector('input[autocomplete="new-password"]');
    if (first) meter(first);
  });
})();
