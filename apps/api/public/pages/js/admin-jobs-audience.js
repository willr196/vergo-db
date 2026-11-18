/**
 * Admin > Jobs: "Who sees it". A job is shown to everyone on the job board,
 * or only to the staff picked here. Picking someone invites them (the app
 * shows it under their invites, the website on their job board); "Email them"
 * also sends the invite email to anyone newly picked.
 *
 * API: GET/PUT /api/v1/admin/matching/:jobId/audience
 */
(function () {
  'use strict';

  var modal = document.getElementById('audience-modal');
  if (!modal) return;
  var state = { jobId: null, job: null, staff: [], picked: {}, invitedIds: [] };
  var searchTimer = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function alertBox(message, type) {
    $('audience-alert').innerHTML = message ? '<div class="alert alert-' + (type || 'error') + '">' + esc(message) + '</div>' : '';
  }

  function filters() {
    var p = new URLSearchParams();
    var v = function (id) { return ($(id).value || '').trim(); };
    if (v('aud-search')) p.set('search', v('aud-search'));
    if (v('aud-role')) p.set('role', v('aud-role'));
    if (v('aud-area')) p.set('area', v('aud-area'));
    if (v('aud-status')) p.set('status', v('aud-status'));
    if (v('aud-rating')) p.set('minRating', v('aud-rating'));
    if ($('aud-free').checked) p.set('freeOnDay', '1');
    return p.toString();
  }

  async function load(firstTime) {
    $('aud-list').innerHTML = '<div class="drawer-loading">Loading staff…</div>';
    try {
      var res = await fetch('/api/v1/admin/matching/' + encodeURIComponent(state.jobId) + '/audience?' + filters(), { credentials: 'include' });
      var body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load staff');
      var d = body.data;
      state.job = d.job;
      state.staff = d.staff;
      if (firstTime) {
        state.picked = {};
        d.invitedIds.forEach(function (id) { state.picked[id] = true; });
        state.invitedIds = d.invitedIds;
        $('audience-title').textContent = 'Who sees "' + d.job.title + '"';
        $('aud-mode-all').checked = !d.job.inviteOnly;
        $('aud-mode-picked').checked = d.job.inviteOnly;
        var roleSel = $('aud-role');
        roleSel.innerHTML = '<option value="">Any role</option>' + d.roles.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');
        $('aud-free').disabled = !d.job.eventDate;
        $('aud-free-label').title = d.job.eventDate ? '' : 'This job has no date yet';
      }
      render();
    } catch (err) {
      $('aud-list').innerHTML = '';
      alertBox(err.message);
    }
  }

  function render() {
    var picking = $('aud-mode-picked').checked;
    $('aud-picker').classList.toggle('aud-disabled', !picking);
    var count = Object.keys(state.picked).length;
    $('aud-count').textContent = picking
      ? count + (count === 1 ? ' person picked' : ' people picked') + '. Only they will see this job.'
      : 'Everyone on the job board can see this job.' + (count ? ' ' + count + ' already invited.' : '');
    if (!state.staff.length) {
      $('aud-list').innerHTML = '<p class="text-muted fs-sm">No staff match these filters.</p>';
      return;
    }
    $('aud-list').innerHTML = state.staff.map(function (p) {
      var bits = [];
      if (p.roles.length) bits.push(p.roles.join(', '));
      if (p.postcode) bits.push(p.postcode);
      bits.push({ AVAILABLE: 'Taking work', LIMITED: 'Taking some work', UNAVAILABLE: 'Not taking work' }[p.availabilityStatus] || p.availabilityStatus);
      if (p.rating) bits.push('★ ' + p.rating);
      if (p.freeOnDay) bits.push('Free that day');
      var tag = p.invite && p.invite !== 'PENDING' ? ' <span class="aud-tag">' + esc(p.invite.toLowerCase()) + '</span>' : '';
      return '<label class="aud-row"><input type="checkbox" data-aud-id="' + esc(p.id) + '"' + (state.picked[p.id] ? ' checked' : '') + (picking ? '' : ' disabled') + '>' +
        '<span><strong>' + esc(p.name) + '</strong>' + tag + '<small>' + esc(bits.join(' · ')) + '</small></span></label>';
    }).join('');
  }

  async function save() {
    var picking = $('aud-mode-picked').checked;
    var ids = Object.keys(state.picked);
    if (picking && !ids.length) return alertBox('Pick at least one person, or choose "Everyone".');
    var button = $('aud-save');
    button.disabled = true;
    alertBox('');
    try {
      var res = await fetch('/api/v1/admin/matching/' + encodeURIComponent(state.jobId) + '/audience', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteOnly: picking, userIds: picking ? ids : ids, notify: $('aud-notify').checked, note: $('aud-note').value.trim() || undefined })
      });
      var body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save');
      var d = body.data;
      var msg = picking
        ? 'Saved. ' + d.invited + (d.invited === 1 ? ' person' : ' people') + ' can see this job.' + (d.emailed ? ' ' + d.emailed + ' emailed.' : '')
        : 'Saved. Everyone on the job board can see this job.';
      alertBox(msg, 'success');
      state.invitedIds = ids;
      if (typeof window.onAudienceSaved === 'function') window.onAudienceSaved();
    } catch (err) {
      alertBox(err.message);
    } finally {
      button.disabled = false;
    }
  }

  window.openAudienceModal = function (jobId) {
    state.jobId = jobId;
    alertBox('');
    ['aud-search', 'aud-area', 'aud-note'].forEach(function (id) { $(id).value = ''; });
    $('aud-status').value = '';
    $('aud-rating').value = '';
    $('aud-free').checked = false;
    $('aud-notify').checked = true;
    modal.classList.remove('d-none');
    load(true);
  };
  function close() { modal.classList.add('d-none'); }

  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-action="close-audience"]')) return close();
    if (e.target.closest('#aud-save')) return save();
    if (e.target.closest('#aud-pick-all')) {
      state.staff.forEach(function (p) { state.picked[p.id] = true; });
      return render();
    }
    if (e.target.closest('#aud-pick-none')) {
      state.staff.forEach(function (p) { delete state.picked[p.id]; });
      return render();
    }
  });
  modal.addEventListener('change', function (e) {
    var box = e.target.closest('[data-aud-id]');
    if (box) {
      if (box.checked) state.picked[box.getAttribute('data-aud-id')] = true;
      else delete state.picked[box.getAttribute('data-aud-id')];
      return render();
    }
    if (e.target.name === 'aud-mode') return render();
    if (e.target.closest('.aud-filters')) load(false);
  });
  modal.addEventListener('input', function (e) {
    if (!e.target.matches('#aud-search, #aud-area')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { load(false); }, 300);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('d-none')) close();
  });
})();
