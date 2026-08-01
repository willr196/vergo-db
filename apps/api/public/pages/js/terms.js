(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderSection(container, section) {
    var html = '';
    if (section.items && section.items.length) {
      html += '<ul class="check-list">' + section.items.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }
    if (section.note) {
      html += '<p>' + escapeHtml(section.note) + '</p>';
    }
    if (html) {
      var heading = container.querySelector('h2');
      container.innerHTML = '';
      if (heading) container.appendChild(heading);
      container.insertAdjacentHTML('beforeend', html);
    }
  }

  fetch('/api/v1/terms')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (payload) {
      if (!payload || !payload.ok || !payload.data) return;
      var data = payload.data;

      var versionNote = document.getElementById('terms-version-note');
      if (versionNote && data.version && data.effectiveDate) {
        var effective = new Date(data.effectiveDate);
        var effectiveDisplay = isNaN(effective.getTime())
          ? data.effectiveDate
          : effective.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        versionNote.textContent = 'Version ' + data.version + ' — last updated ' + effectiveDisplay;
      }

      (data.sections || []).forEach(function (section) {
        var container = document.getElementById('terms-section-' + section.key);
        if (container) renderSection(container, section);
      });
    })
    .catch(function () {
      // Fall back silently to the static markup already in the page.
    });
})();
