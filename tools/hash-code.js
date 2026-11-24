// Usage: node tools/hash-code.js MY-SECRET-CODE  -> paste the hash into config.js
const c = process.argv[2]; if (!c) { console.error('Pass a code'); process.exit(1); }
console.log(require('crypto').createHash('sha256').update(c.trim().toUpperCase()).digest('hex'));
