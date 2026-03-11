(function () {
  'use strict';

  const rates = {
    standard: 20,
    chef: 26,
    supervisor: 22,
  };

  const roleLabels = {
    standard: 'bartender / waiter / FOH / runner',
    chef: 'chef',
    supervisor: 'supervisor',
  };

  const tierField = document.getElementById('calc-tier');
  const roleField = document.getElementById('calc-role');
  const headcountField = document.getElementById('calc-headcount');
  const hoursField = document.getElementById('calc-hours');
  const standardRateWrap = document.getElementById('calc-standard-rate-wrap');
  const standardRateField = document.getElementById('calc-standard-rate');
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
    const tier = tierField.value === 'STANDARD' ? 'STANDARD' : 'GOLD';
    const role = roleField.value in rates ? roleField.value : 'standard';
    const headcount = readPositiveNumber(headcountField);
    const hours = readPositiveNumber(hoursField);

    standardRateWrap.hidden = tier !== 'STANDARD';

    if (tier === 'STANDARD') {
      const baseRate = readPositiveNumber(standardRateField);

      if (!baseRate || !headcount || !hours) {
        tierBadge.textContent = 'Standard estimate';
        total.innerHTML = '--';
        summary.textContent = 'Enter the staff hourly rate, staff count and hours to calculate a Standard estimate.';
        rateLabel.textContent = 'Staff hourly rate';
        hourlyRate.innerHTML = '--';
        subtotal.innerHTML = '--';
        serviceLabel.textContent = 'Service fee';
        serviceFee.innerHTML = '--';
        vat.innerHTML = '--';
        disclaimer.textContent = 'Standard pricing = agreed wage + \u00A33/hr + VAT. Use the contact form for mixed teams or more bespoke briefs.';
        quoteLink.setAttribute('href', staffRequestHref);
        return;
      }

      const labourSubtotal = baseRate * headcount * hours;
      const serviceSubtotal = 3 * headcount * hours;
      const vatAmount = (labourSubtotal + serviceSubtotal) * 0.2;
      const totalAmount = labourSubtotal + serviceSubtotal + vatAmount;

      tierBadge.textContent = 'Standard estimate';
      total.innerHTML = formatMoney(totalAmount);
      summary.textContent = headcount + ' staff for ' + hours + ' hours on the Standard ' + roleLabels[role] + ' route.';
      rateLabel.textContent = 'Staff hourly rate';
      hourlyRate.innerHTML = formatMoney(baseRate) + '/hr';
      subtotal.innerHTML = formatMoney(labourSubtotal);
      serviceLabel.textContent = 'Service fee (\u00A33/hr)';
      serviceFee.innerHTML = formatMoney(serviceSubtotal);
      vat.innerHTML = formatMoney(vatAmount);
      disclaimer.textContent = 'Estimate only. Travel, late-night uplifts, mixed teams and bespoke briefs may need a full staffing conversation.';
      quoteLink.setAttribute('href', staffRequestHref);
      return;
    }

    const rate = rates[role];
    const labourSubtotal = rate * headcount * hours;
    const vatAmount = labourSubtotal * 0.2;
    const totalAmount = labourSubtotal + vatAmount;

    tierBadge.textContent = 'Gold estimate';
    total.innerHTML = formatMoney(totalAmount);
    summary.textContent = headcount + ' staff for ' + hours + ' hours on the Gold ' + roleLabels[role] + ' rate.';
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
