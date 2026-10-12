import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from 'remotion';
import data from './data.json';

/* 40-second film: four reps, four areas, one Mad Monday. Beat drops at 3.0 s. */

/* ------------------------------------------------------------------ constants */
const W = 1920, H = 1080;
const WORLD = 2 ** 14 * 256;
const px = (lng: number) => ((lng + 180) / 360) * WORLD;
const py = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * WORLD; };
type V = { x: number; y: number };
const M_PER_PX = 8.646; // at z14, lat 25

const NAVY = '#0a1024', BLUE = '#3b82f6', BLUE2 = '#60a5fa', WHITE = '#f8fafc', MUTED = '#94a3b8';
const GREEN = '#22c55e', AMBER = '#f59e0b', RED = '#ef4444', GOLD = '#fbbf24', FIRE = '#f97316';
const FONT = '"Segoe UI", "Segoe UI Emoji", Arial, sans-serif';
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile';
const TILE_FILTER = 'brightness(0.75) sepia(0.6) hue-rotate(185deg) saturate(1.6)';

const ramp = (t: number, a: number, b: number, easing?: (n: number) => number) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
const eIO = Easing.inOut(Easing.cubic), eOut = Easing.out(Easing.cubic), eBack = Easing.out(Easing.back(1.8)), eQ = Easing.inOut(Easing.quad);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const rand = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const glass: React.CSSProperties = { background: 'rgba(15,23,42,0.74)', border: '1px solid #ffffff22', borderRadius: 22, backdropFilter: 'blur(14px)', boxShadow: '0 20px 60px #0007' };

/* ------------------------------------------------------------------ data */
type Lbl = 'w' | 'p' | 'l';
type Pin = V & { l: Lbl; i: number };
const pins: Pin[] = (data.pins as { x: number; y: number; l: string }[]).map((p, i) => ({ x: px(p.x), y: py(p.y), l: p.l as Lbl, i }));
const TAGS = {
  p: { name: 'Push', col: AMBER, desc: 'Open deal in process' },
  w: { name: 'Referral', col: GREEN, desc: 'Funded client, ask for intros' },
  l: { name: 'Reconnect', col: RED, desc: 'Lost deal, second chance' },
} as const;

type Stop = V & { l: Lbl };
// nearest-neighbour route of n stops around a home, from the real pins
const routeAround = (home: V, n: number, labels: Lbl[], maxKm = 3.2, minLat = 0): Stop[] => {
  const cand = pins.filter(p => labels.includes(p.l) && Math.hypot(p.x - home.x, p.y - home.y) * M_PER_PX < maxKm * 1000 && p.y < py(minLat || 0) + (minLat ? 0 : 1e12));
  const out: Stop[] = []; let cur = home; const used = new Set<number>();
  while (out.length < n) {
    let best: Pin | null = null, bd = 1e12;
    for (const p of cand) { if (used.has(p.i)) continue; const d = Math.hypot(p.x - cur.x, p.y - cur.y); if (d > 2200 / M_PER_PX && d < bd) { bd = d; best = p; } }
    if (!best) break; used.add(best.i); out.push({ x: best.x, y: best.y, l: best.l }); cur = best;
  }
  return out;
};
const KARIM_LL: [number, number, Lbl][] = [
  [55.22639, 25.12933, 'p'], [55.22355, 25.11396, 'p'], [55.20366, 25.10993, 'p'], [55.19339, 25.11262, 'p'], [55.19629, 25.14566, 'w'], [55.24841, 25.14229, 'p'],
];

type Rep = {
  n: string; area: string; col: string; light: string; home: V; stops: Stop[];
  arrive: number[]; closeAt: Record<number, number>; visits: number; closes: number;
  card: V; cardSide: 'l' | 'r'; phone?: { x: number; y: number; t0: number; t1: number; scale: number };
};
const mk = (n: string, area: string, col: string, light: string, lng: number, lat: number, stops: Stop[], arrive: number[], closeIdx: number[], card: V, cardSide: 'l' | 'r', phone?: Rep['phone']): Rep => {
  const closeAt: Record<number, number> = {}; closeIdx.forEach(i => { closeAt[i] = arrive[i] + 0.7; });
  return { n, area, col, light, home: { x: px(lng), y: py(lat) }, stops, arrive, closeAt, visits: arrive.length, closes: closeIdx.length, card, cardSide, phone };
};
const REPS: Rep[] = [
  mk('Karim', 'Al Quoz', BLUE, '#93c5fd', 55.228, 25.138, KARIM_LL.map(([lng, lat, l]) => ({ x: px(lng), y: py(lat), l })),
    [11.6, 12.9, 14.2, 15.5, 16.8, 18.1], [0, 2, 4], { x: 60, y: 60 }, 'l'),
  mk('Janene', 'Deira', '#a855f7', '#d8b4fe', 55.315, 25.245, routeAround({ x: px(55.315), y: py(25.245) }, 5, ['p', 'w'], 6.5),
    [21.4, 22.5, 23.6, 24.7, 25.8], [1, 3], { x: 1540, y: 60 }, 'r', { x: 1395, y: 150, t0: 21.2, t1: 25.0, scale: 0.48 }),
  mk('Cameron', 'Business Bay', '#22d3ee', '#a5f3fc', 55.265, 25.185, routeAround({ x: px(55.265), y: py(25.185) }, 5, ['p', 'w'], 6.0),
    [21.8, 23.0, 24.2, 25.4, 26.6], [2], { x: 1540, y: 640 }, 'r', { x: 1395, y: 560, t0: 23.2, t1: 27.2, scale: 0.48 }),
  mk('Thomas', 'DIP', '#f472b6', '#fbcfe8', 55.18, 25.012, routeAround({ x: px(55.18), y: py(25.012) }, 4, ['p', 'l'], 6.5, 24.992),
    [22.0, 23.5, 25.0, 26.5], [], { x: 60, y: 640 }, 'l', { x: 330, y: 480, t0: 22.4, t1: 26.4, scale: 0.48 }),
];
const TIMES = ['8:20', '8:48', '9:16', '9:44', '10:12', '10:40'];
const nodesOf = (r: Rep): V[] => [r.home, ...r.stops];
const segsOf = (r: Rep) => { const N = nodesOf(r); return N.slice(1).map((b, i) => ({ a: N[i], b })); };
const kmOf = (r: Rep) => Math.round(segsOf(r).reduce((s, g) => s + Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y), 0) * M_PER_PX / 1000 * 1.35);
const lerp = (a: V, b: V, u: number): V => ({ x: mix(a.x, b.x, u), y: mix(a.y, b.y, u) });

/* ------------------------------------------------------------------ timeline (s) */
const T_DROP = 3.0;
const MARK_T = (ri: number) => T_DROP + ri * 0.25;        // markers pop
const CARD_T = (ri: number) => 3.6 + ri * 0.3;            // plan cards appear
const ROW_T = (ri: number, i: number) => CARD_T(ri) + 0.35 + i * 0.28; // rows and stops
const ROUTE_T0 = 6.2, SEG = 0.38;                        // routes draw, all four at once
const SUM_T = 8.3, TAP_T = 8.9;                           // summary + tap on all cards
const DIVE0 = 9.4, DIVE1 = 11.0;                           // camera into Al Quoz
const PULL0 = 19.3, PULL1 = 21.0;                          // camera back out
const TALLY_T = 27.3;
const STAMP_T = 29.0;
const SB_T = 31.0;
const END_T = 35.8;

/* ------------------------------------------------------------------ camera */
const C_WIDE = { x: px(55.215), y: py(25.122) };
const WIDE_S = 0.25;
const kb = nodesOf(REPS[0]);
const BC = { x: (Math.min(...kb.map(p => p.x)) + Math.max(...kb.map(p => p.x))) / 2, y: (Math.min(...kb.map(p => p.y)) + Math.max(...kb.map(p => p.y))) / 2 };
const TARGET = { x: 760, y: 600 };
const closeCam = (t: number) => { const s = 1.06 + 0.03 * ramp(t, 11, 19); return { cx: BC.x - (TARGET.x - W / 2) / s, cy: BC.y - (TARGET.y - H / 2) / s, s }; };
const wideCam = (t: number) => ({ cx: C_WIDE.x, cy: C_WIDE.y, s: WIDE_S + 0.012 * Math.min(1, t / 9) });
const blend = (a: { cx: number; cy: number; s: number }, b: { cx: number; cy: number; s: number }, e: number) => ({ cx: mix(a.cx, b.cx, e), cy: mix(a.cy, b.cy, e), s: Math.exp(mix(Math.log(a.s), Math.log(b.s), e)) });
const camAt = (t: number) => {
  if (t < DIVE0) return wideCam(t);
  if (t < DIVE1) return blend(wideCam(DIVE0), closeCam(DIVE1), eIO(ramp(t, DIVE0, DIVE1)));
  if (t < PULL0) return closeCam(t);
  if (t < PULL1) return blend(closeCam(PULL0), { ...wideCam(PULL1), s: WIDE_S + 0.012 }, eIO(ramp(t, PULL0, PULL1)));
  return { ...wideCam(PULL1), s: WIDE_S + 0.012 + 0.01 * ramp(t, PULL1, 29) };
};

/* ------------------------------------------------------------------ hexes */
const HR = 74, SQ3 = Math.sqrt(3);
const hexCenter = (q: number, r: number): V => ({ x: HR * SQ3 * (q + r / 2), y: HR * 1.5 * r });
const worldToHex = (p: V) => {
  const fq = (SQ3 / 3 * p.x - p.y / 3) / HR, fr = ((2 / 3) * p.y) / HR, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q, r };
};
const NB = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
type Paint = { q: number; r: number; t: number; col: string; light: string };
const cookHex: Record<string, number> = {};
const paints: Paint[] = [];
REPS.forEach(rep => {
  rep.stops.forEach((s, i) => { const h = worldToHex(s); const k = h.q + ',' + h.r; if (cookHex[k] === undefined || cookHex[k] > rep.arrive[i]) cookHex[k] = rep.arrive[i] + 0.15; });
  Object.entries(rep.closeAt).forEach(([si, ct]) => {
    const h = worldToHex(rep.stops[+si]);
    paints.push({ q: h.q, r: h.r, t: ct + 0.25, col: rep.col, light: rep.light });
    NB.forEach(([dq, dr], j) => paints.push({ q: h.q + dq, r: h.r + dr, t: ct + 0.5 + j * 0.08, col: rep.col, light: rep.light }));
  });
});
const hexPts = (c: V, r: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');

/* ------------------------------------------------------------------ small pieces */
const Head: React.FC<{ light: string; bold: string; size: number; color?: string }> = ({ light, bold, size, color = BLUE }) => (
  <div style={{ fontSize: size, lineHeight: 1.04, color: WHITE, fontWeight: 300, letterSpacing: -1 }}>{light} <span style={{ fontWeight: 800, color }}>{bold}</span></div>
);
const Caps: React.FC<{ children: React.ReactNode; size?: number; color?: string; spacing?: number }> = ({ children, size = 22, color = MUTED, spacing = 8 }) => (
  <div style={{ fontSize: size, letterSpacing: spacing, color, fontWeight: 600, textTransform: 'uppercase' }}>{children}</div>
);
const tagColor = (l: Lbl) => l === 'w' ? '#4ade80' : l === 'l' ? '#f87171' : '#fbbf24';

/* ------------------------------------------------------------------ the film */
export const MadMonday: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const cam = camAt(t);
  const sp = (p: V): V => ({ x: (p.x - cam.cx) * cam.s + W / 2, y: (p.y - cam.cy) * cam.s + H / 2 });
  const zr = Math.pow(cam.s / 0.25, 0.42);       // pin size factor
  const mkS = 0.6 + 0.4 * ramp(cam.s, 0.3, 1);   // marker/stop size factor

  // ---- tiles
  const tiles: React.ReactNode[] = [];
  const z14a = ramp(cam.s, 0.5, 0.7);
  const addTiles = (z: number, T: number, key: string, opacity: number) => {
    const x0 = Math.floor((cam.cx - W / 2 / cam.s) / T), x1 = Math.floor((cam.cx + W / 2 / cam.s) / T);
    const y0 = Math.floor((cam.cy - H / 2 / cam.s) / T), y1 = Math.floor((cam.cy + H / 2 / cam.s) / T);
    const inner: React.ReactNode[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
      inner.push(<Img key={`${key}${x}/${y}`} src={`${TILE_URL}/${z}/${y}/${x}`} style={{ position: 'absolute', left: Math.floor((x * T - cam.cx) * cam.s + W / 2), top: Math.floor((y * T - cam.cy) * cam.s + H / 2), width: Math.ceil(T * cam.s) + 1, height: Math.ceil(T * cam.s) + 1 }} />);
    tiles.push(<div key={key} style={{ position: 'absolute', inset: 0, opacity }}>{inner}</div>);
  };
  if (z14a < 0.99) addTiles(12, 1024, 'a', 1);
  if (z14a > 0.001) addTiles(14, 256, 'b', z14a);

  const mapOpacity = ramp(t, 1.6, 2.6);
  const mapDim = 0.4 * ramp(t, STAMP_T, STAMP_T + 1.2);

  // ---- pins (all, from the start)
  const pinEls: React.ReactNode[] = [];
  const pinA = ramp(t, 2.2, 3.4);
  if (pinA > 0) for (const p of pins) {
    const q = sp(p);
    if (q.x < -30 || q.x > W + 30 || q.y < -30 || q.y > H + 30) continue;
    const a = pinA * ramp(t, 2.2 + rand(p.i) * 0.9, 2.6 + rand(p.i) * 0.9);
    if (p.l === 'w') pinEls.push(<g key={p.i}><circle cx={q.x} cy={q.y} r={12 * zr} fill="url(#wg)" opacity={0.55 * a} /><circle cx={q.x} cy={q.y} r={3 * zr} fill="#4ade80" opacity={a} /></g>);
    else if (p.l === 'p') pinEls.push(<circle key={p.i} cx={q.x} cy={q.y} r={2.4 * zr} fill={AMBER} opacity={0.85 * a} stroke="#0008" strokeWidth={0.6} />);
    else pinEls.push(<circle key={p.i} cx={q.x} cy={q.y} r={2.2 * zr} fill={RED} opacity={0.6 * a} stroke="#0008" strokeWidth={0.6} />);
  }

  // ---- hexes: grid only when close, paint always
  const hexEls: React.ReactNode[] = [];
  const gridA = ramp(t, 11.2, 12.2) * ramp(cam.s, 0.55, 0.8);
  if (gridA > 0.01) {
    const hw = W / 2 / cam.s, hh = H / 2 / cam.s;
    const rMin = Math.floor((cam.cy - hh) / (HR * 1.5)) - 1, rMax = Math.ceil((cam.cy + hh) / (HR * 1.5)) + 1;
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor((cam.cx - hw) / (HR * SQ3) - r / 2) - 1, qMax = Math.ceil((cam.cx + hw) / (HR * SQ3) - r / 2) + 1;
      for (let q = qMin; q <= qMax; q++) {
        const c = sp(hexCenter(q, r)), key = q + ',' + r, rr = HR * cam.s * 0.965;
        const cook = cookHex[key], kc = cook !== undefined ? ramp(t, cook, cook + 0.7, eOut) : 0;
        const painted = paints.some(p => p.q === q && p.r === r && t > p.t + 0.3);
        hexEls.push(
          <g key={key}>
            <polygon points={hexPts(c, rr)} fill="#ffffff" fillOpacity={0.025 * gridA} stroke="#ffffff" strokeOpacity={0.1 * gridA} strokeWidth={1.4} />
            {kc > 0 && !painted && <polygon points={hexPts(c, rr)} fill={FIRE} fillOpacity={0.2 * kc * gridA} stroke="#fb923c" strokeOpacity={0.8 * kc * gridA} strokeWidth={2} />}
          </g>,
        );
      }
    }
  }
  const painted = new Set<string>();
  for (const p of paints) {
    const k = ramp(t, p.t, p.t + 0.55, eOut), key = p.q + ',' + p.r;
    if (k <= 0 || painted.has(key)) continue; painted.add(key);
    const c = sp(hexCenter(p.q, p.r)), rr = HR * cam.s * 0.965;
    if (c.x < -50 || c.x > W + 50 || c.y < -50 || c.y > H + 50) continue;
    hexEls.push(<polygon key={'p' + key} points={hexPts(c, rr)} fill={p.col} fillOpacity={0.34 * k} stroke={p.light} strokeOpacity={0.95 * k} strokeWidth={Math.max(1.2, 2.2 * cam.s)} />);
  }

  // ---- per-rep routes, stops, markers
  const routeEls: React.ReactNode[] = [], stopEls: React.ReactNode[] = [], markerEls: React.ReactNode[] = [], labelEls: React.ReactNode[] = [];
  const repState = REPS.map((rep, ri) => {
    const segs = segsOf(rep);
    // route lines
    segs.forEach((g, i) => {
      const p = ramp(t, ROUTE_T0 + i * SEG, ROUTE_T0 + (i + 1) * SEG, eQ);
      if (p <= 0) return;
      const A = sp(g.a), B = sp(g.b), head = lerp(A, B, p);
      const done = t >= rep.arrive[i];
      routeEls.push(
        <g key={ri + '-' + i}>
          <line x1={A.x} y1={A.y} x2={head.x} y2={head.y} stroke={rep.col} strokeWidth={14 * mkS} opacity={0.14} strokeLinecap="round" />
          <line x1={A.x} y1={A.y} x2={head.x} y2={head.y} stroke={done ? rep.light : rep.col} strokeWidth={3.4 * mkS} strokeLinecap="round" opacity={0.95} />
          {p < 1 && <circle cx={head.x} cy={head.y} r={5 * mkS} fill="#fff" />}
        </g>,
      );
    });
    // stops
    rep.stops.forEach((s, i) => {
      const k = ramp(t, ROW_T(ri, i), ROW_T(ri, i) + 0.45, eBack);
      if (k <= 0) return;
      const q = sp(s), tag = TAGS[s.l];
      const visited = t >= rep.arrive[i], ct = rep.closeAt[i], closed = ct !== undefined && t >= ct;
      const fill = closed ? GREEN : visited ? FIRE : '#0f172a';
      const stroke = closed ? '#fff' : visited ? '#fed7aa' : tag.col;
      const pulseA = ramp(t, rep.arrive[i], rep.arrive[i] + 0.9);
      const burst = ct !== undefined ? ramp(t, ct, ct + 1.0) : 0;
      const pop = closed ? 1 + 0.35 * Math.sin(ramp(t, ct, ct + 0.5) * Math.PI) : 1;
      const R = 17 * mkS;
      stopEls.push(
        <g key={ri + '-' + i} transform={`translate(${q.x},${q.y}) scale(${k * pop})`}>
          <circle r={R * 2} fill={closed ? 'url(#gg)' : visited ? 'url(#fire)' : s.l === 'p' ? 'url(#ag)' : s.l === 'w' ? 'url(#gg)' : 'url(#rg)'} opacity={0.6} />
          <circle r={R} fill={fill} stroke={stroke} strokeWidth={3 * mkS} />
          <text y={R * 0.38} fontSize={R * 1.1} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily={FONT}>{closed || visited ? '✓' : i + 1}</text>
          {pulseA > 0 && pulseA < 1 && <circle r={R + 48 * mkS * eOut(pulseA)} fill="none" stroke={FIRE} strokeWidth={3} opacity={1 - pulseA} />}
          {burst > 0 && burst < 1 && (
            <>
              <circle r={R + 100 * mkS * eOut(burst)} fill="none" stroke={rep.light} strokeWidth={5 * (1 - burst) + 1} opacity={1 - burst} />
              <circle r={R + 55 * mkS * eOut(Math.max(0, burst - 0.12) / 0.88)} fill="none" stroke="#fff" strokeWidth={2.5} opacity={0.8 * (1 - burst)} />
              {Array.from({ length: 10 }, (_, j) => { const a = (j / 10) * Math.PI * 2 + 0.3, r0 = (22 + 75 * eOut(burst)) * mkS; return <circle key={j} cx={Math.cos(a) * r0} cy={Math.sin(a) * r0} r={4 * (1 - burst) * mkS} fill={j % 2 ? rep.light : GOLD} />; })}
            </>
          )}
        </g>,
      );
      if (ct !== undefined) {
        const p = ramp(t, ct, ct + 1.7);
        if (p > 0 && p < 1) labelEls.push(
          <div key={'cl' + ri + '-' + i} style={{ position: 'absolute', left: q.x - 70, top: q.y - 60 * mkS - 30 - 44 * eOut(p), width: 140, textAlign: 'center', opacity: Math.min(1, p * 6) * (1 - ramp(p, 0.65, 1)) }}>
            <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 20, background: GREEN, color: '#04210f', fontWeight: 800, fontSize: 20, boxShadow: '0 0 30px #22c55e88' }}>Closed ✓</span>
          </div>,
        );
      }
    });
    // marker along the route
    let pos = rep.home, seg = -1;
    for (let i = 0; i < rep.arrive.length; i++) if (t >= rep.arrive[i] - 0.8) seg = i;
    if (seg >= 0) pos = lerp(segs[seg].a, segs[seg].b, ramp(t, rep.arrive[seg] - 0.8, rep.arrive[seg], eIO));
    const q = sp(pos), kA = ramp(t, MARK_T(ri), MARK_T(ri) + 0.6, eBack);
    const size = 64 * mkS + 2;
    if (kA > 0) markerEls.push(
      <div key={'m' + ri} style={{ position: 'absolute', left: q.x - size / 2, top: q.y - size / 2, width: size, height: size, transform: `scale(${kA})`, zIndex: ri === 0 ? 2 : 1 }}>
        <div style={{ width: size, height: size, borderRadius: '50%', background: rep.col, border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, fontWeight: 900, color: '#fff', boxShadow: `0 0 30px ${rep.col}cc` }}>{rep.n[0]}</div>
        <div style={{ position: 'absolute', left: size / 2 - 70, width: 140, top: size + 6, textAlign: 'center' }}><span style={{ display: 'inline-block', background: 'rgba(15,23,42,0.9)', border: `1px solid ${rep.col}88`, color: '#fff', borderRadius: 12, padding: '2px 12px', fontSize: 15 + 6 * mkS, fontWeight: 700 }}>{rep.n}</span></div>
      </div>,
    );
    const visits = rep.arrive.filter(a => t >= a).length;
    const closes = Object.values(rep.closeAt).filter(c => t >= c + 0.1).length;
    return { q, visits, closes };
  });

  /* ------------------------------------------------------------------ HUD */
  const chipA = ramp(t, 2.4, 2.9, eOut) * (1 - ramp(t, 9.2, 9.7));
  const typedMM = 'MONDAY · 8:00 AM';
  const nMM = Math.min(typedMM.length, Math.max(0, Math.floor((t - 2.4) * 30)));

  // plan cards (wide phase)
  const cardsA = 1 - ramp(t, DIVE0 - 0.1, DIVE0 + 0.5, eIO);
  const tapK = ramp(t, TAP_T - 0.5, TAP_T, eOut) * (1 - ramp(t, TAP_T, TAP_T + 0.1));
  const btnScale = t < TAP_T ? 1 : 0.93 + 0.07 * ramp(t, TAP_T + 0.05, TAP_T + 0.45) + 0.1 * Math.sin(Math.min(1, ramp(t, TAP_T, TAP_T + 0.45)) * Math.PI);

  // Karim close-up chips + phone
  const kChipA = ramp(t, 11.0, 11.6, eOut) * (1 - ramp(t, PULL0, PULL0 + 0.5));
  const kVisits = repState[0].visits, kCloses = repState[0].closes;

  // team chips (wide phase 2)
  const teamA = ramp(t, PULL1 - 0.4, PULL1 + 0.3, eOut) * (1 - ramp(t, STAMP_T, STAMP_T + 0.5));
  const totalVisits = repState.reduce((s, r) => s + r.visits, 0), totalCloses = repState.reduce((s, r) => s + r.closes, 0);
  const tallyA = ramp(t, TALLY_T, TALLY_T + 0.6, eBack) * (1 - ramp(t, STAMP_T, STAMP_T + 0.5));

  // stamp + confetti
  const stampA = ramp(t, STAMP_T, STAMP_T + 0.35) * (1 - ramp(t, SB_T + 4.2, SB_T + 4.9));
  const stampScale = 1 + 0.35 * (1 - eBack(ramp(t, STAMP_T, STAMP_T + 0.55)));
  const confetti: React.ReactNode[] = [];
  if (t > STAMP_T && t < STAMP_T + 3.6) {
    const tau = t - STAMP_T - 0.12;
    if (tau > 0) for (let i = 0; i < 90; i++) {
      const ta = tau - (i < 60 ? 0 : 0.35); if (ta <= 0) continue;
      const ang = -Math.PI / 2 + (rand(i, 1) - 0.5) * Math.PI * 1.45, sp0 = 480 + rand(i, 2) * 900, k = 1.3;
      const x = 700 + Math.cos(ang) * sp0 * (1 - Math.exp(-k * ta)) / k, y = 235 + Math.sin(ang) * sp0 * (1 - Math.exp(-k * ta)) / k + 750 * ta * ta;
      const life = 2.7 + rand(i, 3) * 0.7, alpha = 1 - ramp(ta, life - 0.7, life); if (alpha <= 0) continue;
      const colr = [GOLD, '#fde68a', BLUE, '#93c5fd', '#f8fafc'][i % 5], rot = rand(i, 4) * 360 + ta * (180 + rand(i, 5) * 420), flip = Math.cos(ta * (4 + rand(i, 6) * 6));
      const w = 9 + rand(i, 7) * 10, h = 5 + rand(i, 8) * 6;
      confetti.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: w, height: i % 4 === 0 ? w : h, borderRadius: i % 4 === 0 ? '50%' : 2, background: colr, opacity: alpha, transform: `rotate(${rot}deg) scaleY(${0.35 + 0.65 * Math.abs(flip)})` }} />);
    }
  }
  const ringP = ramp(t, STAMP_T, STAMP_T + 1.1);

  // scoreboard: Karim climbs from #3 to #1
  const sbIn = ramp(t, SB_T, SB_T + 0.9, eBack);
  const kp = ramp(t, SB_T + 1.0, SB_T + 2.9);
  const board = [
    { n: 'Karim', v: 6, c0: 1, c1: 3, slot: mix(2, 0, eIO(kp)) },
    { n: 'Janene', v: 5, c0: 2, c1: 2, slot: mix(0, 1, eIO(ramp(kp, 0.5, 0.92))) },
    { n: 'Cameron', v: 5, c0: 1, c1: 1, slot: mix(1, 2, eIO(ramp(kp, 0.22, 0.62))) },
    { n: 'Thomas', v: 4, c0: 0, c1: 0, slot: 3 },
  ];
  const sbOut = 1 - ramp(t, END_T - 0.6, END_T + 0.2);

  // end card
  const endBg = ramp(t, END_T - 0.3, END_T + 0.9);
  const l1 = ramp(t, END_T + 0.6, END_T + 1.3, eOut), l2 = ramp(t, END_T + 1.3, END_T + 1.9, eOut), l3 = ramp(t, END_T + 2.1, END_T + 2.8, eOut), l4 = ramp(t, END_T + 2.8, END_T + 3.3);

  // intro
  const typed = 'See where we win.';
  const nTyped = Math.min(typed.length, Math.max(0, Math.floor((t - 0.7) * 22)));
  const introFade = 1 - ramp(t, 2.0, 2.6);
  const titleIn = ramp(t, 0.15, 0.8, eOut);

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT, overflow: 'hidden' }}>
      {/* ---------------- map */}
      <AbsoluteFill style={{ background: NAVY, opacity: mapOpacity, zIndex: 0 }}>
        <AbsoluteFill style={{ filter: TILE_FILTER }}>{tiles}</AbsoluteFill>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <radialGradient id="wg"><stop offset="0" stopColor="#4ade80" stopOpacity="0.95" /><stop offset="0.4" stopColor="#22c55e" stopOpacity="0.35" /><stop offset="1" stopColor="#22c55e" stopOpacity="0" /></radialGradient>
            <radialGradient id="gg"><stop offset="0" stopColor="#4ade80" stopOpacity="0.8" /><stop offset="1" stopColor="#22c55e" stopOpacity="0" /></radialGradient>
            <radialGradient id="ag"><stop offset="0" stopColor="#fbbf24" stopOpacity="0.75" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></radialGradient>
            <radialGradient id="rg"><stop offset="0" stopColor="#f87171" stopOpacity="0.7" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></radialGradient>
            <radialGradient id="fire"><stop offset="0" stopColor="#fde047" stopOpacity="0.9" /><stop offset="0.5" stopColor="#f97316" stopOpacity="0.5" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></radialGradient>
          </defs>
          {hexEls}
          {pinEls}
          {routeEls}
          {stopEls}
        </svg>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(10,16,36,0) 55%, rgba(5,8,20,0.65) 100%)' }} />
        <AbsoluteFill style={{ background: '#05081a', opacity: mapDim }} />
        {labelEls}
        {markerEls}
      </AbsoluteFill>

      {/* ---------------- intro */}
      {t < 2.7 && (
        <AbsoluteFill style={{ opacity: introFade, alignItems: 'center', justifyContent: 'center', background: `rgba(5,8,26,${0.7 * introFade})` }}>
          <div style={{ textAlign: 'center', transform: `translateY(${(1 - titleIn) * 16}px)` }}>
            <div style={{ opacity: titleIn, filter: `blur(${(1 - titleIn) * 14}px)`, fontSize: 200, lineHeight: 1, letterSpacing: -4, color: WHITE, fontWeight: 300, textShadow: '0 0 60px rgba(59,130,246,0.25)' }}>
              FlapKap <span style={{ fontWeight: 800, color: BLUE, textShadow: '0 0 70px rgba(59,130,246,0.6)' }}>Heat</span>
            </div>
            <div style={{ width: 160 * ramp(t, 0.5, 1.0, eOut), height: 4, background: BLUE, margin: '48px auto 26px', borderRadius: 2, boxShadow: '0 0 18px #3b82f6' }} />
            <div style={{ fontSize: 46, letterSpacing: 5, color: '#cbd5e1', fontWeight: 300, height: 60 }}>{typed.slice(0, nTyped)}<span style={{ opacity: Math.floor(t * 3) % 2 === 0 && t < 1.8 ? 1 : 0, color: BLUE }}>|</span></div>
          </div>
        </AbsoluteFill>
      )}

      {/* ---------------- Monday chip */}
      {chipA > 0.001 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 44, textAlign: 'center', opacity: chipA, transform: `translateY(${(1 - chipA) * -16}px)` }}>
          <span style={{ display: 'inline-block', ...glass, borderRadius: 40, padding: '12px 34px', fontSize: 28, letterSpacing: 10, color: WHITE, fontWeight: 700 }}>{typedMM.slice(0, nMM)}</span>
          <div style={{ marginTop: 14, fontSize: 64, fontWeight: 300, color: WHITE, letterSpacing: -2, opacity: ramp(t, 3.0, 3.5, eOut), transform: `scale(${0.9 + 0.1 * ramp(t, 3.0, 3.5, eBack)})`, textShadow: '0 4px 30px #000a' }}>
            Mad <span style={{ fontWeight: 800, color: BLUE }}>Monday</span>
          </div>
        </div>
      )}

      {/* ---------------- plan cards */}
      {cardsA > 0.001 && REPS.map((rep, ri) => {
        const inK = ramp(t, CARD_T(ri), CARD_T(ri) + 0.6, eOut);
        if (inK <= 0) return null;
        const q = repState[ri].q, CW = 340;
        const cx = rep.card.x + (rep.cardSide === 'l' ? CW : 0), cy = rep.card.y + 40;
        const sumK = ramp(t, SUM_T + ri * 0.1, SUM_T + ri * 0.1 + 0.4, eOut);
        return (
          <div key={ri} style={{ opacity: inK * cardsA }}>
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <line x1={cx} y1={cy} x2={q.x} y2={q.y} stroke={rep.col} strokeWidth={2} strokeDasharray="6 6" opacity={0.6} />
            </svg>
            <div style={{ position: 'absolute', left: rep.card.x, top: rep.card.y, width: CW, padding: '16px 18px 16px', ...glass, border: `1px solid ${rep.col}66`, transform: `translateY(${(1 - inK) * 24}px)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: rep.col, color: '#fff', fontWeight: 900, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rep.n[0]}</div>
                <div><div style={{ fontSize: 22, fontWeight: 800, color: WHITE, lineHeight: 1 }}>{rep.n}</div><div style={{ fontSize: 14, color: MUTED, letterSpacing: 2, textTransform: 'uppercase' }}>{rep.area}</div></div>
              </div>
              <div style={{ marginTop: 10 }}>
                {rep.stops.map((s, i) => {
                  const k = ramp(t, ROW_T(ri, i), ROW_T(ri, i) + 0.4, eOut), tag = TAGS[s.l];
                  return (
                    <div key={i} style={{ height: 36, marginBottom: 4, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid #ffffff12', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 10, opacity: k, transform: `translateX(${(1 - k) * 24}px)` }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${tag.col}`, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                      <span style={{ color: tagColor(s.l), fontWeight: 700, fontSize: 16, flex: 1 }}>{tag.name}</span>
                      <span style={{ color: MUTED, fontSize: 14, fontWeight: 600 }}>{TIMES[i]}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, opacity: sumK, transform: `translateY(${(1 - sumK) * 10}px)` }}>
                <div style={{ fontSize: 16, color: '#cbd5e1', fontWeight: 600, textAlign: 'center' }}>{rep.stops.length} stops · {kmOf(rep)} km · {Math.round(kmOf(rep) * 2.1)} min</div>
                <div style={{ position: 'relative', marginTop: 8 }}>
                  <div style={{ height: 42, borderRadius: 12, background: `linear-gradient(180deg, ${rep.light}, ${rep.col})`, color: '#fff', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${btnScale})`, boxShadow: `0 8px 24px ${rep.col}55` }}>Open in Google Maps ↗</div>
                  {tapK > 0 && <div style={{ position: 'absolute', left: CW / 2 - 18 - 18, top: 4, width: 34, height: 34, borderRadius: '50%', background: '#ffffff55', border: '2px solid #fff', transform: `scale(${1.8 - 0.8 * tapK})`, opacity: tapK }} />}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* ---------------- Karim close-up chips */}
      {kChipA > 0.001 && (
        <div style={{ position: 'absolute', left: 60, top: 46, display: 'flex', gap: 14, opacity: kChipA, transform: `translateY(${(1 - kChipA) * -20}px)` }}>
          <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, border: `1px solid ${BLUE}88` }}>Karim <span style={{ color: MUTED, fontWeight: 400 }}>· Al Quoz</span></div>
          <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ color: MUTED, fontWeight: 600, fontSize: 20, letterSpacing: 3 }}>VISITS</span>
            <span><span style={{ color: kVisits === 6 ? '#fdba74' : WHITE }}>{kVisits}</span><span style={{ color: MUTED }}>/6</span></span>
            <div style={{ width: 90, height: 8, borderRadius: 4, background: '#ffffff22', overflow: 'hidden' }}><div style={{ width: `${kVisits / 6 * 100}%`, height: '100%', background: FIRE, borderRadius: 4 }} /></div>
          </div>
          <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #22c55e66' }}>
            <span style={{ color: MUTED, fontWeight: 600, fontSize: 20, letterSpacing: 3 }}>CLOSES</span><span style={{ color: '#4ade80' }}>{kCloses}</span>
          </div>
          <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, border: '1px solid #f9731666' }}>🔥 Streak <span style={{ color: '#fdba74' }}>3 Mondays</span></div>
        </div>
      )}
      {t > 10.4 && t < 20.2 && <Phone t={t} x={1650} y={150} t0={10.4} t1={19.2} scale={1} total={6} next={Math.min(6, kVisits + 1)} km={kmOf(REPS[0])} />}

      {/* ---------------- team chips + small phones (wide phase 2) */}
      {teamA > 0.001 && (
        <div style={{ position: 'absolute', left: 60, top: 46, display: 'flex', flexDirection: 'column', gap: 10, opacity: teamA, transform: `translateX(${(1 - teamA) * -30}px)` }}>
          {REPS.map((rep, ri) => (
            <div key={ri} style={{ ...glass, borderRadius: 40, padding: '10px 22px 10px 12px', display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${rep.col}66`, width: 450, whiteSpace: 'nowrap' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: rep.col, color: '#fff', fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rep.n[0]}</div>
              <div style={{ flex: 1, fontSize: 24, fontWeight: 800, color: WHITE }}>{rep.n}</div>
              <div style={{ fontSize: 20, color: MUTED, fontWeight: 600 }}>VISITS <span style={{ color: WHITE, fontWeight: 800 }}>{repState[ri].visits}</span>/{rep.visits}</div>
              <div style={{ fontSize: 20, color: MUTED, fontWeight: 600 }}>CLOSES <span style={{ color: '#4ade80', fontWeight: 800 }}>{repState[ri].closes}</span></div>
            </div>
          ))}
        </div>
      )}
      {REPS.map((rep, ri) => rep.phone && t > rep.phone.t0 && t < rep.phone.t1 + 1 ? (
        <Phone key={'ph' + ri} t={t} x={rep.phone.x} y={rep.phone.y} t0={rep.phone.t0} t1={rep.phone.t1} scale={rep.phone.scale} total={rep.stops.length} next={Math.min(rep.stops.length, repState[ri].visits + 1)} km={kmOf(rep)} col={rep.col} />
      ) : null)}
      {tallyA > 0.001 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, textAlign: 'center', opacity: Math.min(1, tallyA), transform: `scale(${Math.max(0.6, tallyA)})` }}>
          <span style={{ display: 'inline-block', ...glass, borderRadius: 40, padding: '16px 40px', fontSize: 34, color: WHITE, fontWeight: 300, border: '1px solid #ffffff33' }}>
            <span style={{ color: MUTED, fontSize: 22, letterSpacing: 6, fontWeight: 700, marginRight: 22 }}>MONDAY · 12:40 PM</span>
            <b style={{ color: WHITE, fontWeight: 800 }}>{totalVisits}</b> visits <span style={{ color: MUTED }}>·</span> <b style={{ color: '#4ade80', fontWeight: 800 }}>{totalCloses}</b> closes <span style={{ color: MUTED }}>·</span> <b style={{ fontWeight: 800 }}>4</b> areas
          </span>
        </div>
      )}

      {/* ---------------- stamp */}
      {stampA > 0.001 && (
        <>
          <div style={{ position: 'absolute', left: 140, top: 100, width: 1120, height: 300, background: 'radial-gradient(ellipse at center, rgba(5,8,26,0.85) 0%, rgba(5,8,26,0) 70%)', opacity: stampA }} />
          <div style={{ position: 'absolute', left: 0, width: 1400, top: 118, textAlign: 'center', opacity: stampA, transform: `scale(${stampScale})`, transformOrigin: '700px 110px' }}>
            <div style={{ fontSize: 24, letterSpacing: 10, color: '#cbd5e1', fontWeight: 600 }}>AL QUOZ · OCTOBER</div>
            <div style={{ fontSize: 112, fontWeight: 300, color: WHITE, lineHeight: 1.05, letterSpacing: -1, textShadow: '0 4px 40px #000a' }}>Area <span style={{ fontWeight: 800, color: BLUE, textShadow: '0 0 40px rgba(59,130,246,0.55)' }}>Dominator</span></div>
            <div style={{ width: 160 * ramp(t, STAMP_T + 0.3, STAMP_T + 0.9, eOut), height: 4, background: GOLD, margin: '12px auto 0', borderRadius: 2, boxShadow: '0 0 16px #fbbf24' }} />
            <div style={{ marginTop: 14, fontSize: 44, fontWeight: 800, color: WHITE, opacity: ramp(t, STAMP_T + 0.5, STAMP_T + 0.9) }}>Karim <span style={{ fontWeight: 300, color: '#cbd5e1' }}>· 3 closes</span></div>
          </div>
          {ringP > 0 && ringP < 1 && <div style={{ position: 'absolute', left: 700 - 420 * eOut(ringP), top: 235 - 420 * eOut(ringP), width: 840 * eOut(ringP), height: 840 * eOut(ringP), borderRadius: '50%', border: `4px solid ${GOLD}`, opacity: 0.7 * (1 - ringP) }} />}
        </>
      )}
      {confetti}

      {/* ---------------- scoreboard */}
      {t > SB_T - 0.1 && sbOut > 0.001 && (
        <div style={{ position: 'absolute', left: 1300, top: 110, width: 560, padding: '28px 30px 24px', ...glass, opacity: Math.min(1, sbIn * 2) * sbOut, transform: `translateX(${(1 - sbIn) * 620}px)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Caps size={20} color={MUTED} spacing={6}>Mad Monday · Week 3</Caps>
            <div style={{ display: 'flex', fontSize: 15, color: MUTED, letterSpacing: 2, fontWeight: 700 }}><span style={{ width: 70, textAlign: 'center' }}>VISITS</span><span style={{ width: 70, textAlign: 'center' }}>CLOSES</span></div>
          </div>
          <div style={{ position: 'relative', height: 92 * 4, marginTop: 14 }}>
            {board.map(r => {
              const c = Math.round(mix(r.c0, r.c1, eQ(kp))), rank = Math.round(r.slot), hot = r.n === 'Karim';
              const rep = REPS.find(x => x.n === r.n)!, crown = hot ? ramp(t, SB_T + 2.8, SB_T + 3.4, eBack) : 0;
              return (
                <div key={r.n} style={{ position: 'absolute', left: 0, right: 0, top: r.slot * 92, height: 82, borderRadius: 18, background: hot ? `rgba(59,130,246,${0.14 + 0.1 * kp})` : 'rgba(255,255,255,0.04)', border: `1px solid ${hot ? '#60a5fa88' : '#ffffff14'}`, boxShadow: hot ? `0 0 ${40 * kp}px rgba(59,130,246,0.45)` : 'none', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, zIndex: hot ? 2 : 1 }}>
                  <div style={{ width: 40, fontSize: 36, fontWeight: 800, color: rank === 0 ? BLUE2 : MUTED }}>{rank + 1}</div>
                  <div style={{ width: 50, height: 50, borderRadius: '50%', background: rep.col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', border: hot ? '3px solid #fff' : '2px solid #ffffff33', flex: 'none' }}>{r.n[0]}</div>
                  <div style={{ flex: 1, fontSize: 32, fontWeight: hot ? 800 : 600, color: WHITE, whiteSpace: 'nowrap' }}>{r.n}{crown > 0 && <span style={{ display: 'inline-block', marginLeft: 10, transform: `scale(${crown}) rotate(${(1 - crown) * -30}deg)` }}>👑</span>}</div>
                  <div style={{ fontSize: 34, fontWeight: 700, color: '#cbd5e1', width: 70, textAlign: 'center' }}>{r.v}</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: c > 0 ? '#4ade80' : MUTED, width: 70, textAlign: 'center' }}>{c}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ffffff22', fontSize: 18, color: MUTED }}>Most closes in an area this month takes the title</div>
        </div>
      )}

      {/* ---------------- end card */}
      {endBg > 0.001 && (
        <AbsoluteFill style={{ zIndex: 5, opacity: endBg, background: `radial-gradient(ellipse at 50% 55%, #14214a 0%, ${NAVY} 62%, #060a18 100%)`, alignItems: 'center', justifyContent: 'center' }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
            {Array.from({ length: 9 }, (_, r) => Array.from({ length: 17 }, (_, q) => { const c = { x: q * 130 + (r % 2 ? 65 : 0) - 20, y: r * 117 - 20 }, d = Math.hypot(c.x - 960, c.y - 560); return <polygon key={r * 20 + q} points={hexPts(c, 62)} fill="none" stroke="#3b82f6" strokeOpacity={Math.max(0, 0.17 - d / 7000)} strokeWidth={1.5} />; }))}
          </svg>
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 26}px)`, fontSize: 112, fontWeight: 300, color: WHITE, letterSpacing: -2, lineHeight: 1.05 }}>More visits. <span style={{ fontWeight: 800, color: BLUE }}>More closes.</span></div>
            <div style={{ opacity: l2, transform: `translateY(${(1 - l2) * 20}px)`, fontSize: 48, color: '#cbd5e1', fontWeight: 400, marginTop: 24, letterSpacing: 1 }}>A team that wants to win.</div>
            <div style={{ width: 120 * l3, height: 3, background: BLUE, margin: '56px auto 30px', borderRadius: 2, opacity: l3 }} />
            <div style={{ opacity: l3, transform: `scale(${0.94 + 0.06 * l3})`, fontSize: 84, fontWeight: 300, color: WHITE, letterSpacing: -1 }}>FlapKap <span style={{ fontWeight: 800, color: BLUE }}>Heat</span></div>
            <div style={{ opacity: l4, marginTop: 12, fontSize: 22, letterSpacing: 12, color: MUTED, fontWeight: 600 }}>MAD MONDAY</div>
          </div>
          <div style={{ position: 'absolute', right: 28, bottom: 18, fontSize: 15, color: '#64748b', opacity: l4 }}>Music: "Werq" Kevin MacLeod (incompetech.com), CC BY 4.0 · Map © Esri, HERE, OpenStreetMap contributors</div>
        </AbsoluteFill>
      )}

      {t > 2.4 && t < END_T + 0.5 && <div style={{ position: 'absolute', right: 20, bottom: 10, fontSize: 13, color: '#94a3b8', opacity: 0.55 }}>Map © Esri, HERE, OpenStreetMap contributors</div>}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ phone with a stylised navigation view */
const Phone: React.FC<{ t: number; x: number; y: number; t0: number; t1: number; scale: number; total: number; next: number; km: number; col?: string }> = ({ t, x, y, t0, t1, scale, total, next, km, col = BLUE }) => {
  const inn = ramp(t, t0, t0 + 1.0, eBack), out = ramp(t, t1, t1 + 0.8, eIO);
  const drive = ((t - t0) * 70) % 300;
  const meters = Math.max(40, Math.round((600 - 70 - drive) * 0.9 / 10) * 10);
  const PW = 364, PH = 752;
  const roads: React.ReactNode[] = [];
  for (let i = -6; i < 14; i++) roads.push(<line key={'h' + i} x1={-40} x2={400} y1={i * 96 + (i % 2) * 14} y2={i * 96 + (i % 2) * 14 - 10} stroke="#1b2848" strokeWidth={14} />);
  for (let i = -2; i < 6; i++) roads.push(<line key={'v' + i} x1={i * 112 + 20} x2={i * 112 + 20 + (i % 2) * 10} y1={-700} y2={1300} stroke="#1b2848" strokeWidth={14} />);
  roads.push(<line key="dg" x1={-60} y1={900} x2={420} y2={-300} stroke="#22305a" strokeWidth={20} />);
  const light = col === BLUE ? '#60a5fa' : col;
  return (
    <div style={{ position: 'absolute', left: x - PW / 2 + (1 - inn) * 640 * (x > W / 2 ? 1 : -1) + out * 700 * (x > W / 2 ? 1 : -1), top: y + (1 - inn) * 80, width: PW, height: PH, transform: `rotate(${(1 - inn) * 8}deg) scale(${scale})`, transformOrigin: 'top center', borderRadius: 60, background: '#05080f', border: '3px solid #475569', boxShadow: `0 40px 100px #000a, 0 0 0 10px #0f172a, 0 0 60px ${col}55`, overflow: 'hidden', opacity: 1 - out }}>
      <svg width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`} style={{ position: 'absolute', inset: 0 }}>
        <rect width={PW} height={PH} fill="#0b1226" />
        <g transform={`translate(12,${drive - 140})`}>
          <rect x={200} y={-300} width={300} height={260} rx={30} fill="#0d1c40" />
          {roads}
          <path d="M170 1500 L170 70 Q170 20 220 20 L520 20" fill="none" stroke={col} strokeWidth={26} opacity={0.25} strokeLinecap="round" />
          <path d="M170 1500 L170 70 Q170 20 220 20 L520 20" fill="none" stroke={light} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(182,600)"><circle r={34} fill={col} opacity={0.25} /><path d="M0 -24 L20 18 L0 8 L-20 18 Z" fill="#fff" stroke={col} strokeWidth={3} strokeLinejoin="round" /></g>
      </svg>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 52, borderRadius: 22, background: 'rgba(15,23,42,0.92)', border: '1px solid #ffffff22', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 50, fontWeight: 800, color: '#fff', lineHeight: 1 }}>↱</div>
        <div><div style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{meters} m</div><div style={{ fontSize: 17, color: MUTED }}>Next: stop {next} of {total}</div></div>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 14, width: 120, height: 26, borderRadius: 14, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 118, background: 'rgba(11,18,38,0.96)', borderTop: '1px solid #ffffff22', padding: '18px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div><div style={{ fontSize: 38, fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{Math.round(km * 2.1)} min</div><div style={{ fontSize: 19, color: MUTED, marginTop: 6 }}>{km} km · {total} stops</div></div>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</div>
      </div>
    </div>
  );
};
