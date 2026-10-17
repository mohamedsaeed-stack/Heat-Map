'use strict';
// Which 3 people at a company a rep should see first. Lower tier is better.
// Mohamed, 17 Oct 2026: "owners and then VP and so on ... owner, founder, finance,
// or head". Generic mailboxes ("Info department") sink last.

const TIERS = [
  /\b(owner|founder|co-?founder|proprietor|chairman|chairwoman|ceo|chief executive|managing director|md|president|managing partner)\b/,
  /\b(cfo|chief financial|finance|financial|accountant|accounts|treasur\w*|controller)\b/,
  /\b(coo|cto|cmo|cco|chief|vice president|vp|general manager|gm|director|head|partner)\b/,
  /\bmanager\b/,
];

function tier(title, name) {
  const t = String(title || '').toLowerCase();
  if (/\bdepartment\b/.test(t) || /^(info|hello|sales|support|admin|contact|accounts?)\b/i.test(name || '')) return 9;
  if (!t) return 8;
  const i = TIERS.findIndex(re => re.test(t));
  return i < 0 ? TIERS.length : i;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const clean = s => String(s || '').replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, k) => ENT[k]).replace(/\s+/g, ' ').trim();

// HubSpot contact properties -> [id, name, title, hasPhone], best 3 first.
function top3(contacts) {
  return contacts.map(p => {
    const name = clean([p.firstname, p.lastname].filter(Boolean).join(' ')) || clean(p.email && p.email.split('@')[0]);
    const title = clean(p.jobtitle);
    return {
      row: [String(p.hs_object_id), name, title, p.phone || p.mobilephone ? 1 : 0],
      tier: tier(title, name),
      last: Date.parse(p.notes_last_contacted) || Number(p.notes_last_contacted) || 0,
      made: Date.parse(p.createdate) || Number(p.createdate) || 0,
    };
  })
    .sort((a, b) => a.tier - b.tier || b.row[3] - a.row[3] || b.last - a.last || b.made - a.made)
    .slice(0, 3)
    .map(c => c.row);
}

module.exports = { tier, clean, top3 };
