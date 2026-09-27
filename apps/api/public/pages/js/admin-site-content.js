/**
 * Admin > Site content. Edits what the public pages are built from: settings,
 * reviews, recent work, photos, FAQs and seasonal promos. The server
 * (routes/adminSiteContent.ts) validates every save and enforces the same
 * length limits these counters show; the counters are here so nobody finds
 * out only after pressing Save.
 */
(function () {
  'use strict';

  var esc = AdminCore.escapeHtml;
  var api = AdminCore.fetchJSON;
  var toast = function (m, t) { AdminCore.toast(m, t); };
  var BASE = '/api/v1/admin/site-content';

  var state = null;

  AdminCore.initTabs('#sc-tabs');
  AdminCore.initModalBehavior('sc-modal');

  /* ------------------------------------------------------------ counting */
  // The same rules as src/site/limits.ts.

  function countWords(text) {
    var plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\{\{[A-Z0-9_]+\}\}/g, 'X').trim();
    return plain ? plain.split(/\s+/).length : 0;
  }

  function countSentences(text) {
    var plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\be\.g\./g, 'eg');
    return plain ? plain.split(/(?<=[.!?])\s+(?=[A-Z"£0-9])/).filter(function (s) { return s.trim(); }).length : 0;
  }

  /* ------------------------------------------------------------- loading */

  async function load() {
    try {
      state = await api(BASE);
    } catch (e) {
      document.getElementById('sc-status').textContent = 'Could not load site content: ' + e.message;
      return;
    }
    document.getElementById('sc-import').classList.toggle('d-none', state.seeded);
    document.getElementById('sc-status').textContent =
      (state.seeded ? 'The site is running on this content.' : 'Not imported yet: the site is running on the content built into the code.') +
      ' Season in the header now: ' + (state.headerNow || 'none') + '.' +
      (state.photoStorage ? '' : ' Photo uploads are off: S3 is not configured.');
    fillSettings();
    renderAll();
  }

  function renderAll() {
    renderList('testimonials');
    renderList('recent-work');
    renderList('photos');
    renderFaqPages();
    renderList('faqs');
    renderList('promos');
    renderHistory();
  }

  /* ------------------------------------------------------------ settings */

  function fillSettings() {
    document.querySelectorAll('form[data-setting]').forEach(function (form) {
      var values = state.settings[form.dataset.setting] || {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || !(el.name in values)) return;
        if (el.type === 'checkbox') el.checked = Boolean(values[el.name]);
        else el.value = values[el.name];
      });
    });
    renderPreview();
  }

  function readSetting(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
      else out[el.name] = el.value.trim();
    });
    return out;
  }

  function money(n) { return '£' + Number(n || 0).toFixed(2); }

  /** A plain copy of the site's rate and guarantee blocks, fed from the unsaved form values. */
  function renderPreview() {
    var rates = readSetting(document.querySelector('form[data-setting="rates"]'));
    var promises = readSetting(document.querySelector('form[data-setting="promises"]'));
    var terms = [
      '4-hour minimum', '30-min overrun blocks', '+' + (rates.afterMidnightUpliftPct || 0) + '% after midnight',
      'No booking or uniform fees', 'Chefs and managers quoted separately.',
    ];
    var html = '<h3>Rates</h3>';
    if (rates.premiumEnabled) {
      html += '<p><strong>From ' + money(rates.standardRate) + '/hr</strong> per person</p>' +
        '<p><strong>Standard, ' + money(rates.standardRate) + '.</strong> Waiting, bar, kitchen porters, runners, hosts.</p>' +
        '<p><strong>Premium, ' + money(rates.premiumRate) + '.</strong> ' + esc(promises.premiumDefinition) + '</p>';
    } else {
      html += '<p><strong>' + money(rates.standardRate) + '</strong> per hour, per person</p>';
    }
    html += '<ul>' + terms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    document.getElementById('sc-preview-rates').innerHTML = html;

    document.getElementById('sc-preview-guarantees').innerHTML = '<h3>Our guarantees</h3>' +
      '<h4>Names the same day.</h4><p>' + esc(promises.confirmationPromise) + '</p>' +
      '<h4>Replacement within the hour.</h4><p>' + esc((promises.noShowPromise || '') + (promises.noShowExtra || '')) + '</p>' +
      (promises.guaranteeFootnote ? '<p><em>' + esc(promises.guaranteeFootnote) + '</em></p>' : '');
  }

  document.querySelectorAll('form[data-setting]').forEach(function (form) {
    form.addEventListener('input', renderPreview);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var btn = form.querySelector('button[type="submit"]');
      await AdminCore.withLoading(btn, async function () {
        try {
          await api(BASE + '/settings/' + form.dataset.setting, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(readSetting(form)),
          });
          toast('Saved. The site shows it now.', 'success');
          load();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  });

  /* --------------------------------------------------------------- lists */

  var TYPES = {
    testimonials: {
      label: 'review',
      rows: function () { return state.testimonials; },
      summary: function (t) {
        return '<p>“' + esc(t.quote) + '”</p><p class="sc-meta">' + esc(t.name) + ', ' + esc(t.context) +
          (t.showOnHome ? ' · on the homepage' : '') + (t.showOnHire ? ' · on /hire' : '') + '</p>';
      },
      fields: [
        { name: 'quote', label: 'Quote', type: 'textarea', max: 1000, limit: 'reviewWords', required: true },
        { name: 'name', label: 'Name', max: 120, required: true },
        { name: 'context', label: 'Context (e.g. "Google review", "private party, Fulham")', max: 120, required: true },
        { name: 'source', label: 'Source', type: 'select', options: [['google', 'Google'], ['direct', 'Direct']] },
        { name: 'url', label: 'Link to the review (optional)', type: 'url', max: 500 },
        { name: 'stars', label: 'Stars (optional, only if the review shows them)', type: 'number', min: 1, max: 5 },
        { name: 'showOnHome', label: 'Show on the homepage (the first one ticked is used)', type: 'checkbox' },
        { name: 'showOnHire', label: 'Show on /hire', type: 'checkbox', default: true },
        { name: 'published', label: 'Published', type: 'checkbox', default: true },
      ],
    },
    'recent-work': {
      label: 'recent work item',
      rows: function () { return state.recentWork; },
      summary: function (w) { return '<p><strong>' + esc(w.title) + '</strong>: ' + esc(w.detail) + '</p>'; },
      fields: [
        { name: 'title', label: 'Title', max: 200, required: true, limit: 'recentWorkWords', countWith: 'detail' },
        { name: 'detail', label: 'Detail', max: 500, required: true, limit: 'recentWorkWords', countWith: 'title' },
        { name: 'published', label: 'Published', type: 'checkbox', default: true },
      ],
    },
    photos: {
      label: 'photo',
      rows: function () { return state.photos; },
      summary: function (p) {
        var src = p.variants && p.variants.length ? p.path.replace('{w}', p.variants[0]) : p.path;
        return '<img src="' + esc(src) + '" alt=""><p>' + esc(p.alt) + '</p><p class="sc-meta">' +
          (p.tags.length ? 'Tags: ' + esc(p.tags.join(', ')) : 'No tags') + (p.caption ? ' · ' + esc(p.caption) : '') + '</p>';
      },
      fields: [
        { name: 'file', label: 'Photo (JPEG, PNG, WebP, HEIC; up to 12MB)', type: 'file', newOnly: true, required: true },
        { name: 'alt', label: 'Alt text: what the photo shows, for people who can\'t see it', max: 300, required: true },
        { name: 'caption', label: 'Caption (optional)', max: 300 },
        { name: 'tags', label: 'Tags, comma separated (e.g. home, hire, season-halloween)', type: 'tags' },
        { name: 'published', label: 'Published', type: 'checkbox', default: true },
      ],
    },
    faqs: {
      label: 'FAQ',
      rows: function () {
        var page = document.getElementById('sc-faq-page').value;
        return state.faqs.filter(function (f) { return f.pageKey === page; });
      },
      summary: function (f) { return '<p><strong>' + esc(f.question) + '</strong></p><p>' + esc(f.answer) + '</p>'; },
      fields: [
        { name: 'pageKey', label: 'Page', type: 'page' },
        { name: 'question', label: 'Question', max: 300, required: true },
        { name: 'answer', label: 'Answer (plain text; a link may be written as <a href="/hire">…</a>)', type: 'textarea', max: 1000, required: true, limit: 'faqAnswerWords', sentences: 'faqAnswerSentences' },
        { name: 'published', label: 'Published', type: 'checkbox', default: true },
      ],
    },
    promos: {
      label: 'seasonal promo',
      ordered: false,
      rows: function () { return state.promos; },
      summary: function (p) {
        var nav = p.navStartsOn ? ' · header item ' + p.navStartsOn + ' to ' + (p.navEndsOn || p.endsOn) : '';
        return '<p><strong>' + esc(p.navLabel) + '</strong> ' +
          (p.headerLive ? '<span class="badge badge-success">In the header now</span> ' : '') +
          (p.bannerLive ? '<span class="badge badge-success">Banner live now</span>' : '<span class="badge badge-muted">Not live</span>') +
          '</p><p>' + esc(p.bannerText) + '</p><p class="sc-meta">' + esc(p.startsOn) + ' to ' + esc(p.endsOn) + nav + ' · ' + esc(p.href) + '</p>';
      },
      fields: [
        { name: 'key', label: 'Key (lowercase, e.g. halloween)', max: 50, required: true },
        { name: 'navLabel', label: 'Header label', max: 40, required: true },
        { name: 'bannerText', label: 'Banner text', max: 120, required: true, limit: 'bannerWords' },
        { name: 'href', label: 'Links to (e.g. /special-events/halloween)', max: 200, required: true },
        { name: 'startsOn', label: 'Banner and homepage from', type: 'date', required: true },
        { name: 'endsOn', label: 'Banner and homepage until', type: 'date', required: true },
        { name: 'navStartsOn', label: 'Header item from (optional, if different)', type: 'date' },
        { name: 'navEndsOn', label: 'Header item until (optional)', type: 'date' },
        { name: 'homeHeading', label: 'Homepage heading', max: 200, required: true },
        { name: 'homeLines', label: 'Homepage lines', type: 'lines' },
        { name: 'homeCtaLabel', label: 'Homepage button text (optional)', max: 80 },
        { name: 'homeCtaHref', label: 'Homepage button link (optional)', max: 200 },
        { name: 'published', label: 'Published', type: 'checkbox', default: true },
      ],
    },
  };

  function renderList(type) {
    var cfg = TYPES[type];
    var rows = cfg.rows();
    var el = document.getElementById('list-' + type);
    if (!rows.length) {
      el.innerHTML = '<p class="text-muted fs-sm">None yet.</p>';
      return;
    }
    var ordered = cfg.ordered !== false;
    el.innerHTML = rows.map(function (row, i) {
      return '<div class="sc-item' + (row.published === false ? ' is-hidden' : '') + '">' +
        '<div class="sc-item-order">' + (ordered
          ? '<button class="btn btn-ghost btn-sm" data-action="move" data-collection="' + type + '" data-index="' + i + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="move" data-collection="' + type + '" data-index="' + i + '" data-dir="1" aria-label="Move down"' + (i === rows.length - 1 ? ' disabled' : '') + '>↓</button>'
          : '') + '</div>' +
        '<div class="sc-item-main">' + cfg.summary(row) + (row.published === false ? '<p class="sc-meta">Not published</p>' : '') + '</div>' +
        '<div class="sc-item-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="edit" data-collection="' + type + '" data-id="' + esc(row.id) + '">Edit</button>' +
          '<button class="btn btn-danger-quiet btn-sm" data-action="delete" data-collection="' + type + '" data-id="' + esc(row.id) + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  function renderFaqPages() {
    var select = document.getElementById('sc-faq-page');
    var current = select.value;
    select.innerHTML = state.faqPages.map(function (p) {
      var n = state.faqs.filter(function (f) { return f.pageKey === p && f.published; }).length;
      return '<option value="' + esc(p) + '">/' + esc(p) + ' (' + n + ')</option>';
    }).join('');
    if (current) select.value = current;
  }
  document.getElementById('sc-faq-page').addEventListener('change', function () { renderList('faqs'); });

  function renderHistory() {
    var body = document.getElementById('sc-history');
    body.innerHTML = state.changes.length ? state.changes.map(function (c) {
      return '<tr><td class="text-muted fs-sm">' + AdminCore.formatDateTime(c.when) + '</td><td>' + esc(c.who) + '</td><td>' + esc(c.what) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="empty-state">Nothing yet</td></tr>';
  }

  /* -------------------------------------------------------------- editor */

  var editing = null; // { type, row }

  function fieldHtml(f, row) {
    var value = row ? row[f.name] : f.default;
    var id = 'scf-' + f.name;
    var req = f.required ? ' required' : '';
    var counter = f.limit ? '<span class="sc-count" data-count-for="' + f.name + '"></span>' : '';
    if (f.type === 'checkbox') {
      return '<label class="sc-check"><input type="checkbox" name="' + f.name + '"' + (value ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    }
    if (f.type === 'textarea') {
      return '<label class="as-label" for="' + id + '">' + esc(f.label) + '<textarea class="as-input" id="' + id + '" name="' + f.name + '" rows="4" maxlength="' + f.max + '"' + req + '>' + esc(value || '') + '</textarea>' + counter + '</label>';
    }
    if (f.type === 'select') {
      return '<label class="as-label" for="' + id + '">' + esc(f.label) + '<select class="as-input" id="' + id + '" name="' + f.name + '">' +
        f.options.map(function (o) { return '<option value="' + o[0] + '"' + (value === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    }
    if (f.type === 'page') {
      var page = value || document.getElementById('sc-faq-page').value;
      return '<label class="as-label" for="' + id + '">' + esc(f.label) + '<select class="as-input" id="' + id + '" name="' + f.name + '">' +
        state.faqPages.map(function (p) { return '<option value="' + esc(p) + '"' + (p === page ? ' selected' : '') + '>/' + esc(p) + '</option>'; }).join('') + '</select></label>';
    }
    if (f.type === 'file') {
      return '<label class="as-label" for="' + id + '">' + esc(f.label) + '<input class="as-input" id="' + id + '" name="' + f.name + '" type="file" accept="image/*"' + req + '></label>';
    }
    if (f.type === 'tags') {
      return '<label class="as-label" for="' + id + '">' + esc(f.label) + '<input class="as-input" id="' + id + '" name="' + f.name + '" value="' + esc((value || []).join(', ')) + '"></label>';
    }
    if (f.type === 'lines') {
      var lines = value || [];
      return '<div class="as-label">' + esc(f.label) + '<div class="sc-lines" id="sc-lines">' + lines.map(lineHtml).join('') + '</div>' +
        '<div class="btn-group mt-1"><button type="button" class="btn btn-ghost btn-sm" data-action="add-line" data-kind="price">+ Role and rate</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="add-line" data-kind="sentence">+ Sentence</button></div>' +
        '<p class="text-muted fs-sm mt-1">Rates can be written as tokens, e.g. {{THEMED_RATE}}/hr, so they follow the rate settings.</p></div>';
    }
    var type = f.type || 'text';
    var extra = (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.type === 'number' && f.max !== undefined ? ' max="' + f.max + '"' : (f.max ? ' maxlength="' + f.max + '"' : ''));
    var shown = value === null || value === undefined ? '' : value;
    return '<label class="as-label" for="' + id + '">' + esc(f.label) + '<input class="as-input" id="' + id + '" name="' + f.name + '" type="' + type + '" value="' + esc(String(shown)) + '"' + extra + req + '>' + counter + '</label>';
  }

  function lineHtml(line) {
    if (typeof line === 'string') {
      return '<div class="sc-line is-sentence"><input class="as-input" data-line="sentence" value="' + esc(line) + '" maxlength="200" aria-label="Sentence"><button type="button" class="btn btn-ghost btn-sm" data-action="remove-line" aria-label="Remove">✕</button></div>';
    }
    return '<div class="sc-line"><input class="as-input" data-line="label" value="' + esc(line.label) + '" maxlength="120" aria-label="Role">' +
      '<input class="as-input" data-line="price" value="' + esc(line.price) + '" maxlength="40" aria-label="Rate">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="remove-line" aria-label="Remove">✕</button></div>';
  }

  function openEditor(type, row) {
    var cfg = TYPES[type];
    editing = { type: type, row: row };
    document.getElementById('sc-modal-title').textContent = (row ? 'Edit ' : 'Add ') + cfg.label;
    document.getElementById('sc-form-error').textContent = '';
    document.getElementById('sc-form-body').innerHTML = '<div class="sc-form-grid">' +
      cfg.fields.filter(function (f) { return !(row && f.newOnly); }).map(function (f) { return fieldHtml(f, row); }).join('') + '</div>';
    updateCounters();
    AdminCore.openModal('sc-modal');
    var first = document.querySelector('#sc-form-body input, #sc-form-body textarea');
    if (first) first.focus();
  }

  /** Live counters; Save is disabled while any field is over its limit. */
  function updateCounters() {
    if (!editing) return;
    var form = document.getElementById('sc-form');
    var over = false;
    TYPES[editing.type].fields.forEach(function (f) {
      if (!f.limit) return;
      var el = form.elements[f.name];
      var slot = form.querySelector('[data-count-for="' + f.name + '"]');
      if (!el || !slot) return;
      var textToCount = el.value + (f.countWith && form.elements[f.countWith] ? ' ' + form.elements[f.countWith].value : '');
      var words = countWords(textToCount);
      var max = state.limits[f.limit];
      var msg = words + ' / ' + max + ' words' + (f.countWith ? ' (with the ' + f.countWith + ')' : '');
      var bad = words > max;
      if (f.sentences) {
        var s = countSentences(el.value);
        var smax = state.limits[f.sentences];
        msg += ', ' + s + ' / ' + smax + ' sentences';
        bad = bad || s > smax;
      }
      slot.textContent = msg;
      slot.classList.toggle('is-over', bad);
      over = over || bad;
    });
    document.getElementById('sc-save').disabled = over;
  }
  document.getElementById('sc-form').addEventListener('input', updateCounters);

  function readLines() {
    return Array.prototype.map.call(document.querySelectorAll('#sc-lines .sc-line'), function (row) {
      var sentence = row.querySelector('[data-line="sentence"]');
      if (sentence) return sentence.value.trim();
      return { label: row.querySelector('[data-line="label"]').value.trim(), price: row.querySelector('[data-line="price"]').value.trim() };
    }).filter(function (l) { return typeof l === 'string' ? l : (l.label && l.price); });
  }

  function fileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('Could not read that file')); };
      reader.readAsDataURL(file);
    });
  }

  async function readEditor() {
    var form = document.getElementById('sc-form');
    var out = {};
    for (var i = 0; i < TYPES[editing.type].fields.length; i++) {
      var f = TYPES[editing.type].fields[i];
      if (f.type === 'lines') { out[f.name] = readLines(); continue; }
      var el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else if (f.type === 'tags') out[f.name] = el.value.split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
      else if (f.type === 'file') {
        if (!el.files || !el.files[0]) throw new Error('Choose a photo to upload.');
        out.contentBase64 = await fileAsBase64(el.files[0]);
      } else out[f.name] = el.value.trim();
    }
    return out;
  }

  document.getElementById('sc-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.target;
    var errorEl = document.getElementById('sc-form-error');
    errorEl.textContent = '';
    if (!form.reportValidity()) return;
    var btn = document.getElementById('sc-save');
    await AdminCore.withLoading(btn, async function () {
      try {
        var body = await readEditor();
        var url = BASE + '/' + editing.type + (editing.row ? '/' + encodeURIComponent(editing.row.id) : '');
        await api(url, {
          method: editing.row ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        AdminCore.closeModal('sc-modal');
        editing = null;
        toast('Saved. The site shows it now.', 'success');
        load();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  });

  /* ------------------------------------------------------------- actions */

  document.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    var type = el.dataset.collection;

    if (action === 'close') { AdminCore.closeModal('sc-modal'); editing = null; return; }
    if (action === 'new') { openEditor(type, null); return; }
    if (action === 'edit') {
      var row = TYPES[type].rows().filter(function (r) { return r.id === el.dataset.id; })[0];
      if (row) openEditor(type, row);
      return;
    }
    if (action === 'add-line') {
      document.getElementById('sc-lines').insertAdjacentHTML('beforeend', lineHtml(el.dataset.kind === 'sentence' ? '' : { label: '', price: '' }));
      return;
    }
    if (action === 'remove-line') { el.closest('.sc-line').remove(); return; }

    if (action === 'delete') {
      if (!window.confirm('Delete this ' + TYPES[type].label + '? It comes off the site straight away.')) return;
      try {
        await api(BASE + '/' + type + '/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' });
        toast('Deleted.', 'success');
        load();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }

    if (action === 'move') {
      var rows = TYPES[type].rows().slice();
      var i = Number(el.dataset.index);
      var j = i + Number(el.dataset.dir);
      if (j < 0 || j >= rows.length) return;
      var tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
      try {
        await api(BASE + '/' + type + '/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: rows.map(function (r) { return r.id; }) }),
        });
        load();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }

    if (action === 'import') {
      await AdminCore.withLoading(el, async function () {
        try {
          await api(BASE + '/import', { method: 'POST' });
          toast('Imported. The site now runs on this content, and nothing on it has changed.', 'success');
          load();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  });

  load();
})();
