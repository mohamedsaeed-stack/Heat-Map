'use strict';
// Parse HubSpot MCP spill files into plain record arrays.
//
// Why this exists: the connector writes any result over ~100KB to a file in the
// session's tool-results directory and returns only the path. That is the cheap
// path - a wide 480-row partition costs ~250 tokens to request and nothing to
// receive, while a narrow result comes back inline and costs thousands. So we
// deliberately ask for MANY columns, then read the rows off disk here.
//
// Shape of a spill file:
//   {"results":[{"content":"<json string of one record>"}, ...]}
// Each content is a JSON string: {objectTypeId, properties:{...}}
//
//   node scripts/parse-spill.js <file-or-dir> [--out raw/x.json] [--since <ms>]
//
// PII: the connector returns `phone` and `domain` whether asked for or not.
// Phone is dropped here and never reaches data/ or the page.

const fs = require('fs');
const path = require('path');

const DROP = new Set(['phone', 'phone_formatted']);

function recordsFrom(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
  if (!j || !Array.isArray(j.results)) return [];
  const out = [];
  for (const r of j.results) {
    if (typeof r.content !== 'string') continue;
    // A content block is either one record, or a TSV/report blob we ignore.
    let rec;
    try { rec = JSON.parse(r.content); } catch (e) { continue; }
    const props = rec && rec.properties ? rec.properties : null;
    if (!props) continue;
    const clean = {};
    for (const [k, v] of Object.entries(props)) {
      if (DROP.has(k)) continue;
      if (v === null || v === undefined || v === '') continue;
      clean[k] = v;
    }
    if (Object.keys(clean).length) out.push(clean);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const target = args[0];
  const outIdx = args.indexOf('--out');
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx > -1 ? Number(args[sinceIdx + 1]) : 0;

  let files = [];
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    files = fs.readdirSync(target)
      .filter(f => f.includes('query_crm_data'))
      .map(f => path.join(target, f))
      .filter(f => fs.statSync(f).mtimeMs >= since)
      .sort();
  } else {
    files = [target];
  }

  const all = [];
  for (const f of files) {
    const recs = recordsFrom(f);
    console.log(path.basename(f) + '  ->  ' + recs.length + ' records');
    all.push(...recs);
  }

  // Dedupe on hs_object_id, keeping the richest copy.
  const byId = new Map();
  for (const r of all) {
    const id = r.hs_object_id;
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || Object.keys(r).length > Object.keys(prev).length) byId.set(id, r);
  }

  console.log('rows parsed      ' + all.length);
  console.log('distinct ids     ' + byId.size);
  if (byId.size) {
    const ids = [...byId.keys()].map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    console.log('min id           ' + ids[0]);
    console.log('max id           ' + ids[ids.length - 1]);
  }

  if (outIdx > -1) {
    const out = args[outIdx + 1];
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify([...byId.values()], null, 0));
    console.log('wrote            ' + out);
  }
}

main();
