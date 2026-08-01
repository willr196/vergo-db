(function () {
  'use strict';

  function formatRate(amount) {
    var fixed = Number(amount).toFixed(2);
    return '£' + fixed.replace(/\.00$/, '');
  }

  function vatSuffix(vatRegistered) {
    return vatRegistered ? ' + VAT' : '';
  }

  fetch('/api/v1/rates')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (payload) {
      if (!payload || !payload.ok || !payload.data) return;
      var d = payload.data;
      var suffix = vatSuffix(d.vatRegistered);

      var headline = document.getElementById('rates-headline');
      if (headline) headline.textContent = 'From ' + formatRate(d.standardRate) + '/hr' + suffix;

      var figure = document.getElementById('rates-figure');
      if (figure) figure.textContent = formatRate(d.standardRate) + '/hr';

      var caption = document.getElementById('rates-caption');
      if (caption) {
        caption.textContent = 'per hour, per person' + (d.vatRegistered ? ', plus VAT.' : '.') +
          ' One rate across waiting staff, bar staff, kitchen porters, runners and hosts.';
      }

      var tierList = document.getElementById('rates-tier-list');
      if (tierList) {
        tierList.innerHTML =
          '<li>Under ' + d.volumeThreshold + ' staff on one booking: ' + formatRate(d.standardRateBelowThreshold) + '/hr per person' + suffix + '</li>' +
          '<li>' + d.volumeThreshold + '+ staff on one booking: ' + formatRate(d.volumeRate) + '/hr per person' + suffix + '</li>';
      }

      var detailList = document.getElementById('rates-detail-list');
      if (detailList) {
        detailList.innerHTML =
          '<li>' + d.minimumChargeHours + '-hour minimum charge per person, per booking</li>' +
          '<li>+' + Math.round((d.afterMidnightMultiplier - 1) * 100) + '% after midnight</li>' +
          '<li>No booking fees, uniform charges or other surcharges beyond what\'s set out here</li>';
      }
    })
    .catch(function () {
      var headline = document.getElementById('rates-headline');
      if (headline) headline.textContent = 'Rates unavailable right now — please call or email us.';
    });
})();
