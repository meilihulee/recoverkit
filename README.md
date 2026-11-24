# RecoverKit: FBA Reimbursement Audit (client-side MVP)

A static web app. No server, no build step, no Amazon API. Sellers drop in their Seller Central exports and the audit runs in their browser tab.

## What it flags
1. **Short-received inbound**: shipped minus received, per shipment and SKU. Skips shipments younger than 30 days and older than the lookback.
2. **Refunded, not returned**: refunds from the Payments transaction report with no matching FBA customer return, more than 60 days after the refund.
3. **Fee / dimension overcharges**: recomputes the FBA fee from the seller's measured dimensions, or from Amazon's own dimensions when none are given. Multiplies the difference by units shipped from the ledger.
4. Bonus: **lost or damaged in warehouse**, meaning ledger adjustments M/E minus F (found).

Dollar values are estimates. Unit value is a % of list price (default 60%, adjustable). The fee table in `engine.js` (`DEFAULT_FEE_TABLE`) is approximate. Update it to Amazon's current rate card before launch.

## Files
- `index.html`: landing page, audit UI, pricing, FAQ
- `engine.js`: parsing, report detection, audit logic, CSV export (pure JS, also runs in Node)
- `demo-data.js`: seeded, realistic 8-SKU demo dataset
- `app.js`: UI, drag-and-drop, paywall, exports
- `config.js`: **edit before deploy**: price, payment link, unlock-code hashes, done-for-you email
- `tools/hash-code.js`: generates an unlock-code hash
- `test.js`: runs the engine on the demo data from the command line

## Run locally
    cd fba-audit
    python3 -m http.server 8080     # then open http://localhost:8080
    node test.js                    # engine check, no browser needed

Opening `index.html` directly also works.

## Paywall setup (about 10 minutes)
1. Create a Stripe Payment Link for the unlock price.
2. Pick an unlock code, e.g. `RK-7Q4Z`. Run `node tools/hash-code.js RK-7Q4Z` and paste the hash into `unlockCodeHashes` in `config.js`. Remove the demo hash (code `DEMO-UNLOCK`).
3. Set the Payment Link's after-payment redirect to `https://YOUR-DOMAIN/?unlock=RK-7Q4Z`.
4. Put the link in `paymentLink`.

The unlock is client-side, so a determined user can bypass it. That's acceptable for validating demand. For real enforcement, move export generation behind a tiny serverless function that checks the Stripe session, or issue per-buyer codes. The done-for-you button opens an email. That 20%-of-recovered upsell is where most revenue is likely to come from.

## Deploy (any static host, free)
- **Netlify Drop**: drag the folder onto app.netlify.com/drop
- **Cloudflare Pages / Vercel**: new project → upload folder or connect repo, no build command, output dir `/`
- **GitHub Pages**: push to a repo → Settings → Pages → deploy from branch

Add your domain, then put a privacy line on the page: "files never leave your browser." Analytics such as Plausible must not capture file contents.

## Known MVP limits
- Doesn't yet match findings against the Reimbursements report, so some may already be paid. Next feature to add.
- Column aliases cover common US report versions. If a report isn't recognised, add its headers to `ALIASES` / `detectType` in `engine.js`.
- Very large ledgers (500k+ rows) parse on the main thread. Move to a Web Worker if needed.
