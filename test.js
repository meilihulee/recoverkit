const E = require('./engine.js'); const { buildDemo } = require('./demo-data.js');
const files = buildDemo('2026-11-24'); const reports = {};
for (const [name, text] of Object.entries(files)) { const p = E.parseDelimited(text); const t = E.detectType(p.headers); console.log(name, '->', t, p.records.length); reports[t] = p; }
const r = E.runAudit(reports, { asOf: '2026-11-24' });
console.log(r.totals, r.counts, r.warnings);
for (const f of r.findings.slice(0,40)) console.log(f.category, f.reference, f.sku, f.units, f.amount, '|', f.evidence);
const csv = E.toClaimCsv(r.findings); console.log(csv.split('\n').length, 'csv lines');
const back = E.parseDelimited(csv); console.log('roundtrip rows', back.records.length, back.headers.length);
// TSV test
const tsv = 'sku\tfnsku\texpected-fulfillment-fee-per-unit\tlongest-side\nA\tB\t3.1\t5'; const t=E.parseDelimited(tsv); console.log(E.detectType(t.headers), t.records);
