'use strict';
// Pack the measured createdate buckets into partitions that each stay under the
// 500-row cap on a record SELECT.
//
// Why this is not "split the months evenly": bulk-import days break any even
// split. 2026-01-14 alone holds 468 records, 2026-03-04 holds 417 and
// 2026-03-31 holds 396. A month split into four equal date ranges would put
// 900+ rows in one of them and silently truncate at 500 with no error.
//
//   node scripts/plan-partitions.js            print the plan
//   node scripts/plan-partitions.js --write    also write lookups/dubai-partitions.json

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'lookups', 'dubai-createdate-buckets.json');
const OUT = path.join(ROOT, 'lookups', 'dubai-partitions.json');

const CAP = 480; // 500 is the hard cap; 480 leaves headroom

function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// Flatten every bucket into {start, end, n}, in date order.
const buckets = [];
for (const [ym, n] of Object.entries(src.monthly)) {
  buckets.push({ start: ym + '-01', end: lastDayOfMonth(ym), n });
}
for (const [d, n] of Object.entries(src.daily)) {
  buckets.push({ start: d, end: d, n });
}
buckets.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

const bucketSum = buckets.reduce((s, b) => s + b.n, 0);

// Greedy pack in date order. A single bucket bigger than the cap becomes its own
// partition and is FLAGGED - it cannot be split further by date, so it needs a
// second dimension (industry) to be pulled safely.
const partitions = [];
let cur = null;
const oversize = [];

for (const b of buckets) {
  if (b.n > CAP) {
    if (cur) { partitions.push(cur); cur = null; }
    partitions.push({ start: b.start, end: b.end, expected: b.n, oversize: b.n > 500 });
    if (b.n > 500) oversize.push(b);
    continue;
  }
  if (!cur) { cur = { start: b.start, end: b.end, expected: b.n }; continue; }
  if (cur.expected + b.n <= CAP) { cur.end = b.end; cur.expected += b.n; }
  else { partitions.push(cur); cur = { start: b.start, end: b.end, expected: b.n }; }
}
if (cur) partitions.push(cur);

const packed = partitions.reduce((s, p) => s + p.expected, 0);

console.log('buckets            ' + buckets.length);
console.log('bucket sum         ' + bucketSum);
console.log('declared total     ' + src._total);
console.log('partitions         ' + partitions.length);
console.log('packed sum         ' + packed);
console.log('largest partition  ' + Math.max(...partitions.map(p => p.expected)));
console.log('');
if (packed !== bucketSum) { console.log('! packing lost rows'); process.exitCode = 1; }
if (bucketSum !== src._total) {
  console.log('NOTE: buckets sum to ' + bucketSum + ' against a declared total of ' + src._total +
    ' (difference ' + (bucketSum - src._total) + '). Records with a null createdate fall outside every bucket ' +
    'and need their own partition.');
  console.log('');
}
if (oversize.length) {
  console.log('! single days above the 500 cap, cannot be split by date alone:');
  for (const b of oversize) console.log('   ' + b.start + '  ' + b.n);
  console.log('');
}

console.log('idx  start        end          expected');
partitions.forEach((p, i) => {
  console.log(String(i).padStart(3) + '  ' + p.start + '   ' + p.end + '   ' + String(p.expected).padStart(4) +
    (p.oversize ? '   OVERSIZE' : ''));
});

if (process.argv.includes('--write')) {
  fs.writeFileSync(OUT, JSON.stringify({
    _comment: 'Partition plan for the Dubai COMPANY pull. Each partition must return exactly `expected` rows; ' +
              'a parsed count below that means the query truncated and the partition must be split.',
    _generated_from: 'lookups/dubai-createdate-buckets.json',
    _cap: CAP,
    _total: packed,
    partitions,
  }, null, 2) + '\n');
  console.log('');
  console.log('wrote ' + path.relative(ROOT, OUT));
}
