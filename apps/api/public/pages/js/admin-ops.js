/**
 * VERGO Ops console. One page, hash-routed (#/workers, #/booking/<id> ...).
 * Every write goes through window.fetch, which admin-core.js patches to carry
 * the CSRF token. All text from the server is escaped before it is shown.
 */
(function () {
  'use strict';

  var API = '/api/v1/ops';
  var main = document.getElementById('as-content');
  var esc = AdminCore.escapeHtml;

  // ── Helpers ─────────────────────────────────────────────────────────────

  async function api(path, opts) {
    opts = opts || {};
    var init = { credentials: 'include', method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    var res = await fetch(API + path, init);
    var payload = await res.json().catch(function () { return {}; });
    if (res.status === 401) {
      location.href = '/login?redirect=' + encodeURIComponent('/ops' + location.hash);
      throw new Error('Session expired');
    }
    if (!res.ok) {
      var err = new Error(payload.error || res.statusText);
      err.payload = payload;
      err.status = res.status;
      throw err;
    }
    return payload.data !== undefined ? payload.data : payload;
  }

  function toast(msg, type) { AdminCore.toast(msg, type || 'success'); }
  function fail(err) { toast(err.message || String(err), 'error'); }

  function gbp(pence) {
    if (pence == null) return '—';
    var neg = pence < 0;
    var s = '£' + (Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return neg ? '−' + s : s;
  }
  function rate(v) { return v == null ? '—' : '£' + Number(v).toFixed(2); }
  function pct(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function day(v) {
    if (!v) return '—';
    var s = String(v).slice(0, 10);
    var d = new Date(s + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
  }
  function when(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  }
  function words(v) {
    if (v == null) return '';
    return String(v).replace(/_/g, ' ').toLowerCase()
      .replace(/^\w/, function (c) { return c.toUpperCase(); })
      .replace(/\b(kid|rtw|awr|fps|hmrc|csv)\b/gi, function (m) { return m.toUpperCase(); });
  }
  function chip(text, kind) { return '<span class="chip chip-' + (kind || 'muted') + '">' + esc(text) + '</span>'; }
  function todayLondon() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); }

  var CHIPS = {
    rtw: { valid: 'ok', follow_up_required: 'warn', expired: 'bad', blocked: 'bad', not_checked: 'muted' },
    contract: { accepted: 'ok', issued: 'warn', superseded: 'warn', not_issued: 'bad' },
    kid: { issued: 'ok', superseded: 'warn', not_issued: 'bad' },
    payroll: { ACTIVE: 'ok', PENDING: 'warn', NOT_ADDED: 'bad', LEAVER: 'muted' },
    booking: { DRAFT: 'muted', QUOTED: 'info', CONFIRMED: 'info', STAFFING: 'warn', FULLY_STAFFED: 'ok', IN_PROGRESS: 'info', COMPLETED: 'ok', CANCELLED: 'muted', INVOICED: 'warn', PAID: 'ok' },
    assignment: { PENDING: 'warn', CONFIRMED: 'ok', REJECTED: 'muted', CANCELLED: 'muted', COMPLETED: 'ok', NO_SHOW: 'bad', REPLACED: 'muted' },
    doc: { ISSUED: 'warn', ACCEPTED: 'ok', SUPERSEDED: 'muted', WITHDRAWN: 'muted' },
  };
  var ASSIGNMENT_WORDS = { PENDING: 'Offered', CONFIRMED: 'Accepted', REJECTED: 'Declined', CANCELLED: 'Cancelled', COMPLETED: 'Completed', NO_SHOW: 'No-show', REPLACED: 'Replaced' };

  function readyChip(r) {
    if (r.computedReady) return chip('Ready', 'ok');
    if (r.overridden) return chip('Ready (override)', 'info');
    return chip('Not ready', 'bad');
  }
  function pensionChip(s) {
    if (s === 'NOT_ASSESSED') return chip('Not assessed', 'bad');
    if (s === 'REVIEW_REQUIRED') return chip('Review', 'warn');
    return chip(words(s), 'info');
  }

  function options(list, selected, blank) {
    var out = blank != null ? '<option value="">' + esc(blank) + '</option>' : '';
    return out + list.map(function (o) {
      var value = Array.isArray(o) ? o[0] : o;
      var label = Array.isArray(o) ? o[1] : words(o);
      return '<option value="' + esc(value) + '"' + (String(selected) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  /**
   * One form field. type: text|date|time|number|email|textarea|select|checkbox|list|datetime.
   * "list" is a comma-separated array; "number" parses; empty optional fields become null.
   */
  function field(label, name, value, type, extra) {
    extra = extra || {};
    type = type || 'text';
    var id = 'f-' + name + '-' + Math.random().toString(36).slice(2, 7);
    var attrs = ' id="' + id + '" name="' + esc(name) + '" data-type="' + type + '"' + (extra.required ? ' required' : '') + (extra.attrs || '');
    var cls = extra.wide ? ' class="wide"' : '';
    var hint = extra.hint ? '<div class="text-muted fs-sm" style="margin-top:4px">' + esc(extra.hint) + '</div>' : '';
    if (type === 'checkbox') {
      return '<div' + cls + '><label class="ops-check"><input type="checkbox"' + attrs + (value ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>' + hint + '</div>';
    }
    var input;
    if (type === 'textarea') input = '<textarea' + attrs + '>' + esc(value == null ? '' : value) + '</textarea>';
    else if (type === 'select') input = '<select' + attrs + '>' + options(extra.options || [], value, extra.blank) + '</select>';
    else {
      var v = value == null ? '' : (type === 'list' && Array.isArray(value) ? value.join(', ') : value);
      var htmlType = { list: 'text', number: 'number', datetime: 'datetime-local' }[type] || type;
      input = '<input type="' + htmlType + '"' + attrs + ' value="' + esc(v) + '"' + (type === 'number' ? ' step="any"' : '') + '>';
    }
    return '<div' + cls + '><label for="' + id + '">' + esc(label) + (extra.required ? ' *' : '') + '</label>' + input + hint + '</div>';
  }

  function readForm(root) {
    var out = {};
    root.querySelectorAll('[name]').forEach(function (el) {
      var t = el.dataset.type;
      var v;
      if (t === 'checkbox') v = el.checked;
      else if (t === 'number') v = el.value.trim() === '' ? null : Number(el.value);
      else if (t === 'list') v = el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      else if (t === 'datetime') v = el.value ? new Date(el.value).toISOString() : null;
      else v = el.value.trim() === '' ? null : el.value.trim();
      out[el.name] = v;
    });
    return out;
  }
  function compact(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) { if (obj[k] !== null && obj[k] !== '') out[k] = obj[k]; });
    return out;
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ── Modal and confirmation ──────────────────────────────────────────────

  var modal = document.getElementById('ops-modal');
  function closeModal() { modal.classList.add('d-none'); document.getElementById('ops-modal-body').innerHTML = ''; }
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-ops-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /** buttons: [{ label, kind, onClick(body) -> Promise|void }]. A handler that resolves closes the modal unless it returns false. */
  function openModal(title, bodyHtml, buttons) {
    document.getElementById('ops-modal-title').textContent = title;
    var body = document.getElementById('ops-modal-body');
    body.innerHTML = bodyHtml;
    var footer = document.getElementById('ops-modal-footer');
    footer.innerHTML = '';
    var cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', closeModal);
    footer.appendChild(cancel);
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.kind || 'btn-primary');
      btn.textContent = b.label;
      btn.addEventListener('click', async function () {
        try {
          var keep = await AdminCore.withLoading(btn, function () { return b.onClick(body); });
          if (keep !== false) closeModal();
        } catch (err) { fail(err); }
      });
      footer.appendChild(btn);
    });
    modal.classList.remove('d-none');
    var first = body.querySelector('input, select, textarea');
    if (first) first.focus();
    return body;
  }

  function confirmDialog(message, label, danger) {
    return new Promise(function (resolve) {
      var settled = false;
      openModal('Please confirm', '<p>' + esc(message) + '</p>', [{
        label: label || 'Confirm', kind: danger ? 'btn-danger' : 'btn-primary',
        onClick: function () { settled = true; resolve(true); },
      }]);
      var obs = new MutationObserver(function () {
        if (modal.classList.contains('d-none')) { obs.disconnect(); if (!settled) resolve(false); }
      });
      obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /**
   * Submit something that may come back 409 with assignment warnings. Soft
   * warnings ask for a written reason and resubmit; blocking ones stop.
   */
  async function submitWithOverride(path, method, body) {
    try {
      return await api(path, { method: method, body: body });
    } catch (err) {
      var w = err.payload && err.payload.warnings;
      if (err.status !== 409 || !w) throw err;
      var list = '<ul class="ops-warning-list">' + w.map(function (x) {
        return '<li class="' + (x.blocking ? 'blocking' : 'soft') + '">' + (x.blocking ? '<strong>Blocked:</strong> ' : '') + esc(x.message) + '</li>';
      }).join('') + '</ul>';
      if (w.some(function (x) { return x.blocking; })) {
        openModal('Cannot assign', list + '<p class="text-muted fs-sm">Fix the blocking item first. Right-to-work problems cannot be overridden.</p>', []);
        throw new Error('Assignment blocked');
      }
      return await new Promise(function (resolve, reject) {
        openModal('Confirm despite warnings', list + '<div class="ops-form">' +
          field('Reason for going ahead', 'overrideReason', '', 'textarea', { wide: true, required: true, hint: 'Kept on the assignment and in the audit log.' }) + '</div>', [{
          label: 'Go ahead', kind: 'btn-warning',
          onClick: async function (b) {
            var reason = readForm(b).overrideReason;
            if (!reason || reason.length < 5) throw new Error('Give a reason of at least a few words.');
            var result = await api(path, { method: method, body: Object.assign({}, body, { overrideReason: reason }) });
            resolve(result);
          },
        }]);
        var obs = new MutationObserver(function () {
          if (modal.classList.contains('d-none')) { obs.disconnect(); reject(new Error('Cancelled')); }
        });
        obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
      }).catch(function (e) { if (e.message !== 'Cancelled') throw e; return null; });
    }
  }

  function table(headers, rows, emptyText) {
    if (!rows.length) return '<div class="ops-empty">' + esc(emptyText || 'Nothing here.') + '</div>';
    return '<div class="ops-scroll"><table class="ops-table"><thead><tr>' +
      headers.map(function (h) { return '<th' + (h.charAt(0) === '>' ? ' class="num"' : '') + '>' + esc(h.replace(/^>/, '')) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function auditTable(rows) {
    return table(['When', 'Who', 'Action', 'Change', 'Reason'], rows.map(function (a) {
      var change = (a.oldValue != null || a.newValue != null)
        ? '<details><summary class="fs-sm">view</summary><div class="ops-pre">' +
          (a.oldValue != null ? 'Before: ' + esc(JSON.stringify(a.oldValue, null, 1)) + '\n' : '') +
          (a.newValue != null ? 'After: ' + esc(JSON.stringify(a.newValue, null, 1)) : '') + '</div></details>'
        : '';
      return '<tr><td>' + when(a.at) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(words(a.action)) + '</td><td>' + change + '</td><td>' + esc(a.reason || '') + '</td></tr>';
    }), 'No changes recorded yet.');
  }

  function alertBox(level, message, link) {
    return '<div class="ops-alert ops-alert-' + level + '"><span>' + esc(message) + '</span>' + (link ? '<a href="' + esc(link) + '">Open</a>' : '') + '</div>';
  }

  function on(root, selector, event, handler) {
    root.querySelectorAll(selector).forEach(function (el) { el.addEventListener(event, function (e) { handler(e, el); }); });
  }

  function parseQuery(qs) {
    var out = {};
    new URLSearchParams(qs || '').forEach(function (v, k) { if (v !== '') out[k] = v; });
    return out;
  }
  function setQuery(base, params) {
    var qs = new URLSearchParams(compact(params)).toString();
    location.hash = '#/' + base + (qs ? '?' + qs : '');
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  function kpi(label, value, sub, kind, href) {
    var tag = href ? 'a href="' + esc(href) + '"' : 'div';
    return '<' + tag + ' class="kpi-card' + (kind ? ' kpi-' + kind : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + esc(value) + '</div>' +
      (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '') + '</' + (href ? 'a' : 'div') + '>';
  }

  async function viewDashboard() {
    var d = await api('/dashboard');
    var w = d.workers, a = d.assignments, m = d.money;
    main.innerHTML =
      '<div class="ops-head"><div><h2>Dashboard</h2><div class="ops-lede">Today, ' + day(d.today) + '. Figures for ' + day(d.month.start) + ' to ' + day(d.month.end) + ' are estimates.</div></div></div>' +
      (d.alerts.length ? '<h3>Alerts</h3>' + d.alerts.map(function (x) { return alertBox(x.level, x.message, x.link); }).join('') : alertBox('info', 'No compliance alerts.')) +
      '<div class="kpi-section-title">Workers</div><div class="kpi-grid ops-kpis">' +
        kpi('Active workers', w.active, null, null, '#/workers?active=ACTIVE') +
        kpi('Ready for assignments', w.ready, null, 'success', '#/workers?ready=ready') +
        kpi('Blocked by compliance', w.blocked, 'Active but not ready', w.blocked ? 'error' : null, '#/workers?ready=not_ready') +
        kpi('RTW expired', w.rtwExpired, null, w.rtwExpired ? 'error' : null, '#/rtw') +
        kpi('RTW expiring ≤30 days', w.rtwWithin30, w.rtwWithin60 + ' more within 60', w.rtwWithin30 ? 'warning' : null, '#/rtw') +
        kpi('No RTW check', w.rtwNoCheck, null, w.rtwNoCheck ? 'warning' : null, '#/workers?rtw=not_checked') +
        kpi('Contracts not accepted', w.contractsNotAccepted, w.contractsNotIssued + ' not issued', w.contractsNotAccepted ? 'warning' : null, '#/workers?contract=issued') +
        kpi('KIDs not issued', w.kidsNotIssued, null, w.kidsNotIssued ? 'warning' : null, '#/workers?kid=not_issued') +
        kpi('No pension status', w.pensionNotAssessed, null, w.pensionNotAssessed ? 'warning' : null, '#/workers?pension=NOT_ASSESSED') +
      '</div>' +
      '<div class="kpi-section-title">Documents &amp; Terms</div><div class="kpi-grid ops-kpis">' +
        kpi('Workers missing KID', w.missingKid, null, w.missingKid ? 'warning' : null, '#/documents?tab=workers&pack=kid_missing') +
        kpi('Workers missing agreement', w.missingAgreement, null, w.missingAgreement ? 'warning' : null, '#/documents?tab=workers&pack=contract_missing') +
        kpi('Clients without current Terms', d.terms.clientsWithoutCurrentTerms, 'Business clients', d.terms.clientsWithoutCurrentTerms ? 'warning' : null, '#/documents?tab=clients&terms=missing') +
        kpi('Workers on superseded contract', w.onSupersededContract, null, w.onSupersededContract ? 'warning' : null, '#/documents?tab=workers&pack=outdated') +
        kpi('Clients on superseded Terms', d.terms.clientsOnSupersededTerms, null, d.terms.clientsOnSupersededTerms ? 'warning' : null, '#/documents?tab=clients&terms=older') +
      '</div>' +
      '<div class="kpi-section-title">Work</div><div class="kpi-grid ops-kpis">' +
        kpi('Upcoming assignments', a.upcoming, 'Next 14 days', 'info') +
        kpi('Unfilled slots', a.unfilledSlots, null, a.unfilledSlots ? 'warning' : null, '#/bookings?staffed=not_full') +
        kpi('Timesheets awaiting approval', a.timesheetsAwaitingApproval, null, a.timesheetsAwaitingApproval ? 'warning' : null, '#/timesheets') +
        kpi('Completed, not invoiced', a.completedAwaitingInvoice, null, a.completedAwaitingInvoice ? 'warning' : null, '#/bookings?status=COMPLETED') +
        kpi('Invoices outstanding', d.invoices.outstandingCount, gbp(d.invoices.outstandingPence), d.invoices.outstandingCount ? 'warning' : null, '#/bookings?status=INVOICED') +
      '</div>' +
      '<div class="kpi-section-title">This month <span class="ops-estimate">Estimate</span></div><div class="kpi-grid ops-kpis">' +
        kpi('Estimated revenue', gbp(m.revenuePence)) +
        kpi('Estimated direct labour', gbp(m.directLabourPence), 'Wages, holiday, employer costs') +
        kpi('Estimated gross contribution', gbp(m.grossContributionPence), null, m.grossContributionPence < 0 ? 'error' : 'success') +
        kpi('Average gross margin', pct(m.averageGrossMargin)) +
      '</div>' +
      '<div class="kpi-section-title">' + esc(d.awr.label) + '</div><div class="kpi-grid ops-kpis">' +
        kpi('AWR 10-week warnings', d.awr.warning, null, d.awr.warning ? 'warning' : null, '#/awr') +
        kpi('AWR 12-week reviews', d.awr.review, null, d.awr.review ? 'error' : null, '#/awr') +
      '</div>' +
      '<h3>Upcoming assignments</h3><div class="as-table-wrap">' + table(['Date', 'Time', 'Worker', 'Role', 'Booking', 'Venue', 'Status'], a.upcomingList.map(function (x) {
        return '<tr' + (x.opsBookingId ? ' class="clickable" data-href="#/booking/' + esc(x.opsBookingId) + '"' : '') + '><td>' + day(x.date) + '</td><td>' + esc(x.plannedStart + '–' + x.plannedFinish) + '</td><td>' + esc(x.worker.name) + '</td><td>' + esc(x.role || '—') + '</td><td>' + esc(x.reference || 'Shift (not in Ops)') + '</td><td>' + esc(x.venue || '—') + '</td><td>' + chip(ASSIGNMENT_WORDS[x.status] || x.status, CHIPS.assignment[x.status]) + '</td></tr>';
      }), 'Nothing in the next 14 days.') + '</div>';
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
  }

  // ── Workers ─────────────────────────────────────────────────────────────

  var PENSION = ['NOT_ASSESSED', 'NOT_ELIGIBLE_CURRENTLY', 'ELIGIBLE', 'ENROLLED', 'OPTED_IN', 'OPTED_OUT', 'ENTITLED_WORKER', 'POSTPONED', 'REVIEW_REQUIRED'];

  async function viewWorkers(query) {
    var params = new URLSearchParams(query).toString();
    var workers = await api('/workers' + (params ? '?' + params : ''));
    main.innerHTML =
      '<div class="ops-head"><div><h2>Workers</h2><div class="ops-lede">Ready for Work is worked out from the records: active, right to work valid, agreement accepted, KID issued, contact and emergency details, and payroll active.</div></div>' +
      '<div class="ops-actions"><a class="btn btn-ghost btn-sm" href="' + API + '/exports/workers.csv">Export list</a><a class="btn btn-ghost btn-sm" href="' + API + '/exports/compliance.csv">Export compliance</a><button class="btn btn-primary" id="add-worker">Add worker</button></div></div>' +
      '<form class="as-filters" id="filters">' +
        '<div class="as-filter-group"><label>Search</label><input type="search" name="search" value="' + esc(query.search || '') + '" placeholder="Name, email, phone"></div>' +
        '<div class="as-filter-group"><label>Role</label><input type="text" name="role" value="' + esc(query.role || '') + '"></div>' +
        '<div class="as-filter-group"><label>Ready</label><select name="ready">' + options([['ready', 'Ready'], ['not_ready', 'Not ready'], ['overridden', 'Overridden']], query.ready, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Right to work</label><select name="rtw">' + options(['valid', 'follow_up_required', 'expired', 'blocked', 'not_checked'], query.rtw, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>RTW expiry</label><select name="rtwExpiry">' + options([['expired', 'Expired'], ['within_30', 'Within 30 days'], ['within_60', 'Within 60 days'], ['later', 'Later'], ['no_expiry', 'No expiry'], ['no_check', 'No check']], query.rtwExpiry, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Contract</label><select name="contract">' + options(['not_issued', 'issued', 'accepted', 'superseded'], query.contract, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>KID</label><select name="kid">' + options(['not_issued', 'issued', 'superseded'], query.kid, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Pension</label><select name="pension">' + options(PENSION, query.pension, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Availability</label><select name="availability">' + options(['AVAILABLE', 'LIMITED', 'UNAVAILABLE'], query.availability, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Status</label><select name="active">' + options(['ACTIVE', 'INACTIVE', 'LEFT'], query.active, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Min rating</label><select name="minRating">' + options(['1', '2', '3', '4', '5'], query.minRating, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Last shift before</label><input type="date" name="lastShiftBefore" value="' + esc(query.lastShiftBefore || '') + '"></div>' +
        '<div class="as-filter-actions"><button class="btn btn-ghost btn-sm" type="button" id="clear">Clear</button></div>' +
      '</form>' +
      '<div class="as-table-wrap"><div class="as-table-toolbar"><span class="text-muted fs-sm">' + workers.length + ' worker(s)</span></div>' +
      table(['Name', 'Roles', 'Ready', 'Right to work', 'Contract', 'KID', 'Payroll', 'Pension', 'Last shift', '>Rating'], workers.map(function (w) {
        return '<tr class="clickable" data-href="#/worker/' + esc(w.id) + '"><td><strong>' + esc(w.name) + '</strong>' + (w.activeStatus !== 'ACTIVE' ? ' ' + chip(words(w.activeStatus), 'muted') : '') + '<div class="text-muted fs-sm">' + esc(w.email) + '</div></td>' +
          '<td>' + esc(w.roles.join(', ') || '—') + '</td>' +
          '<td>' + readyChip(w.readiness) + (w.readiness.missing.length && !w.readiness.computedReady ? '<div class="text-muted fs-sm">' + w.readiness.missing.length + ' missing</div>' : '') + '</td>' +
          '<td>' + chip(words(w.rtw.status), CHIPS.rtw[w.rtw.status]) + (w.rtw.expiresAt ? '<div class="text-muted fs-sm">until ' + day(w.rtw.expiresAt) + '</div>' : '') + '</td>' +
          '<td>' + chip(words(w.contract.status), CHIPS.contract[w.contract.status]) + '</td>' +
          '<td>' + chip(words(w.kid.status), CHIPS.kid[w.kid.status]) + '</td>' +
          '<td>' + chip(words(w.payrollStatus), CHIPS.payroll[w.payrollStatus]) + '</td>' +
          '<td>' + pensionChip(w.pensionStatus) + '</td>' +
          '<td>' + day(w.lastAssignmentDate) + '</td><td class="num">' + (w.rating || '—') + '</td></tr>';
      }), 'No workers match.') + '</div>';

    var form = main.querySelector('#filters');
    form.addEventListener('change', function () { setQuery('workers', Object.fromEntries(new FormData(form))); });
    form.addEventListener('submit', function (e) { e.preventDefault(); setQuery('workers', Object.fromEntries(new FormData(form))); });
    main.querySelector('#clear').addEventListener('click', function () { location.hash = '#/workers'; });
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
    main.querySelector('#add-worker').addEventListener('click', addWorkerModal);
  }

  function addWorkerModal() {
    var body = openModal('Add worker',
      '<p class="text-muted fs-sm mb-2">Check for an existing account first, so nobody is added twice.</p>' +
      '<div class="ops-form"><div class="wide"><label>Find an existing account</label><input type="search" id="cand-search" placeholder="Name or email"></div></div>' +
      '<div id="cand-results" class="mb-2"></div><h3>Or add someone new</h3><div class="ops-form" id="new-worker">' +
      field('First name', 'firstName', '', 'text', { required: true }) + field('Last name', 'lastName', '', 'text', { required: true }) +
      field('Email', 'email', '', 'email', { required: true }) + field('Phone', 'phone', '', 'text') + '</div>',
      [{ label: 'Add new worker', onClick: async function (b) {
        var w = await api('/workers', { method: 'POST', body: compact(readForm(b.querySelector('#new-worker'))) });
        toast('Worker added'); location.hash = '#/worker/' + w.id;
      } }]);
    var input = body.querySelector('#cand-search');
    var search = AdminCore.debounce(async function () {
      var list = await api('/workers/candidates?search=' + encodeURIComponent(input.value));
      var results = body.querySelector('#cand-results');
      results.innerHTML = table(['Name', 'Email', ''], list.map(function (u) {
        return '<tr><td>' + esc(u.firstName + ' ' + u.lastName) + '</td><td>' + esc(u.email) + '</td><td><button class="btn btn-sm btn-primary" data-id="' + esc(u.id) + '">Add</button></td></tr>';
      }), 'No matching accounts that are not already workers.');
      on(results, 'button[data-id]', 'click', async function (_e, el) {
        try {
          var w = await api('/workers', { method: 'POST', body: { userId: el.dataset.id } });
          closeModal(); toast('Worker added'); location.hash = '#/worker/' + w.id;
        } catch (err) { fail(err); }
      });
    }, 300);
    input.addEventListener('input', search);
    search();
  }

  async function viewWorker(id) {
    var w = await api('/workers/' + encodeURIComponent(id));
    var r = w.readiness;
    var ACCEPTABLE = { ZERO_HOURS_AGREEMENT: true, ASSIGNMENT_CONFIRMATION: true };

    main.innerHTML =
      '<div class="ops-head"><div><a href="#/workers" class="text-muted fs-sm">← Workers</a><h2>' + esc(w.name) + ' ' + readyChip(r) + '</h2>' +
      '<div class="ops-lede">' + esc(w.email) + (w.phone ? ' · ' + esc(w.phone) : '') + ' · first shift ' + day(w.firstAssignmentDate) + ' · last shift ' + day(w.lastAssignmentDate) + '</div></div>' +
      '<div class="ops-actions"><a class="btn btn-ghost btn-sm" href="' + API + '/workers/' + esc(w.id) + '/export">Export all records (JSON)</a></div></div>' +

      '<div class="ops-card"><h3 style="margin-top:0">Ready for Work</h3>' +
        (r.computedReady ? '<p>All requirements are met.</p>' : '<p>Not ready. Missing:</p><ul class="ops-missing">' + r.missing.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>') +
        (w.readyOverride.active
          ? alertBox('info', 'Marked ready by override: "' + (w.readyOverride.reason || '') + '" (' + (w.readyOverride.by || '') + ', ' + when(w.readyOverride.at) + ')') + '<button class="btn btn-sm btn-ghost" id="clear-override">Clear override</button>'
          : (!r.computedReady ? '<div style="margin-top:10px"><button class="btn btn-sm btn-warning" id="set-override">Override with a reason…</button></div>' : '')) +
      '</div>' +

      '<div class="ops-grid-2">' +
        '<div class="ops-card"><h3 style="margin-top:0">Details</h3><div class="ops-form" id="details">' +
          field('Phone', 'phone', w.phone) + field('Date of birth', 'dateOfBirth', w.dateOfBirth, 'date') +
          field('Status', 'activeStatus', w.activeStatus, 'select', { options: ['ACTIVE', 'INACTIVE', 'LEFT'] }) +
          field('Internal rating (1–5)', 'internalRating', w.rating, 'select', { options: ['1', '2', '3', '4', '5'], blank: 'None' }) +
          field('Roles', 'roles', w.roles, 'list', { wide: true, hint: 'Comma separated, e.g. Waiting staff, Bar staff' }) +
          field('Qualifications', 'qualifications', w.qualifications, 'list', { wide: true, hint: 'Comma separated, e.g. Personal Licence, Food Hygiene L2' }) +
          field('Availability notes', 'availabilityNotes', w.availabilityNotes, 'textarea', { wide: true }) +
          field('Experience notes', 'experienceNotes', w.experienceNotes, 'textarea', { wide: true }) +
          field('Internal notes', 'internalNotes', w.internalNotes, 'textarea', { wide: true, hint: 'Never shown to clients.' }) +
          field('Emergency contact name', 'emergencyContactName', w.emergencyContactName) +
          field('Emergency contact phone', 'emergencyContactPhone', w.emergencyContactPhone) +
          '<div class="wide"><button class="btn btn-primary btn-sm" id="save-details">Save details</button></div></div>' +
          (w.availabilityWindows.length ? '<p class="text-muted fs-sm" style="margin-top:10px">Availability windows from the app: ' + w.availabilityWindows.map(function (x) { return day(x.from) + '–' + day(x.to); }).join(', ') + '</p>' : '') +
        '</div>' +

        '<div class="ops-card"><h3 style="margin-top:0">Payroll and pension</h3>' +
          '<div class="ops-aid">Tracking fields only. Payroll, tax and pension duties are carried out by the payroll and pension providers. Do not store NI numbers or bank details here.</div>' +
          '<div class="ops-form" id="payroll">' +
          field('Payroll status', 'payrollStatus', w.payrollStatus, 'select', { options: ['NOT_ADDED', 'PENDING', 'ACTIVE', 'LEAVER'] }) +
          field('Payroll provider reference', 'payrollExternalReference', w.payrollExternalReference, 'text', { hint: "The provider's employee ID, not an NI number." }) +
          field('Pension status', 'pensionStatus', w.pensionStatus, 'select', { options: PENSION }) +
          field('Last assessed', '_assessed', w.pensionLastAssessedAt ? when(w.pensionLastAssessedAt) : 'Never', 'text', { attrs: ' disabled' }) +
          field('Opt-out evidence', 'optOutEvidence', '', 'text', { wide: true, hint: "Only when recording OPTED_OUT: the worker's own opt-out as received by the pension provider." }) +
          field('Pension notes', 'pensionNotes', w.pensionNotes, 'textarea', { wide: true }) +
          '<div class="wide"><button class="btn btn-primary btn-sm" id="save-payroll">Save payroll and pension</button></div></div>' +
          (w.pensionAlerts.length ? '<div style="margin-top:10px">' + w.pensionAlerts.map(function (x) { return alertBox(x.level === 'warning' ? 'warning' : 'info', x.message); }).join('') + '</div>' : '') +
        '</div>' +
      '</div>' +

      '<div class="ops-card"><div class="ops-head"><h3 style="margin:0">Right to work ' + chip(words(w.rtw.status), CHIPS.rtw[w.rtw.status]) + '</h3>' +
        '<div class="ops-actions"><button class="btn btn-sm btn-primary" id="record-rtw">Record a check</button><button class="btn btn-sm ' + (w.rtw.blocked ? 'btn-ghost' : 'btn-danger-quiet') + '" id="block-rtw">' + (w.rtw.blocked ? 'Remove block' : 'Block') + '</button></div></div>' +
        '<p class="fs-sm">' + esc(w.rtw.label) + (w.rtw.followUpDue ? ' · follow-up due ' + day(w.rtw.followUpDue) : '') + '</p>' +
        (w.rtw.blocked ? alertBox('danger', 'Blocked: ' + (w.rtw.blockedReason || '')) : '') +
        (w.rtw.confirmationMissing ? alertBox('warning', 'The check that clears this worker was recorded without confirmation that the prescribed check was performed. Record the check again with confirmation.') : '') +
        table(['Date', 'Method', 'Result', 'Valid until', 'Follow-up', 'Performed by', 'Confirmed', 'Evidence reference', 'Notes'], w.rtw.checks.map(function (c) {
          return '<tr><td>' + day(c.checkedAt) + '</td><td>' + esc(words(c.method)) + (c.documentType ? '<div class="text-muted fs-sm">' + esc(c.documentType) + '</div>' : '') + '</td><td>' + chip(c.outcome, c.outcome === 'PASS' ? 'ok' : c.outcome === 'FAIL' ? 'bad' : 'warn') + '</td><td>' + (c.expiresAt ? day(c.expiresAt) : 'No expiry') + '</td><td>' + day(c.followUpDue) + '</td><td>' + esc(c.performedBy || c.checkedBy) + '</td><td>' +
            (c.prescribedCheckConfirmed === true ? chip('Yes', 'ok') : c.prescribedCheckConfirmed === false ? chip('No', 'bad') : chip('Not recorded', 'warn')) + '</td><td>' + esc(c.evidenceReference || '—') + (c.hasDocument ? ' ' + chip('copy held', 'muted') : '') + '</td><td>' + esc(c.notes || '') + '</td></tr>';
        }), 'No right-to-work check recorded.') +
      '</div>' +

      '<div class="ops-card"><div class="ops-head"><h3 style="margin:0">Documents ' + chip(PACK_WORDS[w.documentPack], PACK_CHIPS[w.documentPack]) + '</h3><div class="ops-actions">' +
        '<button class="btn btn-sm btn-primary" id="issue-pack">Issue current pack</button>' +
        '<button class="btn btn-sm btn-ghost" id="send-link">Send secure link</button>' +
        '<button class="btn btn-sm btn-ghost" id="revoke-links">Revoke links</button>' +
        '<button class="btn btn-sm btn-ghost" data-issue="KEY_INFORMATION_DOCUMENT">Issue KID only</button>' +
        '<button class="btn btn-sm btn-ghost" data-issue="RTW_CHECKLIST">RTW checklist</button>' +
        '<button class="btn btn-sm btn-ghost" data-issue="ONBOARDING_CHECKLIST">Onboarding checklist</button></div></div>' +
        '<div class="ops-aid">Order: the Key Information Document is issued first, then the employment agreement. The worker reads both through their secure link, confirms receipt of the KID, and agrees the agreement by typing their name. If they agreed some other way (e.g. replying to an email), record it with how and when.</div>' +
        '<div class="ops-grid-2" style="margin:10px 0"><div><strong>Key Information Document</strong><br>' + kidCell(w.kid) + '</div><div><strong>Employment agreement</strong><br>' + contractCell(w.contract) + '</div></div>' +
        table(['Document', 'Version', 'Status', 'Issued', 'Acknowledged / agreed', ''], w.documents.map(function (doc) {
          return '<tr><td>' + esc(DOC_LABELS[doc.type] || doc.type) + '</td><td>v' + doc.version + '</td><td>' + chip(words(doc.status), CHIPS.doc[doc.status]) + '</td><td>' + when(doc.issuedAt) + '<div class="text-muted fs-sm">' + esc(doc.issuedBy) + '</div></td><td>' +
            (doc.acknowledgedAt ? '<div>Receipt acknowledged ' + when(doc.acknowledgedAt) + '</div>' : '') +
            (doc.acceptedAt ? when(doc.acceptedAt) + '<div class="text-muted fs-sm">as "' + esc(doc.acceptedName) + '", ' + esc(doc.acceptanceMethod || '') + '</div>' : (doc.acknowledgedAt ? '' : '—')) + '</td><td class="ops-actions">' +
            '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="/ops/print/document/' + esc(doc.id) + '">Print</a>' +
            (doc.status === 'ISSUED' && ACCEPTABLE[doc.type] ? '<button class="btn btn-sm btn-success" data-accept="' + esc(doc.id) + '">Record acceptance</button>' : '') +
            (doc.status === 'ISSUED' || doc.status === 'ACCEPTED' ? '<button class="btn btn-sm btn-danger-quiet" data-withdraw="' + esc(doc.id) + '">Withdraw</button>' : '') + '</td></tr>';
        }), 'Nothing issued yet.') +
      '</div>' +

      '<div class="ops-card"><h3 style="margin-top:0">Recent shifts</h3>' + table(['Date', 'Time', 'Role', 'Client', 'Booking', 'Status'], w.assignments.map(function (a) {
        return '<tr' + (a.opsBooking ? ' class="clickable" data-href="#/booking/' + esc(a.opsBooking.id) + '"' : '') + '><td>' + day(a.eventDate) + '</td><td>' + esc(a.shiftStart + '–' + a.shiftEnd) + '</td><td>' + esc(a.role || '—') + '</td><td>' + esc(a.client.companyName) + '</td><td>' + esc(a.opsBooking ? a.opsBooking.reference : '—') + '</td><td>' + chip(ASSIGNMENT_WORDS[a.status] || a.status, CHIPS.assignment[a.status]) + '</td></tr>';
      }), 'No shifts yet.') + '</div>' +

      '<div class="ops-card"><h3 style="margin-top:0">History</h3>' + auditTable(w.audit) + '</div>';

    var reload = function () { return viewWorker(id); };
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });

    main.querySelector('#save-details').addEventListener('click', async function (e) {
      try {
        var data = readForm(main.querySelector('#details'));
        data.internalRating = data.internalRating ? Number(data.internalRating) : null;
        await AdminCore.withLoading(e.target, function () { return api('/workers/' + id, { method: 'PATCH', body: data }); });
        toast('Saved'); reload();
      } catch (err) { fail(err); }
    });
    main.querySelector('#save-payroll').addEventListener('click', async function (e) {
      try {
        var data = readForm(main.querySelector('#payroll'));
        delete data._assessed;
        await AdminCore.withLoading(e.target, function () { return api('/workers/' + id, { method: 'PATCH', body: data }); });
        toast('Saved'); reload();
      } catch (err) { fail(err); }
    });
    var setO = main.querySelector('#set-override');
    if (setO) setO.addEventListener('click', function () {
      openModal('Override Ready for Work', '<p class="fs-sm mb-2">The worker will show as ready even though these are missing:</p><ul class="ops-missing">' + r.missing.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><div class="ops-form" style="margin-top:12px">' +
        field('Reason', 'reason', '', 'textarea', { wide: true, required: true, hint: 'Recorded with your name in the audit log. Right-to-work problems still block every assignment.' }) + '</div>',
        [{ label: 'Override', kind: 'btn-warning', onClick: async function (b) {
          await api('/workers/' + id + '/ready-override', { method: 'POST', body: { active: true, reason: readForm(b).reason } });
          toast('Override recorded'); reload();
        } }]);
    });
    var clearO = main.querySelector('#clear-override');
    if (clearO) clearO.addEventListener('click', async function () {
      if (!(await confirmDialog('Clear the Ready override?', 'Clear'))) return;
      try { await api('/workers/' + id + '/ready-override', { method: 'POST', body: { active: false } }); reload(); } catch (err) { fail(err); }
    });
    main.querySelector('#record-rtw').addEventListener('click', function () { rtwCheckModal(w, reload); });
    main.querySelector('#block-rtw').addEventListener('click', function () {
      if (w.rtw.blocked) {
        confirmDialog('Remove the right-to-work block?', 'Remove block').then(function (ok) {
          if (ok) api('/workers/' + id + '/rtw-block', { method: 'POST', body: { blocked: false } }).then(reload, fail);
        });
        return;
      }
      openModal('Block right to work', '<div class="ops-form">' + field('Reason', 'reason', '', 'textarea', { wide: true, required: true }) + '</div>', [{
        label: 'Block', kind: 'btn-danger', onClick: async function (b) {
          await api('/workers/' + id + '/rtw-block', { method: 'POST', body: { blocked: true, reason: readForm(b).reason } }); reload();
        } }]);
    });
    main.querySelector('#issue-pack').addEventListener('click', function () { issuePackFor(id, w.name, reload); });
    main.querySelector('#send-link').addEventListener('click', function () {
      openModal('Send secure link: ' + w.name, '<p>A new personal link to ' + esc(w.name) + '\'s documents, valid for 30 days. Earlier links keep working until they expire unless you revoke them.</p>', [
        { label: 'Copy link', kind: 'btn-ghost', onClick: async function () { var l = await api('/workers/' + id + '/document-link', { method: 'POST', body: { email: false } }); setTimeout(function () { showLink('Secure link: ' + w.name, l); }, 0); } },
        { label: 'Email link', onClick: async function () { var l = await api('/workers/' + id + '/document-link', { method: 'POST', body: { email: true } }); setTimeout(function () { showLink('Secure link: ' + w.name, l); }, 0); } },
      ]);
    });
    main.querySelector('#revoke-links').addEventListener('click', async function () {
      if (!(await confirmDialog('Revoke every secure document link for ' + w.name + '? They will need a new link.', 'Revoke', true))) return;
      try { var r2 = await api('/workers/' + id + '/document-links/revoke', { method: 'POST' }); toast(r2.revoked + ' link(s) revoked'); } catch (err) { fail(err); }
    });
    on(main, 'button[data-issue]', 'click', async function (_e, el) {
      var type = el.dataset.issue;
      var label = el.textContent;
      if (!(await confirmDialog(label + ': issue the current version to ' + w.name + '? Any earlier live copy is marked superseded.', 'Issue'))) return;
      try {
        var doc = await api('/workers/' + id + '/documents', { method: 'POST', body: { type: type } });
        toast('Issued'); window.open('/ops/print/document/' + doc.id, '_blank', 'noopener'); reload();
      } catch (err) { fail(err); }
    });
    on(main, 'button[data-accept]', 'click', function (_e, el) {
      openModal('Record electronic acceptance',
        '<p class="fs-sm mb-2">Record the worker\'s acceptance as they gave it. This is a record of agreement, not a qualified electronic signature.</p><div class="ops-form">' +
        field('Name the worker typed', 'acceptedName', w.name, 'text', { required: true }) +
        field('Accepted at', 'acceptedAt', toLocalInput(new Date().toISOString()), 'datetime', { required: true }) +
        field('How', 'method', 'Typed name in reply to emailed agreement', 'text', { wide: true, required: true, hint: 'The Key Information Document must have been issued before this time.' }) + '</div>',
        [{ label: 'Record acceptance', kind: 'btn-success', onClick: async function (b) {
          await api('/documents/' + el.dataset.accept + '/accept', { method: 'POST', body: readForm(b) });
          toast('Acceptance recorded'); reload();
        } }]);
    });
    on(main, 'button[data-withdraw]', 'click', function (_e, el) {
      openModal('Withdraw document', '<div class="ops-form">' + field('Reason', 'reason', '', 'textarea', { wide: true, required: true }) + '</div>', [{
        label: 'Withdraw', kind: 'btn-danger', onClick: async function (b) {
          await api('/documents/' + el.dataset.withdraw + '/withdraw', { method: 'POST', body: readForm(b) }); reload();
        } }]);
    });
  }

  function rtwCheckModal(w, done) {
    openModal('Record right-to-work check: ' + w.name,
      '<div class="ops-aid">Holding or uploading a document is not a check. Only record a pass once the prescribed check has actually been carried out. Do not type a share code anywhere here.</div><div class="ops-form">' +
      field('Method', 'method', 'SHARE_CODE', 'select', { options: [['SHARE_CODE', 'Home Office online check'], ['DOCUMENT', 'Manual document check'], ['IDSP', 'IDSP (certified provider)']] }) +
      field('Date performed', 'performedOn', todayLondon(), 'date', { required: true }) +
      field('Performed by', 'performedBy', '', 'text', { required: true, hint: 'The person who carried out the check.' }) +
      field('Result', 'outcome', 'PASS', 'select', { options: [['PASS', 'Pass'], ['FAIL', 'Fail'], ['PENDING', 'Started, not complete']] }) +
      field('Document type', 'documentType', '', 'text', { hint: 'e.g. UK passport, eVisa profile' }) +
      field('Valid until', 'validUntil', '', 'date', { hint: 'Leave empty for permanent right to work.' }) +
      field('Follow-up check due', 'followUpDue', '', 'date', { hint: 'Required when there is a valid-until date.' }) +
      field('Evidence reference', 'evidenceReference', '', 'text', { hint: 'Where the evidence is kept, e.g. "Profile PDF, RTW folder". Not the share code.' }) +
      field('Notes', 'notes', '', 'textarea', { wide: true }) +
      field('I confirm the prescribed right-to-work check was carried out as recorded above.', 'prescribedCheckConfirmed', false, 'checkbox', { wide: true }) +
      '</div>',
      [{ label: 'Record check', onClick: async function (b) {
        await api('/workers/' + w.id + '/rtw-checks', { method: 'POST', body: compact(readForm(b)) });
        toast('Check recorded'); done();
      } }]);
  }

  // ── Right to work screen ────────────────────────────────────────────────

  async function viewRtw() {
    var workers = (await api('/workers')).filter(function (w) { return w.activeStatus !== 'LEFT'; });
    function group(title, list, kind) {
      return '<h3>' + esc(title) + ' <span class="chip chip-' + kind + '">' + list.length + '</span></h3><div class="as-table-wrap">' +
        table(['Worker', 'Status', 'Valid until', 'Follow-up due', 'Last check', 'By'], list.map(function (w) {
          return '<tr class="clickable" data-href="#/worker/' + esc(w.id) + '"><td>' + esc(w.name) + '</td><td>' + chip(words(w.rtw.status), CHIPS.rtw[w.rtw.status]) + '</td><td>' + (w.rtw.expiresAt ? day(w.rtw.expiresAt) : '—') + '</td><td>' + day(w.rtw.followUpDue) + '</td><td>' + day(w.rtw.checkedAt) + '</td><td>' + esc(w.rtw.checkedBy || '—') + '</td></tr>';
        }), 'None.') + '</div>';
    }
    var by = function (fn) { return workers.filter(fn); };
    main.innerHTML = '<h2>Right to work</h2><div class="ops-lede">From the recorded checks. A check counts only once an admin confirms the prescribed check was performed. Inactive workers are included; leavers are not.</div>' +
      group('Expired', by(function (w) { return w.rtw.expiryBucket === 'expired'; }), 'bad') +
      group('Expires within 30 days', by(function (w) { return w.rtw.expiryBucket === 'within_30'; }), 'warn') +
      group('Expires within 60 days', by(function (w) { return w.rtw.expiryBucket === 'within_60'; }), 'warn') +
      group('Follow-up due', by(function (w) { return w.rtw.status === 'follow_up_required'; }), 'warn') +
      group('No check recorded', by(function (w) { return w.rtw.status === 'not_checked'; }), 'muted') +
      group('Blocked', by(function (w) { return w.rtw.status === 'blocked'; }), 'bad') +
      group('Cleared without recorded confirmation', by(function (w) { return w.rtw.confirmationMissing; }), 'warn');
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
  }

  // ── Clients ─────────────────────────────────────────────────────────────

  var CLIENT_TYPES = ['BUSINESS_HIRER', 'PRIVATE_CONSUMER', 'AGENCY', 'VENUE', 'CATERER', 'PRODUCTION', 'OTHER'];

  function clientFields(c) {
    c = c || {};
    return field('Legal / business name', 'companyName', c.companyName, 'text', { required: true }) +
      field('Trading name', 'tradingName', c.tradingName) +
      field('Client type', 'clientType', c.clientType || 'BUSINESS_HIRER', 'select', { options: CLIENT_TYPES }) +
      field('Contact name', 'contactName', c.contactName, 'text', { required: true }) +
      field('Email', 'email', c.email, 'email', { required: true }) +
      field('Phone', 'phone', c.phone) +
      field('Nature of business', 'industry', c.industry) +
      field('Payment terms', 'paymentTerms', c.paymentTerms) +
      field('Billing address', 'billingAddress', c.billingAddress, 'textarea', { wide: true }) +
      field('Venue addresses', 'venueAddresses', c.venueAddresses || [], 'list', { wide: true, hint: 'Comma separated' }) +
      field('Notes', 'adminNotes', c.adminNotes, 'textarea', { wide: true });
  }

  async function viewClients(query) {
    var data = await api('/clients' + (query.search || query.type ? '?' + new URLSearchParams(query) : ''));
    main.innerHTML = '<div class="ops-head"><div><h2>Clients and hirers</h2><div class="ops-lede">Current business Terms of Business: ' + esc(data.currentTermsVersion || 'none yet') + '. Private consumers need separate consumer booking terms.</div></div><button class="btn btn-primary" id="new-client">Add client</button></div>' +
      '<form class="as-filters" id="filters"><div class="as-filter-group"><label>Search</label><input type="search" name="search" value="' + esc(query.search || '') + '"></div>' +
      '<div class="as-filter-group"><label>Type</label><select name="type">' + options(CLIENT_TYPES, query.type, 'Any') + '</select></div></form>' +
      '<div class="as-table-wrap">' + table(['Client', 'Type', 'Contact', 'Terms', '>Bookings'], data.clients.map(function (c) {
        var terms = c.clientType === 'PRIVATE_CONSUMER'
          ? (c.termsAcceptedAt ? chip('Consumer terms recorded', 'ok') : chip('Consumer booking terms required', 'warn'))
          : termsChip(c.terms);
        return '<tr class="clickable" data-href="#/client/' + esc(c.id) + '"><td><strong>' + esc(c.companyName) + '</strong>' + (c.tradingName ? '<div class="text-muted fs-sm">t/a ' + esc(c.tradingName) + '</div>' : '') + '</td><td>' + esc(words(c.clientType)) + '</td><td>' + esc(c.contactName) + '<div class="text-muted fs-sm">' + esc(c.email) + '</div></td><td>' + terms + '</td><td class="num">' + c._count.opsBookings + '</td></tr>';
      }), 'No clients.') + '</div>';
    var form = main.querySelector('#filters');
    form.addEventListener('change', function () { setQuery('clients', Object.fromEntries(new FormData(form))); });
    form.addEventListener('submit', function (e) { e.preventDefault(); setQuery('clients', Object.fromEntries(new FormData(form))); });
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
    main.querySelector('#new-client').addEventListener('click', function () {
      openModal('Add client', '<div class="ops-form">' + clientFields() + '</div>', [{ label: 'Add client', onClick: async function (b) {
        var c = await api('/clients', { method: 'POST', body: compact(readForm(b)) });
        toast('Client added'); location.hash = '#/client/' + c.id;
      } }]);
    });
  }

  async function viewClient(id) {
    var both = await Promise.all([api('/clients/' + encodeURIComponent(id)), api('/clients/' + encodeURIComponent(id) + '/terms')]);
    var c = both[0], t = both[1];
    var consumer = c.clientType === 'PRIVATE_CONSUMER';
    main.innerHTML = '<a href="#/clients" class="text-muted fs-sm">← Clients</a><h2>' + esc(c.companyName) + '</h2><div class="ops-lede">' + esc(words(c.clientType)) + '</div>' +
      (consumer ? alertBox('warning', 'Private consumer: the B2B Terms of Business must not be used. Bookings for this client are flagged as needing separate consumer booking terms.') : '') +
      '<div class="ops-grid-2"><div class="ops-card"><h3 style="margin-top:0">Details</h3><div class="ops-form" id="client-form">' + clientFields(c) +
      '<div class="wide"><button class="btn btn-primary btn-sm" id="save-client">Save</button></div></div></div>' +
      (consumer
        ? '<div class="ops-card"><h3 style="margin-top:0">Consumer booking terms</h3>' +
          '<p class="fs-sm">Private consumer: the business Terms of Business are never issued here. Record the separate consumer booking terms this client agreed.</p>' +
          '<div class="detail-grid"><div class="detail-row"><span class="detail-label">Terms</span><span class="detail-value">' + esc(c.termsVersion || '—') + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">Sent</span><span class="detail-value">' + day(c.termsSentAt) + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">Accepted</span><span class="detail-value">' + day(c.termsAcceptedAt) + (c.termsAcceptedBy ? ' by ' + esc(c.termsAcceptedBy) : '') + '</span></div></div>' +
          '<h3>Record consumer terms</h3><div class="ops-form" id="terms-form">' +
            field('Action', 'action', 'sent', 'select', { options: [['sent', 'Sent'], ['accepted', 'Accepted']] }) +
            field('Consumer terms name or reference', 'version', '', 'text', { required: true, hint: 'e.g. "Private event booking terms, Oct 2026"' }) +
            field('Date', 'date', todayLondon(), 'date', { required: true }) +
            field('Accepted by (name)', 'acceptedBy', '') +
            field('These are the separate consumer booking terms, not the B2B Terms of Business', 'consumerTerms', false, 'checkbox', { wide: true }) +
            '<div class="wide"><button class="btn btn-primary btn-sm" id="save-terms">Record</button></div></div>'
        : '<div class="ops-card"><div class="ops-head"><h3 style="margin:0">Terms of Business</h3><div class="ops-actions">' +
            '<button class="btn btn-sm btn-primary" id="issue-terms">Issue current Terms</button>' +
            '<button class="btn btn-sm btn-ghost" id="terms-link">Send secure link</button>' +
            '<button class="btn btn-sm btn-ghost" id="terms-revoke">Revoke links</button></div></div>' +
          '<p>' + termsChip(t.position) + ' <span class="text-muted fs-sm">Current version: ' + (t.currentVersion ? 'v' + t.currentVersion : 'none') + '</span></p>' +
          (t.gate.ok ? '' : alertBox('warning', t.gate.message + ' Drafts and quotes can go ahead; supplying staff needs a written reason until the Terms are accepted.')) +
          table(['Version', 'Status', 'Issued', 'Accepted', ''], t.documents.map(function (doc) {
            return '<tr><td>v' + doc.version + '</td><td>' + chip(words(doc.status), CHIPS.doc[doc.status]) + '</td><td>' + when(doc.issuedAt) + '<div class="text-muted fs-sm">' + esc(doc.issuedBy) + '</div></td><td>' +
              (doc.acceptedAt ? when(doc.acceptedAt) + '<div class="text-muted fs-sm">' + esc(doc.legalBusinessName || '') + ': ' + esc(doc.acceptedByName || '') + (doc.acceptedByJobTitle ? ' (' + esc(doc.acceptedByJobTitle) + ')' : '') + ', typed "' + esc(doc.typedName || '') + '", ' + esc(doc.acceptanceMethod || '') + '</div>' : '—') + '</td>' +
              '<td class="ops-actions"><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="/ops/print/client-terms/' + esc(doc.id) + '">Print</a>' +
              (doc.status === 'ISSUED' ? '<button class="btn btn-sm btn-success" data-terms-accept="' + esc(doc.id) + '">Record acceptance</button>' : '') +
              (doc.status === 'ISSUED' || doc.status === 'ACCEPTED' ? '<button class="btn btn-sm btn-danger-quiet" data-terms-withdraw="' + esc(doc.id) + '">Withdraw</button>' : '') + '</td></tr>';
          }), 'Terms of Business not issued to this client yet.')) +
      '</div></div>' +
      '<div class="ops-card"><h3 style="margin-top:0">Bookings</h3>' + table(['Reference', 'Date', 'Event', 'Venue', 'Status'], c.bookings.map(function (b) {
        return '<tr class="clickable" data-href="#/booking/' + esc(b.id) + '"><td>' + esc(b.reference) + '</td><td>' + day(b.eventDate) + '</td><td>' + esc(b.eventType || '—') + '</td><td>' + esc(b.venue || '—') + '</td><td>' + chip(words(b.status), CHIPS.booking[b.status]) + '</td></tr>';
      }), 'No Ops bookings.') + '</div>' +
      '<div class="ops-card"><h3 style="margin-top:0">History</h3>' + auditTable(c.audit) + '</div>';
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
    main.querySelector('#save-client').addEventListener('click', async function () {
      try { await api('/clients/' + id, { method: 'PATCH', body: readForm(main.querySelector('#client-form')) }); toast('Saved'); viewClient(id); } catch (err) { fail(err); }
    });
    var reloadClient = function () { viewClient(id); };
    var saveTerms = main.querySelector('#save-terms');
    if (saveTerms) saveTerms.addEventListener('click', async function () {
      try { await api('/clients/' + id + '/terms', { method: 'POST', body: compact(readForm(main.querySelector('#terms-form'))) }); toast('Recorded'); reloadClient(); } catch (err) { fail(err); }
    });
    var issueTerms = main.querySelector('#issue-terms');
    if (issueTerms) issueTerms.addEventListener('click', function () { issueTermsFor(id, c.companyName, reloadClient); });
    var termsLink = main.querySelector('#terms-link');
    if (termsLink) termsLink.addEventListener('click', function () {
      openModal('Send secure link: ' + c.companyName, '<p>A new link to this client\'s Terms of Business, valid for 30 days.</p>', [
        { label: 'Copy link', kind: 'btn-ghost', onClick: async function () { var l = await api('/clients/' + id + '/terms-link', { method: 'POST', body: { email: false } }); setTimeout(function () { showLink('Secure link: ' + c.companyName, l); }, 0); } },
        { label: 'Email link', onClick: async function () { var l = await api('/clients/' + id + '/terms-link', { method: 'POST', body: { email: true } }); setTimeout(function () { showLink('Secure link: ' + c.companyName, l); }, 0); } },
      ]);
    });
    var termsRevoke = main.querySelector('#terms-revoke');
    if (termsRevoke) termsRevoke.addEventListener('click', async function () {
      if (!(await confirmDialog('Revoke every secure Terms link for ' + c.companyName + '?', 'Revoke', true))) return;
      try { var r2 = await api('/clients/' + id + '/terms-links/revoke', { method: 'POST' }); toast(r2.revoked + ' link(s) revoked'); } catch (err) { fail(err); }
    });
    on(main, '[data-terms-accept]', 'click', function (_e, el) {
      openModal('Record Terms acceptance received in writing',
        '<p class="fs-sm mb-2">Only for an acceptance the client actually gave outside their link, e.g. a signed copy emailed back. Never record one on the client\'s behalf.</p><div class="ops-form">' +
        field('Legal business name', 'legalBusinessName', c.companyName, 'text', { required: true }) +
        field('Person accepting', 'acceptedByName', c.contactName, 'text', { required: true }) +
        field('Job title', 'jobTitle', '') +
        field('Name they typed or signed', 'typedName', '', 'text', { required: true }) +
        field('Accepted at', 'acceptedAt', toLocalInput(new Date().toISOString()), 'datetime', { required: true }) +
        field('How', 'method', 'Signed copy returned by email', 'text', { wide: true, required: true }) +
        field('They confirmed they are authorised to accept for the hirer', 'authorityConfirmed', false, 'checkbox', { wide: true }) + '</div>',
        [{ label: 'Record acceptance', kind: 'btn-success', onClick: async function (b2) {
          var f = readForm(b2);
          if (!f.authorityConfirmed) throw new Error('Confirm the client confirmed their authority.');
          await api('/client-terms/' + el.dataset.termsAccept + '/accept', { method: 'POST', body: compact(f) });
          toast('Acceptance recorded'); reloadClient();
        } }]);
    });
    on(main, '[data-terms-withdraw]', 'click', function (_e, el) {
      openModal('Withdraw Terms', '<div class="ops-form">' + field('Reason', 'reason', '', 'textarea', { wide: true, required: true }) + '</div>', [{
        label: 'Withdraw', kind: 'btn-danger', onClick: async function (b2) {
          await api('/client-terms/' + el.dataset.termsWithdraw + '/withdraw', { method: 'POST', body: readForm(b2) }); reloadClient();
        } }]);
    });
  }

  // ── Bookings ────────────────────────────────────────────────────────────

  var BOOKING_STATUSES = ['DRAFT', 'QUOTED', 'CONFIRMED', 'STAFFING', 'FULLY_STAFFED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INVOICED', 'PAID'];

  function bookingFields(b) {
    b = b || {};
    return field('Booking type', 'bookingType', b.bookingType, 'text', { hint: 'e.g. Staffing only, Managed' }) +
      field('Event type', 'eventType', b.eventType) +
      field('Venue', 'venue', b.venue) +
      field('Date', 'eventDate', b.eventDate, 'date', { required: true }) +
      field('Start', 'startTime', b.startTime, 'time', { required: true }) +
      field('Expected finish', 'expectedFinish', b.expectedFinish, 'time', { required: true, hint: 'A finish before the start is the next morning.' }) +
      field('Actual finish', 'actualFinish', b.actualFinish, 'time') +
      field('Guests', 'guestNumbers', b.guestNumbers, 'number') +
      field('On-site contact', 'onSiteContactName', b.onSiteContactName) +
      field('On-site contact phone', 'onSiteContactPhone', b.onSiteContactPhone) +
      field('VERGO lead', 'vergoLead', b.vergoLead) +
      field('Address', 'address', b.address, 'textarea', { wide: true }) +
      field('Payment in advance required', 'advancePaymentRequired', b.advancePaymentRequired, 'checkbox', { hint: 'Defaults on for a client\'s first booking when Settings say so.' }) +
      field('Payment terms (days)', 'paymentTermsDays', b.paymentTermsDays, 'number', { hint: 'Empty uses the Terms of Business default.' }) +
      field('Notes', 'notes', b.notes, 'textarea', { wide: true });
  }

  async function viewBookings(query) {
    var params = new URLSearchParams(query).toString();
    var [bookings, clientData] = await Promise.all([api('/bookings' + (params ? '?' + params : '')), api('/clients')]);
    var clients = clientData.clients;
    main.innerHTML = '<div class="ops-head"><div><h2>Bookings</h2><div class="ops-lede">Revenue and margin are estimates until timesheets are approved and actual payroll is entered.</div></div>' +
      '<div class="ops-actions"><a class="btn btn-ghost btn-sm" href="' + API + '/exports/bookings.csv">Export</a><a class="btn btn-ghost btn-sm" href="' + API + '/exports/profitability.csv">Export profitability</a><button class="btn btn-primary" id="new-booking">New booking</button></div></div>' +
      '<form class="as-filters" id="filters">' +
        '<div class="as-filter-group"><label>Search</label><input type="search" name="search" value="' + esc(query.search || '') + '" placeholder="Reference, venue, client"></div>' +
        '<div class="as-filter-group"><label>From</label><input type="date" name="from" value="' + esc(query.from || '') + '"></div>' +
        '<div class="as-filter-group"><label>To</label><input type="date" name="to" value="' + esc(query.to || '') + '"></div>' +
        '<div class="as-filter-group"><label>Client</label><select name="clientId">' + options(clients.map(function (c) { return [c.id, c.companyName]; }), query.clientId, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Venue</label><input type="text" name="venue" value="' + esc(query.venue || '') + '"></div>' +
        '<div class="as-filter-group"><label>Event type</label><input type="text" name="eventType" value="' + esc(query.eventType || '') + '"></div>' +
        '<div class="as-filter-group"><label>Status</label><select name="status">' + options(BOOKING_STATUSES, query.status, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Staffing</label><select name="staffed">' + options([['full', 'Fully staffed'], ['not_full', 'Not fully staffed']], query.staffed, 'Any') + '</select></div>' +
        '<div class="as-filter-group"><label>Min margin %</label><input type="text" name="minMargin" value="' + esc(query.minMargin ? Math.round(query.minMargin * 100) : '') + '"></div>' +
        '<div class="as-filter-actions"><button class="btn btn-ghost btn-sm" type="button" id="clear">Clear</button></div>' +
      '</form>' +
      '<div class="as-table-wrap">' + table(['Reference', 'Date', 'Client', 'Event', 'Venue', 'Status', 'Staffed', '>Revenue', '>Margin'], bookings.map(function (b) {
        return '<tr class="clickable" data-href="#/booking/' + esc(b.id) + '"><td><strong>' + esc(b.reference) + '</strong>' + (b.consumerTermsRequired ? '<div>' + chip('Consumer terms', 'warn') + '</div>' : '') + '</td><td>' + day(b.eventDate) + '<div class="text-muted fs-sm">' + esc(b.startTime + '–' + b.expectedFinish) + '</div></td><td>' + esc(b.client.companyName) + '</td><td>' + esc(b.eventType || '—') + '</td><td>' + esc(b.venue || '—') + '</td><td>' + chip(words(b.status), CHIPS.booking[b.status]) + '</td><td>' +
          chip(b.staffing.confirmed + '/' + b.staffing.required, b.staffing.fullyStaffed ? 'ok' : b.staffing.required ? 'warn' : 'muted') + '</td><td class="num">' + gbp(b.profit.revenuePence) + '</td><td class="num">' + pct(b.profit.grossMargin) + (b.profit.isEstimate ? '<div class="text-muted fs-sm">est.</div>' : '') + '</td></tr>';
      }), 'No bookings match.') + '</div>';

    var form = main.querySelector('#filters');
    var apply = function () {
      var q = Object.fromEntries(new FormData(form));
      if (q.minMargin) q.minMargin = String(Number(q.minMargin) / 100);
      setQuery('bookings', q);
    };
    form.addEventListener('change', apply);
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    main.querySelector('#clear').addEventListener('click', function () { location.hash = '#/bookings'; });
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
    main.querySelector('#new-booking').addEventListener('click', function () {
      var body = openModal('New booking', '<div class="ops-form">' +
        field('Client', 'clientId', '', 'select', { options: clients.map(function (c) { return [c.id, c.companyName + (c.clientType === 'PRIVATE_CONSUMER' ? ' (private consumer)' : '')]; }), blank: 'Choose…', required: true, wide: true }) +
        '<div class="wide" id="consumer-note"></div>' +
        field('Status', 'status', 'DRAFT', 'select', { options: ['DRAFT', 'QUOTED', 'CONFIRMED'] }) + bookingFields() + '</div>',
        [{ label: 'Create booking', onClick: async function (b) {
          var created = await api('/bookings', { method: 'POST', body: compact(readForm(b)) });
          toast('Booking ' + created.reference + ' created'); location.hash = '#/booking/' + created.id;
        } }]);
      body.querySelector('[name=clientId]').addEventListener('change', function (e) {
        var c = clients.find(function (x) { return x.id === e.target.value; });
        body.querySelector('#consumer-note').innerHTML = c && c.clientType === 'PRIVATE_CONSUMER'
          ? alertBox('warning', 'Private consumer: this booking will be flagged as needing separate consumer booking terms. The B2B Terms of Business do not apply.') : '';
      });
    });
  }

  function requirementFields(r) {
    r = r || {};
    return field('Role', 'role', r.role, 'text', { required: true }) +
      field('Quantity', 'quantity', r.quantity || 1, 'number', { required: true }) +
      field('Client charge rate (£/h)', 'clientChargeRate', r.clientChargeRate, 'number', { required: true }) +
      field('Worker pay rate (£/h)', 'workerPayRate', r.workerPayRate, 'number', { required: true }) +
      field('Minimum hours', 'minimumHours', r.minimumHours, 'number', { hint: 'Empty uses the standard minimum.' }) +
      field('After-midnight multiplier', 'afterMidnightMultiplier', r.afterMidnightMultiplier, 'number', { hint: 'e.g. 1.25' }) +
      field('Overtime charge rate (£/h)', 'overtimeChargeRate', r.overtimeChargeRate, 'number') +
      field('Overtime after (hours per shift)', 'overtimeAfterHours', r.overtimeAfterHours, 'number') +
      field('Specialist rate / other agreed charges', 'otherCharges', r.otherCharges, 'text', { wide: true, hint: 'Shown on the Booking Confirmation.' }) +
      field('Travel contribution (£ per worker)', 'travelContribution', r.travelContribution, 'number') +
      field('Expenses (£ per worker)', 'expenses', r.expenses, 'number') +
      field('Unpaid break (minutes)', 'breakMins', r.breakMins || 0, 'number') +
      field('Break information', 'breakInfo', r.breakInfo) +
      field('Required experience', 'requiredExperience', r.requiredExperience, 'text', { wide: true }) +
      field('Required qualifications', 'requiredQualifications', r.requiredQualifications || [], 'list', { wide: true, hint: 'Comma separated' }) +
      field('Dress code', 'dressCode', r.dressCode, 'textarea') +
      field('Equipment', 'equipment', r.equipment, 'textarea') +
      field('Duties', 'duties', r.duties, 'textarea', { wide: true }) +
      field('Health and safety risks', 'healthSafetyRisks', r.healthSafetyRisks, 'textarea', { wide: true }) +
      field('Risk control measures', 'riskControls', r.riskControls, 'textarea', { wide: true });
  }

  function profitPanel(b) {
    var p = b.profit;
    var basis = function (k) { return p.basis[k] === 'actual' ? chip('actual', 'ok') : '<span class="ops-estimate">Estimate</span>'; };
    var line = function (label, pence, tag) { return '<tr><td>' + esc(label) + (tag || '') + '</td><td class="num">' + gbp(pence) + '</td></tr>'; };
    return '<div class="ops-card"><h3 style="margin-top:0">Profit ' + (p.isEstimate ? '<span class="ops-estimate">Estimate</span>' : chip('Actual figures', 'ok')) + '</h3>' +
      '<p class="text-muted fs-sm mb-2">' + p.countedAssignments + ' shift(s), ' + p.billableHours + ' billable hours. Not payroll: it does not work out anyone\'s tax.</p>' +
      '<table class="ops-table ops-money">' +
        line('Hours × charge rate', p.revenue.hoursPence) + line('After-midnight uplift', p.revenue.afterMidnightPence) + line('Agreed additional charges', p.revenue.chargesPence) +
        '<tr class="total"><td>Revenue</td><td class="num">' + gbp(p.revenuePence) + '</td></tr>' +
        line('Worker wages', p.workerWagesPence, ' ' + basis('wages')) + line('Holiday pay', p.holidayPayPence, ' ' + basis('holidayPay')) +
        line('Employer costs (NI, pension)', p.employerCostsPence, ' ' + basis('employerCosts')) +
        line('Travel and expenses', p.workerTravelExpensesPence) + line('Other worker costs', p.otherWorkerCostsPence) +
        line('Other direct costs', p.otherDirectCostsPence) +
        '<tr class="total"><td>Gross contribution</td><td class="num">' + gbp(p.grossContributionPence) + '</td></tr>' +
        '<tr><td>Gross margin</td><td class="num">' + pct(p.grossMargin) + '</td></tr>' +
      '</table>' +
      '<h3>Actual payroll figures</h3><p class="text-muted fs-sm mb-2">Once payroll has run, enter the actual totals for this booking. Each one replaces its estimate. Leave a box empty to keep the estimate.' +
        (b.actualPayroll.recordedAt ? ' Last entered by ' + esc(b.actualPayroll.recordedBy) + ', ' + when(b.actualPayroll.recordedAt) + '.' : '') + '</p>' +
      '<div class="ops-form" id="actuals">' +
        field('Wages (£)', 'wages', b.actualPayroll.wagesPence != null ? b.actualPayroll.wagesPence / 100 : null, 'number') +
        field('Holiday pay (£)', 'holiday', b.actualPayroll.holidayPayPence != null ? b.actualPayroll.holidayPayPence / 100 : null, 'number') +
        field('Employer costs (£)', 'employer', b.actualPayroll.employerCostsPence != null ? b.actualPayroll.employerCostsPence / 100 : null, 'number') +
        field('Note (source)', 'note', b.actualPayroll.note, 'text', { wide: true, required: true, hint: 'e.g. "Pay run 14 Oct, payroll report"' }) +
        '<div class="wide"><button class="btn btn-sm btn-primary" id="save-actuals">Save actual figures</button></div></div></div>';
  }

  async function viewBooking(id) {
    var b = await api('/bookings/' + encodeURIComponent(id));
    var reqById = {};
    b.requirements.forEach(function (r) { reqById[r.id] = r; });
    var live = function (a) { return a.status === 'PENDING' || a.status === 'CONFIRMED'; };

    main.innerHTML = '<a href="#/bookings" class="text-muted fs-sm">← Bookings</a>' +
      '<div class="ops-head"><div><h2>' + esc(b.reference) + ' ' + chip(words(b.status), CHIPS.booking[b.status]) + '</h2><div class="ops-lede"><a class="detail-link" href="#/client/' + esc(b.client.id) + '">' + esc(b.client.companyName) + '</a> · ' + day(b.eventDate) + ' ' + esc(b.startTime + '–' + b.expectedFinish) + (b.venue ? ' · ' + esc(b.venue) : '') + '</div></div>' +
      '<div class="ops-actions"><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="/ops/print/booking/' + esc(b.id) + '">Booking confirmation</a><select id="status-select" class="as-input" style="width:auto">' + options(BOOKING_STATUSES.filter(function (s) { return s !== 'INVOICED' && s !== 'PAID'; }).concat(b.status === 'INVOICED' || b.status === 'PAID' ? [b.status] : []), b.status) + '</select><button class="btn btn-sm btn-primary" id="save-status">Set status</button></div></div>' +
      b.warnings.map(function (w) { return alertBox('warning', w); }).join('') +

      '<div class="ops-card"><div class="ops-head"><h3 style="margin:0">Requirements and assignments</h3><button class="btn btn-sm btn-primary" id="add-req">Add requirement</button></div>' +
      (b.requirements.length ? b.requirements.map(function (r) {
        var assigned = b.assignments.filter(function (a) { return a.requirementId === r.id; });
        var filled = assigned.filter(function (a) { return a.status !== 'REJECTED' && a.status !== 'CANCELLED' && a.status !== 'REPLACED' && a.status !== 'NO_SHOW'; }).length;
        return '<div style="border-top:1px solid var(--as-border);padding-top:12px;margin-top:12px">' +
          '<div class="ops-head"><div><strong>' + esc(r.role) + '</strong> × ' + r.quantity + ' ' + chip(filled + '/' + r.quantity + ' filled', filled >= r.quantity ? 'ok' : 'warn') +
          '<div class="text-muted fs-sm">Charge ' + rate(r.clientChargeRate) + ' · pay ' + rate(r.workerPayRate) + ' · min ' + (r.minimumHours != null ? r.minimumHours + 'h' : 'standard') + ' · after midnight ×' + (r.afterMidnightMultiplier || '—') + (r.requiredQualifications.length ? ' · needs ' + esc(r.requiredQualifications.join(', ')) : '') + '</div></div>' +
          '<div class="ops-actions"><button class="btn btn-sm btn-primary" data-assign="' + esc(r.id) + '">Assign worker</button><button class="btn btn-sm btn-ghost" data-edit-req="' + esc(r.id) + '">Edit</button>' + (assigned.length ? '' : '<button class="btn btn-sm btn-danger-quiet" data-del-req="' + esc(r.id) + '">Remove</button>') + '</div></div>' +
          table(['Worker', 'Time', 'Status', '>Pay', '>Charge', 'Timesheet', ''], assigned.map(function (a) {
            var ts = a.timesheet.disputedAt ? chip('Disputed', 'bad') : a.timesheet.adminApprovedAt ? chip('Approved', 'ok') : a.actualFinish ? chip('Checked out', 'warn') : a.actualStart ? chip('Checked in', 'info') : '—';
            return '<tr><td><a class="detail-link" href="#/worker/' + esc(a.worker.id) + '">' + esc(a.worker.name) + '</a>' + (a.warningOverrideReason ? '<div class="text-muted fs-sm">Override: ' + esc(a.warningOverrideReason) + '</div>' : '') + '</td><td>' + esc(a.plannedStart + '–' + a.plannedFinish) + '</td><td>' + chip(ASSIGNMENT_WORDS[a.status] || a.status, CHIPS.assignment[a.status]) + '</td><td class="num">' + rate(a.payRate) + '</td><td class="num">' + rate(a.clientChargeRate) + '</td><td>' + ts + '</td><td class="ops-actions">' +
              (a.status === 'PENDING' ? '<button class="btn btn-sm btn-success" data-a-status="CONFIRMED" data-a="' + esc(a.id) + '">Accepted</button><button class="btn btn-sm btn-ghost" data-a-status="REJECTED" data-a="' + esc(a.id) + '">Declined</button>' : '') +
              (a.status === 'CONFIRMED' ? '<button class="btn btn-sm btn-ghost" data-a-status="NO_SHOW" data-a="' + esc(a.id) + '">No-show</button>' : '') +
              (live(a) ? '<button class="btn btn-sm btn-ghost" data-replace="' + esc(a.id) + '">Replace</button><button class="btn btn-sm btn-ghost" data-confirmation="' + esc(a.id) + '">Confirmation doc</button><button class="btn btn-sm btn-danger-quiet" data-a-status="CANCELLED" data-a="' + esc(a.id) + '">Cancel</button>' : '') +
              '</td></tr>';
          }), 'Nobody assigned yet.') + '</div>';
      }).join('') : '<div class="ops-empty">Add a requirement (role, quantity and rates) before assigning workers.</div>') +
      '</div>' +
      '<div class="ops-card" id="running-order"><div class="as-skeleton" style="max-width:200px"></div></div>' +

      '<div class="ops-grid-2">' + profitPanel(b) +
        '<div><div class="ops-card"><div class="ops-head"><h3 style="margin:0">Costs and charges</h3><button class="btn btn-sm btn-primary" id="add-cost">Add</button></div>' +
          table(['Type', 'Category', 'Description', '>Amount', ''], b.costs.map(function (c) {
            return '<tr><td>' + (c.kind === 'CHARGE' ? chip('Charge', 'ok') : chip('Cost', 'warn')) + '</td><td>' + esc(words(c.category)) + '</td><td>' + esc(c.description) + '</td><td class="num">' + gbp(c.amountPence) + '</td><td><button class="btn btn-sm btn-danger-quiet" data-del-cost="' + esc(c.id) + '">Remove</button></td></tr>';
          }), 'No extra costs or charges.') + '</div>' +
          '<div class="ops-card"><h3 style="margin-top:0">Invoice</h3>' +
            (b.invoicedAt ? '<p>Invoiced ' + when(b.invoicedAt) + ' (' + esc(b.invoiceRef) + ').' + (b.paidAt ? ' Paid ' + when(b.paidAt) + '.' : '') + '</p>' + (b.paidAt ? '' : '<button class="btn btn-sm btn-success" id="mark-paid">Mark paid</button>')
              : '<div class="ops-form" id="invoice-form">' + field('Invoice reference', 'invoiceRef', '', 'text', { required: true }) + '<div><label>&nbsp;</label><button class="btn btn-sm btn-primary" id="mark-invoiced">Mark invoiced</button></div></div><p class="text-muted fs-sm" style="margin-top:8px">All assignments must be completed (timesheets approved) first.</p>') +
          '</div></div>' +
      '</div>' +

      '<div class="ops-card"><h3 style="margin-top:0">Booking details</h3><div class="ops-form" id="booking-form">' + bookingFields(b) + '<div class="wide"><button class="btn btn-sm btn-primary" id="save-booking">Save details</button></div></div></div>' +
      '<div class="ops-card"><h3 style="margin-top:0">History</h3>' + auditTable(b.audit) + '</div>';

    var reload = function () { return viewBooking(id); };
    loadRunningOrder(id, b.reference);

    main.querySelector('#save-status').addEventListener('click', async function () {
      var status = main.querySelector('#status-select').value;
      if (status === b.status) return;
      if (status === 'CANCELLED' && !(await confirmDialog('Cancel this booking? Its offered and accepted assignments are cancelled too.', 'Cancel booking', true))) return;
      try { await api('/bookings/' + id, { method: 'PATCH', body: { status: status } }); toast('Status updated'); reload(); } catch (err) { fail(err); }
    });
    main.querySelector('#save-booking').addEventListener('click', async function () {
      try { await api('/bookings/' + id, { method: 'PATCH', body: readForm(main.querySelector('#booking-form')) }); toast('Saved'); reload(); } catch (err) { fail(err); }
    });
    main.querySelector('#add-req').addEventListener('click', function () {
      openModal('Add requirement', '<div class="ops-form">' + requirementFields() + '</div>', [{ label: 'Add', onClick: async function (body) {
        await api('/bookings/' + id + '/requirements', { method: 'POST', body: compact(readForm(body)) }); reload();
      } }]);
    });
    on(main, '[data-edit-req]', 'click', function (_e, el) {
      openModal('Edit requirement', '<p class="text-muted fs-sm mb-2">Rate changes apply to new assignments. Existing assignments keep their own rates (change them on the assignment).</p><div class="ops-form">' + requirementFields(reqById[el.dataset.editReq]) + '</div>', [{ label: 'Save', onClick: async function (body) {
        await api('/requirements/' + el.dataset.editReq, { method: 'PATCH', body: readForm(body) }); reload();
      } }]);
    });
    on(main, '[data-del-req]', 'click', async function (_e, el) {
      if (!(await confirmDialog('Remove this requirement?', 'Remove', true))) return;
      try { await api('/requirements/' + el.dataset.delReq, { method: 'DELETE' }); reload(); } catch (err) { fail(err); }
    });
    on(main, '[data-assign]', 'click', function (_e, el) { assignModal(b, reqById[el.dataset.assign], reload); });
    on(main, '[data-a-status]', 'click', async function (_e, el) {
      var status = el.dataset.aStatus;
      if ((status === 'CANCELLED' || status === 'NO_SHOW') && !(await confirmDialog(status === 'CANCELLED' ? 'Cancel this assignment?' : 'Record a no-show? The shift will not be charged or paid.', 'Yes', true))) return;
      try {
        var res = await submitWithOverride('/assignments/' + el.dataset.a, 'PATCH', { status: status });
        if (res) { toast('Updated'); reload(); }
      } catch (err) { if (err.message !== 'Assignment blocked') fail(err); }
    });
    on(main, '[data-replace]', 'click', async function (_e, el) {
      var workers = await api('/workers?active=ACTIVE');
      openModal('Replace worker', '<div class="ops-form">' +
        field('New worker', 'workerId', '', 'select', { options: workers.map(function (w) { return [w.id, w.name + (w.readiness.ready ? '' : ' (not ready)')]; }), blank: 'Choose…', wide: true }) +
        field('Status', 'status', 'PENDING', 'select', { options: [['PENDING', 'Offered'], ['CONFIRMED', 'Accepted']] }) +
        field('Why', 'reason', '', 'text', { required: true, wide: true }) + '</div>',
        [{ label: 'Replace', onClick: async function (body) {
          var res = await submitWithOverride('/assignments/' + el.dataset.replace + '/replace', 'POST', readForm(body));
          if (res) { toast('Replaced'); reload(); }
        } }]);
    });
    on(main, '[data-confirmation]', 'click', async function (_e, el) {
      try {
        var doc = await api('/assignments/' + el.dataset.confirmation + '/confirmation', { method: 'POST' });
        toast('Assignment confirmation issued. The worker can also see it through their secure document link.'); window.open('/ops/print/document/' + doc.id, '_blank', 'noopener');
      } catch (err) { fail(err); }
    });
    main.querySelector('#add-cost').addEventListener('click', function () {
      openModal('Add cost or charge', '<div class="ops-form">' +
        field('Type', 'kind', 'COST', 'select', { options: [['COST', 'Direct cost'], ['CHARGE', 'Additional charge to client']] }) +
        field('Category', 'category', 'equipment', 'select', { options: [['equipment', 'Equipment'], ['costume', 'Costume'], ['food_drink', 'Food and drink'], ['supplier', 'Third-party supplier'], ['worker_other', 'Other worker cost'], ['other', 'Other']] }) +
        field('Description', 'description', '', 'text', { wide: true, required: true }) +
        field('Amount (£)', 'amount', '', 'number', { required: true }) + '</div>',
        [{ label: 'Add', onClick: async function (body) { await api('/bookings/' + id + '/costs', { method: 'POST', body: readForm(body) }); reload(); } }]);
    });
    on(main, '[data-del-cost]', 'click', async function (_e, el) {
      if (!(await confirmDialog('Remove this line?', 'Remove', true))) return;
      try { await api('/costs/' + el.dataset.delCost, { method: 'DELETE' }); reload(); } catch (err) { fail(err); }
    });
    main.querySelector('#save-actuals').addEventListener('click', async function () {
      var f = readForm(main.querySelector('#actuals'));
      var p = function (v) { return v == null ? null : Math.round(v * 100); };
      try {
        await api('/bookings/' + id + '/actual-payroll', { method: 'POST', body: { wagesPence: p(f.wages), holidayPayPence: p(f.holiday), employerCostsPence: p(f.employer), note: f.note || '' } });
        toast('Actual figures saved'); reload();
      } catch (err) { fail(err); }
    });
    var inv = main.querySelector('#mark-invoiced');
    if (inv) inv.addEventListener('click', async function () {
      try { await api('/bookings/' + id + '/invoice', { method: 'POST', body: readForm(main.querySelector('#invoice-form')) }); toast('Marked invoiced'); reload(); } catch (err) { fail(err); }
    });
    var paid = main.querySelector('#mark-paid');
    if (paid) paid.addEventListener('click', async function () {
      if (!(await confirmDialog('Record that the client has paid this invoice?', 'Mark paid'))) return;
      try { await api('/bookings/' + id + '/paid', { method: 'POST' }); reload(); } catch (err) { fail(err); }
    });
  }

  async function assignModal(b, r, done) {
    var workers = await api('/workers?active=ACTIVE');
    var body = openModal('Assign ' + r.role + ' (' + b.reference + ')', '<div class="ops-form">' +
      field('Worker', 'workerId', '', 'select', { wide: true, required: true, blank: 'Choose…', options: workers.map(function (w) {
        return [w.id, w.name + ' — ' + (w.readiness.ready ? 'ready' : 'not ready') + (w.roles.length ? ' · ' + w.roles.join(', ') : '')];
      }) }) +
      field('Status', 'status', 'PENDING', 'select', { options: [['PENDING', 'Offered'], ['CONFIRMED', 'Accepted (confirmed)']] }) +
      field('Holiday pay', 'holidayPayMethod', 'ROLLED_UP', 'select', { options: [['ROLLED_UP', 'Rolled up'], ['ACCRUED', 'Accrued']] }) +
      field('Planned start', 'plannedStart', b.startTime, 'time') + field('Planned finish', 'plannedFinish', b.expectedFinish, 'time') +
      field('Pay rate (£/h)', 'payRate', r.workerPayRate, 'number') + field('Client charge rate (£/h)', 'clientChargeRate', r.clientChargeRate, 'number') +
      '<div class="wide" id="assign-warnings"></div></div>',
      [{ label: 'Assign', onClick: async function (bd) {
        var data = compact(readForm(bd));
        data.requirementId = r.id;
        var res = await submitWithOverride('/bookings/' + b.id + '/assignments', 'POST', data);
        if (res) { toast('Assigned'); done(); }
        return res ? undefined : false;
      } }]);
    var check = async function () {
      var data = compact(readForm(body));
      if (!data.workerId) { body.querySelector('#assign-warnings').innerHTML = ''; return; }
      data.requirementId = r.id;
      try {
        var res = await api('/bookings/' + b.id + '/assignments/check', { method: 'POST', body: data });
        body.querySelector('#assign-warnings').innerHTML = res.warnings.length
          ? '<ul class="ops-warning-list">' + res.warnings.map(function (x) { return '<li class="' + (x.blocking ? 'blocking' : 'soft') + '">' + (x.blocking ? '<strong>Blocked:</strong> ' : '') + esc(x.message) + '</li>'; }).join('') + '</ul>'
          : alertBox('info', 'No warnings for this worker.');
      } catch (err) { fail(err); }
    };
    body.querySelectorAll('select, input').forEach(function (el) { el.addEventListener('change', check); });
  }

  // ── Timesheets ──────────────────────────────────────────────────────────

  async function viewTimesheets(query) {
    var filter = query.filter || 'awaiting';
    var rows = await api('/timesheets?filter=' + filter);
    var tabs = [['awaiting', 'Awaiting approval'], ['disputed', 'Disputed'], ['approved', 'Approved'], ['all', 'All']];
    main.innerHTML = '<div class="ops-head"><div><h2>Timesheets</h2><div class="ops-lede">Hours come from the worker\'s check-in and check-out in the app. Approving a timesheet completes the shift with its net hours, which then feed pay, the invoice and booking profit. Every edit is in the audit log.</div></div><a class="btn btn-ghost btn-sm" href="' + API + '/exports/timesheets.csv">Export approved</a></div>' +
      '<div class="as-tabs">' + tabs.map(function (t) { return '<a class="as-tab' + (t[0] === filter ? ' active' : '') + '" href="#/timesheets?filter=' + t[0] + '" style="text-decoration:none">' + esc(t[1]) + '</a>'; }).join('') + '</div>' +
      '<div class="as-table-wrap" style="margin-top:12px">' + table(['Date', 'Worker', 'Booking', 'Scheduled', 'In / out', '>Actual h', '>Break', '>Billable h', 'Client approved', 'Status', ''], rows.map(function (a) {
        return '<tr><td>' + day(a.date) + '</td><td>' + esc(a.worker.name) + '</td><td><a class="detail-link" href="#/booking/' + esc(a.opsBookingId) + '">' + esc(a.booking ? a.booking.reference : '') + '</a></td><td>' + esc(a.plannedStart + '–' + a.plannedFinish) + '<div class="text-muted fs-sm">' + (a.scheduledHours != null ? a.scheduledHours + 'h' : '') + '</div></td>' +
          '<td>' + (a.actualStart ? when(a.actualStart) : '—') + '<div class="text-muted fs-sm">' + (a.actualFinish ? when(a.actualFinish) : 'no check-out') + '</div></td><td class="num">' + (a.actualHours != null ? a.actualHours : '—') + '</td><td class="num">' + (a.breakMins || 0) + 'm</td><td class="num">' + a.billableHours + '</td>' +
          '<td>' + (a.timesheet.clientApprovedAt ? esc(a.timesheet.clientApprovedBy) : '—') + '</td><td>' + (a.timesheet.disputedAt ? chip('Disputed', 'bad') + '<div class="text-muted fs-sm">' + esc(a.timesheet.disputeReason || '') + '</div>' : a.timesheet.adminApprovedAt ? chip('Approved', 'ok') : chip(ASSIGNMENT_WORDS[a.status] || a.status, CHIPS.assignment[a.status])) + '</td>' +
          '<td class="ops-actions"><button class="btn btn-sm btn-ghost" data-edit="' + esc(a.id) + '">Edit</button>' +
          (!a.timesheet.clientApprovedAt ? '<button class="btn btn-sm btn-ghost" data-client="' + esc(a.id) + '">Client approved</button>' : '') +
          (a.timesheet.disputedAt ? '<button class="btn btn-sm btn-ghost" data-resolve="' + esc(a.id) + '">Resolve</button>' : '<button class="btn btn-sm btn-danger-quiet" data-dispute="' + esc(a.id) + '">Dispute</button>') +
          (a.rawStatus === 'CONFIRMED' && !a.timesheet.disputedAt ? '<button class="btn btn-sm btn-success" data-approve="' + esc(a.id) + '">Approve</button>' : '') + '</td></tr>';
      }), 'No timesheets here.') + '</div>';
    var byId = {};
    rows.forEach(function (a) { byId[a.id] = a; });
    var reload = function () { return viewTimesheets(query); };
    on(main, '[data-edit]', 'click', function (_e, el) {
      var a = byId[el.dataset.edit];
      openModal('Edit timesheet: ' + a.worker.name, '<div class="ops-form">' +
        field('Checked in', 'checkedInAt', toLocalInput(a.actualStart), 'datetime') + field('Checked out', 'checkedOutAt', toLocalInput(a.actualFinish), 'datetime') +
        field('Hours worked (gross)', 'hoursWorked', a.actualHours, 'number', { hint: 'Leave empty to work it out from the times.' }) + field('Unpaid break (minutes)', 'breakMins', a.breakMins || 0, 'number') +
        field('Reason for the change', 'reason', '', 'text', { wide: true, required: true }) + '</div>',
        [{ label: 'Save', onClick: async function (body) {
          var f = readForm(body);
          if (f.hoursWorked == null) delete f.hoursWorked;
          await api('/assignments/' + a.id + '/timesheet', { method: 'PATCH', body: f }); reload();
        } }]);
    });
    on(main, '[data-client]', 'click', function (_e, el) {
      openModal('Client approval', '<div class="ops-form">' + field('Approved by (client name)', 'approvedBy', '', 'text', { wide: true, required: true }) + '</div>', [{
        label: 'Record', onClick: async function (body) { await api('/assignments/' + el.dataset.client + '/timesheet/client-approval', { method: 'POST', body: readForm(body) }); reload(); } }]);
    });
    on(main, '[data-dispute]', 'click', function (_e, el) {
      openModal('Dispute timesheet', '<div class="ops-form">' + field('What is disputed', 'reason', '', 'textarea', { wide: true, required: true }) + '</div>', [{
        label: 'Mark disputed', kind: 'btn-danger', onClick: async function (body) { await api('/assignments/' + el.dataset.dispute + '/timesheet/dispute', { method: 'POST', body: readForm(body) }); reload(); } }]);
    });
    on(main, '[data-resolve]', 'click', function (_e, el) {
      openModal('Resolve dispute', '<div class="ops-form">' + field('Resolution', 'reason', '', 'textarea', { wide: true }) + '</div>', [{
        label: 'Resolve', onClick: async function (body) { await api('/assignments/' + el.dataset.resolve + '/timesheet/dispute', { method: 'POST', body: Object.assign(readForm(body), { resolve: true }) }); reload(); } }]);
    });
    on(main, '[data-approve]', 'click', function (_e, el) {
      var a = byId[el.dataset.approve];
      var suggested = a.netWorkedHours != null ? a.netWorkedHours : a.scheduledHours;
      openModal('Approve timesheet: ' + a.worker.name, '<p class="fs-sm mb-2">Scheduled ' + (a.scheduledHours || '—') + 'h · recorded ' + (a.actualHours != null ? a.actualHours + 'h' : 'nothing') + ' · break ' + (a.breakMins || 0) + 'm. The minimum hours still apply to billing and pay.</p><div class="ops-form">' +
        field('Hours to approve (net of break)', 'hours', suggested != null ? Math.round(suggested * 100) / 100 : '', 'number', { required: true }) + field('Note', 'note', '', 'text') + '</div>',
        [{ label: 'Approve', kind: 'btn-success', onClick: async function (body) { await api('/assignments/' + a.id + '/timesheet/approve', { method: 'POST', body: compact(readForm(body)) }); toast('Approved'); reload(); } }]);
    });
  }

  // ── Documents & Terms ───────────────────────────────────────────────────

  var DOC_LABELS = {
    KEY_INFORMATION_DOCUMENT: 'Key Information Document', ZERO_HOURS_AGREEMENT: 'Zero-Hours Employment Agreement',
    ASSIGNMENT_CONFIRMATION: 'Assignment confirmation', CLIENT_TERMS_OF_BUSINESS: 'Terms of Business (business clients)',
    RTW_CHECKLIST: 'RTW checklist', ONBOARDING_CHECKLIST: 'Onboarding checklist',
  };
  var PACK_WORDS = { both_missing: 'Both missing', kid_missing: 'KID missing', contract_missing: 'Contract missing', outdated: 'Superseded / outdated', current: 'Current' };
  var PACK_CHIPS = { both_missing: 'bad', kid_missing: 'bad', contract_missing: 'warn', outdated: 'warn', current: 'ok' };
  var TERMS_CHIPS = { consumer_terms_required: 'info', not_issued: 'bad', issued: 'warn', accepted: 'ok', reacceptance_required: 'bad' };

  function termsChip(t) {
    if (!t) return '—';
    if (t.status === 'consumer_terms_required') return chip('Consumer booking terms required', 'info');
    if (t.status === 'not_issued') return chip('Not issued', 'bad');
    if (t.status === 'issued') return chip('v' + t.pendingVersion + ' issued, not accepted', 'warn');
    if (t.status === 'reacceptance_required') return chip('v' + t.acceptedVersion + ' accepted; material change, re-acceptance needed', 'bad');
    return chip('Accepted v' + t.acceptedVersion, t.newerVersionAvailable ? 'warn' : 'ok') + (t.newerVersionAvailable ? ' ' + chip('older version', 'warn') : '') + (t.pendingVersion ? ' ' + chip('v' + t.pendingVersion + ' awaiting', 'muted') : '');
  }
  function kidCell(k) {
    if (k.status !== 'issued') return chip(k.status === 'superseded' ? 'Superseded only' : 'Not issued', 'bad');
    return chip('v' + k.version + ' issued', k.reacceptanceRequired ? 'bad' : k.newerVersionAvailable ? 'warn' : 'ok') +
      '<div class="text-muted fs-sm">' + (k.acknowledgedAt ? 'Acknowledged ' + when(k.acknowledgedAt) : 'Not acknowledged yet') + '</div>';
  }
  function contractCell(c) {
    if (c.status === 'accepted') {
      return chip('v' + c.version + ' agreed', c.reacceptanceRequired ? 'bad' : c.newerVersionAvailable ? 'warn' : 'ok') +
        (c.pendingVersion ? ' ' + chip('v' + c.pendingVersion + ' awaiting', 'muted') : '') +
        '<div class="text-muted fs-sm">' + when(c.acceptedAt) + (c.reacceptanceRequired ? ' · material change: must agree current version' : '') + '</div>';
    }
    if (c.status === 'issued') return chip('v' + c.version + ' issued, not agreed', 'warn');
    return chip(c.status === 'superseded' ? 'Superseded only' : 'Not issued', 'bad');
  }

  /** A freshly made link: shown once, with a copy button. */
  function showLink(title, link) {
    var url = location.origin + link.path;
    var emailNote = link.email
      ? (link.email.sent ? alertBox('info', 'Emailed to the address on file.') : alertBox('warning', 'Email not sent: ' + (link.email.error || 'unknown error') + '. Copy the link and send it yourself.'))
      : '';
    openModal(title, emailNote + '<p class="fs-sm mb-2">Personal secure link, valid until ' + day(link.expiresAt) + '. It opens only this person\'s documents and is shown once, so copy it now.</p>' +
      '<div class="ops-form"><div class="wide"><input class="as-input" id="link-url" readonly value="' + esc(url) + '"></div></div>', [{
      label: 'Copy link', onClick: async function (b) {
        var input = b.querySelector('#link-url');
        input.select();
        try { await navigator.clipboard.writeText(url); } catch (_e) { document.execCommand('copy'); }
        toast('Link copied');
        return false;
      },
    }]);
  }

  /** Ask whether to email the link or just show it, then run `go(email)`. */
  function linkChoice(title, message, go) {
    openModal(title, '<p>' + esc(message) + '</p>', [
      { label: 'Issue and copy link', kind: 'btn-ghost', onClick: async function () { var l = await go(false); setTimeout(function () { showLink(title, l); }, 0); } },
      { label: 'Issue and email link', onClick: async function () { var l = await go(true); setTimeout(function () { showLink(title, l); }, 0); } },
    ]);
  }

  function issuePackFor(workerId, workerName, done) {
    linkChoice('Issue current worker pack: ' + workerName,
      'Issues the current Key Information Document first, then the current Zero-Hours Employment Agreement, skipping any the worker already has at the current version. An agreement already made stays in force until the new one is agreed. Issue dates are today; nothing is backdated.',
      async function (email) {
        var r = await api('/workers/' + workerId + '/documents/pack', { method: 'POST', body: { email: email } });
        toast(r.issued.length ? 'Issued: ' + r.issued.map(function (x) { return DOC_LABELS[x.type] + ' v' + x.version; }).join(', ') : 'Nothing new to issue; link created');
        if (done) done();
        return r.link;
      });
  }

  function issueTermsFor(clientId, clientName, done) {
    linkChoice('Issue Terms of Business: ' + clientName,
      'Issues the current business Terms of Business to this client and makes a secure link for them to accept. An acceptance of an earlier version stays on record and in force until this one is accepted (unless this version was marked as a material change).',
      async function (email) {
        var r = await api('/clients/' + clientId + '/terms/issue', { method: 'POST', body: { email: email } });
        toast('Terms v' + r.document.version + ' issued');
        if (done) done();
        return r.link;
      });
  }

  var DOC_TABS = [['overview', 'Overview'], ['workers', 'Worker documents'], ['clients', 'Client terms'], ['templates', 'Document templates'], ['versions', 'Versions'], ['outstanding', 'Outstanding acceptances']];

  function docTabs(active) {
    return '<h2>Documents &amp; Terms</h2><nav class="ops-tabs" aria-label="Documents and Terms">' + DOC_TABS.map(function (t) {
      return '<a href="#/documents?tab=' + t[0] + '"' + (t[0] === active ? ' class="active" aria-current="page"' : '') + '>' + esc(t[1]) + '</a>';
    }).join('') + '</nav>';
  }

  async function viewDocuments(query) {
    query = (query && typeof query === 'object') ? query : {};
    var tab = query.tab || 'overview';
    if (tab === 'templates') return viewTemplates();
    var d = await api('/documents-terms');
    var c = d.counts;
    var review = d.commercialReview.reviewed ? '' : alertBox('warning', d.commercialReview.label + ': the transfer fee, extended hire, payment and cancellation defaults have not been confirmed. Terms of Business cannot be issued until they are.', '#/settings');
    var html = docTabs(tab) + review;

    if (tab === 'overview') {
      html += '<div class="ops-lede">Worker onboarding: application / worker created → right to work → Key Information Document issued → employment agreement agreed → payroll onboarding → Ready for Work. Business clients accept the Terms of Business before staff are supplied; private consumers need consumer booking terms instead.</div>' +
        '<div class="kpi-grid ops-kpis">' +
          kpi('Workers missing KID', c.workersMissingKid, 'Active workers', c.workersMissingKid ? 'warning' : 'success', '#/documents?tab=workers&pack=kid_missing') +
          kpi('Workers missing agreement', c.workersMissingAgreement, 'Not agreed (current or still valid)', c.workersMissingAgreement ? 'warning' : 'success', '#/documents?tab=workers&pack=contract_missing') +
          kpi('Workers on superseded contract', c.workersOnSupersededContract, null, c.workersOnSupersededContract ? 'warning' : null, '#/documents?tab=workers&pack=outdated') +
          kpi('Clients without current Terms', c.clientsWithoutCurrentTerms, 'Business clients', c.clientsWithoutCurrentTerms ? 'warning' : 'success', '#/documents?tab=clients&terms=missing') +
          kpi('Clients on superseded Terms', c.clientsOnSupersededTerms, null, c.clientsOnSupersededTerms ? 'warning' : null, '#/documents?tab=clients&terms=older') +
          kpi('Awaiting acceptance', c.outstandingAcceptances, 'Agreements and Terms issued', c.outstandingAcceptances ? 'info' : null, '#/documents?tab=outstanding') +
        '</div>';
    }

    if (tab === 'workers') {
      var pack = query.pack || '';
      var rows = d.workers.filter(function (w) {
        if (!pack) return true;
        if (pack === 'kid_missing') return w.documentPack === 'kid_missing' || w.documentPack === 'both_missing';
        if (pack === 'contract_missing') return w.documentPack === 'contract_missing' || w.documentPack === 'both_missing';
        return w.documentPack === pack;
      });
      html += '<div class="ops-lede">Documents outstanding for every worker who has not left. Existing workers are not treated as having documents they were never given: issue the current pack and they agree it on the date they actually do.</div>' +
        '<form class="as-filters" id="filters"><div class="as-filter-group"><label>Show</label><select name="pack">' +
        options([['kid_missing', 'KID missing'], ['contract_missing', 'Contract missing'], ['both_missing', 'Both missing'], ['current', 'Current'], ['outdated', 'Superseded / outdated']], pack, 'All') +
        '</select></div></form><div class="as-table-wrap">' +
        table(['Worker', 'Documents', 'Key Information Document', 'Employment agreement', 'Ready', ''], rows.map(function (w) {
          return '<tr><td><a href="#/worker/' + esc(w.id) + '"><strong>' + esc(w.name) + '</strong></a><div class="text-muted fs-sm">' + esc(w.email) + (w.activeStatus !== 'ACTIVE' ? ' · ' + esc(words(w.activeStatus)) : '') + '</div></td>' +
            '<td>' + chip(PACK_WORDS[w.documentPack], PACK_CHIPS[w.documentPack]) + '</td><td>' + kidCell(w.kid) + '</td><td>' + contractCell(w.contract) + '</td>' +
            '<td>' + (w.ready ? chip('Ready', 'ok') : chip('Not ready', 'bad')) + '</td>' +
            '<td class="ops-actions">' + (w.documentPack !== 'current' ? '<button class="btn btn-sm btn-primary" data-pack="' + esc(w.id) + '" data-name="' + esc(w.name) + '">Issue current pack</button>' : '') + '</td></tr>';
        }), 'No workers in this group.') + '</div>';
    }

    if (tab === 'clients') {
      var tf = query.terms || '';
      var list = d.clients.filter(function (x) {
        var t = x.terms;
        if (tf === 'missing') return t.status !== 'consumer_terms_required' && !(t.status === 'accepted' && !t.newerVersionAvailable);
        if (tf === 'older') return t.acceptedVersion != null && (t.newerVersionAvailable || t.status === 'reacceptance_required');
        if (tf === 'current') return t.status === 'accepted' && !t.newerVersionAvailable;
        if (tf === 'consumer') return t.status === 'consumer_terms_required';
        return true;
      });
      html += '<div class="ops-lede">The business Terms of Business, by client. Private consumers never receive them.</div>' +
        '<form class="as-filters" id="filters"><div class="as-filter-group"><label>Show</label><select name="terms">' +
        options([['missing', 'Without current Terms'], ['older', 'On a superseded version'], ['current', 'Current'], ['consumer', 'Private consumers']], tf, 'All') +
        '</select></div></form><div class="as-table-wrap">' +
        table(['Client', 'Type', 'Terms', 'Booking gate', ''], list.map(function (x) {
          var b2b = x.clientType !== 'PRIVATE_CONSUMER';
          return '<tr><td><a href="#/client/' + esc(x.id) + '"><strong>' + esc(x.companyName) + '</strong></a><div class="text-muted fs-sm">' + esc(x.contactName) + ' · ' + esc(x.email) + '</div></td><td>' + esc(words(x.clientType)) + '</td>' +
            '<td>' + termsChip(x.terms) + '</td><td class="fs-sm">' + (x.gate.ok ? chip('OK to supply', 'ok') : esc(x.gate.message)) + '</td>' +
            '<td class="ops-actions">' + (b2b && !(x.terms.status === 'accepted' && !x.terms.newerVersionAvailable) && d.commercialReview.reviewed ? '<button class="btn btn-sm btn-primary" data-terms="' + esc(x.id) + '" data-name="' + esc(x.companyName) + '">Issue current Terms</button>' : '') + '</td></tr>';
        }), 'No clients in this group.') + '</div>';
    }

    if (tab === 'versions') {
      var v = d.versions;
      html += '<div class="ops-lede">Every version is kept. A new version supersedes the old one but never changes what was issued or accepted under it. "Material change" means anyone on an earlier version must agree the new one before they count as current.</div>' +
        ['KEY_INFORMATION_DOCUMENT', 'ZERO_HOURS_AGREEMENT', 'CLIENT_TERMS_OF_BUSINESS', 'ASSIGNMENT_CONFIRMATION'].map(function (type) {
          var versions = v.templates.filter(function (t) { return t.type === type; });
          var h = v.holders[type];
          var names = function (list) { return list.length ? list.slice(0, 40).map(function (x) { return esc(x.name) + (x.version ? ' (v' + x.version + ')' : ''); }).join(', ') + (list.length > 40 ? '…' : '') : 'None'; };
          return '<div class="ops-card"><h3 style="margin-top:0">' + esc(DOC_LABELS[type]) + '</h3>' +
            table(['Version', 'Status', 'Effective', 'Created', 'Superseded', 'Material change'], versions.map(function (t) {
              return '<tr><td>v' + t.version + ' <a class="fs-sm ops-link" target="_blank" rel="noopener" href="/ops/print/template/' + esc(t.id) + '">preview</a></td><td>' + (t.status === 'CURRENT' ? chip('Current', 'ok') : chip('Superseded', 'muted')) + '</td><td>' + day(t.effectiveDate) + '</td><td>' + when(t.createdAt) + '<div class="text-muted fs-sm">' + esc(t.createdBy) + '</div></td><td>' + (t.supersededAt ? when(t.supersededAt) : '—') + '</td><td>' + (t.requiresReacceptance ? chip('Yes', 'warn') : 'No') + '</td></tr>';
            }), 'No versions yet.') +
            (h ? '<div class="ops-holders"><p><strong>' + (type === 'CLIENT_TERMS_OF_BUSINESS' ? 'Accepted' : type === 'KEY_INFORMATION_DOCUMENT' ? 'Issued' : 'Agreed') + ' current version (' + h.current.length + '):</strong> ' + names(h.current) + '</p>' +
              '<p><strong>On an older version (' + h.older.length + '):</strong> ' + names(h.older) + '</p>' +
              '<p><strong>Never ' + (type === 'KEY_INFORMATION_DOCUMENT' ? 'issued' : 'accepted') + ' (' + h.never.length + '):</strong> ' + names(h.never) + '</p></div>' : '') +
            '</div>';
        }).join('');
    }

    if (tab === 'outstanding') {
      var o = d.outstanding;
      html += '<h3>Employment agreements awaiting agreement</h3>' + table(['Worker', 'Version', 'Issued'], o.agreements.map(function (x) {
          return '<tr class="clickable" data-href="#/worker/' + esc(x.workerId) + '"><td>' + esc(x.name) + '</td><td>v' + x.version + '</td><td>' + when(x.issuedAt) + '</td></tr>';
        }), 'None.') +
        '<h3>KIDs issued, receipt not yet acknowledged</h3>' + table(['Worker', 'Version', 'Issued'], o.kidsNotAcknowledged.map(function (x) {
          return '<tr class="clickable" data-href="#/worker/' + esc(x.workerId) + '"><td>' + esc(x.name) + '</td><td>v' + x.version + '</td><td>' + when(x.issuedAt) + '</td></tr>';
        }), 'None.') +
        '<h3>Terms of Business awaiting acceptance</h3>' + table(['Client', 'Version', 'Issued'], o.clientTerms.map(function (x) {
          return '<tr class="clickable" data-href="#/client/' + esc(x.clientId) + '"><td>' + esc(x.name) + '</td><td>v' + x.version + '</td><td>' + when(x.issuedAt) + '</td></tr>';
        }), 'None.');
    }

    main.innerHTML = html;
    var form = main.querySelector('#filters');
    if (form) form.addEventListener('change', function () { setQuery('documents', Object.assign({ tab: tab }, Object.fromEntries(new FormData(form)))); });
    on(main, 'tr[data-href]', 'click', function (_e, el) { location.hash = el.dataset.href; });
    var reload = function () { viewDocuments(query); };
    on(main, '[data-pack]', 'click', function (_e, el) { issuePackFor(el.dataset.pack, el.dataset.name, reload); });
    on(main, '[data-terms]', 'click', function (_e, el) { issueTermsFor(el.dataset.terms, el.dataset.name, reload); });
  }

  async function viewTemplates() {
    var templates = await api('/templates');
    var types = [];
    templates.forEach(function (t) { if (types.indexOf(t.type) < 0) types.push(t.type); });
    main.innerHTML = docTabs('templates') + '<div class="ops-lede">Each change is a new version; earlier versions are kept and stay attached to what was issued and accepted. A template with "VERGO WORDING NEEDED" gaps cannot be issued. Placeholders like {{worker.name}} are filled in when a document is issued. Versions written by "system" are drafts for legal review.</div>' +
      types.map(function (type) {
        var versions = templates.filter(function (t) { return t.type === type; });
        var current = versions.find(function (t) { return t.current; }) || versions[0];
        var flags = (current.needsWording ? ' ' + chip('Wording needed', 'bad') : ' ' + chip('Ready to issue', 'ok')) +
          (current.systemDraft ? ' ' + chip('System draft: legal review', 'warn') : '') +
          (current.ownerReview && !current.ownerReview.reviewed ? ' ' + chip(current.ownerReview.label, 'bad') : '');
        return '<div class="ops-card"><div class="ops-head"><div><h3 style="margin:0">' + esc(current.label) + '</h3><div class="text-muted fs-sm">Current: v' + current.version + ', effective ' + day(current.effectiveDate) + flags + '</div></div>' +
          '<div class="ops-actions"><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="/ops/print/template/' + esc(current.id) + '">Preview</a><button class="btn btn-sm btn-primary" data-new="' + esc(current.id) + '">New version</button></div></div>' +
          table(['Version', 'Status', 'Effective', 'Created', 'Superseded', 'Change', 'Issued', 'Accepted', ''], versions.map(function (t) {
            return '<tr><td>v' + t.version + (t.requiresReacceptance ? ' ' + chip('material', 'warn') : '') + '</td><td>' + (t.current ? chip('Current', 'ok') : chip('Superseded', 'muted')) + '</td><td>' + day(t.effectiveDate) + '</td><td>' + when(t.createdAt) + '<div class="text-muted fs-sm">' + esc(t.createdBy) + '</div></td><td>' + (t.retiredAt ? when(t.retiredAt) : '—') + '</td><td>' + esc(t.changeNote || '') + '</td><td class="num">' + t.issuedCount + '</td><td class="num">' + t.acceptedCount + '</td><td><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="/ops/print/template/' + esc(t.id) + '">Preview</a></td></tr>';
          })) + '</div>';
      }).join('');
    var byId = {};
    templates.forEach(function (t) { byId[t.id] = t; });
    on(main, '[data-new]', 'click', function (_e, el) {
      var t = byId[el.dataset.new];
      var accepts = t.type === 'ZERO_HOURS_AGREEMENT' || t.type === 'CLIENT_TERMS_OF_BUSINESS' || t.type === 'KEY_INFORMATION_DOCUMENT';
      openModal('New version: ' + t.label, '<p class="text-muted fs-sm mb-2">"# " heading, "## " subheading, "- " list item, blank line between paragraphs. Placeholders in use: ' + esc(t.keys.join(', ') || 'none') + '. The KID pay example and the commercial terms come from Settings and are frozen into the version when it is saved.</p><div class="ops-form">' +
        field('Title', 'title', t.title, 'text', { wide: true, required: true }) +
        field('Wording', 'body', t.body, 'textarea', { wide: true, required: true, attrs: ' rows="22" style="min-height:360px;font-family:ui-monospace,Consolas,monospace;font-size:12px"' }) +
        field('What changed', 'changeNote', '', 'text', { wide: true, required: true }) +
        field('Effective date', 'effectiveDate', todayLondon(), 'date', { required: true }) +
        (accepts ? field('Material change: everyone on an earlier version must agree (or be re-issued) this version before they count as current', 'requiresReacceptance', false, 'checkbox', { wide: true, hint: 'Leave unticked for corrections that do not change anyone\'s terms. Earlier agreements then stay in force.' }) : '') +
        '</div>',
        [{ label: 'Save as v' + (t.version + 1), onClick: async function (body) {
          var f = readForm(body);
          await api('/templates', { method: 'POST', body: { type: t.type, title: f.title, body: body.querySelector('[name=body]').value, changeNote: f.changeNote, effectiveDate: f.effectiveDate, requiresReacceptance: Boolean(f.requiresReacceptance) } });
          toast('Saved new version'); viewTemplates();
        } }]);
    });
  }

  // ── AWR and direct hire ─────────────────────────────────────────────────

  async function viewAwr() {
    var d = await api('/awr');
    main.innerHTML = '<h2>Agency Workers Regulations</h2><div class="ops-aid"><strong>' + esc(d.label) + '.</strong> Counts calendar weeks with any work for the same worker, hirer and role. A gap of more than six weeks is treated as a reset. Some breaks (sickness, maternity, shutdowns and others) do not reset the clock, and whether roles are substantively different is a judgement. This does not decide anyone\'s entitlement.</div>' +
      '<div class="as-table-wrap">' + table(['Worker', 'Hirer', 'Role', '>Weeks', 'Count started', 'Last assignment', 'Break / reset', 'Flag'], d.rows.map(function (r) {
        var flag = r.level === 'review_required' ? chip('12-week review required', 'bad') : r.level === 'warning' ? chip('10-week warning', 'warn') : chip('Tracking', 'muted');
        return '<tr><td><a class="detail-link" href="#/worker/' + esc(r.workerId) + '">' + esc(r.worker) + '</a></td><td>' + esc(r.client) + '</td><td>' + esc(r.role) + '</td><td class="num">' + r.weeksAccumulated + '</td><td>' + day(r.firstQualifyingDate) + '</td><td>' + day(r.lastQualifyingAssignment) + '</td><td class="fs-sm">' +
          (r.resetOccurred ? 'An earlier run reset after a long gap. ' : '') + (r.resetsIfNoWorkBy ? 'Count may reset without work by ' + day(r.resetsIfNoWorkBy) : '') + '</td><td>' + flag + '</td></tr>';
      }), 'No worker has AWR weeks on record.') + '</div>';
  }

  async function viewDirectHire() {
    var d = await api('/direct-hire');
    main.innerHTML = '<h2>Transfer and direct hire</h2><div class="ops-aid"><strong>' + esc(d.label) + '.</strong> The relevant-period date is estimated as the later of 14 weeks from the first assignment or 8 weeks after the last. Breaks between assignments can change it.</div>' +
      '<div class="as-table-wrap">' + table(['Worker', 'Hirer', 'First', 'Last', 'Relevant period ends', 'Direct hire reported', 'Extended hire', 'Transfer fee', 'Notes', ''], d.rows.map(function (r, i) {
        var t = r.tracking || {};
        return '<tr><td>' + esc(r.worker) + '</td><td>' + esc(r.client) + '</td><td>' + day(r.firstAssignmentDate) + '</td><td>' + day(r.lastAssignmentDate) + '</td><td>' + day(t.relevantPeriodEnd || r.estimatedRelevantPeriodEnd) + (t.relevantPeriodEnd ? '' : ' <span class="ops-estimate">Est.</span>') + '</td><td>' + (t.directHireReported ? chip('Yes', 'warn') : 'No') + '</td><td>' + (t.extendedHireOption ? 'Yes' : 'No') + '</td><td>' + esc(words(t.transferFeeStatus || 'NOT_APPLICABLE')) + '</td><td class="fs-sm">' + esc(t.notes || '') + '</td><td><button class="btn btn-sm btn-ghost" data-i="' + i + '">Update</button></td></tr>';
      }), 'No worker is inside a relevant period with any hirer.') + '</div>';
    on(main, '[data-i]', 'click', function (_e, el) {
      var r = d.rows[Number(el.dataset.i)];
      var t = r.tracking || {};
      openModal('Direct hire: ' + r.worker + ' / ' + r.client, '<div class="ops-form">' +
        field('Last assignment', 'lastAssignmentDate', t.lastAssignmentDate || r.lastAssignmentDate, 'date') +
        field('Relevant period ends', 'relevantPeriodEnd', t.relevantPeriodEnd || r.estimatedRelevantPeriodEnd, 'date') +
        field('Transfer fee', 'transferFeeStatus', t.transferFeeStatus || 'NOT_APPLICABLE', 'select', { options: ['NOT_APPLICABLE', 'POSSIBLE', 'INVOICED', 'PAID', 'WAIVED'] }) +
        field('Hirer reported a direct hire', 'directHireReported', t.directHireReported, 'checkbox', { wide: true }) +
        field('Hirer chose the extended hire option', 'extendedHireOption', t.extendedHireOption, 'checkbox', { wide: true }) +
        field('Notes', 'notes', t.notes, 'textarea', { wide: true }) + '</div>',
        [{ label: 'Save', onClick: async function (body) {
          await api('/direct-hire', { method: 'PUT', body: Object.assign({ userId: r.userId, clientId: r.clientId }, readForm(body)) }); viewDirectHire();
        } }]);
    });
  }

  // ── Historic Payroll Reconstruction ─────────────────────────────────────

  async function viewPayroll(query) {
    var [d, workers] = await Promise.all([api('/payroll-history' + (Object.keys(query).length ? '?' + new URLSearchParams(query) : '')), api('/workers')]);
    var t = d.totals;
    var yn = function (v) { return v ? chip('Yes', 'ok') : chip('No', 'warn'); };
    main.innerHTML = '<div class="ops-head"><div><h2>Historic Payroll Reconstruction</h2></div><div class="ops-actions"><a class="btn btn-ghost btn-sm" href="' + API + '/exports/payroll-history.csv">Export CSV</a><button class="btn btn-ghost" id="import">Import CSV</button><button class="btn btn-primary" id="add">Add payment</button></div></div>' +
      '<div class="ops-aid">Organises what was actually paid so it can be entered in HMRC Basic PAYE Tools or payroll software, or handed to an accountant. It does not create FPS submissions, invent tax codes or work out tax due.</div>' +
      '<form class="as-filters" id="filters"><div class="as-filter-group"><label>Worker</label><select name="userId">' + options(workers.map(function (w) { return [w.id, w.name]; }), query.userId, 'All') + '</select></div>' +
      '<div class="as-filter-group"><label>From</label><input type="date" name="from" value="' + esc(query.from || '') + '"></div><div class="as-filter-group"><label>To</label><input type="date" name="to" value="' + esc(query.to || '') + '"></div></form>' +
      '<div class="kpi-grid ops-kpis">' + kpi('Gross transferred', '£' + t.gross.toFixed(2)) + kpi('Base pay', '£' + t.base.toFixed(2)) + kpi('Holiday pay', '£' + t.holiday.toFixed(2)) +
        kpi('Not payroll-corrected', t.notCorrected, null, t.notCorrected ? 'warning' : null) + kpi('FPS not submitted', t.notFps, null, t.notFps ? 'warning' : null) + kpi('HMRC not reconciled', t.notReconciled, null, t.notReconciled ? 'warning' : null) + '</div>' +
      '<div class="as-table-wrap" style="margin-top:14px">' + table(['Paid', 'Worker', '>Hours', '>Base', '>Holiday', '>Gross transferred', 'Corrected', 'FPS', 'Reconciled', 'Notes', ''], d.rows.map(function (p) {
        return '<tr><td>' + day(p.paymentDate) + '</td><td>' + esc(p.workerName) + (p.userId ? '' : ' ' + chip('unmatched', 'muted')) + '</td><td class="num">' + (p.hours != null ? p.hours : '—') + '</td><td class="num">' + rate(p.basePay) + '</td><td class="num">' + rate(p.holidayPay) + '</td><td class="num">' + rate(p.grossTransferred) + '</td><td>' + yn(p.payrollCorrected) + '</td><td>' + yn(p.fpsSubmitted) + '</td><td>' + yn(p.hmrcReconciled) + '</td><td class="fs-sm">' + esc(p.notes || '') + '</td><td><button class="btn btn-sm btn-ghost" data-edit="' + esc(p.id) + '">Edit</button></td></tr>';
      }), 'No historic payments recorded.') + '</div>';

    var form = main.querySelector('#filters');
    form.addEventListener('change', function () { setQuery('payroll', Object.fromEntries(new FormData(form))); });
    var byId = {};
    d.rows.forEach(function (p) { byId[p.id] = p; });
    var paymentForm = function (p) {
      p = p || {};
      return '<div class="ops-form">' + field('Worker (matched)', 'userId', p.userId, 'select', { options: workers.map(function (w) { return [w.id, w.name]; }), blank: 'Not matched' }) +
        field('Worker name as recorded', 'workerName', p.workerName, 'text', { required: true }) + field('Payment date', 'paymentDate', p.paymentDate, 'date', { required: true }) +
        field('Hours', 'hours', p.hours, 'number') + field('Base pay (£)', 'basePay', p.basePay, 'number') + field('Holiday pay (£)', 'holidayPay', p.holidayPay, 'number') +
        field('Gross actually transferred (£)', 'grossTransferred', p.grossTransferred, 'number', { required: true }) +
        field('Payroll corrected', 'payrollCorrected', p.payrollCorrected, 'checkbox') + field('FPS submitted', 'fpsSubmitted', p.fpsSubmitted, 'checkbox') + field('HMRC payment reconciled', 'hmrcReconciled', p.hmrcReconciled, 'checkbox') +
        field('Notes', 'notes', p.notes, 'textarea', { wide: true }) + '</div>';
    };
    var reload = function () { return viewPayroll(query); };
    main.querySelector('#add').addEventListener('click', function () {
      var body = openModal('Add historic payment', paymentForm(), [{ label: 'Add', onClick: async function (bd) { await api('/payroll-history', { method: 'POST', body: readForm(bd) }); reload(); } }]);
      body.querySelector('[name=userId]').addEventListener('change', function (e) {
        var w = workers.find(function (x) { return x.id === e.target.value; });
        var name = body.querySelector('[name=workerName]');
        if (w && !name.value) name.value = w.name;
      });
    });
    on(main, '[data-edit]', 'click', function (_e, el) {
      openModal('Edit historic payment', paymentForm(byId[el.dataset.edit]), [{ label: 'Save', onClick: async function (bd) { await api('/payroll-history/' + el.dataset.edit, { method: 'PATCH', body: readForm(bd) }); reload(); } }]);
    });
    main.querySelector('#import').addEventListener('click', function () {
      var body = openModal('Import historic payments (CSV)',
        '<p class="fs-sm mb-2">Columns: <span class="ops-mono">worker_name, worker_email, payment_date, hours, base_pay, holiday_pay, gross_transferred, notes, payroll_corrected, fps_submitted, hmrc_reconciled</span>. Only worker_name, payment_date and gross_transferred are required. Dates as YYYY-MM-DD or DD/MM/YYYY; yes/no for the flags. Rows already on file (same name, date and amount) are skipped.</p>' +
        '<div class="ops-form"><div class="wide"><label>CSV file</label><input type="file" id="csv-file" accept=".csv,text/csv"></div>' + field('Or paste CSV', 'csv', '', 'textarea', { wide: true }) + '</div><div id="preview"></div>',
        [{ label: 'Preview', kind: 'btn-ghost', onClick: async function (bd) { await previewImport(bd, false); return false; } },
         { label: 'Import', onClick: async function (bd) { await previewImport(bd, true); reload(); } }]);
      body.querySelector('#csv-file').addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        file.text().then(function (text) { body.querySelector('[name=csv]').value = text; });
      });
    });
  }

  async function previewImport(body, commit) {
    var csv = body.querySelector('[name=csv]').value;
    var res = await api('/payroll-history/import', { method: 'POST', body: { csv: csv, commit: commit } });
    body.querySelector('#preview').innerHTML = '<h3>' + (commit ? 'Imported ' + res.created + ' payment(s)' : 'Preview') + '</h3>' +
      table(['Line', 'Worker', 'Paid', '>Gross', 'Matched', 'Result'], res.rows.map(function (r) {
        return '<tr><td>' + r.line + '</td><td>' + esc(r.data.workerName) + '</td><td>' + esc(r.data.paymentDate) + '</td><td class="num">' + r.data.grossTransferred.toFixed(2) + '</td><td>' + (r.matched ? chip('Yes', 'ok') : chip('No', 'muted')) + '</td><td>' +
          (r.errors.length ? chip(r.errors.join('; '), 'bad') : r.duplicate ? chip('Already on file, skipped', 'muted') : chip(commit ? 'Imported' : 'Will import', 'ok')) + '</td></tr>';
      }));
    if (commit) toast('Imported ' + res.created + ' payment(s)');
  }

  // ── Exports, audit, settings ────────────────────────────────────────────

  async function viewExports() {
    var retention = await api('/retention');
    var list = [
      ['workers', 'Worker master list', 'Names, contact, roles, ready status. No date of birth, emergency contacts or notes.'],
      ['compliance', 'Worker compliance', 'Status and dates for RTW, agreement, KID, payroll and pension. No evidence or document numbers.'],
      ['bookings', 'Bookings', ''], ['assignments', 'Assignments', ''], ['timesheets', 'Approved timesheets', ''],
      ['profitability', 'Booking profitability', 'Estimates unless actual payroll figures were entered.'],
      ['payroll-history', 'Historic payroll reconstruction', ''], ['invoices', 'Outstanding invoices', ''],
    ];
    main.innerHTML = '<h2>Exports</h2><div class="ops-lede">CSV files open in Excel or Sheets. Every download is recorded in the audit log. For everything held on one worker (a subject access or records request), use "Export all records" on their page.</div>' +
      '<div class="as-table-wrap">' + table(['Export', 'Notes', ''], list.map(function (x) {
        return '<tr><td><strong>' + esc(x[1]) + '</strong></td><td class="fs-sm">' + esc(x[2]) + '</td><td><a class="btn btn-sm btn-primary" href="' + API + '/exports/' + x[0] + '.csv">Download</a></td></tr>';
      })) + '</div>' +
      '<h3>Record classification and retention</h3><div class="ops-lede">' + esc(retention.note) + '</div><div class="as-table-wrap">' + table(['Category', 'Covers', 'Commonly cited period (confirm)'], retention.classes.map(function (c) {
        return '<tr><td><strong>' + esc(c.label) + '</strong></td><td class="fs-sm">' + esc(c.covers.join('; ')) + '</td><td class="fs-sm">' + esc(c.guidance) + '</td></tr>';
      })) + '</div>';
  }

  async function viewAudit(query) {
    var rows = await api('/audit' + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''));
    main.innerHTML = '<h2>Audit log</h2><div class="ops-lede">Every material change in VERGO Ops, and timesheet and status changes made in the older admin Bookings screen.</div>' +
      '<form class="as-filters" id="filters"><div class="as-filter-group"><label>Entity</label><select name="entityType">' + options(['Worker', 'OpsBooking', 'Booking', 'Client', 'DocumentTemplate', 'HistoricPayment', 'OpsSetting', 'Export'], query.entityType, 'Any') + '</select></div>' +
      '<div class="as-filter-group"><label>Action</label><input type="text" name="action" value="' + esc(query.action || '') + '" placeholder="e.g. RTW_CHECK_RECORDED"></div>' +
      '<div class="as-filter-group"><label>Admin</label><input type="text" name="actor" value="' + esc(query.actor || '') + '"></div></form>' +
      '<div class="as-table-wrap">' + table(['When', 'Who', 'Action', 'Entity', 'Change', 'Reason'], rows.map(function (a) {
        var link = a.entityType === 'Worker' ? '#/worker/' + a.entityId : a.entityType === 'OpsBooking' ? '#/booking/' + a.entityId : a.entityType === 'Client' ? '#/client/' + a.entityId : null;
        var change = (a.oldValue != null || a.newValue != null) ? '<details><summary class="fs-sm">view</summary><div class="ops-pre">' + (a.oldValue != null ? 'Before: ' + esc(JSON.stringify(a.oldValue, null, 1)) + '\n' : '') + (a.newValue != null ? 'After: ' + esc(JSON.stringify(a.newValue, null, 1)) : '') + '</div></details>' : '';
        return '<tr><td>' + when(a.at) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.entityType) + ' ' + (link ? '<a class="detail-link ops-mono" href="' + esc(link) + '">' + esc(a.entityId.slice(0, 10)) + '</a>' : '<span class="ops-mono">' + esc(a.entityId.slice(0, 14)) + '</span>') + '</td><td>' + change + '</td><td class="fs-sm">' + esc(a.reason || '') + '</td></tr>';
      }), 'No entries.') + '</div>';
    var form = main.querySelector('#filters');
    form.addEventListener('change', function () { setQuery('audit', Object.fromEntries(new FormData(form))); });
    form.addEventListener('submit', function (e) { e.preventDefault(); setQuery('audit', Object.fromEntries(new FormData(form))); });
  }

  async function viewSettings() {
    var both = await Promise.all([api('/settings'), api('/commercial-terms')]);
    var d = both[0], ct = both[1];
    var s = d.settings;
    var k = s.kidPayExample, t = s.clientCommercialTerms;
    var years = Object.keys(s.pensionThresholds).sort().reverse();
    main.innerHTML = '<h2>Ops settings</h2><div class="ops-lede">Current tax year: ' + esc(d.currentTaxYear) + '. These drive the pension review alerts only. Nothing here enrols anyone or makes a declaration.</div>' +
      '<div class="ops-card"><h3 style="margin-top:0">Workplace pension</h3><div class="ops-form" id="pension-settings">' +
        field('Pension duties start date', 'pensionDutiesStartDate', s.pensionDutiesStartDate, 'date', { hint: "VERGO's duties start (staging) date from The Pensions Regulator." }) +
        field('Pay frequency', 'payFrequency', s.payFrequency, 'select', { options: ['weekly', 'fortnightly', 'four_weekly', 'monthly'] }) +
        field('State Pension age', 'statePensionAge', s.statePensionAge, 'number') +
        '<div class="wide"><button class="btn btn-sm btn-primary" id="save-pension">Save</button></div></div></div>' +
      '<div class="ops-card"><h3 style="margin-top:0">Pension thresholds by tax year</h3><p class="text-muted fs-sm mb-2">Annual figures in pounds. Tick verified once checked against The Pensions Regulator.</p><div id="thresholds">' +
        table(['Tax year', 'Lower qualifying earnings', 'Earnings trigger', 'Upper qualifying earnings', 'Verified'], years.map(function (y) {
          var t = s.pensionThresholds[y];
          return '<tr data-year="' + esc(y) + '"><td>' + esc(y) + '</td><td><input class="as-input" data-k="lowerQualifyingAnnual" type="number" value="' + t.lowerQualifyingAnnual + '"></td><td><input class="as-input" data-k="earningsTriggerAnnual" type="number" value="' + t.earningsTriggerAnnual + '"></td><td><input class="as-input" data-k="upperQualifyingAnnual" type="number" value="' + t.upperQualifyingAnnual + '"></td><td><input type="checkbox" data-k="verified"' + (t.verified ? ' checked' : '') + '></td></tr>';
        })) + '</div><div class="ops-actions" style="margin-top:10px"><button class="btn btn-sm btn-ghost" id="add-year">Add ' + esc(d.currentTaxYear) + '</button><button class="btn btn-sm btn-primary" id="save-thresholds">Save thresholds</button></div></div>' +
      '<div class="ops-card"><h3 style="margin-top:0">Key Information Document: pay example</h3><p class="text-muted fs-sm mb-2">The representative payslip in the KID. Every figure is shown as illustrative. Leave a deduction empty to show it as depending on the worker\'s circumstances rather than inventing a tax result. Saving makes a new KID version (workers on the old one are flagged to be re-issued).</p><div class="ops-form" id="kid-example">' +
        field('Hours in the pay period', 'hours', k.hours, 'number') +
        field('Hourly base pay (£)', 'hourlyRate', k.hourlyRate, 'number', { hint: 'Never below the legal minimum that applies.' }) +
        field('Holiday pay %', 'holidayPayPercent', k.holidayPayPercent, 'number') +
        field('Income Tax (£, illustrative)', 'incomeTax', k.incomeTax, 'number') +
        field('Employee NI (£, illustrative)', 'employeeNi', k.employeeNi, 'number') +
        field('Pension (£, illustrative)', 'pension', k.pension, 'number') +
        field('Other deductions (£)', 'otherDeductions', k.otherDeductions, 'number') +
        field('Note shown under the example', 'note', k.note, 'text', { wide: true }) +
        '<div class="wide"><button class="btn btn-sm btn-primary" id="save-kid-example">Save and make new KID version</button></div></div></div>' +
      '<div class="ops-card"><h3 style="margin-top:0">Commercial terms (business Terms of Business) ' + (ct.reviewed ? chip('Reviewed by ' + ct.review.reviewedBy + ', ' + when(ct.review.reviewedAt), 'ok') : chip(ct.label, 'bad')) + '</h3>' +
        '<p class="text-muted fs-sm mb-2">Frozen into each Terms version. Saving a change makes a new Terms version marked as a material change, so clients must accept it, and needs the owner\'s review again before Terms can be issued. A transfer fee is only payable within the relevant period the Conduct Regulations allow, and the hirer always has the extended-hire option instead.</p><div class="ops-form" id="commercial">' +
        field('Payment terms (days after invoice)', 'paymentTermsDays', t.paymentTermsDays, 'number') +
        field('First booking paid in advance', 'firstBookingAdvancePayment', t.firstBookingAdvancePayment, 'checkbox') +
        field('Cancellation charges', 'cancellation', t.cancellation.map(function (c) { return c.withinHours + 'h:' + c.percent + '%'; }).join(', '), 'text', { wide: true, hint: 'Within N hours of the start : % of the cancelled charges, e.g. "48h:10%, 24h:25%". Earlier notice is free.' }) +
        field('No-show replacement window (minutes)', 'replacementWindowMinutes', t.replacementWindowMinutes, 'number') +
        field('Transfer fee (% of anticipated gross remuneration)', 'transferFeePercent', t.transferFeePercent, 'number') +
        field('Transfer fee basis (months of remuneration)', 'transferFeeRemunerationMonths', t.transferFeeRemunerationMonths, 'number') +
        field('Extended hire option (weeks)', 'extendedHireWeeks', t.extendedHireWeeks, 'number') +
        '<div class="wide ops-actions"><button class="btn btn-sm btn-primary" id="save-commercial">Save and make new Terms version</button>' +
        (ct.reviewed ? '' : '<button class="btn btn-sm btn-warning" id="review-commercial">I am the owner and have reviewed these terms</button>') + '</div></div></div>';

    main.querySelector('#save-kid-example').addEventListener('click', async function () {
      var f = readForm(main.querySelector('#kid-example'));
      try {
        var r = await api('/settings/kidPayExample', { method: 'PUT', body: { value: f } });
        toast('Saved' + (r.newVersion ? '; KID is now v' + r.newVersion.version : '')); viewSettings();
      } catch (err) { fail(err); }
    });
    main.querySelector('#save-commercial').addEventListener('click', async function () {
      var f = readForm(main.querySelector('#commercial'));
      try {
        f.cancellation = String(f.cancellation || '').split(',').map(function (part) {
          var m = part.trim().match(/^(\d+)\s*h?\s*:\s*(\d+(?:\.\d+)?)\s*%?$/i);
          if (!m) throw new Error('Cancellation charges should look like "48h:10%, 24h:25%".');
          return { withinHours: Number(m[1]), percent: Number(m[2]) };
        });
        if (!(await confirmDialog('Saving makes a new Terms of Business version. Clients will need to accept it, and the owner must review the terms again. Continue?', 'Save'))) return;
        var r = await api('/settings/clientCommercialTerms', { method: 'PUT', body: { value: f } });
        toast('Saved' + (r.newVersion ? '; Terms are now v' + r.newVersion.version : '')); viewSettings();
      } catch (err) { fail(err); }
    });
    var reviewBtn = main.querySelector('#review-commercial');
    if (reviewBtn) reviewBtn.addEventListener('click', async function () {
      if (!(await confirmDialog('Confirm you are the owner and have reviewed the payment, cancellation, no-show, transfer fee and extended hire terms shown. This is recorded in the audit log.', 'Confirm review'))) return;
      try { await api('/commercial-terms/review', { method: 'POST', body: { confirm: true } }); toast('Review recorded'); viewSettings(); } catch (err) { fail(err); }
    });

    main.querySelector('#save-pension').addEventListener('click', async function () {
      var f = readForm(main.querySelector('#pension-settings'));
      try {
        await api('/settings/pensionDutiesStartDate', { method: 'PUT', body: { value: f.pensionDutiesStartDate } });
        await api('/settings/payFrequency', { method: 'PUT', body: { value: f.payFrequency } });
        await api('/settings/statePensionAge', { method: 'PUT', body: { value: f.statePensionAge } });
        toast('Saved'); viewSettings();
      } catch (err) { fail(err); }
    });
    var addYear = main.querySelector('#add-year');
    if (s.pensionThresholds[d.currentTaxYear]) addYear.remove();
    else addYear.addEventListener('click', async function () {
      var latest = s.pensionThresholds[years[0]] || { lowerQualifyingAnnual: 0, earningsTriggerAnnual: 0, upperQualifyingAnnual: 0 };
      var next = Object.assign({}, s.pensionThresholds);
      next[d.currentTaxYear] = Object.assign({}, latest, { verified: false });
      try { await api('/settings/pensionThresholds', { method: 'PUT', body: { value: next } }); toast('Added ' + d.currentTaxYear + ' (copied, unverified): check the figures'); viewSettings(); } catch (err) { fail(err); }
    });
    main.querySelector('#save-thresholds').addEventListener('click', async function () {
      var value = {};
      main.querySelectorAll('#thresholds tr[data-year]').forEach(function (tr) {
        var row = {};
        tr.querySelectorAll('[data-k]').forEach(function (inp) { row[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value); });
        value[tr.dataset.year] = row;
      });
      try { await api('/settings/pensionThresholds', { method: 'PUT', body: { value: value } }); toast('Saved'); viewSettings(); } catch (err) { fail(err); }
    });
  }

  // ── Rota ────────────────────────────────────────────────────────────────
  // One week: people down, days across, from the same assignments as the
  // Bookings screen. Places still to fill are listed under each day.

  function shortDay(ymd) {
    var d = new Date(ymd + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  async function viewRota(query) {
    var d = await api('/rota' + (query.week ? '?week=' + encodeURIComponent(query.week) : ''));
    var today = todayLondon();
    var head = '<tr><th>Person</th>' + d.days.map(function (k) {
      return '<th class="' + (k === today ? 'ops-today' : '') + '">' + esc(shortDay(k)) + '</th>';
    }).join('') + '</tr>';
    var shiftCell = function (s) {
      var link = s.opsBookingId ? '#/booking/' + s.opsBookingId : null;
      return '<' + (link ? 'a href="' + esc(link) + '"' : 'div') + ' class="ops-rota-shift">' +
        '<strong>' + esc(s.start + '–' + s.finish) + '</strong>' +
        '<span>' + esc([s.role, s.client || s.venue].filter(Boolean).join(' · ') || '—') + '</span>' +
        (s.status !== 'CONFIRMED' && s.status !== 'COMPLETED' ? chip(ASSIGNMENT_WORDS[s.status] || words(s.status), CHIPS.assignment[s.status]) : '') +
        '</' + (link ? 'a' : 'div') + '>';
    };
    var rows = d.people.map(function (p) {
      return '<tr><td><a class="detail-link" href="#/worker/' + esc(p.id) + '">' + esc(p.name) + '</a></td>' + d.days.map(function (k) {
        return '<td class="' + (k === today ? 'ops-today' : '') + '">' + (p.days[k] || []).map(shiftCell).join('') + '</td>';
      }).join('') + '</tr>';
    });
    var gaps = d.days.filter(function (k) { return (d.shortfalls[k] || []).length; }).map(function (k) {
      return '<div class="ops-rota-gap-day"><div class="ops-field-label">' + esc(shortDay(k)) + '</div>' + d.shortfalls[k].map(function (g) {
        return '<a class="ops-rota-gap" href="#/booking/' + esc(g.opsBookingId) + '"><strong>' + esc(g.reference) + '</strong> ' + esc(g.client) +
          ' · ' + esc(g.start + '–' + g.finish) + ' ' + chip(g.unfilled + ' to fill', 'warn') + '</a>';
      }).join('') + '</div>';
    }).join('');

    main.innerHTML = '<div class="ops-head"><div><h2>Rota</h2><div class="ops-lede">Week of ' + day(d.week) + '. Cancelled and declined shifts are hidden.</div></div>' +
      '<div class="ops-actions"><a class="btn btn-ghost btn-sm" href="#/rota?week=' + esc(d.previousWeek) + '">← Previous</a>' +
      '<a class="btn btn-ghost btn-sm" href="#/rota">This week</a>' +
      '<a class="btn btn-ghost btn-sm" href="#/rota?week=' + esc(d.nextWeek) + '">Next →</a>' +
      '<input type="date" id="rota-jump" class="as-input" style="width:auto" value="' + esc(d.week) + '" aria-label="Jump to week"></div></div>' +
      '<div class="as-table-wrap ops-rota">' + (rows.length
        ? '<div class="ops-scroll"><table class="ops-table"><thead>' + head + '</thead><tbody>' + rows.join('') + '</tbody></table></div>'
        : '<div class="ops-empty">Nobody is rostered this week.</div>') + '</div>' +
      '<h3>Still to fill</h3>' + (gaps || '<div class="ops-empty">Every booking this week has its places filled.</div>');
    main.querySelector('#rota-jump').addEventListener('change', function (e) { if (e.target.value) setQuery('rota', { week: e.target.value }); });
  }

  // ── Leads ───────────────────────────────────────────────────────────────
  // Companies approached for work, before they are clients. Converting one
  // creates the client and keeps the link.

  var LEAD_STAGES = ['CONTACTED', 'REPLIED', 'WON', 'LOST'];
  var LEAD_CHANNELS = [['EMAIL', 'Email'], ['PHONE', 'Phone'], ['IN_PERSON', 'In person'], ['OTHER', 'Other']];
  var LEAD_CHIP = { CONTACTED: 'info', REPLIED: 'warn', WON: 'ok', LOST: 'muted' };

  function leadFields(l) {
    l = l || {};
    return field('Company', 'company', l.company, 'text', { required: true }) +
      field('Contact name', 'contactName', l.contactName) +
      field('Contact email', 'contactEmail', l.contactEmail, 'email') +
      field('Contact phone', 'contactPhone', l.contactPhone) +
      field('Last contacted', 'contactedOn', l.contactedOn || todayLondon(), 'date', { required: true }) +
      field('How', 'channel', l.channel || 'EMAIL', 'select', { options: LEAD_CHANNELS }) +
      field('Stage', 'stage', l.stage || 'CONTACTED', 'select', { options: LEAD_STAGES }) +
      field('Notes', 'notes', l.notes, 'textarea', { wide: true });
  }

  async function viewLeads(query) {
    var params = new URLSearchParams(query).toString();
    var leads = await api('/leads' + (params ? '?' + params : ''));
    var count = function (s) { return leads.filter(function (l) { return l.stage === s; }).length; };
    main.innerHTML = '<div class="ops-head"><div><h2>Leads</h2><div class="ops-lede">Companies you have approached for work. A lead is not a client until it is converted, so prospects stay out of the booking list.</div></div><button class="btn btn-primary" id="new-lead">Add lead</button></div>' +
      (query.stage ? '' : '<div class="kpi-grid ops-kpis">' + LEAD_STAGES.map(function (s) {
        return kpi(words(s), count(s), null, s === 'WON' ? 'success' : s === 'REPLIED' ? 'warning' : null, '#/leads?stage=' + s);
      }).join('') + '</div>') +
      '<form class="as-filters" id="filters"><div class="as-filter-group"><label>Search</label><input type="search" name="search" value="' + esc(query.search || '') + '" placeholder="Company, contact"></div>' +
      '<div class="as-filter-group"><label>Stage</label><select name="stage">' + options(LEAD_STAGES, query.stage, 'Any') + '</select></div></form>' +
      '<div class="as-table-wrap">' + table(['Company', 'Contact', 'Last contacted', 'How', 'Stage', ''], leads.map(function (l) {
        return '<tr><td><strong>' + esc(l.company) + '</strong>' + (l.notes ? '<div class="text-muted fs-sm">' + esc(l.notes.length > 90 ? l.notes.slice(0, 90) + '…' : l.notes) + '</div>' : '') + '</td>' +
          '<td>' + esc(l.contactName || '—') + (l.contactEmail ? '<div class="text-muted fs-sm">' + esc(l.contactEmail) + '</div>' : '') + (l.contactPhone ? '<div class="text-muted fs-sm">' + esc(l.contactPhone) + '</div>' : '') + '</td>' +
          '<td>' + day(l.contactedOn) + '</td><td>' + esc(words(l.channel)) + '</td><td>' + chip(words(l.stage), LEAD_CHIP[l.stage]) + '</td>' +
          '<td class="ops-actions">' + (l.client
            ? '<a class="btn btn-sm btn-ghost" href="#/client/' + esc(l.client.id) + '">Client: ' + esc(l.client.companyName) + '</a>'
            : '<button class="btn btn-sm btn-success" data-convert="' + esc(l.id) + '">Make client</button>') +
          '<button class="btn btn-sm btn-ghost" data-edit-lead="' + esc(l.id) + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger-quiet" data-del-lead="' + esc(l.id) + '">Delete</button></td></tr>';
      }), query.stage || query.search ? 'No leads match.' : 'No leads yet. Add the companies you reach out to.') + '</div>';

    var byId = {};
    leads.forEach(function (l) { byId[l.id] = l; });
    var form = main.querySelector('#filters');
    form.addEventListener('change', function () { setQuery('leads', Object.fromEntries(new FormData(form))); });
    form.addEventListener('submit', function (e) { e.preventDefault(); setQuery('leads', Object.fromEntries(new FormData(form))); });
    var reload = function () { return viewLeads(query); };
    main.querySelector('#new-lead').addEventListener('click', function () {
      openModal('Add lead', '<div class="ops-form">' + leadFields() + '</div>', [{ label: 'Add lead', onClick: async function (b) {
        await api('/leads', { method: 'POST', body: compact(readForm(b)) }); toast('Lead added'); reload();
      } }]);
    });
    on(main, '[data-edit-lead]', 'click', function (_e, el) {
      openModal('Edit lead', '<div class="ops-form">' + leadFields(byId[el.dataset.editLead]) + '</div>', [{ label: 'Save', onClick: async function (b) {
        await api('/leads/' + el.dataset.editLead, { method: 'PATCH', body: readForm(b) }); toast('Saved'); reload();
      } }]);
    });
    on(main, '[data-del-lead]', 'click', async function (_e, el) {
      if (!(await confirmDialog('Delete the lead for ' + byId[el.dataset.delLead].company + '? A client made from it is kept.', 'Delete', true))) return;
      try { await api('/leads/' + el.dataset.delLead, { method: 'DELETE' }); toast('Lead deleted'); reload(); } catch (err) { fail(err); }
    });
    on(main, '[data-convert]', 'click', function (_e, el) {
      var l = byId[el.dataset.convert];
      openModal('Make ' + l.company + ' a client', '<p class="mb-2">Creates an approved client from this lead and marks the lead won. They get no portal login until they set a password.</p><div class="ops-form">' +
        field('Client email', 'email', l.contactEmail, 'email', { required: true, wide: true, hint: 'A client needs a unique email.' }) + '</div>',
        [{ label: 'Make client', kind: 'btn-success', onClick: async function (b) {
          var made = await api('/leads/' + l.id + '/convert', { method: 'POST', body: compact(readForm(b)) });
          toast(made.companyName + ' is now a client'); location.hash = '#/client/' + made.clientId;
        } }]);
    });
  }

  // ── Running order (on a booking) ────────────────────────────────────────
  // What happens when on the day. Not shifts: editing it never changes pay.

  async function loadRunningOrder(bookingId, reference) {
    var slot = main.querySelector('#running-order');
    if (!slot) return;
    var items;
    try { items = await api('/bookings/' + encodeURIComponent(bookingId) + '/schedule'); } catch (err) { slot.innerHTML = alertBox('danger', 'Could not load the running order: ' + err.message); return; }
    var byId = {};
    items.forEach(function (i) { byId[i.id] = i; });
    var lineFields = function (i) {
      i = i || {};
      return field('Time', 'time', i.time, 'time', { hint: 'Leave empty for a note with no fixed time.' }) +
        field('What happens', 'title', i.title, 'text', { required: true }) +
        field('Who', 'assignee', i.assignee) +
        field('Notes', 'notes', i.notes, 'textarea', { wide: true });
    };
    slot.innerHTML = '<div class="ops-head"><h3 style="margin:0">Running order</h3><div class="ops-actions">' +
      (items.length ? '<button class="btn btn-sm btn-ghost" id="print-ro">Print</button>' : '') +
      '<button class="btn btn-sm btn-primary" id="add-ro">Add line</button></div></div>' +
      table(['Time', 'What happens', 'Who', 'Notes', ''], items.map(function (i) {
        return '<tr><td class="ops-mono">' + esc(i.time || '—') + '</td><td><strong>' + esc(i.title) + '</strong></td><td>' + esc(i.assignee || '') + '</td><td class="fs-sm">' + esc(i.notes || '') + '</td>' +
          '<td class="ops-actions"><button class="btn btn-sm btn-ghost" data-edit-ro="' + esc(i.id) + '">Edit</button><button class="btn btn-sm btn-danger-quiet" data-del-ro="' + esc(i.id) + '">Remove</button></td></tr>';
      }), 'No running order yet: arrival, briefing, doors, service, pack-down.');
    var reload = function () { return loadRunningOrder(bookingId, reference); };
    slot.querySelector('#add-ro').addEventListener('click', function () {
      openModal('Add to running order', '<div class="ops-form">' + lineFields() + '</div>', [{ label: 'Add', onClick: async function (b) {
        await api('/bookings/' + bookingId + '/schedule', { method: 'POST', body: compact(readForm(b)) }); reload();
      } }]);
    });
    on(slot, '[data-edit-ro]', 'click', function (_e, el) {
      openModal('Edit line', '<div class="ops-form">' + lineFields(byId[el.dataset.editRo]) + '</div>', [{ label: 'Save', onClick: async function (b) {
        await api('/schedule/' + el.dataset.editRo, { method: 'PATCH', body: readForm(b) }); reload();
      } }]);
    });
    on(slot, '[data-del-ro]', 'click', async function (_e, el) {
      if (!(await confirmDialog('Remove "' + byId[el.dataset.delRo].title + '" from the running order?', 'Remove', true))) return;
      try { await api('/schedule/' + el.dataset.delRo, { method: 'DELETE' }); reload(); } catch (err) { fail(err); }
    });
    var printBtn = slot.querySelector('#print-ro');
    if (printBtn) printBtn.addEventListener('click', function () {
      var w = window.open('', '_blank');
      if (!w) return fail(new Error('Allow pop-ups to print the running order.'));
      w.document.write('<!doctype html><meta charset="utf-8"><title>Running order ' + esc(reference) + '</title>' +
        '<style>body{font:14px/1.4 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:8px;text-align:left;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#555}</style>' +
        '<h1>Running order · ' + esc(reference) + '</h1><table><tr><th>Time</th><th>What happens</th><th>Who</th><th>Notes</th></tr>' +
        items.map(function (i) { return '<tr><td>' + esc(i.time || '') + '</td><td>' + esc(i.title) + '</td><td>' + esc(i.assignee || '') + '</td><td>' + esc(i.notes || '') + '</td></tr>'; }).join('') +
        '</table>');
      w.document.close();
      w.focus();
      w.print();
    });
  }

  // ── Router ──────────────────────────────────────────────────────────────

  var ROUTES = {
    dashboard: viewDashboard, workers: viewWorkers, worker: viewWorker, rtw: viewRtw,
    clients: viewClients, client: viewClient, bookings: viewBookings, booking: viewBooking,
    rota: viewRota, leads: viewLeads,
    timesheets: viewTimesheets, documents: viewDocuments, awr: viewAwr, 'direct-hire': viewDirectHire,
    payroll: viewPayroll, exports: viewExports, audit: viewAudit, settings: viewSettings,
  };
  var NAV_OF = { worker: 'workers', client: 'clients', booking: 'bookings' };

  async function route() {
    var hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    var qIndex = hash.indexOf('?');
    var pathPart = qIndex >= 0 ? hash.slice(0, qIndex) : hash;
    var query = parseQuery(qIndex >= 0 ? hash.slice(qIndex + 1) : '');
    var parts = pathPart.split('/');
    var name = ROUTES[parts[0]] ? parts[0] : 'dashboard';
    document.querySelectorAll('#ops-subnav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.route === (NAV_OF[name] || name));
    });
    closeModal();
    main.innerHTML = '<div class="as-skeleton" style="max-width:240px"></div>';
    try {
      await ROUTES[name](parts[1] ? decodeURIComponent(parts[1]) : query, query);
      document.title = 'VERGO Ops · ' + words(NAV_OF[name] || name);
    } catch (err) {
      main.innerHTML = alertBox('danger', 'Could not load this page: ' + (err.message || err));
    }
  }

  window.addEventListener('hashchange', route);
  AdminCore.checkAuth().then(function (session) { if (session) route(); });
})();
