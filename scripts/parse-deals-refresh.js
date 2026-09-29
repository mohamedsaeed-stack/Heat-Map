'use strict';
// Refresh raw/hubspot-deals-all.json from a SINGLE-OBJECT deals pull (29 Sep 2026).
//
// Why single-object: `SELECT ... FROM deals ORDER BY hs_object_id LIMIT 500 OFFSET n`
// honours ORDER BY and OFFSET (the cross-object traps do not apply), so all 4,3xx
// deals come in nine wide pages that spill to disk. What single-object cannot give
// is the COMPANY the deal is attached to; that is carried over from the previous
// all-deals file by deal id, and the deals new since that file get theirs from a
// small cross-object query (raw/deal-company-new.json, { dealId: companyId }).
//
// Stage labels: the single-object result carries stage IDs only. Labels come from
// lookups/stage-map.json and, failing that, from the previous file.
//
//   node scripts/parse-deals-refresh.js <spillDir> <sinceEpochMs> <expectedCount>
//
// PII: no phone or email is selected; nothing personal reaches the file.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const [spillDir, sinceArg, expectedArg] = process.argv.slice(2);
if (!spillDir || !sinceArg || !expectedArg) { console.error('usage: node scripts/parse-deals-refresh.js <spillDir> <sinceEpochMs> <expectedCount>'); process.exit(1); }
const since = Number(sinceArg), expected = Number(expectedArg);
const OUT = path.join(ROOT, 'raw/hubspot-deals-all.json');

const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const prevById = new Map(prev.map(d => [String(d.deal_id), d]));
const stageMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'lookups/stage-map.json'), 'utf8'));
const labelByStage = new Map();
for (const st of stageMap.stages || []) if (st.stage_id) labelByStage.set(String(st.stage_id), st.label || st.stage_label || st.name || null);
for (const d of prev) if (d.stage_id && d.stage_label && !labelByStage.get(String(d.stage_id))) labelByStage.set(String(d.stage_id), d.stage_label);
const pipelineLabel = new Map();
for (const d of prev) if (d.pipeline_id && d.pipeline) pipelineLabel.set(d.pipeline_id, d.pipeline);
let newCompany = {};
try { newCompany = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw/deal-company-new.json'), 'utf8')); } catch (e) {}

const files = fs.readdirSync(spillDir)
  .filter(f => /query_crm_data-(\d+)\.txt$/.test(f) && Number(f.match(/-(\d+)\.txt$/)[1]) >= since).sort();
const byId = new Map();
let pages = 0, rows = 0;
const iso = ms => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString().slice(0, 10) : (ms || null); };
for (const f of files) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(spillDir, f), 'utf8')); } catch (e) { continue; }
  if (!j || !Array.isArray(j.results)) continue;
  let n = 0;
  for (const r of j.results) {
    if (typeof r.content !== 'string') continue;
    let rec; try { rec = JSON.parse(r.content); } catch (e) { continue; }
    if (!rec || !rec.properties || rec.objectTypeId !== '0-3') continue;
    const p = rec.properties;
    const id = String(p.hs_object_id);
    const old = prevById.get(id) || {};
    const stageId = p.dealstage || null;
    const out = {
      deal_id: id,
      dealname: p.dealname || old.dealname || null,
      dealtype: p.dealtype || old.dealtype || null,
      pipeline_id: p.pipeline || old.pipeline_id || null,
      pipeline: pipelineLabel.get(p.pipeline) || old.pipeline || p.pipeline || null,
      stage_id: stageId,
      stage_label: labelByStage.get(String(stageId)) || (old.stage_id === stageId ? old.stage_label : null) || null,
      dealstage: (labelByStage.get(String(stageId)) || '') + ' (' + stageId + ')',
      closedate: p.closedate_iso ? p.closedate_iso.slice(0, 10) : iso(p.closedate) || old.closedate || null,
      createdate: p.createdate_iso ? p.createdate_iso.slice(0, 10) : iso(p.createdate) || old.createdate || null,
      amount: p.amount_in_home_currency || p.amount || null,
      owner_id: p.hubspot_owner_id || null,
      closed_lost_reason: p.closed_lost_reason || null,
      risk_rejected_reason: p.risk_rejected_reason || null,
      pre_nop_rejection_reason: p.pre_nop_rejection_reason || null,
      company_id: old.company_id || newCompany[id] || null,
      company_name: old.company_name || null, city: old.city || null, state: old.state || null, country: old.country || null,
      domain: old.domain || null, industry: old.industry || null, industry_value: old.industry_value || null,
      lifecyclestage: old.lifecyclestage || null, company_createdate: old.company_createdate || null,
      hs_lastmodifieddate: p.hs_lastmodifieddate_iso || null,
    };
    byId.set(id, out); n++; rows++;
  }
  if (n) pages++;
}
const out = [...byId.values()];
console.log('pages ' + pages + '  rows ' + rows + '  unique ' + out.length + '  expected ' + expected);
if (out.length < expected || out.length - expected > 5) { console.error('DOES NOT RECONCILE - not writing'); process.exit(2); }

// what changed
let stageChanged = 0, newDeals = 0, noCompanyNew = [], unknownStage = new Set(), gone = 0;
for (const d of out) {
  const o = prevById.get(d.deal_id);
  if (!o) { newDeals++; if (!d.company_id) noCompanyNew.push(d.deal_id); }
  else if (o.stage_id !== d.stage_id) stageChanged++;
  if (d.stage_id && !labelByStage.has(String(d.stage_id))) unknownStage.add(d.pipeline_id + '|' + d.stage_id);
}
for (const o of prev) if (!byId.has(String(o.deal_id))) gone++;
console.log('new deals ' + newDeals + ' (without a company id: ' + noCompanyNew.length + ')  stage changed ' + stageChanged + '  deals gone from the portal ' + gone + '  stage ids with no label: ' + [...unknownStage].join(', '));
if (noCompanyNew.length) fs.writeFileSync(path.join(ROOT, 'raw/deal-company-missing.json'), JSON.stringify(noCompanyNew));
fs.copyFileSync(OUT, OUT.replace(/\.json$/, '.prev.json'));
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote raw/hubspot-deals-all.json (previous kept as .prev.json)');
