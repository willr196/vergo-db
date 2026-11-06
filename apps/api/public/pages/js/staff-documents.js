/**
 * /staff/documents: read the Key Information Document and confirm it arrived,
 * then read and agree the employment agreement by typing their name. The
 * office issues both from Ops; the API records how and when they were done.
 */
(function () {
  'use strict';
  var S = window.VergoStaff;
  var API = '/api/v1/user/documents';
  var state = null;
  var list = document.getElementById('docList');
  var reader = document.getElementById('reader');
  var readerForm = document.getElementById('readerForm');

  /** The document text: "# " and "## " headings, "- " list items, blank lines between paragraphs. */
  function renderBody(text) {
    var out = [];
    var items = [];
    function flush() { if (items.length) { out.push('<ul>' + items.join('') + '</ul>'); items = []; } }
    String(text || '').split(/\n{2,}/).forEach(function (block) {
      block.split('\n').forEach(function (line) {
        if (/^## /.test(line)) { flush(); out.push('<h4>' + S.esc(line.slice(3)) + '</h4>'); }
        else if (/^# /.test(line)) { flush(); out.push('<h3>' + S.esc(line.slice(2)) + '</h3>'); }
        else if (/^- /.test(line)) { items.push('<li>' + S.esc(line.slice(2)) + '</li>'); }
        else if (line.trim()) { flush(); out.push('<p>' + S.esc(line) + '</p>'); }
      });
      flush();
    });
    return out.join('');
  }

  function render() {
    var rows = [];
    if (state.kid) {
      var kidDone = !!state.kid.acknowledgedAt;
      rows.push('<li class="staff-item"><h3>Key Information Document' + S.statusTag(kidDone ? 'Received' : 'To read', kidDone ? 'good' : '') + '</h3>' +
        '<p>Version ' + S.esc(state.kid.version) + ', sent ' + S.esc(S.day(state.kid.issuedAt)) + (kidDone ? '. You confirmed it on ' + S.esc(S.day(state.kid.acknowledgedAt)) : '') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn ' + (kidDone ? 'btn-secondary' : 'btn-primary') + '" data-open="kid">' + (kidDone ? 'Read again' : 'Read it') + '</button></div></li>');
    }
    if (state.agreement) {
      var agreed = !!state.agreement.acceptedAt;
      rows.push('<li class="staff-item"><h3>Employment agreement' + S.statusTag(agreed ? 'Agreed' : 'To agree', agreed ? 'good' : '') + '</h3>' +
        '<p>Version ' + S.esc(state.agreement.version) + ', sent ' + S.esc(S.day(state.agreement.issuedAt)) +
        (agreed ? '. You agreed it as "' + S.esc(state.agreement.acceptedName) + '" on ' + S.esc(S.day(state.agreement.acceptedAt)) : '') +
        (state.agreement.replacesVersion ? '. It replaces version ' + S.esc(state.agreement.replacesVersion) : '') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn ' + (agreed ? 'btn-secondary' : 'btn-primary') + '" data-open="agreement">' + (agreed ? 'Read again' : 'Read and agree') + '</button></div></li>');
    }
    list.innerHTML = rows.join('');
    document.getElementById('docsEmpty').hidden = rows.length > 0;

    var conf = state.confirmations || [];
    document.getElementById('confirmationsHeading').hidden = !conf.length;
    document.getElementById('confirmationList').innerHTML = conf.map(function (c) {
      return '<li class="staff-item"><h3>' + S.esc(c.role || 'Shift') + '</h3><p>' + S.esc(S.day(c.date)) + (c.start ? ', from ' + S.esc(c.start) : '') + (c.venue ? ', ' + S.esc(c.venue) : '') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn btn-secondary" data-open-id="' + S.esc(c.id) + '">Read</button></div></li>';
    }).join('');
  }

  function load() {
    return S.request('GET', API).then(function (r) {
      if (r.status !== 200) throw new Error('load');
      state = r.body.data;
      render();
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('docsStatus', 'Could not load your documents. Refresh to try again.', 'error');
    });
  }

  /** Opens a document; kind 'kid' or 'agreement' adds the step it needs. */
  function open(id, kind) {
    S.request('GET', API + '/' + encodeURIComponent(id)).then(function (r) {
      if (r.status !== 200) { S.show('docsStatus', r.body.error || 'Could not open that document.', 'error'); return; }
      var doc = r.body.data;
      document.getElementById('readerTitle').textContent = doc.title + ' (version ' + doc.version + ')';
      document.getElementById('readerBody').innerHTML = renderBody(doc.body);
      var html = '';
      if (kind === 'kid' && !doc.acknowledgedAt) {
        html = '<div class="form-field staff-terms"><label class="checkbox-line"><input type="checkbox" name="confirm"><span>' + S.esc(state.statements.kidAcknowledgement) + '</span></label></div>' +
          '<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Confirm I have received it</button></div>';
      } else if (kind === 'agreement' && !doc.acceptedAt) {
        var kidPending = state.kid && !state.kid.acknowledgedAt;
        html = kidPending
          ? '<p class="form-hint form-hint-block">Read your Key Information Document and confirm it first, then come back to agree this.</p>'
          : '<div class="form-field staff-terms"><label class="checkbox-line"><input type="checkbox" name="confirm"><span>' + S.esc(state.statements.agreement) + '</span></label></div>' +
            '<div class="form-field"><label for="typedName">Type your full name to sign</label><input type="text" id="typedName" name="typedName" autocomplete="name" maxlength="200"></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Agree and sign</button></div>';
      }
      readerForm.innerHTML = html + '<div class="form-status" id="readerStatus" role="status" hidden></div>';
      readerForm.dataset.kind = kind || '';
      readerForm.dataset.id = id;
      reader.hidden = false;
      reader.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }).catch(function () {});
  }

  list.addEventListener('click', function (event) {
    var b = event.target.closest('[data-open]');
    if (!b) return;
    var kind = b.getAttribute('data-open');
    open((kind === 'kid' ? state.kid : state.agreement).id, kind);
  });
  document.getElementById('confirmationList').addEventListener('click', function (event) {
    var b = event.target.closest('[data-open-id]');
    if (b) open(b.getAttribute('data-open-id'), '');
  });

  readerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var kind = readerForm.dataset.kind;
    var id = readerForm.dataset.id;
    var tick = readerForm.elements.confirm;
    if (!tick || !tick.checked) return S.show('readerStatus', 'Tick the box to confirm.', 'error');
    var call;
    if (kind === 'kid') {
      call = S.request('POST', API + '/kid/' + encodeURIComponent(id) + '/acknowledge', { acknowledged: true });
    } else {
      var name = readerForm.elements.typedName.value.trim();
      if (name.length < 2) return S.show('readerStatus', 'Type your full name to sign.', 'error');
      call = S.request('POST', API + '/agreement/' + encodeURIComponent(id) + '/accept', { agree: true, typedName: name });
    }
    var button = readerForm.querySelector('button[type="submit"]');
    button.disabled = true;
    call.then(function (r) {
      if (r.status === 200) {
        reader.hidden = true;
        var agreementWaiting = state.agreement && !state.agreement.acceptedAt;
        S.show('docsStatus', kind === 'kid'
          ? (agreementWaiting ? 'Thank you. Now read and agree your employment agreement.' : 'Thank you, that is recorded.')
          : 'Agreement signed. Thank you.', 'success');
        return load();
      }
      S.show('readerStatus', r.body.error || 'That did not go through. Try again.', 'error');
      button.disabled = false;
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('readerStatus', 'Could not reach VERGO. Try again.', 'error');
      button.disabled = false;
    });
  });

  load();
})();
