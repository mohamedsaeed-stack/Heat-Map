'use strict';
// Pure matching rules for Google Places results (no I/O, no network).
// Used by scripts/google-places.js; tested by places-match.test.js
// (node --test scripts/lib/places-match.test.js).
//
//   brandTokens(name)               the significant words of a name
//   matchScore(company, place)      Jaccard on tokens + bonus for the first brand token
//   isUAE(lat, lng)                 coarse bounding box
//   acceptBranches(company, places) which Places results are really this brand
//   pickHq(company, branches)       which branch is the head office, or null
//   cleanName(name)                 the name as sent to Text Search
//   deriveEmirateArea(addr, lat, lng)  emirate + area from a Google address string

const GENERIC = new Set([
  'the', 'al', 'and', 'of', 'llc', 'trading', 'general', 'restaurant', 'cafe', 'center', 'centre',
  'medical', 'motors', 'group', 'store', 'services', 'company', 'international', 'est', 'establishment',
  'fz', 'fzco', 'fze', 'dubai', 'abu', 'dhabi', 'sharjah', 'uae',
  // beyond the brief: legal suffixes and listing words that say nothing about the brand
  'ltd', 'limited', 'inc', 'co', 'corp', 'corporation', 'fzc', 'fzllc', 'branch', 'branches', 'me',
  // category words: they describe the business, they are not the brand
  'fitness', 'gym', 'foods', 'food', 'coffee', 'bakery', 'laundry', 'perfumes', 'perfume', 'salon',
  'pharmacy', 'clinic', 'seafood', 'kitchen', 'grill', 'sweets', 'market', 'mart', 'shop', 'house',
  'island', 'power', 'london', 'global', 'national', 'emirates', 'middle', 'east', 'dxb',
  'llc', 'l', 'lc', 'llcs', 'fzllc', 'fzco',
]);

// A result that is a building of worship, a station, a car park... is never a company's branch,
// however much of the name it shares ("Furqan Mosque" is not "Al Furqan Trading").
const BAD_TYPES = new Set([
  'mosque', 'place_of_worship', 'church', 'hindu_temple', 'synagogue', 'school', 'primary_school',
  'secondary_school', 'university', 'transit_station', 'bus_station', 'bus_stop', 'subway_station',
  'train_station', 'light_rail_station', 'parking', 'cemetery', 'locality', 'political',
  'neighborhood', 'sublocality', 'route', 'street_address', 'country', 'administrative_area_level_1',
]);
const BAD_NAME_WORDS = new Set(['mosque', 'masjid', 'church', 'temple', 'parking', 'metro', 'station', 'cemetery']);

const decode = v => String(v == null ? '' : v)
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Lower-cased words, accents folded, anything that is not a letter or digit is a space.
function words(s) {
  return decode(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

// "J I V A" -> ["jiva"], "L.L.C" -> ["llc"]: a run of 2+ single letters is one word.
function mergeLetters(ws) {
  const out = [];
  for (let i = 0; i < ws.length;) {
    if (/^\p{L}$/u.test(ws[i])) {
      let j = i; while (j < ws.length && /^\p{L}$/u.test(ws[j])) j++;
      if (j - i >= 2) { out.push(ws.slice(i, j).join('')); i = j; continue; }
    }
    out.push(ws[i++]);
  }
  return out;
}

function brandTokens(name) {
  const out = [];
  for (const w of mergeLetters(words(name))) {
    if (GENERIC.has(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

function editLE1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [l, sh] = a.length > b.length ? [a, b] : [b, a];
  return l.slice(i + 1) === sh.slice(i);
}
// does brand word w (or its edit-distance-1 variant, for 5+ letters) appear among the place's tokens?
const hasWord = (w, pt) => pt.some(t => t === w || (w.length >= 5 && t.length >= 5 && editLE1(w, t)));

// 0..1. Jaccard of the two token sets, plus 0.15 when the first brand token of the company
// is among the place's tokens. Two names with no brand tokens never match.
function matchScore(companyName, placeName) {
  const a = brandTokens(companyName), b = brandTokens(placeName);
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter(t => sb.has(t)).length;
  const union = new Set([...a, ...b]).size;
  let s = inter / union;
  if (sb.has(a[0])) s += 0.15;
  if (a.join('') === b.join('')) s = 1;   // same brand once spaces/punctuation are removed
  return Math.min(1, +s.toFixed(4));
}

const isUAE = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 22 && lat <= 26.5 && lng >= 51 && lng <= 56.5;

function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Gate on top of the score: the first brand word must be in the place name, and a company with
// 2+ brand words must have at least two of them there ("Live Current" is not "Live Dubai").
function brandGate(ct, pt) {
  if (ct.join('') === pt.join('')) return true;
  if (!hasWord(ct[0], pt)) return false;
  const hits = ct.filter(w => hasWord(w, pt)).length;
  return hits >= Math.min(ct.length, Math.max(2, Math.ceil(ct.length * 2 / 3)));
}

const UAE_ADDR = /united arab emirates|uae|dubai|abu dhabi|sharjah|ajman|umm al quwain|ras al khaimah|fujairah/i;

const MAX_BRANCHES = 150, MIN_SCORE = 0.5, MIN_SCORE_SINGLE = 0.34, DEDUPE_M = 30;

// Normalise one Places API (New) result into the shape used here.
function normPlace(p) {
  const loc = p.location || {};
  return {
    placeId: p.id || p.placeId || p.cid || null,
    name: (p.displayName && p.displayName.text) || (typeof p.displayName === 'string' ? p.displayName : p.name) || '',
    address: p.formattedAddress || p.address || '',
    lat: loc.latitude != null ? +loc.latitude : (p.lat != null ? +p.lat : NaN),
    lng: loc.longitude != null ? +loc.longitude : (p.lng != null ? +p.lng : NaN),
    types: p.types || [],
    status: p.businessStatus || null,
    cid: p.cid || null,
  };
}

// company: {n: name, ...}  places: raw Places API (New) results (or already-normalised ones).
// Returns { branches:[{placeId,name,address,lat,lng,score}], rejected:[{placeId,name,address,score,why}], reason }.
function acceptBranches(company, places) {
  const cname = company.n || company.name || '';
  const ct = brandTokens(cname);
  const rejected = [], cand = [];
  const list = (places || []).map(normPlace);
  if (!list.length) return { branches: [], rejected, reason: 'no places returned' };
  if (!ct.length) {
    for (const p of list) rejected.push({ placeId: p.placeId, name: p.name, address: p.address, score: 0, why: 'company name has no brand tokens' });
    return { branches: [], rejected, reason: 'company name has no brand tokens' };
  }
  const companyWords = new Set(words(cname));
  const seen = new Set();
  for (const p of list) {
    const rej = why => rejected.push({ placeId: p.placeId, name: p.name, address: p.address, score: score, why });
    const score = matchScore(cname, p.name);
    if (p.placeId && seen.has(p.placeId)) { rej('duplicate placeId'); continue; }
    if (p.placeId) seen.add(p.placeId);
    const hasCoords = Number.isFinite(p.lat) && Number.isFinite(p.lng);
    if (hasCoords ? !isUAE(p.lat, p.lng) : !UAE_ADDR.test(p.address)) { rej('outside UAE'); continue; }
    if (p.status === 'CLOSED_PERMANENTLY') { rej('closed permanently'); continue; }
    const badType = p.types.find(t => BAD_TYPES.has(t));
    const badWord = words(p.name).find(w => BAD_NAME_WORDS.has(w) && !companyWords.has(w));
    if (badType || badWord) { rej('not a business of this kind (' + (badType || badWord) + ')'); continue; }
    const pt = new Set(brandTokens(p.name));
    if (!brandGate(ct, [...pt])) { rej('brand word missing'); continue; }
    if (ct.length > 1 && score < MIN_SCORE_SINGLE) { rej('low name score'); continue; }
    // the listing's own name before any ", " / " - " branch suffix; brand words in it that the
    // company does not have ("Hive Board Game Cafe" -> "board game") mark a different business
    const head = brandTokens(String(p.name).split(/\s+-\s+|,|\||–/)[0]);
    const extra = head.join('') === ct.join('') ? '' : head.filter(w => !hasWord(w, ct)).join(' ');
    const c = { placeId: p.placeId, cid: p.cid, name: p.name, address: p.address, lat: hasCoords ? p.lat : null, lng: hasCoords ? p.lng : null, score, extra };
    if (!hasCoords) c.needsGeocode = true;
    cand.push(c);
  }
  // An ambiguous name ("Hive", "Green Land") pulls in many unrelated businesses that merely contain
  // it: when the candidates carry 3+ different sets of extra brand words, keep only the exact ones.
  const sigs = new Set(cand.map(c => c.extra).filter(Boolean));
  if (sigs.size >= 2) {
    for (let i = cand.length - 1; i >= 0; i--) if (cand[i].extra) {
      const c = cand.splice(i, 1)[0];
      rejected.push({ placeId: c.placeId, name: c.name, address: c.address, score: c.score, why: 'other brand words: ' + c.extra });
    }
  }
  for (const c of cand) delete c.extra;
  // best first, then drop anything within 30 m of an already-kept branch
  cand.sort((a, b) => b.score - a.score);
  const branches = [];
  for (const c of cand) {
    const near = c.needsGeocode ? null : branches.find(b => !b.needsGeocode && distM(b.lat, b.lng, c.lat, c.lng) < DEDUPE_M);
    if (near) { rejected.push({ placeId: c.placeId, name: c.name, address: c.address, score: c.score, why: 'within 30 m of ' + near.placeId }); continue; }
    if (branches.length >= MAX_BRANCHES) { rejected.push({ placeId: c.placeId, name: c.name, address: c.address, score: c.score, why: 'over the branch cap' }); continue; }
    branches.push(c);
  }
  return { branches, rejected, reason: branches.length ? 'ok' : 'no result matched the brand' };
}

// Words that appear in nearly every address and say nothing about WHICH one.
const ADDR_NOISE = new Set([
  'dubai', 'uae', 'united', 'arab', 'emirates', 'abu', 'dhabi', 'sharjah', 'ajman', 'umm', 'quwain', 'ras', 'khaimah',
  'fujairah', 'al', 'the', 'of', 'and', 'road', 'rd', 'street', 'st', 'po', 'box', 'p', 'o', 'floor', 'office',
  'building', 'bldg', 'shop', 'unit', 'no', 'google', 'maps', 'near', 'opposite', 'behind', 'area', 'city',
]);
function addrTokens(s) {
  return new Set(words(String(s || '').replace(/\(.*?\)/g, ' ')).filter(w => !ADDR_NOISE.has(w) && (w.length > 1 || /\d/.test(w))));
}

// The head office: the branch whose address best overlaps the address HubSpot holds (c.ga) and
// the area it was placed in (c.a). One branch -> that one. No overlap, or a tie -> null ("HQ unknown").
function pickHq(company, branches) {
  if (!branches || !branches.length) return null;
  if (branches.length === 1) return branches[0];
  const known = new Set([...addrTokens(company.ga), ...addrTokens(company.a)]);
  if (!known.size) return null;
  let best = null, bestScore = 0, tie = false;
  for (const b of branches) {
    const bt = addrTokens(b.address);
    const hit = [...known].filter(t => bt.has(t)).length;
    const s = hit / known.size;
    if (s > bestScore) { best = b; bestScore = s; tie = false; }
    else if (s === bestScore && s > 0) tie = true;
  }
  return best && bestScore > 0 && !tie ? best : null;
}

// Name as sent to Text Search: legal suffixes, (R) and trailing punctuation removed.
function cleanName(name) {
  let s = decode(name).replace(/[®™©]/g, ' ');
  s = s.replace(/\(?\bFZ[\s-]?(?:LLC|CO|E|C)?\b\.?\)?/gi, ' ');
  s = s.replace(/\(?\bL\.?\s?L\.?\s?C\b\.?\)?/gi, ' ');
  s = s.replace(/\bCo\.(?=\s|$|,)|\bCo\b(?=\s*$)/gi, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[\s,.\-–&|/]+|[\s,.\-–&|/]+$/g, '');
  return s.trim();
}

const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
// Same rule as scripts/apply-gmaps.js: the part of the address just before the emirate is the area;
// with no emirate in the text, fall back on the coordinates for the two northern ones.
function deriveEmirateArea(address, lat, lng) {
  const parts = String(address || '').split(/\s+-\s+|,/).map(s => s.trim()).filter(Boolean)
    .filter(s => !/^(united arab emirates|uae)$/i.test(s));
  const e = EMIRATES.find(x => parts.some(p => p.toLowerCase() === x.toLowerCase()))
    || (lat > 25.45 ? (lng > 55.8 ? 'Ras Al Khaimah' : 'Umm Al Quwain') : lng > 55.4 && lat > 25.25 ? 'Sharjah' : null);
  const ei = e ? parts.findIndex(p => p.toLowerCase() === e.toLowerCase()) : parts.length;
  const area = ei > 0 ? parts[ei - 1].replace(/^\d+\s*/, '') || null : null;
  return { emirate: e, area };
}

module.exports = { brandTokens, matchScore, isUAE, acceptBranches, pickHq, cleanName, deriveEmirateArea, distM, normPlace, MAX_BRANCHES };
