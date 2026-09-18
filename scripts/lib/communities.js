'use strict';
// Community extraction - PLAN.md obstacle 3, tier (a).
//
// Turns a company's free text (name + address + address2 + zip) into one Dubai
// community, or null. Deliberately conservative: a miss is recorded as
// "unlocated" and counted on the page. A wrong community is worse than none,
// because it silently moves a pin to another part of the city.

const fs = require('fs');
const path = require('path');

const LOOKUP = path.join(__dirname, '..', '..', 'lookups', 'dubai-communities.json');

// Build one regex per alias, longest alias first so the most specific wins.
function buildMatchers(lookup) {
  const out = [];
  for (const c of lookup.communities) {
    for (const alias of c.aliases) {
      // spaces in the alias become a flexible separator, so "al quoz" also
      // matches "al-quoz" and "alquoz"
      const body = alias
        .split(/\s+/)
        .map(tok => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\s\\-_,.]*');
      out.push({
        community: c.name,
        sector: c.sector,
        alias,
        weight: alias.length,
        re: new RegExp('(?<![a-z0-9])' + body + '(?![a-z0-9])', 'i'),
      });
    }
  }
  out.sort((a, b) => b.weight - a.weight);
  return out;
}

let _matchers = null;
function matchers() {
  if (!_matchers) _matchers = buildMatchers(JSON.parse(fs.readFileSync(LOOKUP, 'utf8')));
  return _matchers;
}

// Fields are joined with a separator that cannot bridge two aliases into one.
function haystack(company) {
  return [company.name, company.address, company.address2, company.zip]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

// Returns { community, sector, alias, matchedOn } or null.
// matchedOn says which field carried the match, because a hit on `name` alone
// ("Al Quoz Trading LLC" registered elsewhere) is weaker evidence than a hit on
// `address`. The page reports the two separately.
function locate(company) {
  const nameOnly = (company.name || '').toLowerCase();
  const addr = [company.address, company.address2, company.zip]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();

  for (const m of matchers()) {
    if (addr && m.re.test(addr)) {
      return { community: m.community, sector: m.sector, alias: m.alias, matchedOn: 'address' };
    }
  }
  for (const m of matchers()) {
    if (nameOnly && m.re.test(nameOnly)) {
      return { community: m.community, sector: m.sector, alias: m.alias, matchedOn: 'name' };
    }
  }
  return null;
}

module.exports = { locate, haystack, buildMatchers, LOOKUP };

// Self-test: node scripts/lib/communities.js
if (require.main === module) {
  const cases = [
    [{ name: 'Acme Foods LLC', address: 'Warehouse 4, Al Quoz Industrial Area 3' }, 'Al Quoz'],
    [{ name: 'Acme Foods LLC', address: 'Cluster X, JLT' }, 'Jumeirah Lakes Towers'],
    [{ name: 'Acme', address: 'Dubai Investment Park 2, Jebel Ali' }, 'Dubai Investment Park'],
    [{ name: 'Acme', address: 'Office 12, Business Bay' }, 'Business Bay'],
    [{ name: 'Acme', address: 'Al-Quoz' }, 'Al Quoz'],
    [{ name: 'Acme', address: 'ALQUOZ' }, 'Al Quoz'],
    [{ name: 'Acme', address: 'Sheikh Zayed Road' }, null],
    [{ name: 'Acme', address: 'Dubai' }, null],
    [{ name: 'Dipped Foods', address: 'Dubai' }, null],
    [{ name: 'Acme', address: 'Shop 3, Deira' }, 'Deira'],
    [{ name: 'Acme', address: 'Jumeirah Village Circle' }, 'Jumeirah Village Circle'],
  ];
  let pass = 0;
  for (const [input, expected] of cases) {
    const got = locate(input);
    const name = got && got.community;
    const ok = name === expected;
    if (ok) pass++;
    console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(input.address) +
      ' -> ' + name + (ok ? '' : '  (expected ' + expected + ')'));
  }
  console.log(pass + '/' + cases.length + ' passed');
  process.exit(pass === cases.length ? 0 : 1);
}
