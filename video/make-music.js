'use strict';
// Original 60 s soundtrack for heat-story-60s.mp4, synthesised from scratch (no samples, no licence issues).
// 120 BPM, A minor. Ambient intro, beat drops at "Mad Monday" (14 s), chimes on each close,
// a big hit on "Area Dominator", celebration under the scoreboard, soft outro.
//   node make-music.js  -> out/music.wav
const fs = require('fs'), path = require('path');
const SR = 44100, DUR = 60, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
const BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan) ; R[i] += v * (1 + pan); } };
const level = t => t < 5 ? 0.6 : t < 14 ? 0.75 : t < 56 ? 1 : Math.max(0, 1 - (t - 56) / 4) * 0.9;

function tone(t0, dur, f, amp, { type = 'sine', a = 0.01, r = 0.2, pan = 0, detune = 0 } = {}) {
  const s0 = Math.floor(t0 * SR), n = Math.floor((dur + r) * SR);
  for (let k = 0; k < n; k++) {
    const t = k / SR, env = t < a ? t / a : t < dur ? 1 : Math.max(0, 1 - (t - dur) / r);
    let v = 0;
    for (const d of detune ? [-detune, 0, detune] : [0]) {
      const ph = (t * f * (1 + d)) % 1;
      v += type === 'saw' ? 2 * ph - 1 : type === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(2 * Math.PI * ph);
    }
    add(s0 + k, v / (detune ? 3 : 1) * env * amp * level(t0 + t), pan);
  }
}
function kick(t0, amp = 0.9) {
  const s0 = Math.floor(t0 * SR);
  for (let k = 0; k < SR * 0.35; k++) { const t = k / SR, f = 50 + 110 * Math.exp(-t * 30); add(s0 + k, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * amp * level(t0)); }
}
function hat(t0, amp = 0.12, len = 0.05, pan = 0.3) {
  const s0 = Math.floor(t0 * SR); let prev = 0;
  for (let k = 0; k < SR * len; k++) { const n = rnd(), hp = n - prev; prev = n; add(s0 + k, hp * Math.exp(-k / SR * 60) * amp * level(t0), pan); }
}
function clap(t0, amp = 0.25) {
  const s0 = Math.floor(t0 * SR);
  for (let k = 0; k < SR * 0.2; k++) { const t = k / SR; add(s0 + k, rnd() * Math.exp(-t * 22) * amp * level(t0), -0.1); }
}
function riser(t0, dur, amp = 0.18) {
  const s0 = Math.floor(t0 * SR); let lp = 0;
  for (let k = 0; k < SR * dur; k++) { const p = k / (SR * dur), c = 0.02 + p * 0.5; lp += c * (rnd() - lp); add(s0 + k, lp * p * p * amp * 4 * level(t0)); }
}
function chime(t0, base, amp = 0.22) { [0, 7, 12, 16].forEach((iv, j) => tone(t0 + j * 0.06, 0.12, hz(base + iv), amp, { type: 'tri', a: 0.003, r: 0.6, pan: j % 2 ? 0.4 : -0.4 })); }

// chords: Am - F - C - G (one per bar)
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const ROOT = [45, 41, 48, 43];
for (let bar = 0; bar * BAR < DUR; bar++) {
  const t = bar * BAR, c = CH[bar % 4];
  // pad all the way through
  c.forEach((m, j) => tone(t, BAR, hz(m), 0.05, { type: 'saw', a: bar === 0 ? 2.5 : 0.4, r: 0.6, detune: 0.004, pan: j - 1 }));
  for (let b = 0; b < 4; b++) {
    const tb = t + b * BEAT;
    if (tb >= 5 && tb < 56) hat(tb + BEAT / 2, 0.09);                       // offbeat pulse from 5 s
    if (tb >= 14 && tb < 56) { kick(tb); if (b % 2) clap(tb); }               // beat drops at Mad Monday
    if (tb >= 14 && tb < 56) for (let e = 0; e < 2; e++) {                    // bass, 8ths
      tone(tb + e * BEAT / 2, BEAT / 2 * 0.8, hz(ROOT[bar % 4] - 12 + (e ? 12 : 0)), 0.16, { type: 'saw', a: 0.005, r: 0.05 });
    }
    if (tb >= 24 && tb < 56) tone(tb, BEAT * 0.5, hz(c[(b + bar) % 3] + 12), 0.05, { type: 'tri', a: 0.005, r: 0.15, pan: b % 2 ? 0.5 : -0.5 }); // arp from the route
  }
}
// moments
riser(11.5, 2.5); kick(14, 1); chime(14, 69, 0.15);            // Mad Monday
chime(40.5, 69); chime(43.5, 72); riser(45, 2.4, 0.22);        // closes 1, 2
chime(46.5, 76, 0.26); kick(47.4, 1.1); clap(47.4, 0.4);        // close 3 -> Area Dominator
[0, 4, 7, 12].forEach((iv, j) => tone(47.4, 2.2, hz(57 + iv), 0.08, { type: 'saw', a: 0.01, r: 1.5, detune: 0.006, pan: j % 2 ? 0.5 : -0.5 }));
chime(52, 81, 0.18); chime(54, 76, 0.16);                        // scoreboard climb
tone(56, 3.5, hz(45), 0.12, { a: 0.05, r: 0.5 }); tone(56, 3.5, hz(57), 0.06, { a: 0.05, r: 0.5 }); // outro

// fade in/out, normalise, write 16-bit WAV
let peak = 0;
for (let i = 0; i < N; i++) { const t = i / SR, g = Math.min(1, t / 1.5) * Math.min(1, (DUR - t) / 1.2); L[i] *= g; R[i] *= g; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = 0.89 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.tanh(L[i] * norm) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.tanh(R[i] * norm) * 32767), 46 + i * 4); }
fs.writeFileSync(path.join(__dirname, 'out/music.wav'), buf);
console.log('wrote out/music.wav, peak', peak.toFixed(2));
