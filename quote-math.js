(() => {
  'use strict';

  const supportedVatRates = new Set([0, 5, 8, 23]);
  const safeNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  };

  globalThis.pwQuoteTotals = (items, extra, margin, vatMode, vatRate) => {
    const subtotal = (Array.isArray(items) ? items : []).reduce((sum, item) =>
      sum + safeNumber(item?.quantity) * safeNumber(item?.rate), 0);
    const base = subtotal + safeNumber(extra);
    const netGrosze = Math.round(base * (1 + safeNumber(margin) / 100) * 100);
    const rate = Number(vatRate);
    const vatGrosze = vatMode === 'active' && supportedVatRates.has(rate)
      ? Math.round(netGrosze * rate / 100)
      : 0;

    return {
      netGrosze,
      vatGrosze,
      grossGrosze: netGrosze + vatGrosze,
      net: netGrosze / 100,
      vat: vatGrosze / 100,
      gross: (netGrosze + vatGrosze) / 100,
      vatRate: supportedVatRates.has(rate) ? rate : 0,
      vatMode: vatMode === 'active' ? 'active' : 'exempt'
    };
  };
})();
