'use strict';
// Parse CROSS-OBJECT HubSpot spill files (e.g. SELECT ... COMPANY.x FROM CONTACT).
//
// Why this is separate from parse-spill.js:
//   A single-object record SELECT spills as JSON records. A CROSS-OBJECT select
//   spills as a TSV table instead - a different shape entirely - and its header
//   row carries DUPLICATE column names: two "[hs_object_id]" columns and two
//   "[country]" columns, one from each object. They are told apart by the label
//   prefix ("Contact [hs_object_id]" vs "Company [hs_object_id]") and, where
//   even that repeats, by position: first occurrence is the FROM object, later
//   occurrences are the associated object.
//
// Two further traps this guards against:
//   - ORDER BY silently returns an EMPTY dataset on these queries, so pages are
//     cut by createdate range instead and every page is checked here.
//   - Truncation at the 500-row cap is SILENT. Any page returning exactly 500
//     rows is reported as SUSPECT so it can be split further.
//
//   node scripts/parse-crossobject.js <dir-or-file> [--out raw/x.json]

const fs = require('fs');
const path = require('path');

function tsvFrom(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  if (!j || !Array.isArray(j.results)) return null;
  for (const r of j.results) {
    if (typeof r.content !== 'string') continue;
    const i = r.content.indexOf('Dataset TSV:');
    if (i === -1) continue;
    return r.content.slice(i + 'Dataset TSV:'.length).replace(/^\s*\n/, '');
  }
  return null;
}

function parseTable(tsv) {
  const lines = tsv.split('\n').filter(l => l.trim() && !/^Showing \d+ of \d+/.test(l));
  if (!lines.length) return { rows: [], cols: [] };
  const rawCols = lines[0].split('\t').map(s => s.trim());

  // Resolve duplicate headers: first wins the bare key, later ones get company_.
  const seen = new Map();
  const cols = rawCols.map(h => {
    const m = h.match(/\[([^\]]+)\]/);
    let key = m ? m[1] : h.toLowerCase().replace(/\W+/g, '_');
    if (/^Company\b/i.test(h) || seen.has(key)) key = 'company_' + key;
    seen.set(key, true);
    return key;
  });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length < 2) continue;
    const o = {};
    cols.forEach((c, k) => {
      let v = (parts[k] || '').trim();
      if (!v || v === 'Unassigned') return;
      o[c] = v;
    });
    if (Object.keys(o).length) rows.push(o);
  }
  return { rows, cols };
}

function main() {
  const args = process.argv.slice(2);
  const target = args[0];
  const outIdx = args.indexOf('--out');

  const st = fs.statSync(target);
  const files = st.isDirectory()
    ? fs.readdirSync(target).filter(f => f.includes('query_crm_data')).map(f => path.join(target, f)).sort()
    : [target];

  const all = [];
  for (const f of files) {
    const tsv = tsvFrom(f);
    if (!tsv) { console.log(path.basename(f) + '  ->  not a cross-object TSV, skipped'); continue; }
    const { rows, cols } = parseTable(tsv);
    const flag = rows.length === 500 ? '   *** SUSPECT: exactly 500, may be truncated ***' : '';
    console.log(path.basename(f) + '  ->  ' + rows.length + ' rows' + flag);
    if (all.length === 0 && rows.length) console.log('   columns: ' + cols.join(', '));
    all.push(...rows);
  }

  // Fold to one row per COMPANY, collecting every city its contacts name.
  const byCompany = new Map();
  for (const r of all) {
    const cid = r.company_hs_object_id;
    if (!cid) continue;
    let e = byCompany.get(cid);
    if (!e) {
      e = { company_id: cid, name: r.company_name || null,
            industry: r.company_industry || null, contact_cities: {}, contacts: 0 };
      byCompany.set(cid, e);
    }
    e.contacts++;
    const city = (r.city || '').toLowerCase().trim();
    if (city) e.contact_cities[city] = (e.contact_cities[city] || 0) + 1;
  }

  console.log('');
  console.log('contact rows        ' + all.length);
  console.log('distinct companies  ' + byCompany.size);

  if (outIdx > -1) {
    const out = args[outIdx + 1];
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify([...byCompany.values()], null, 0));
    console.log('wrote               ' + out);
  }
}

main();
