/*
 * Realistic demo dataset: a mid-size kitchen/home brand with 8 SKUs.
 * Generated as CSV text (same shape as Seller Central exports) with dates relative to today,
 * so the demo always lands inside the claim windows. Deterministic (seeded).
 */
(function (root) {
  'use strict';
  function buildDemo(asOf) {
    asOf = asOf ? new Date(asOf) : new Date();
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const day = n => { const d = new Date(asOf); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const csv = rows => rows.map(r => r.map(v => /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n');

    const skus = [
      { sku: 'KX-GARLIC-PRESS', fn: 'X001GP7K2L', asin: 'B0C1GP7K2L', t: 'Stainless Garlic Press with Peeler', p: 24.99, d: [7.9, 2.6, 1.6], w: 0.62, fee: 3.90, tier: 'Large standard' },
      { sku: 'KX-SPICE-JARS-12', fn: 'X001SJ12AB', asin: 'B0C1SJ12AB', t: '12-Pack Glass Spice Jars with Labels', p: 32.99, d: [10.2, 7.8, 4.1], w: 2.35, fee: 6.10, tier: 'Large standard', trueD: [9.8, 7.4, 3.9], trueW: 2.05 },
      { sku: 'KX-SILICONE-LIDS', fn: 'X001SL6CDE', asin: 'B0C1SL6CDE', t: 'Silicone Stretch Lids, Set of 6', p: 14.99, d: [8.0, 6.0, 0.7], w: 0.44, fee: 3.68, tier: 'Large standard' },
      { sku: 'KX-MANDOLINE-PRO', fn: 'X001MP9FGH', asin: 'B0C1MP9FGH', t: 'Adjustable Mandoline Slicer Pro', p: 39.99, d: [14.1, 5.2, 3.8], w: 1.71, fee: 5.52, tier: 'Large standard' },
      { sku: 'KX-BAMBOO-BOARD-L', fn: 'X001BB3IJK', asin: 'B0C1BB3IJK', t: 'Bamboo Cutting Board, Large', p: 29.99, d: [18.4, 12.2, 1.1], w: 3.40, fee: 9.61, tier: 'Large bulky', trueD: [17.8, 12.0, 0.9], trueW: 3.10 },
      { sku: 'KX-HERB-SCISSORS', fn: 'X001HS5LMN', asin: 'B0C1HS5LMN', t: '5-Blade Herb Scissors', p: 12.99, d: [8.1, 3.9, 0.7], w: 0.21, fee: 3.15, tier: 'Small standard' },
      { sku: 'KX-OIL-SPRAYER', fn: 'X001OS2OPQ', asin: 'B0C1OS2OPQ', t: 'Glass Olive Oil Sprayer 2-Pack', p: 19.99, d: [8.6, 5.9, 2.9], w: 0.98, fee: 4.55, tier: 'Large standard' },
      { sku: 'KX-KNIFE-SHARP', fn: 'X001KS4RST', asin: 'B0C1KS4RST', t: '3-Stage Knife Sharpener', p: 17.99, d: [8.7, 2.4, 2.4], w: 0.55, fee: 4.15, tier: 'Large standard' },
    ];

    // Fee preview
    const fees = [['sku', 'fnsku', 'asin', 'product-name', 'your-price', 'longest-side', 'median-side', 'shortest-side', 'unit-of-dimension', 'item-package-weight', 'unit-of-weight', 'product-size-tier', 'expected-fulfillment-fee-per-unit']];
    for (const s of skus) fees.push([s.sku, s.fn, s.asin, s.t, s.p.toFixed(2), ...s.d, 'inches', s.w, 'pounds', s.tier, s.fee.toFixed(2)]);

    // Seller's own measurements (optional catalog file)
    const catalog = [['sku', 'true-longest-side', 'true-median-side', 'true-shortest-side', 'true-weight']];
    for (const s of skus) { const d = s.trueD || s.d; catalog.push([s.sku, ...d, s.trueW || s.w]); }

    // Inbound shipments: 6 shipments, three with shortages
    const inbound = [['Shipment ID', 'Shipment Date', 'Merchant SKU', 'FNSKU', 'Quantity Shipped', 'Quantity Received']];
    const shipments = [['FBA17XK2M9QZ', 210], ['FBA17XN4P1RT', 160], ['FBA17Y0B7CDE', 118], ['FBA17Y8H2FGH', 85], ['FBA17YC5J6KL', 52], ['FBA17YF9M3NP', 12]];
    const shorts = { 'FBA17XN4P1RT|KX-MANDOLINE-PRO': 24, 'FBA17Y0B7CDE|KX-SPICE-JARS-12': 18, 'FBA17Y8H2FGH|KX-GARLIC-PRESS': 11, 'FBA17Y8H2FGH|KX-OIL-SPRAYER': 6, 'FBA17YF9M3NP|KX-HERB-SCISSORS': 9 };
    for (const [id, age] of shipments) for (const s of skus.slice(0, ri(4, 8))) {
      const qty = ri(4, 20) * 12; const short = shorts[id + '|' + s.sku] || 0;
      inbound.push([id, day(age), s.sku, s.fn, qty, qty - short]);
    }

    // Inventory ledger: customer shipments + adjustments
    const ledger = [['Date', 'FNSKU', 'ASIN', 'MSKU', 'Title', 'Event Type', 'Reference ID', 'Quantity', 'Fulfillment Center', 'Disposition', 'Reason']];
    for (const s of skus) {
      const sold = ri(300, 1800);
      for (let m = 0; m < 12; m++) ledger.push([day(m * 30 + 5), s.fn, s.asin, s.sku, s.t, 'Shipments', '', -Math.round(sold / 12), 'PHX7', 'SELLABLE', '']);
    }
    const adj = [['X001MP9FGH', 'M', 9], ['X001MP9FGH', 'F', 2], ['X001SJ12AB', 'E', 7], ['X001BB3IJK', 'M', 5], ['X001BB3IJK', 'F', 5], ['X001KS4RST', 'M', 4]];
    for (const [fn, reason, q] of adj) {
      const s = skus.find(x => x.fn === fn);
      ledger.push([day(ri(40, 300)), fn, s.asin, s.sku, s.t, 'Adjustments', 'ADJ' + ri(100000, 999999), reason === 'F' ? q : -q, 'LAS1', reason === 'E' ? 'DAMAGED' : 'SELLABLE', reason]);
    }

    // Refunds (from the Payments date-range transaction report) and returns
    const refunds = [['date/time', 'type', 'order id', 'sku', 'description', 'quantity', 'total']];
    const returns = [['return-date', 'order-id', 'sku', 'asin', 'fnsku', 'product-name', 'quantity', 'fulfillment-center-id', 'detailed-disposition', 'reason', 'status']];
    for (let i = 0; i < 64; i++) {
      const s = skus[ri(0, skus.length - 1)];
      const oid = `11${ri(1, 4)}-${ri(1000000, 9999999)}-${ri(1000000, 9999999)}`;
      const age = ri(20, 400);
      refunds.push([day(age), 'Refund', oid, s.sku, s.t, 1, (-s.p).toFixed(2)]);
      const unreturned = i % 5 === 0 || i % 7 === 0; // ~one in four never came back
      if (!unreturned) returns.push([day(age - ri(3, 25)), oid, s.sku, s.asin, s.fn, s.t, 1, 'PHX7', rnd() > 0.3 ? 'SELLABLE' : 'CUSTOMER_DAMAGED', 'UNWANTED_ITEM', 'Unit returned to inventory']);
    }

    return {
      'Inventory Ledger (demo).csv': csv(ledger),
      'Inbound Shipments (demo).csv': csv(inbound),
      'FBA Customer Returns (demo).csv': csv(returns),
      'Payments Transactions - Refunds (demo).csv': csv(refunds),
      'Fee Preview (demo).csv': csv(fees),
      'My Product Measurements (demo).csv': csv(catalog),
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildDemo };
  else root.buildDemo = buildDemo;
})(typeof window !== 'undefined' ? window : globalThis);
