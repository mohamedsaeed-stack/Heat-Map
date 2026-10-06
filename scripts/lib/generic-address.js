// Is this address string too generic to be trusted as a place?
//
// Shared by the geocoder (which refuses to even look such an address up) and
// by scatter-pins.js (which refuses to draw a cached geocode of one as an
// "exact building"). Both must agree, which is why this lives in one file.
//
// History. The rules were written in the geocoder on 24 Sep 2026, but a cached
// geocode made before a rule existed was still trusted by the scatter step. On
// 6 Oct 2026 a 20-pin sample test of the Google Maps links showed "exact" pins
// such as "32 C Street" (a random house on some Street 32) and "4th Street"
// (resolved to the city of Dubai itself); 563 exact pins were bare numbered
// streets and 744 more were area names. Scatter now re-checks. The adversarial
// review the same day added the separator, PO-box, unit-number, ordinal and
// Arabic-suffix cases below.
const fs = require('fs');
const path = require('path');

const PLACES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'lookups', 'uae-places.json'), 'utf8'));
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Arabic-Indic digits are digits. Separators of every kind become spaces:
// "Dubai – UAE", "UAE | Abu Dhabi", "United Arab Emirates,Ajman" and
// "PO BOX : 1940" all hid behind a character the word test treated as a word.
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function clean(addr) {
  return norm(addr)
    .replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[.,;:|\/\\\-–—#()\[\]'"]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// An address that says nothing more than a city or country is not an address.
const GENERIC = new Set();
for (const [em, def] of Object.entries(PLACES.emirates)) {
  GENERIC.add(norm(em));
  for (const a of def.aliases) GENERIC.add(norm(a));
}
for (const t of PLACES.uae_tokens) GENERIC.add(norm(t));
// The 24 Sep 2026 CRM refresh brought Arabic addresses. An emirate or country
// name in Arabic is as generic as in English.
for (const t of ['دبي', 'أبوظبي', 'أبو ظبي', 'ابوظبي', 'الشارقة', 'عجمان', 'الفجيرة', 'رأس الخيمة', 'راس الخيمة', 'أم القيوين', 'ام القيوين', 'العين', 'الإمارات', 'الامارات', 'الإمارات العربية المتحدة', 'الامارات العربية المتحدة']) GENERIC.add(norm(t));
const GENERIC_WORDS = new Set();
for (const g of GENERIC) for (const w of g.split(' ')) if (w) GENERIC_WORDS.add(w);

// Words that carry no location on their own: "Street", "Office 101", "27th
// floor", "Street No. 54", "Lane 8", "Building 11", "PO Box", "شارع 4".
const FILLER = new Set(['street', 'st', 'road', 'rd', 'avenue', 'ave', 'boulevard', 'blvd', 'lane', 'floor', 'fl',
  'office', 'flat', 'shop', 'unit', 'suite', 'villa', 'warehouse', 'block', 'plot', 'bldg', 'building', 'tower',
  'room', 'no', 'number', 'num', 'po', 'p', 'o', 'box', 'pobox', 'level', 'the', 'of', 'and',
  'شارع', 'طريق', 'مبنى', 'مكتب', 'طابق', 'محل', 'رقم', 'صندوق', 'بريد', 'ص', 'ب', 'شقة', 'فيلا', 'بناية', 'برج', 'الطابق']);
// A number, an ordinal, a number with a letter suffix, or a single letter.
const NUMBERISH = /^(?:\d+(?:st|nd|rd|th)?[a-zأ-ي]?|[a-zأ-ي])$/;
// A mailbox number says where post goes, not where the business is.
const PO_BOX = /\bp\s*o\s*box\b|\bpobox\b|\bص\s*ب\b/;
// "Cluster F" is a JLT cluster, an area of towers, not one building.
const CLUSTER = /^cluster\s*[a-z]{1,2}\s*\d?$/;
// A road name alone ("Al Rigga Road", "Sheikh Zayed Road", "شارع الوصل",
// "Airport Road, Abu Dhabi", "Corniche Road West"): a line, not a building.
// Only matched when the address carries no number at all; "1 Sheikh Zayed Road"
// is left to the geocoder's category and the stacking guard.
const ROAD_NAME_ONLY = /^(?!.*\d)(?:[a-z' ]+\s(?:road|street|st|rd|boulevard|blvd|avenue|ave)(?:\s(?:north|south|east|west))?|(?:شارع|طريق)\s[؀-ۿ ]+)$/i;

function isGeneric(addr) {
  const a = clean(addr);
  if (a.length < 4) return true;
  if (GENERIC.has(a)) return true;
  if (PO_BOX.test(a)) return true;
  if (CLUSTER.test(a)) return true;
  // Every word is a place name we already know, a filler word or a number:
  // "dubai uae", "32 c street", "4 شارع 26", "44 7th street", "office 101",
  // "street", "united arab emirates dubai 7124".
  const words = a.split(' ').filter(Boolean);
  return words.every(w => GENERIC_WORDS.has(w) || FILLER.has(w) || NUMBERISH.test(w));
}

// Strip the emirate / country words off the end, then ask: is what is left a
// bare road name?
function isRoadNameOnly(addr) {
  let a = clean(addr);
  for (const g of [...GENERIC].sort((x, y) => y.length - x.length)) {
    a = a.replace(new RegExp('(?:^|\\s)' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)', 'g'), ' ');
  }
  a = a.replace(/\s+/g, ' ').trim();
  return ROAD_NAME_ONLY.test(a);
}

module.exports = { isGeneric, isRoadNameOnly, clean, norm, GENERIC, GENERIC_WORDS };
