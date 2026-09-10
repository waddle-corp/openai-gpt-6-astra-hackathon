import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://localhost:4318';
const root = await fetch(origin, { redirect: 'manual' });
assert.equal(root.status, 307);
assert.equal(root.headers.get('location'), '/store');
for (const path of [
  '/store',
  '/store/products/boosted-charger',
  '/store/collections/all?page=2',
  '/store/search?q=board',
  '/store/cart',
  '/store/checkout',
]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.match(html, /class="store-header"/, path);
  assert.match(html, /class="store-footer"/, path);
  assert.doesNotMatch(
    html,
    /(?:href|action)="\/(?:products|collections|search|cart|checkout|pages|blogs)(?:[/?"])/,
    path,
  );
  console.log('OK', path);
}
const admin = await fetch(origin + '/admin');
assert.equal(admin.status, 200);
const html = await admin.text();
assert.doesNotMatch(
  html,
  /store-header|store-footer|store-scope|boosted-demo-cart/,
);
assert.match(html, /Feedback becomes/);
assert.match(html, /Feedback workflow/);
const image = await fetch(
  origin +
    '/media/storefront/buy-boosted-boards-online-electric-skateboard-2.png',
);
assert.equal(image.status, 200);
assert.match(image.headers.get('content-type'), /image/);
const canonical = await fetch(
  origin +
    '/store/collections/accessories/products/boosted-charger?variant=123',
  { redirect: 'manual' },
);
assert.equal(canonical.status, 307);
assert.equal(
  canonical.headers.get('location'),
  '/store/products/boosted-charger?variant=123',
);
console.log(
  'OK root redirect, merchant admin, static image, canonical product redirect',
);
