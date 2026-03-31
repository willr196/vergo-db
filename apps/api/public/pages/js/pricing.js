(function () {
  'use strict';

  const rates = {
    waitstaff: 21,
    chef: 26,
  };

  const roleLabels = {
    waitstaff: 'wait staff / FOH / bar support',
    chef: 'chef cover',
  };

  const tierLabels = {
    STANDARD: 'Standard',
    SHORTLIST: 'Shortlist',
    GOLD: 'Gold',
  };

  const serviceFeeRates = {
    STANDARD: 2,
    SHORTLIST: 3,
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

  function writeEmptyState(tier) {
    const tierLabel = tierLabels[tier];
    const feeRate = serviceFeeRates[tier];

    tierBadge.textContent = tierLabel + ' estimate';
    total.innerHTML = '--';
    summary.textContent = 'Enter the agreed wage, headcount and hours to estimate the ' + tierLabel + ' tier.';
    rateLabel.textContent = 'Agreed wage';
    hourlyRate.innerHTML = '--';
    subtotal.innerHTML = '--';
    serviceLabel.textContent = 'VERGO fee (\u00A3' + feeRate + '/hr)';
    serviceFee.innerHTML = '--';
    vat.innerHTML = '--';
    disclaimer.textContent = tierLabel + ' pricing = agreed wage + \u00A3' + feeRate + '/hr + VAT.';
    quoteLink.setAttribute('href', staffRequestHref);
  }

  function writeGoldEmptyState() {
    tierBadge.textContent = 'Gold estimate';
    total.innerHTML = '--';
    summary.textContent = 'Enter headcount and hours to estimate the Gold tier.';
    rateLabel.textContent = 'Fixed rate used';
    hourlyRate.innerHTML = '--';
    subtotal.innerHTML = '--';
    serviceLabel.textContent = 'Service fee';
    serviceFee.innerHTML = 'Included';
    vat.innerHTML = '--';
    disclaimer.textContent = 'Gold uses fixed public rates. Mixed teams and bespoke briefs may need a tailored quote.';
    quoteLink.setAttribute('href', staffRequestHref);
  }

  function updateCalculator() {
    const tier = tierField.value in tierLabels ? tierField.value : 'STANDARD';
    const role = roleField.value in rates ? roleField.value : 'waitstaff';
    const headcount = readPositiveNumber(headcountField);
    const hours = readPositiveNumber(hoursField);

    standardRateWrap.hidden = tier === 'GOLD';
    standardRateNote.textContent = tier === 'SHORTLIST'
      ? 'Shortlist pricing = agreed wage + \u00A33/hr + VAT.'
      : 'Standard pricing = agreed wage + \u00A32/hr + VAT.';

    if (tier !== 'GOLD') {
      const serviceFeeRate = serviceFeeRates[tier];
      const tierLabel = tierLabels[tier];
      const baseRate = readPositiveNumber(standardRateField);

      if (!baseRate || !headcount || !hours) {
        writeEmptyState(tier);
        return;
      }

      const labourSubtotal = baseRate * headcount * hours;
      const serviceSubtotal = serviceFeeRate * headcount * hours;
      const vatAmount = (labourSubtotal + serviceSubtotal) * 0.2;
      const totalAmount = labourSubtotal + serviceSubtotal + vatAmount;

      tierBadge.textContent = tierLabel + ' estimate';
      total.innerHTML = formatMoney(totalAmount);
      summary.textContent = headcount + ' staff for ' + hours + ' hours on the ' + tierLabel + ' tier for ' + roleLabels[role] + '.';
      rateLabel.textContent = 'Agreed wage';
      hourlyRate.innerHTML = formatMoney(baseRate) + '/hr';
      subtotal.innerHTML = formatMoney(labourSubtotal);
      serviceLabel.textContent = 'VERGO fee (\u00A3' + serviceFeeRate + '/hr)';
      serviceFee.innerHTML = formatMoney(serviceSubtotal);
      vat.innerHTML = formatMoney(vatAmount);
      disclaimer.textContent = 'Estimate only. Travel, late-night uplifts, mixed teams and bespoke briefs may need a full quote.';
      quoteLink.setAttribute('href', staffRequestHref);
      return;
    }

    const rate = rates[role];
    if (!headcount || !hours) {
      writeGoldEmptyState();
      return;
    }

    const labourSubtotal = rate * headcount * hours;
    const vatAmount = labourSubtotal * 0.2;
    const totalAmount = labourSubtotal + vatAmount;

    tierBadge.textContent = 'Gold estimate';
    total.innerHTML = formatMoney(totalAmount);
    summary.textContent = headcount + ' staff for ' + hours + ' hours on the Gold tier for ' + roleLabels[role] + '.';
    rateLabel.textContent = 'Fixed rate used';
    hourlyRate.innerHTML = formatMoney(rate) + '/hr';
    subtotal.innerHTML = formatMoney(labourSubtotal);
    serviceLabel.textContent = 'Service fee';
    serviceFee.innerHTML = 'Included';
    vat.innerHTML = formatMoney(vatAmount);
    disclaimer.textContent = 'Estimate only. Gold uses fixed public rates for the roles shown here. Mixed teams and bespoke briefs may need a tailored quote.';
    quoteLink.setAttribute('href', staffRequestHref);
  }

  [tierField, roleField, headcountField, hoursField, standardRateField].forEach((field) => {
    field.addEventListener('input', updateCalculator);
    field.addEventListener('change', updateCalculator);
  });

  updateCalculator();
})();
