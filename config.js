/* Edit these before you deploy. */
window.RECOVERKIT_CONFIG = {
  productName: 'RecoverKit',
  price: '$49',                       // one-time unlock price shown on the paywall
  // Stripe Payment Link (or Gumroad/Lemon Squeezy checkout). Set its success URL to
  // https://YOUR-DOMAIN/?unlock=YOUR-CODE so buyers come back unlocked.
  paymentLink: 'https://buy.stripe.com/test_REPLACE_ME',
  // SHA-256 hashes of valid unlock codes (generate with: node tools/hash-code.js MYCODE).
  // Default hash below is for the code DEMO-UNLOCK. Replace before launch.
  unlockCodeHashes: ['2cdba590f46209ae2d8d379085fc7a7318d4eb05cd22ae6176b3c21e58fa6447'],
  doneForYouEmail: 'claims@your-domain.com', // "we file it for you, 20% of recovered" upsell
  doneForYouRate: '20%',
};
