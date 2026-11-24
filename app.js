(function () {
  'use strict';
  const C = window.RECOVERKIT_CONFIG, E = window.AuditEngine;
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FREE_ROWS = 5;

  const SLOTS = [
    ['ledger', 'Inventory Ledger', true], ['inbound', 'Inbound Shipments', true],
    ['returns', 'FBA Customer Returns', true], ['refunds', 'Refunds (Transactions)', true],
    ['fees', 'Fee Preview', true], ['catalog', 'My Measurements', false],
  ];
  const reports = {}; const fileNames = {};
  let lastResult = null;

  // ---------- unlock ----------
  async function sha256(str) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Fallback(str);
  }
  const isUnlocked = () => localStorage.getItem('rk_unlocked') === '1';
  async function tryUnlock(code) {
    if (!code) return false;
    const h = await sha256(code.trim().toUpperCase());
    if (C.unlockCodeHashes.includes(h)) { localStorage.setItem('rk_unlocked', '1'); return true; }
    return false;
  }

  // ---------- files ----------
  function renderSlots() {
    $('#slots').innerHTML = SLOTS.map(([k, label, req]) => {
      const ok = !!reports[k];
      return `<div class="slot ${ok ? 'ok' : ''}"><b>${label}${req ? '' : ' <span class="muted small">(optional)</span>'}</b><span class="st">${ok ? '✓ ' + esc(fileNames[k]) + ' · ' + reports[k].records.length.toLocaleString() + ' rows' : 'Not loaded'}</span></div>`;
    }).join('');
    $('#runBtn').disabled = !Object.keys(reports).length;
  }
  function addText(name, text) {
    const parsed = E.parseDelimited(text);
    const type = E.detectType(parsed.headers);
    if (!type) { alert(`Couldn't recognise "${name}". Make sure it's an unedited Seller Central export.`); return; }
    reports[type] = parsed; fileNames[type] = name;
  }
  async function addFiles(files) {
    for (const f of files) addText(f.name, await f.text());
    renderSlots();
  }
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  $('#fileInput').addEventListener('change', e => addFiles(e.target.files));
  $('#clearBtn').addEventListener('click', () => { for (const k in reports) { delete reports[k]; delete fileNames[k]; } $('#results').hidden = true; renderSlots(); });

  $$('[data-demo]').forEach(b => b.addEventListener('click', () => {
    const demo = window.buildDemo();
    for (const [n, t] of Object.entries(demo)) addText(n, t);
    renderSlots(); run();
    $('#audit').scrollIntoView({ behavior: 'smooth' });
  }));

  // ---------- run ----------
  function run() {
    lastResult = E.runAudit(reports, {
      reimbursementRatio: (+$('#ratio').value || 60) / 100,
      inboundMinAgeDays: +$('#inboundAge').value || 30,
      refundGraceDays: +$('#graceDays').value || 60,
      lookbackDays: +$('#lookback').value || 540,
    });
    render();
    $('#results').hidden = false;
  }
  $('#runBtn').addEventListener('click', run);

  const CATS = [['inbound', 'Short-received inbound'], ['refund', 'Refunded, not returned'], ['fee', 'Fee / dimension overcharges'], ['warehouse', 'Lost/damaged in warehouse']];

  function render() {
    const r = lastResult, unlocked = isUnlocked();
    $('#totalAll').textContent = money(r.totals.all);
    $('#totalNote').textContent = `${r.findings.length} potential claims · as of ${r.asOf}`;
    $('#cats').innerHTML = CATS.map(([k, l]) => `<div class="cat"><span class="muted small">${l}</span><b>${money(r.totals[k])}</b><span class="muted small">${r.counts[k]} finding${r.counts[k] === 1 ? '' : 's'}</span></div>`).join('');
    $('#warnings').innerHTML = r.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('');

    const shown = unlocked ? r.findings : r.findings.slice(0, FREE_ROWS);
    const lockedTeaser = unlocked ? [] : r.findings.slice(FREE_ROWS, FREE_ROWS + 6);
    const row = (f, locked) => `<tr class="${locked ? 'locked' : ''}"><td><span class="tag ${f.category}">${esc(f.label)}</span></td><td>${esc(f.reference)}</td><td>${esc(f.sku)}</td><td>${f.units}</td><td>${esc(f.evidence)}</td><td class="r"><b>${money2(f.amount)}</b></td></tr>`;
    $('#findings tbody').innerHTML = shown.map(f => row(f, false)).join('') + lockedTeaser.map(f => row(f, true)).join('')
      || '<tr><td colspan="6" class="muted">No recoverable gaps found in these files. Nice and clean.</td></tr>';

    const hidden = r.findings.slice(FREE_ROWS);
    const pw = $('#paywall');
    pw.hidden = unlocked || !hidden.length;
    $('#hiddenCount').textContent = hidden.length;
    $('#hiddenAmt').textContent = money(hidden.reduce((s, f) => s + f.amount, 0));
    $('#exportCsv').textContent = unlocked ? 'Download claim CSV' : '🔒 Download claim CSV';
    $('#exportReport').textContent = unlocked ? 'Print / save report as PDF' : '🔒 Print / save report as PDF';
  }

  // ---------- export ----------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function gate() { if (isUnlocked()) return true; $('#paywall').hidden = false; $('#paywall').scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
  $('#exportCsv').addEventListener('click', () => { if (!lastResult || !gate()) return; download(`recoverkit-claims-${lastResult.asOf}.csv`, E.toClaimCsv(lastResult.findings), 'text/csv'); });
  $('#exportReport').addEventListener('click', () => {
    if (!lastResult || !gate()) return;
    const r = lastResult, w = window.open('', '_blank');
    w.document.write(`<!doctype html><title>RecoverKit audit ${r.asOf}</title><style>body{font:13px system-ui;margin:32px;color:#14201b}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}.r{text-align:right}.k{display:flex;gap:28px;margin:16px 0}.k b{display:block;font-size:20px}</style>
      <h1>FBA Reimbursement Audit</h1><p>As of ${r.asOf} · ${r.findings.length} potential claims · estimated recoverable <b>${money2(r.totals.all)}</b></p>
      <div class="k">${CATS.map(([k, l]) => `<div>${l}<b>${money2(r.totals[k])}</b></div>`).join('')}</div>
      <table><tr><th>Type</th><th>Reference</th><th>SKU</th><th>Units</th><th>Evidence</th><th>Suggested case text</th><th class="r">Est. $</th></tr>
      ${r.findings.map(f => `<tr><td>${esc(f.label)}</td><td>${esc(f.reference)}</td><td>${esc(f.sku)}</td><td>${f.units}</td><td>${esc(f.evidence)}</td><td>${esc(f.caseText)}</td><td class="r">${money2(f.amount)}</td></tr>`).join('')}</table>
      <p style="color:#777;margin-top:24px">Estimates only. Check each item against your Reimbursements report before filing.</p>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  });

  // ---------- paywall wiring ----------
  $$('.price').forEach(e => e.textContent = C.price);
  $$('.dfy').forEach(e => e.textContent = C.doneForYouRate);
  $('#buyBtn').href = C.paymentLink;
  $('#dfyBtn').href = `mailto:${C.doneForYouEmail}?subject=${encodeURIComponent('Done-for-you FBA claims')}&body=${encodeURIComponent('My free scan found an estimated recoverable amount. Please file these claims for me.')}`;
  $('#dfyBtn').addEventListener('click', () => { if (lastResult) $('#dfyBtn').href = $('#dfyBtn').href.replace('an estimated recoverable amount', money(lastResult.totals.all) + ' recoverable'); });
  $('#codeForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (await tryUnlock($('#codeInput').value)) render(); else alert('That code didn\'t work.');
  });
  (async () => { // returning from checkout: ?unlock=CODE
    const code = new URLSearchParams(location.search).get('unlock');
    if (code && await tryUnlock(code)) history.replaceState(null, '', location.pathname + '#audit');
  })();

  renderSlots();

  // ---------- tiny SHA-256 fallback (for file:// where crypto.subtle is unavailable) ----------
  function sha256Fallback(ascii) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const K = [], H = []; let p = 2, n = 0;
    const isP = x => { for (let i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; };
    while (n < 64) { if (isP(p)) { if (n < 8) H[n] = (Math.pow(p, 1 / 2) * 2 ** 32) | 0; K[n++] = (Math.pow(p, 1 / 3) * 2 ** 32) | 0; } p++; }
    const bytes = [...new TextEncoder().encode(ascii)], bitLen = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 255);
    for (let j = 0; j < bytes.length; j += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (bytes[j + i * 4] << 24) | (bytes[j + i * 4 + 1] << 16) | (bytes[j + i * 4 + 2] << 8) | bytes[j + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  window.__rkSha256Fallback = sha256Fallback;
})();
