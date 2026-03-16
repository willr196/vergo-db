(function () {
  'use strict';

  const rates = {
    standard: 22,
    chef: 26,
  };

  const roleLabels = {
    standard: 'bartender / waiter / FOH / runner cover',
    chef: 'chef cover',
  };

  const tierField = document.getElementById('calc-tier');
  const roleField = document.getElementById('calc-role');
  const headcountField = document.getElementById('calc-headcount');
  const hoursField = document.getElementById('calc-hours');
  const standardRateWrap = document.getElementById('calc-standard-rate-wrap');
  const standardRateField = document.getElementById('calc-standard-rate');
  const standardRateNote = document.getElementById('calc-standard-note');
  const tierBadge = document.getElementById('calc-tier-badge');
  const total = document.getElementById('calc-total');
  const summary = document.getElementById('calc-summary');
  const rateLabel = document.getElementById('calc-rate-label');
  const hourlyRate = document.getElementById('calc-hourly-rate');
  const subtotal = document.getElementById('calc-subtotal');
  const serviceLabel = document.getElementById('calc-service-label');
  const serviceFee = document.getElementById('calc-service-fee');
  const vat = document.getElementById('calc-vat');
  const disclaimer = document.getElementById('calc-disclaimer');
  const quoteLink = document.getElementById('calc-quote-link');
  const staffRequestHref = '/contact?tab=staff#contact-forms';

  if (
    !tierField ||
    !roleField ||
    !headcountField ||
    !hoursField ||
    !standardRateWrap ||
    !standardRateField ||
    !standardRateNote ||
    !tierBadge ||
    !total ||
    !summary ||
    !rateLabel ||
    !hourlyRate ||
    !subtotal ||
    !serviceLabel ||
    !serviceFee ||
    !vat ||
    !disclaimer ||
    !quoteLink
  ) {
    return;
  }

  function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '--';
    const fixed = amount.toFixed(2);
    return '&pound;' + fixed.replace(/\.00$/, '');
  }

  function readPositiveNumber(field) {
    const value = Number(field.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function updateCalculator() {
    const tier = ['STANDARD', 'SHORTLIST'].includes(tierField.value) ? tierField.value : 'GOLD';
    const role = roleField.value in rates ? roleField.value : 'standard';
    const headcount = readPositiveNumber(headcountField);
    const hours = readPositiveNumber(hoursField);

    standardRateWrap.hidden = tier === 'GOLD';
    standardRateNote.textContent = tier === 'SHORTLIST'
      ? 'Shortlist pricing = agreed wage + \u00A34/hr + VAT, including the \u00A31/hr merit uplift.'
      : 'Standard pricing = agreed wage + \u00A33/hr + VAT.';

    if (tier === 'STANDARD' || tier === 'SHORTLIST') {
      const isShortlist = tier === 'SHORTLIST';
      const serviceFeeRate = isShortlist ? 4 : 3;
      const tierLabel = isShortlist ? 'Shortlist' : 'Standard';
      const baseRate = readPositiveNumber(standardRateField);

      if (!baseRate || !headcount || !hours) {
        tierBadge.textContent = tierLabel + ' estimate';
        total.innerHTML = '--';
        summary.textContent = 'Enter the agreed worker rate, team size and hours to calculate a ' + tierLabel + ' estimate.';
        rateLabel.textContent = 'Worker hourly rate';
        hourlyRate.innerHTML = '--';
        subtotal.innerHTML = '--';
        serviceLabel.textContent = 'Service fee';
        serviceFee.innerHTML = '--';
        vat.innerHTML = '--';
        disclaimer.textContent = tierLabel + ' pricing = agreed wage + \u00A3' + serviceFeeRate + '/hr + VAT.' + (isShortlist ? ' Includes \u00A31/hr merit uplift for shortlisted workers.' : ' Use the contact form for mixed teams or more bespoke briefs.');
        quoteLink.setAttribute('href', staffRequestHref);
        return;
      }

      const labourSubtotal = baseRate * headcount * hours;
      const serviceSubtotal = serviceFeeRate * headcount * hours;
      const vatAmount = (labourSubtotal + serviceSubtotal) * 0.2;
      const totalAmount = labourSubtotal + serviceSubtotal + vatAmount;

      tierBadge.textContent = tierLabel + ' estimate';
      total.innerHTML = formatMoney(totalAmount);
      summary.textContent = headcount + ' staff for ' + hours + ' hours using the ' + tierLabel + ' solution for ' + roleLabels[role] + '.';
      rateLabel.textContent = 'Worker hourly rate';
      hourlyRate.innerHTML = formatMoney(baseRate) + '/hr';
      subtotal.innerHTML = formatMoney(labourSubtotal);
      serviceLabel.textContent = 'Service fee (\u00A3' + serviceFeeRate + '/hr' + (isShortlist ? ' incl. merit uplift' : '') + ')';
      serviceFee.innerHTML = formatMoney(serviceSubtotal);
      vat.innerHTML = formatMoney(vatAmount);
      disclaimer.textContent = isShortlist
        ? 'Estimate only. Includes \u00A31/hr merit uplift for each shortlisted worker selected. Travel, late-night uplifts and bespoke briefs may need a full quote.'
        : 'Estimate only. Travel, late-night uplifts, mixed teams and bespoke briefs may need a full staffing conversation.';
      quoteLink.setAttribute('href', staffRequestHref);
      return;
    }

    const rate = rates[role];
    const labourSubtotal = rate * headcount * hours;
    const vatAmount = labourSubtotal * 0.2;
    const totalAmount = labourSubtotal + vatAmount;

    tierBadge.textContent = 'Gold estimate';
    total.innerHTML = formatMoney(totalAmount);
    summary.textContent = headcount + ' staff for ' + hours + ' hours using the Gold solution for ' + roleLabels[role] + '.';
    rateLabel.textContent = 'Hourly rate used';
    hourlyRate.innerHTML = formatMoney(rate) + '/hr';
    subtotal.innerHTML = formatMoney(labourSubtotal);
    serviceLabel.textContent = 'Service fee';
    serviceFee.innerHTML = 'Included';
    vat.innerHTML = formatMoney(vatAmount);
    disclaimer.textContent = 'Estimate only. Gold rates shown here cover the published public roles. Use the contact form for mixed teams or bespoke support.';
    quoteLink.setAttribute('href', staffRequestHref);
  }

  [tierField, roleField, headcountField, hoursField, standardRateField].forEach((field) => {
    field.addEventListener('input', updateCalculator);
    field.addEventListener('change', updateCalculator);
  });

  updateCalculator();
})();
