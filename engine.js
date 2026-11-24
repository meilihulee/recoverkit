/*
 * RecoverKit audit engine — pure functions, no DOM, no network.
 * Works in the browser (window.AuditEngine) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- CSV / TSV parsing ----------
  function parseDelimited(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, '\t': 0, ';': 0 };
    for (const ch of firstLine) if (ch in counts) counts[ch]++;
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';

    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"' && field === '') inQuotes = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
    if (!rows.length) return { headers: [], records: [] };
    const headers = rows[0].map(h => h.trim());
    const records = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
      return o;
    });
    return { headers, records };
  }

  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  // Column aliases seen across Amazon report versions (US marketplace).
  const ALIASES = {
    date: ['date', 'datetime', 'postedate', 'posteddate', 'returndate', 'shipmentdate', 'createddate'],
    sku: ['msku', 'sku', 'merchantsku', 'sellersku'],
    fnsku: ['fnsku'],
    asin: ['asin'],
    title: ['title', 'productname', 'productdescription', 'description'],
    eventType: ['eventtype', 'transactiontype'],
    referenceId: ['referenceid', 'reference'],
    quantity: ['quantity', 'qty', 'quantitypurchased'],
    fc: ['fulfillmentcenter', 'fulfillmentcenterid', 'fc'],
    disposition: ['disposition', 'detaileddisposition'],
    reason: ['reason', 'reasoncode'],
    shipmentId: ['shipmentid', 'fbashipmentid'],
    shipped: ['quantityshipped', 'unitsexpected', 'shipped', 'expected', 'unitsshipped'],
    received: ['quantityreceived', 'unitslocated', 'received', 'unitsreceived'],
    orderId: ['orderid', 'amazonorderid'],
    status: ['status'],
    amount: ['total', 'amount', 'refundamount', 'productsales', 'principal'],
    type: ['type'],
    price: ['yourprice', 'price', 'salesprice'],
    longest: ['longestside'],
    median: ['medianside'],
    shortest: ['shortestside'],
    dimUnit: ['unitofdimension'],
    weight: ['itempackageweight', 'weight'],
    weightUnit: ['unitofweight'],
    sizeTier: ['productsizetier', 'sizetier'],
    fbaFee: ['expectedfulfillmentfeeperunit', 'fulfillmentfee', 'fbafee'],
    trueLongest: ['truelongestside', 'mylongestside'],
    trueMedian: ['truemedianside', 'mymedianside'],
    trueShortest: ['trueshortestside', 'myshortestside'],
    trueWeight: ['trueweight', 'myweight', 'trueweightlb'],
  };

  function makeGetter(headers) {
    const map = {};
    const normed = headers.map(norm);
    for (const key in ALIASES) {
      for (const a of ALIASES[key]) {
        const idx = normed.indexOf(a);
        if (idx >= 0) { map[key] = headers[idx]; break; }
      }
    }
    const get = (rec, key) => (map[key] ? rec[map[key]] : undefined);
    get.has = key => !!map[key];
    return get;
  }

  const num = v => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const toDate = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; };
  const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
  const round2 = n => Math.round(n * 100) / 100;

  // ---------- Report type detection ----------
  function detectType(headers) {
    const h = new Set(headers.map(norm));
    const any = list => list.some(x => h.has(x));
    if (any(['expectedfulfillmentfeeperunit', 'longestside']) ) return 'fees';
    if (h.has('shipmentid') && any(['quantityshipped', 'unitsexpected', 'quantityreceived', 'unitslocated'])) return 'inbound';
    if (h.has('eventtype') && any(['fnsku', 'msku'])) return 'ledger';
    if (any(['detaileddisposition', 'returndate']) && h.has('orderid')) return 'returns';
    if (h.has('orderid') && h.has('type') && any(['total', 'amount', 'productsales'])) return 'refunds';
    if (any(['truelongestside', 'trueweight', 'mylongestside'])) return 'catalog';
    return null;
  }

  // ---------- Fee table (US FBA, non-apparel, approximate, editable) ----------
  // Values are simplified estimates. Verify against Amazon's current rate card before filing.
  const DEFAULT_FEE_TABLE = {
    note: 'Approximate US FBA fulfillment fees (non-peak, non-apparel). Edit to match current rate card.',
    smallStandard: [ // max 15x12x0.75 in, max 16 oz
      [2, 3.06], [4, 3.15], [6, 3.24], [8, 3.33], [10, 3.43], [12, 3.53], [14, 3.60], [16, 3.65]
    ],
    largeStandard: [ // max 18x14x8 in, max 20 lb; [ounces, fee]
      [4, 3.68], [8, 3.90], [12, 4.15], [16, 4.55], [24, 4.99], [32, 5.37], [40, 5.52], [48, 5.77]
    ],
    largeStandardOver3lbBase: 6.10, largeStandardPerHalfLbOver3: 0.08,
    largeBulkyBase: 9.61, largeBulkyPerLbOver1: 0.38,
  };

  function toInches(v, unit) { v = num(v); return /cm|centimet/i.test(unit || '') ? v / 2.54 : v; }
  function toPounds(v, unit) {
    v = num(v); unit = unit || 'pounds';
    if (/kilo|kg/i.test(unit)) return v * 2.20462;
    if (/gram|^g$/i.test(unit)) return v / 453.592;
    if (/ounce|oz/i.test(unit)) return v / 16;
    return v;
  }

  function estimateFee(dims, table) {
    table = table || DEFAULT_FEE_TABLE;
    const [l, m, s] = [dims.longest, dims.median, dims.shortest].map(Number).sort((a, b) => b - a);
    const unitWt = dims.weightLb;
    const dimWt = (l * m * s) / 139;
    if (l <= 15 && m <= 12 && s <= 0.75 && unitWt <= 1) {
      const oz = unitWt * 16;
      for (const [maxOz, fee] of table.smallStandard) if (oz <= maxOz) return { tier: 'Small standard', fee };
    }
    if (l <= 18 && m <= 14 && s <= 8 && Math.max(unitWt, dimWt) <= 20) {
      const shipLb = Math.max(unitWt, dimWt);
      const oz = shipLb * 16;
      for (const [maxOz, fee] of table.largeStandard) if (oz <= maxOz) return { tier: 'Large standard', fee };
      const over = Math.max(0, Math.ceil((shipLb - 3) * 2));
      return { tier: 'Large standard', fee: round2(table.largeStandardOver3lbBase + over * table.largeStandardPerHalfLbOver3) };
    }
    const shipLb = Math.max(unitWt, dimWt);
    return { tier: 'Large bulky', fee: round2(table.largeBulkyBase + Math.max(0, Math.ceil(shipLb - 1)) * table.largeBulkyPerLbOver1) };
  }

  // ---------- The audit ----------
  /**
   * reports: { ledger, inbound, returns, refunds, fees, catalog } each as {headers, records}
   * opts: { asOf: Date, reimbursementRatio, inboundMinAgeDays, refundGraceDays, lookbackDays, feeTable }
   */
  function runAudit(reports, opts) {
    opts = Object.assign({
      asOf: new Date(),
      reimbursementRatio: 0.6,     // share of list price used to estimate per-unit reimbursement value
      inboundMinAgeDays: 30,       // give Amazon time to finish receiving before claiming
      refundGraceDays: 60,         // Amazon auto-charges back after 60 days; past that, unreturned refunds are claimable
      lookbackDays: 540,           // ~18 months, the outer claim window for most case types
      feeTable: DEFAULT_FEE_TABLE,
    }, opts || {});

    const asOf = opts.asOf instanceof Date ? opts.asOf : new Date(opts.asOf);
    const findings = [];
    const warnings = [];

    // Price / value lookup by SKU and FNSKU
    const price = {}, titles = {}, skuByFnsku = {};
    if (reports.fees) {
      const g = makeGetter(reports.fees.headers);
      for (const r of reports.fees.records) {
        const sku = g(r, 'sku'), fn = g(r, 'fnsku');
        const p = num(g(r, 'price'));
        if (sku) { price[sku] = p; titles[sku] = g(r, 'title') || titles[sku]; }
        if (fn) { price[fn] = p; if (sku) skuByFnsku[fn] = sku; }
      }
    }
    const unitValue = key => round2((price[key] || price[skuByFnsku[key]] || 0) * opts.reimbursementRatio);

    // 1) Short-received inbound shipments
    if (reports.inbound) {
      const g = makeGetter(reports.inbound.headers);
      if (!g.has('shipped') || !g.has('received')) warnings.push('Inbound report is missing shipped/received columns.');
      const agg = {};
      for (const r of reports.inbound.records) {
        const key = g(r, 'shipmentId') + '|' + (g(r, 'sku') || g(r, 'fnsku'));
        const a = agg[key] || (agg[key] = { shipmentId: g(r, 'shipmentId'), sku: g(r, 'sku'), fnsku: g(r, 'fnsku'), shipped: 0, received: 0, date: toDate(g(r, 'date')) });
        a.shipped += num(g(r, 'shipped')); a.received += num(g(r, 'received'));
      }
      for (const a of Object.values(agg)) {
        const short = a.shipped - a.received;
        if (short <= 0) continue;
        const age = a.date ? daysBetween(a.date, asOf) : null;
        if (age !== null && age < opts.inboundMinAgeDays) continue;
        if (age !== null && age > opts.lookbackDays) continue;
        const v = unitValue(a.sku || a.fnsku);
        findings.push({
          category: 'inbound', label: 'Short-received inbound',
          reference: a.shipmentId, sku: a.sku, fnsku: a.fnsku, units: short, unitValue: v,
          amount: round2(short * v), date: a.date ? a.date.toISOString().slice(0, 10) : '',
          evidence: `Shipped ${a.shipped}, received ${a.received}`,
          caseText: `Shipment ${a.shipmentId} closed with ${short} unit(s) of ${a.sku || a.fnsku} not received (shipped ${a.shipped}, received ${a.received}). Please investigate and reimburse the missing units. Proof of delivery and packing list attached.`,
        });
      }
    }

    // 2) Refunded but not returned
    if (reports.refunds) {
      const g = makeGetter(reports.refunds.headers);
      const returned = {};
      if (reports.returns) {
        const rg = makeGetter(reports.returns.headers);
        for (const r of reports.returns.records) {
          const key = rg(r, 'orderId') + '|' + (rg(r, 'sku') || '');
          returned[key] = (returned[key] || 0) + Math.abs(num(rg(r, 'quantity')) || 1);
          returned[rg(r, 'orderId') + '|*'] = (returned[rg(r, 'orderId') + '|*'] || 0) + Math.abs(num(rg(r, 'quantity')) || 1);
        }
      } else warnings.push('No returns report: every refund will look unreturned. Upload the FBA Customer Returns report.');

      const refunds = {};
      for (const r of reports.refunds.records) {
        const t = (g(r, 'type') || '').toLowerCase();
        if (g.has('type') && !t.includes('refund')) continue;
        const key = g(r, 'orderId') + '|' + (g(r, 'sku') || '');
        const a = refunds[key] || (refunds[key] = { orderId: g(r, 'orderId'), sku: g(r, 'sku'), qty: 0, amount: 0, date: toDate(g(r, 'date')) });
        a.qty += Math.abs(num(g(r, 'quantity')) || 1);
        a.amount += Math.abs(num(g(r, 'amount')));
      }
      for (const a of Object.values(refunds)) {
        const back = returned[a.orderId + '|' + a.sku] ?? returned[a.orderId + '|*'] ?? 0;
        const missing = a.qty - back;
        if (missing <= 0) continue;
        const age = a.date ? daysBetween(a.date, asOf) : null;
        if (age !== null && (age < opts.refundGraceDays || age > opts.lookbackDays)) continue;
        const perUnit = a.qty ? a.amount / a.qty : 0;
        findings.push({
          category: 'refund', label: 'Refunded, not returned',
          reference: a.orderId, sku: a.sku, fnsku: '', units: missing, unitValue: round2(perUnit),
          amount: round2(perUnit * missing), date: a.date ? a.date.toISOString().slice(0, 10) : '',
          evidence: `Refunded ${a.qty}, returned ${back}${age !== null ? `, ${age} days ago` : ''}`,
          caseText: `Order ${a.orderId}: customer was refunded for ${a.qty} unit(s) of ${a.sku} on ${a.date ? a.date.toISOString().slice(0, 10) : 'n/a'} but only ${back} unit(s) were returned to the fulfillment center, and no reimbursement has been issued. Please reimburse the unreturned unit(s).`,
        });
      }
    }

    // 3) Dimension / fee overcharges
    if (reports.fees) {
      const g = makeGetter(reports.fees.headers);
      const truth = {};
      if (reports.catalog) {
        const cg = makeGetter(reports.catalog.headers);
        for (const r of reports.catalog.records) {
          const sku = cg(r, 'sku'); if (!sku) continue;
          truth[sku] = { longest: num(cg(r, 'trueLongest')), median: num(cg(r, 'trueMedian')), shortest: num(cg(r, 'trueShortest')), weightLb: num(cg(r, 'trueWeight')) };
        }
      }
      // Units shipped to customers in lookback, from the ledger
      const unitsSold = {};
      if (reports.ledger) {
        const lg = makeGetter(reports.ledger.headers);
        for (const r of reports.ledger.records) {
          if (!/shipment/i.test(lg(r, 'eventType') || '')) continue;
          const d = toDate(lg(r, 'date'));
          if (d && daysBetween(d, asOf) > opts.lookbackDays) continue;
          const k = lg(r, 'sku') || skuByFnsku[lg(r, 'fnsku')] || lg(r, 'fnsku');
          unitsSold[k] = (unitsSold[k] || 0) + Math.abs(num(lg(r, 'quantity')));
        }
      } else warnings.push('No inventory ledger: fee overcharges are shown per unit only. Upload the ledger to multiply by units sold.');

      for (const r of reports.fees.records) {
        const sku = g(r, 'sku');
        const charged = num(g(r, 'fbaFee'));
        const unit = g(r, 'dimUnit'), wUnit = g(r, 'weightUnit');
        const amazonDims = {
          longest: toInches(g(r, 'longest'), unit), median: toInches(g(r, 'median'), unit),
          shortest: toInches(g(r, 'shortest'), unit), weightLb: toPounds(g(r, 'weight'), wUnit),
        };
        // Prefer the seller's true dims; otherwise check Amazon's own dims against its own fee
        const basis = truth[sku] ? 'your measured dimensions' : "Amazon's own listed dimensions";
        const dims = truth[sku] || amazonDims;
        if (!dims.longest || !charged) continue;
        const est = estimateFee(dims, opts.feeTable);
        const diff = round2(charged - est.fee);
        if (diff < 0.10) continue;
        const units = unitsSold[sku] || 0;
        findings.push({
          category: 'fee', label: 'Fee / dimension overcharge',
          reference: g(r, 'asin') || g(r, 'fnsku'), sku, fnsku: g(r, 'fnsku'), units, unitValue: diff,
          amount: round2(diff * (units || 1)), date: '',
          evidence: `Charged $${charged.toFixed(2)} (${g(r, 'sizeTier') || 'tier n/a'}); expected $${est.fee.toFixed(2)} (${est.tier}) from ${basis}${units ? `; ${units} units shipped` : '; units unknown, 1 assumed'}`,
          caseText: `ASIN ${g(r, 'asin') || ''} / SKU ${sku}: FBA fulfillment fee charged at $${charged.toFixed(2)} per unit, but the item measures ${dims.longest.toFixed(1)} x ${dims.median.toFixed(1)} x ${dims.shortest.toFixed(1)} in, ${dims.weightLb.toFixed(2)} lb (${est.tier}, $${est.fee.toFixed(2)}). Please re-measure the item and refund the fee difference on ${units || 'all'} unit(s) shipped. Photos of item on scale and tape measure attached.`,
        });
      }
    }

    // Bonus: warehouse lost/damaged not offset by "found" adjustments
    if (reports.ledger) {
      const lg = makeGetter(reports.ledger.headers);
      const net = {};
      for (const r of reports.ledger.records) {
        if (!/adjust/i.test(lg(r, 'eventType') || '')) continue;
        const d = toDate(lg(r, 'date'));
        if (d && daysBetween(d, asOf) > opts.lookbackDays) continue;
        const reason = (lg(r, 'reason') || '').toUpperCase();
        const k = lg(r, 'fnsku') || lg(r, 'sku');
        const a = net[k] || (net[k] = { sku: lg(r, 'sku') || skuByFnsku[k], fnsku: lg(r, 'fnsku'), lost: 0, damaged: 0, found: 0 });
        const q = Math.abs(num(lg(r, 'quantity')));
        if (reason === 'M') a.lost += q; else if (reason === 'E') a.damaged += q; else if (reason === 'F') a.found += q;
      }
      for (const a of Object.values(net)) {
        const units = a.lost + a.damaged - a.found;
        if (units <= 0) continue;
        const v = unitValue(a.fnsku || a.sku);
        findings.push({
          category: 'warehouse', label: 'Lost/damaged in warehouse',
          reference: a.fnsku, sku: a.sku, fnsku: a.fnsku, units, unitValue: v, amount: round2(units * v), date: '',
          evidence: `Lost ${a.lost}, damaged ${a.damaged}, found ${a.found}`,
          caseText: `FNSKU ${a.fnsku}: inventory ledger shows ${a.lost} unit(s) misplaced and ${a.damaged} damaged at the fulfillment center, with only ${a.found} later found. Please reimburse the ${units} net unit(s) not already reimbursed.`,
        });
      }
    }

    findings.sort((a, b) => b.amount - a.amount);
    const totals = { all: 0, inbound: 0, refund: 0, fee: 0, warehouse: 0 };
    const counts = { inbound: 0, refund: 0, fee: 0, warehouse: 0 };
    for (const f of findings) { totals[f.category] += f.amount; totals.all += f.amount; counts[f.category]++; }
    for (const k in totals) totals[k] = round2(totals[k]);
    return { findings, totals, counts, warnings, asOf: asOf.toISOString().slice(0, 10) };
  }

  // ---------- Export ----------
  function toClaimCsv(findings) {
    const cols = ['Case Type', 'Reference (Shipment/Order/ASIN)', 'SKU', 'FNSKU', 'Units', 'Est. Value per Unit', 'Est. Recoverable', 'Date', 'Evidence', 'Suggested Case Text'];
    const esc = v => { v = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.join(',')];
    for (const f of findings) lines.push([f.label, f.reference, f.sku, f.fnsku, f.units, f.unitValue.toFixed(2), f.amount.toFixed(2), f.date, f.evidence, f.caseText].map(esc).join(','));
    return lines.join('\n');
  }

  const api = { parseDelimited, detectType, runAudit, toClaimCsv, estimateFee, DEFAULT_FEE_TABLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
