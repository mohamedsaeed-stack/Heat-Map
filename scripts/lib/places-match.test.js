'use strict';
// node --test scripts/lib/places-match.test.js
const test = require('node:test');
const assert = require('node:assert');
const { brandTokens, matchScore, isUAE, acceptBranches, pickHq, cleanName, deriveEmirateArea } = require('./places-match');

// A Places API (New) result, as the API returns it.
const P = (id, name, lat, lng, extra = {}) => ({
  id, displayName: { text: name }, formattedAddress: extra.address || 'Dubai - United Arab Emirates',
  location: { latitude: lat, longitude: lng }, types: extra.types || ['store'], businessStatus: extra.status || 'OPERATIONAL',
});

test('brandTokens drops generic words', () => {
  assert.deepStrictEqual(brandTokens('Al Furqan Trading L.L.C'), ['furqan']);
  assert.deepStrictEqual(brandTokens('The Zest Restaurant &amp; Cafe'), ['zest']);
  assert.deepStrictEqual(brandTokens('Gulf Medical Center FZCO'), ['gulf']);
});

test('Zest Restaurant vs ZEST Restaurant is accepted', () => {
  assert.ok(matchScore('Zest Restaurant', 'ZEST Restaurant') >= 0.5);
  const r = acceptBranches({ n: 'Zest Restaurant' }, [P('a', 'ZEST Restaurant', 25.2, 55.27)]);
  assert.strictEqual(r.branches.length, 1);
  assert.strictEqual(r.branches[0].placeId, 'a');
});

test('Al Furqan Trading: Grocery accepted via brand token, Mosque rejected', () => {
  const r = acceptBranches({ n: 'Al Furqan Trading' }, [
    P('g', 'Al Furqan Grocery', 25.2, 55.3),
    P('m', 'Furqan Mosque', 25.21, 55.31, { types: ['mosque', 'place_of_worship'] }),
  ]);
  assert.deepStrictEqual(r.branches.map(b => b.placeId), ['g']);
  assert.strictEqual(r.rejected.find(x => x.placeId === 'm').why.startsWith('not a business'), true);
  // even without the type, the word "Mosque" alone rejects it
  const r2 = acceptBranches({ n: 'Al Furqan Trading' }, [P('m2', 'Furqan Mosque', 25.21, 55.31)]);
  assert.strictEqual(r2.branches.length, 0);
});

test('Carzilla vs "Carzilla - Al Quoz branch" is accepted', () => {
  const r = acceptBranches({ n: 'Carzilla' }, [P('c', 'Carzilla - Al Quoz branch', 25.13, 55.23)]);
  assert.strictEqual(r.branches.length, 1);
});

test('unrelated name is rejected on score', () => {
  const r = acceptBranches({ n: 'Carzilla' }, [P('x', 'Fresh Juice Corner', 25.13, 55.23)]);
  assert.strictEqual(r.branches.length, 0);
  assert.strictEqual(r.rejected[0].why, 'brand word missing');
});

test('isUAE rejects a Riyadh result', () => {
  assert.strictEqual(isUAE(24.7136, 46.6753), false);
  assert.strictEqual(isUAE(25.2, 55.27), true);
  const r = acceptBranches({ n: 'Zest Restaurant' }, [P('r', 'Zest Restaurant', 24.7136, 46.6753, { address: 'Riyadh Saudi Arabia' })]);
  assert.strictEqual(r.branches.length, 0);
  assert.strictEqual(r.rejected[0].why, 'outside UAE');
});

test('closed places are rejected', () => {
  const r = acceptBranches({ n: 'Zest Restaurant' }, [P('z', 'Zest Restaurant', 25.2, 55.27, { status: 'CLOSED_PERMANENTLY' })]);
  assert.strictEqual(r.branches.length, 0);
});

test('duplicates by placeId and within 30 m are removed', () => {
  const r = acceptBranches({ n: 'Zest Restaurant' }, [
    P('a', 'Zest Restaurant', 25.2000, 55.2700),
    P('a', 'Zest Restaurant', 25.3000, 55.3000),          // same placeId
    P('b', 'Zest Restaurant (Terrace)', 25.20010, 55.27005), // ~12 m away
    P('c', 'Zest Restaurant', 25.2500, 55.3000),          // far: kept
  ]);
  assert.deepStrictEqual(r.branches.map(b => b.placeId).sort(), ['a', 'c']);
  assert.ok(r.rejected.some(x => x.why === 'duplicate placeId'));
  assert.ok(r.rejected.some(x => x.why.startsWith('within 30 m')));
});

test('every branch is kept (no 12 cap); the same listing twice counts once', () => {
  const places = Array.from({ length: 20 }, (_, i) => P('p' + i, 'Zest Restaurant', 24.5 + i * 0.05, 55.27));
  places.push(P('p3', 'Zest Restaurant', 24.65, 55.27)); // same listing id again, from a second search
  assert.strictEqual(acceptBranches({ n: 'Zest' }, places).branches.length, 20);
});

test('pickHq: address overlap, single branch, unknown', () => {
  const branches = [
    { placeId: 'a', name: 'Carzilla', address: 'Sheikh Zayed Rd - Al Barsha 1 - Dubai - United Arab Emirates', lat: 25.1, lng: 55.2 },
    { placeId: 'b', name: 'Carzilla', address: 'Street 8 - Al Quoz Industrial Area 3 - Dubai - United Arab Emirates', lat: 25.13, lng: 55.23 },
  ];
  assert.strictEqual(pickHq({ ga: 'Warehouse 4, Al Quoz Industrial 3, Dubai', a: 'Al Quoz' }, branches).placeId, 'b');
  assert.strictEqual(pickHq({ ga: '', a: 'Al Barsha' }, branches).placeId, 'a');
  assert.strictEqual(pickHq({ ga: 'Business Bay' }, [branches[0]]).placeId, 'a');   // only one
  assert.strictEqual(pickHq({ ga: 'Deira' }, branches), null);                       // no overlap
  assert.strictEqual(pickHq({}, branches), null);                                    // nothing known
  assert.strictEqual(pickHq({ ga: 'Dubai' }, []), null);
});

test('cleanName', () => {
  assert.strictEqual(cleanName('ZEST RESTAURANT L.L.C.'), 'ZEST RESTAURANT');
  assert.strictEqual(cleanName('Live Current Fzco'), 'Live Current');
  assert.strictEqual(cleanName('Acme Trading FZ-LLC'), 'Acme Trading');
  assert.strictEqual(cleanName('Acme Trading (FZE) -'), 'Acme Trading');
  assert.strictEqual(cleanName('Foo &amp; Bar Co.'), 'Foo & Bar');
  assert.strictEqual(cleanName('Brandname®'), 'Brandname');
  assert.strictEqual(cleanName('Costa Coffee'), 'Costa Coffee');
});

test('deriveEmirateArea follows the apply-gmaps rule', () => {
  assert.deepStrictEqual(deriveEmirateArea('Shop 1 - Al Quoz Industrial Area 3 - Dubai - United Arab Emirates', 25.1, 55.2), { emirate: 'Dubai', area: 'Al Quoz Industrial Area 3' });
  assert.deepStrictEqual(deriveEmirateArea('Al Majaz 3 - Sharjah - United Arab Emirates', 25.33, 55.38), { emirate: 'Sharjah', area: 'Al Majaz 3' });
  assert.deepStrictEqual(deriveEmirateArea('Sheikh Zayed Rd, Dubai, UAE', 25.1, 55.2), { emirate: 'Dubai', area: 'Sheikh Zayed Rd' });
  assert.deepStrictEqual(deriveEmirateArea('United Arab Emirates', 25.6, 55.95), { emirate: 'Ras Al Khaimah', area: null });
});

test('category words and near-miss brands are rejected', () => {
  const none = (c, p) => assert.strictEqual(acceptBranches({ n: c }, [P('x', p, 25.2, 55.3)]).branches.length, 0, c + ' vs ' + p);
  none('Satrang Foods', 'Sark Foods');
  none('Mad Island', 'MADO');
  none('Triple X', 'Triple 7');
  none('Live Current Fzco', 'Live Dubai International');
  none('Gold Gym', 'Fitness Gym');
});

test('letter-spaced CRM names match the glued brand', () => {
  const ok = (c, p) => assert.strictEqual(acceptBranches({ n: c }, [P('x', p, 25.2, 55.3)]).branches.length, 1, c + ' vs ' + p);
  ok('J I V A', 'JIVA Salon');
  ok('H S P', 'HSP Trading LLC');
  assert.deepStrictEqual(brandTokens('J I V A'), ['jiva']);
});

test('UAE address without coordinates is accepted with needsGeocode', () => {
  const r = acceptBranches({ n: 'Zest Restaurant' }, [
    { name: 'ZEST Restaurant', lat: null, lng: null, address: 'Palm - Jumeirah - Dubai - United Arab Emirates' },
    { name: 'ZEST Restaurant', lat: null, lng: null, address: 'Riyadh Saudi Arabia' },
  ]);
  assert.strictEqual(r.branches.length, 1);
  assert.strictEqual(r.branches[0].needsGeocode, true);
  assert.strictEqual(r.rejected[0].why, 'outside UAE');
});
