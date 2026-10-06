// Is this address string too generic to be trusted as a place?
//
// Shared by the geocoder (which refuses to even look such an address up) and
// by scatter-pins.js (which refuses to draw a cached geocode of one as an
// "exact building"). Both must agree, which is why this lives in one file.
//
// History. The rules below were written in the geocoder on 24 Sep 2026, but a
// cached geocode made before a rule existed was still trusted by the scatter
// step. On 6 Oct 2026 a 20-pin sample test of the Google Maps links showed
// "exact" pins such as "32 C Street" (a random house on some Street 32) and
// "4th Street" (resolved to the city of Dubai itself); 563 exact pins were bare
// numbered streets and 744 more were area names. Scatter now re-checks.
const fs = require('fs');
const path = require('path');

const PLACES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'lookups', 'uae-places.json'), 'utf8'));
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

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

// "Street 2", "شارع 4", "Road 12", "32 C Street", "18 40 St", "4th Street",
// "4 شارع 26": a numbered street with no area is not an address. Every Dubai
// district has a Street 2; Nominatim picks one at random.
const BARE_STREET = /^(?:street|st|road|rd|avenue|ave|شارع|طريق)\s*\d+\s*[a-z]?$|^\d+\s*[a-z]?\s*(?:street|st|road|rd|شارع|طريق)$|^\d+\s+\d+\s*[a-z]?\s*(?:street|st|road|rd)$|^\d+(?:st|nd|rd|th)\s+(?:street|st|road|rd)$|^\d+\s*(?:شارع|طريق)\s*\d+\s*[a-z]?$/i;
// "PO Box 123851" is a mailbox. "Cluster F" is a JLT cluster, an area of
// towers, not one building.
const NOT_A_BUILDING = /^p\.?\s*o\.?\s*box\b[\d\s\-]*$|^cluster\s*[a-z]{1,2}\s*\d?$/i;
// A road name alone ("Al Rigga Road", "Sheikh Zayed Road", "شارع الوصل"): a
// line, not a building. Only matched when the address carries no number at
// all; "1 Sheikh Zayed Road" is left to the geocoder's category.
const ROAD_NAME_ONLY = /^(?!.*\d)(?:[a-z'\- ]+\s(?:road|street|st|rd|boulevard|blvd|avenue|ave)|(?:شارع|طريق)\s[؀-ۿ ]+)$/i;

function isGeneric(addr) {
  // Separators become spaces (6 Oct 2026 review: "Dubai – UAE", "UAE | Abu Dhabi",
  // "United Arab Emirates,Ajman", "PO BOX : 1940" had slipped through as words).
  const a = norm(addr).replace(/[.,;:|\/\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (a.length < 6) return true;
  if (GENERIC.has(a)) return true;
  if (BARE_STREET.test(a)) return true;
  if (NOT_A_BUILDING.test(a)) return true;
  if (/^[\d\s\-\/]+$/.test(a)) return true;             // "12", "4-5": numbers alone
  // "dubai uae", "uae dubai" and friends carry no street information either.
  const words = a.split(' ').filter(Boolean);
  return words.every(w => [...GENERIC].some(g => g.split(' ').includes(w)));
}

// A road name with no number: real, but a line - drawn as "area or street".
function isRoadNameOnly(addr) {
  return ROAD_NAME_ONLY.test(norm(addr).replace(/[.,]/g, '').trim());
}

module.exports = { isGeneric, isRoadNameOnly, norm, GENERIC, BARE_STREET };
