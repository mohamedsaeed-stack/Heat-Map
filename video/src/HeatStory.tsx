import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from 'remotion';
import data from './data.json';

/* ------------------------------------------------------------------ constants */
const W = 1920, H = 1080;
const WORLD = 2 ** 14 * 256; // world size in z14 pixels
const px = (lng: number) => ((lng + 180) / 360) * WORLD;
const py = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * WORLD;
};
type V = { x: number; y: number };

const NAVY = '#0a1024', BLUE = '#3b82f6', BLUE2 = '#60a5fa', WHITE = '#f8fafc', MUTED = '#94a3b8';
const GREEN = '#22c55e', AMBER = '#f59e0b', RED = '#ef4444', GOLD = '#fbbf24', FIRE = '#f97316';
const FONT = '"Segoe UI", "Segoe UI Emoji", Arial, sans-serif';
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile';
const TILE_FILTER = 'brightness(0.75) sepia(0.6) hue-rotate(185deg) saturate(1.6)';

const ramp = (t: number, a: number, b: number, easing?: (n: number) => number) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
const eIO = Easing.inOut(Easing.cubic);
const eOut = Easing.out(Easing.cubic);
const eBack = Easing.out(Easing.back(1.8));
const eQ = Easing.inOut(Easing.quad);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const rand = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const glass: React.CSSProperties = {
  background: 'rgba(15,23,42,0.72)', border: '1px solid #ffffff22', borderRadius: 22,
  backdropFilter: 'blur(14px)', boxShadow: '0 20px 60px #0007',
};

/* ------------------------------------------------------------------ data */
type Pin = V & { l: 'w' | 'p' | 'l'; i: number };
const pins: Pin[] = (data.pins as { x: number; y: number; l: string }[]).map((p, i) => ({ x: px(p.x), y: py(p.y), l: p.l as Pin['l'], i }));
const AQ = { x: px(55.228), y: py(25.138) }; // Karim starts here

const TAGS = {
  p: { name: 'Push', col: AMBER, desc: 'Open deal in process' },
  w: { name: 'Referral', col: GREEN, desc: 'Funded client, ask for intros' },
  l: { name: 'Reconnect', col: RED, desc: 'Lost deal, second chance' },
} as const;
// 8 real nearby pins (found by search: 5 push, 2 referral, 1 reconnect, ordered as a route of ~26 km)
const STOP_LL: [number, number, 'p' | 'w' | 'l'][] = [
  [55.22639, 25.12933, 'p'], [55.22355, 25.11396, 'p'], [55.20366, 25.10993, 'p'], [55.19339, 25.11262, 'p'],
  [55.19629, 25.14566, 'w'], [55.24841, 25.14229, 'p'], [55.24756, 25.13225, 'w'], [55.24055, 25.09976, 'l'],
];
const STOPS = STOP_LL.map(([lng, lat, l]) => ({ x: px(lng), y: py(lat), l }));
const STOP_TIMES = ['8:20', '8:48', '9:16', '9:44', '10:12', '10:40', '11:08', '11:36'];
const PLAN_T = (i: number) => 18.6 + 0.62 * i; // stop i is added to the plan + map
const ROUTE_T0 = 24.3, SEG = 0.5; // route drawing
const ARRIVE = (i: number) => 32.6 + 1.5 * i; // visits 0..4
const CLOSE_IDX = [0, 1, 2]; // the first three push stops close
const CLOSE_T = [40.6, 43.0, 45.4];
const CLOSE_OF: Record<number, number> = { 0: 0, 1: 1, 2: 2 };

// route: clean straight lines, start -> stop 0 -> ... -> stop 7
const NODES: V[] = [AQ, ...STOPS];
const SEGS = NODES.slice(1).map((b, i) => {
  const a = NODES[i], d = Math.hypot(b.x - a.x, b.y - a.y);
  return { a, b, d, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
});
const qp = (a: V, c: V, b: V, u: number): V => ({
  x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
});

// neighbour rings: every funded client sends a ~1 km ring that lights the open deals inside it
const won = pins.filter(p => p.l === 'w'), open = pins.filter(p => p.l === 'p');
const RING_PX = 1000 / 8.646; // 1 km in z14 world pixels
const RING_T0 = (rank: number) => 5.2 + rank * 5.8; // wins appear one after another
const RING_DUR = 1.3;
const wonSorted = won.slice().sort((p, q) => Math.hypot(p.x - AQ.x, p.y - AQ.y) - Math.hypot(q.x - AQ.x, q.y - AQ.y));
const wonRank: Record<number, number> = {};
wonSorted.forEach((p, i) => { wonRank[p.i] = i / wonSorted.length; });
const hitT: Record<number, number> = {}; // open pin -> moment the first ring reaches it
for (const o of open) {
  let best = 1e9;
  for (const w of won) { const d = Math.hypot(w.x - o.x, w.y - o.y); if (d < RING_PX) best = Math.min(best, RING_T0(wonRank[w.i]) + 0.25 + RING_DUR * 0.8 * (d / RING_PX)); }
  if (best < 1e8) hitT[o.i] = best;
}

// big open deals (gold sparkle): open pins around the route, away from stops
const SPARKS = (() => {
  const out: V[] = [];
  for (const o of open) {
    if (Math.hypot(o.x - AQ.x, o.y - AQ.y) > 330) continue;
    if (STOPS.some(s => Math.hypot(s.x - o.x, s.y - o.y) < 60)) continue;
    if (out.every(q => Math.hypot(q.x - o.x, q.y - o.y) > 150)) out.push(o);
    if (out.length === 3) break;
  }
  return out;
})();

/* ------------------------------------------------------------------ camera */
const C_WIDE = { x: px(55.262), y: py(25.145) };
const wideCam = (t: number) => ({ cx: C_WIDE.x, cy: C_WIDE.y, s: 0.238 + 0.03 * Math.min(t, 14) / 14 });
const bx = [AQ, ...STOPS].map(p => p.x), by = [AQ, ...STOPS].map(p => p.y);
const BC = { x: (Math.min(...bx) + Math.max(...bx)) / 2, y: (Math.min(...by) + Math.max(...by)) / 2 };
const TARGET = { x: 700, y: 640 };
const aqCam = (t: number) => {
  const s = 1.08 + 0.02 * ramp(t, 18, 50);
  return { cx: BC.x - (TARGET.x - W / 2) / s, cy: BC.y - (TARGET.y - H / 2) / s, s };
};
const camAt = (t: number) => {
  if (t < 14) return wideCam(t);
  if (t >= 18) return aqCam(t);
  const a = wideCam(14), b = aqCam(18), e = eIO(ramp(t, 14, 18));
  return { cx: mix(a.cx, b.cx, e), cy: mix(a.cy, b.cy, e), s: Math.exp(mix(Math.log(a.s), Math.log(b.s), e)) };
};

/* ------------------------------------------------------------------ hexes (turf) */
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
const cookHex: Record<string, number> = {}; // key -> time cooking starts
const blueHex: Record<string, number> = {}; // key -> time painted blue
const blueCenters: { x: number; y: number; t: number }[] = [];
STOPS.slice(0, 5).forEach((s, i) => { const h = worldToHex(s); cookHex[h.q + ',' + h.r] = ARRIVE(i) + 0.15; });
CLOSE_IDX.forEach((si, k) => {
  const h = worldToHex(STOPS[si]);
  const put = (q: number, r: number, t: number) => { const key = q + ',' + r; if (blueHex[key] === undefined || blueHex[key] > t) blueHex[key] = t; };
  put(h.q, h.r, CLOSE_T[k] + 0.25);
  NB.forEach(([dq, dr], j) => put(h.q + dq, h.r + dr, CLOSE_T[k] + 0.5 + j * 0.08));
  const c = hexCenter(h.q, h.r); blueCenters.push({ ...c, t: CLOSE_T[k] + 0.5 });
});
const hexPts = (c: V, r: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');

const starPath = (x: number, y: number, k: number) => `M${x} ${y - 26 * k} l${3 * k} ${9 * k} ${9 * k} ${3 * k} ${-9 * k} ${3 * k} ${-3 * k} ${9 * k} ${-3 * k} ${-9 * k} ${-9 * k} ${-3 * k} ${9 * k} ${-3 * k}z`;

/* ------------------------------------------------------------------ small pieces */
const Head: React.FC<{ light: string; bold: string; size: number; color?: string; align?: 'left' | 'center' }> = ({ light, bold, size, color = BLUE, align = 'left' }) => (
  <div style={{ fontSize: size, lineHeight: 1.04, color: WHITE, fontWeight: 300, letterSpacing: -1, textAlign: align }}>
    {light} <span style={{ fontWeight: 800, color }}>{bold}</span>
  </div>
);
const Caps: React.FC<{ children: React.ReactNode; size?: number; color?: string; spacing?: number }> = ({ children, size = 22, color = MUTED, spacing = 8 }) => (
  <div style={{ fontSize: size, letterSpacing: spacing, color, fontWeight: 600, textTransform: 'uppercase' }}>{children}</div>
);

/* ------------------------------------------------------------------ the video */
export const HeatStory: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const cam = camAt(t);
  const sp = (p: V): V => ({ x: (p.x - cam.cx) * cam.s + W / 2, y: (p.y - cam.cy) * cam.s + H / 2 });
  const zr = Math.pow(cam.s / 0.25, 0.42);

  // ---- tiles
  const tiles: React.ReactNode[] = [];
  const z14a = ramp(cam.s, 0.5, 0.7);
  if (z14a < 0.99) {
    const T = 1024, x0 = Math.floor((cam.cx - W / 2 / cam.s) / T), x1 = Math.floor((cam.cx + W / 2 / cam.s) / T);
    const y0 = Math.floor((cam.cy - H / 2 / cam.s) / T), y1 = Math.floor((cam.cy + H / 2 / cam.s) / T);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
      tiles.push(<Img key={`a${x}/${y}`} src={`${TILE_URL}/12/${y}/${x}`} style={{ position: 'absolute', left: Math.floor((x * T - cam.cx) * cam.s + W / 2), top: Math.floor((y * T - cam.cy) * cam.s + H / 2), width: Math.ceil(T * cam.s) + 1, height: Math.ceil(T * cam.s) + 1 }} />);
  }
  if (z14a > 0.001) {
    const T = 256, x0 = Math.floor((cam.cx - W / 2 / cam.s) / T), x1 = Math.floor((cam.cx + W / 2 / cam.s) / T);
    const y0 = Math.floor((cam.cy - H / 2 / cam.s) / T), y1 = Math.floor((cam.cy + H / 2 / cam.s) / T);
    const inner: React.ReactNode[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
      inner.push(<Img key={`b${x}/${y}`} src={`${TILE_URL}/14/${y}/${x}`} style={{ position: 'absolute', left: Math.floor((x * T - cam.cx) * cam.s + W / 2), top: Math.floor((y * T - cam.cy) * cam.s + H / 2), width: Math.ceil(T * cam.s) + 1, height: Math.ceil(T * cam.s) + 1 }} />);
    tiles.push(<div key="z14" style={{ position: 'absolute', inset: 0, opacity: z14a }}>{inner}</div>);
  }

  const mapOpacity = ramp(t, 2.6, 5.0);
  const mapDim = 0.38 * ramp(t, 50.2, 51.6);

  // ---- pins
  const pinEls: React.ReactNode[] = [];
  for (const p of pins) {
    const q = sp(p);
    if (q.x < -30 || q.x > W + 30 || q.y < -30 || q.y > H + 30) continue;
    if (p.l === 'w') {
      const t0 = RING_T0(wonRank[p.i]), k = ramp(t, t0, t0 + 0.55, eBack);
      if (k <= 0) continue;
      const pulse = 0.5 + 0.2 * Math.sin(t * 2.6 + p.i);
      pinEls.push(
        <g key={p.i}>
          <circle cx={q.x} cy={q.y} r={17 * zr * k} fill="url(#wg)" opacity={pulse} />
          <circle cx={q.x} cy={q.y} r={3.8 * zr * k} fill="#4ade80" stroke="#052e16" strokeWidth={0.8} />
        </g>,
      );
    } else if (p.l === 'p') {
      const base = ramp(t, 5.6 + rand(p.i) * 1.2, 6.4 + rand(p.i) * 1.2);
      if (base <= 0) continue;
      const h = hitT[p.i], lk = h !== undefined ? ramp(t, h, h + 0.5, eOut) : 0;
      const flash = h !== undefined ? Math.max(0, 1 - Math.abs(t - h - 0.2) / 0.35) : 0;
      const late = ramp(t, 14.5, 16);
      const o = base * (mix(0.34, 0.97, lk) * (1 - late) + 0.85 * late);
      pinEls.push(
        <g key={p.i}>
          {lk > 0 && late < 1 && <circle cx={q.x} cy={q.y} r={12 * zr * (1 + flash * 0.8)} fill="url(#ag)" opacity={0.7 * lk * (1 - late)} />}
          <circle cx={q.x} cy={q.y} r={(2.1 + 1.0 * lk + 2.6 * flash) * zr} fill={lk > 0.5 && late < 1 ? '#fcd34d' : AMBER} opacity={o} stroke="#0008" strokeWidth={0.6} />
        </g>,
      );
    } else {
      const o = ramp(t, 14.6, 16.4) * 0.72;
      if (o > 0) pinEls.push(<circle key={p.i} cx={q.x} cy={q.y} r={2.3 * zr} fill={RED} opacity={o} stroke="#0008" strokeWidth={0.6} />);
    }
  }

  // ---- neighbour rings (wide shot)
  const ringEls: React.ReactNode[] = [];
  if (t > 5.2 && t < 12.6) {
    for (const p of won) {
      const t0 = RING_T0(wonRank[p.i]) + 0.25, u = ramp(t, t0, t0 + RING_DUR);
      if (u <= 0 || u >= 1) continue;
      const q = sp(p), rr = RING_PX * cam.s * eOut(u);
      if (q.x < -rr || q.x > W + rr || q.y < -rr || q.y > H + rr) continue;
      ringEls.push(<circle key={p.i} cx={q.x} cy={q.y} r={rr} fill="#22c55e" fillOpacity={0.09 * (1 - u)} stroke="#4ade80" strokeWidth={2} strokeOpacity={0.65 * (1 - u)} />);
    }
  }

  // ---- hex turf
  const hexEls: React.ReactNode[] = [];
  const hexA = ramp(t, 31.4, 33.0);
  if (hexA > 0.01) {
    const hw = W / 2 / cam.s, hh = H / 2 / cam.s;
    const rMin = Math.floor((cam.cy - hh) / (HR * 1.5)) - 1, rMax = Math.ceil((cam.cy + hh) / (HR * 1.5)) + 1;
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor((cam.cx - hw) / (HR * SQ3) - r / 2) - 1, qMax = Math.ceil((cam.cx + hw) / (HR * SQ3) - r / 2) + 1;
      for (let q = qMin; q <= qMax; q++) {
        const c = sp(hexCenter(q, r)), key = q + ',' + r, rr = HR * cam.s * 0.965;
        const cook = cookHex[key], blue = blueHex[key];
        const kc = cook !== undefined ? ramp(t, cook, cook + 0.7, eOut) : 0;
        const kb = blue !== undefined ? ramp(t, blue, blue + 0.55, eOut) : 0;
        const pts = hexPts(c, rr);
        hexEls.push(
          <g key={key}>
            <polygon points={pts} fill="#ffffff" fillOpacity={0.025 * hexA} stroke="#ffffff" strokeOpacity={0.1 * hexA} strokeWidth={1.4} />
            {kc > 0 && kb < 1 && (
              <>
                <circle cx={c.x} cy={c.y} r={rr * 1.55} fill="url(#fire)" opacity={(0.55 + 0.15 * Math.sin(t * 4 + q)) * kc * (1 - kb)} />
                <polygon points={pts} fill={FIRE} fillOpacity={0.2 * kc * (1 - kb)} stroke="#fb923c" strokeOpacity={0.85 * kc * (1 - kb)} strokeWidth={2} />
              </>
            )}
            {kb > 0 && <polygon points={pts} fill={BLUE} fillOpacity={0.3 * kb} stroke={BLUE2} strokeOpacity={0.95 * kb} strokeWidth={2.2} />}
          </g>,
        );
      }
    }
  }
  // turf label
  const doneBlue = blueCenters.filter(b => t > b.t);
  const turfLabel = doneBlue.length ? (() => {
    const cx = doneBlue.reduce((s, b) => s + b.x, 0) / doneBlue.length, cy = doneBlue.reduce((s, b) => s + b.y, 0) / doneBlue.length;
    return sp({ x: cx, y: cy });
  })() : null;

  // ---- route (blue arcs)
  const routeEls: React.ReactNode[] = [];
  SEGS.forEach((g, i) => {
    const p = ramp(t, ROUTE_T0 + i * SEG, ROUTE_T0 + (i + 1) * SEG, eQ);
    if (p <= 0) return;
    const A = sp(g.a), B = sp(g.b), C = sp(g.c);
    const dd = `M${A.x.toFixed(1)},${A.y.toFixed(1)} Q${C.x.toFixed(1)},${C.y.toFixed(1)} ${B.x.toFixed(1)},${B.y.toFixed(1)}`;
    const done = i < 5 && t >= ARRIVE(i) ? 1 : 0;
    const base = t < 32 ? 1 : 0.55 + 0.45 * done;
    const head = qp(A, C, B, p);
    const col = done ? '#93c5fd' : BLUE2;
    routeEls.push(
      <g key={i} opacity={base}>
        <path d={dd} fill="none" stroke={BLUE} strokeWidth={16} opacity={0.16} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
        <path d={dd} fill="none" stroke={BLUE} strokeWidth={8} opacity={0.34} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
        <path d={dd} fill="none" stroke={col} strokeWidth={3.6} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
        {p < 1 && <circle cx={head.x} cy={head.y} r={6} fill="#fff" />}
      </g>,
    );
  });

  // ---- stop markers
  const stopEls: React.ReactNode[] = [];
  STOPS.forEach((s, i) => {
    const k = ramp(t, PLAN_T(i), PLAN_T(i) + 0.5, eBack);
    if (k <= 0) return;
    const q = sp(s), tag = TAGS[s.l];
    const visited = i < 5 && t >= ARRIVE(i);
    const ci = CLOSE_OF[i], closed = ci !== undefined && t >= CLOSE_T[ci];
    const fill = closed ? GREEN : visited ? FIRE : '#0f172a';
    const stroke = closed ? '#ffffff' : visited ? '#fed7aa' : tag.col;
    const pulseA = i < 5 ? ramp(t, ARRIVE(i), ARRIVE(i) + 1.0) : 0;
    const burst = ci !== undefined ? ramp(t, CLOSE_T[ci], CLOSE_T[ci] + 1.1) : 0;
    const pop = closed ? 1 + 0.35 * Math.max(0, 1 - ramp(t, CLOSE_T[ci], CLOSE_T[ci] + 0.5)) * Math.sin(ramp(t, CLOSE_T[ci], CLOSE_T[ci] + 0.5) * Math.PI) : 1;
    stopEls.push(
      <g key={i} transform={`translate(${q.x},${q.y}) scale(${k * pop})`}>
        <circle r={36} fill={closed ? 'url(#gg)' : visited ? 'url(#fire)' : tag.col === AMBER ? 'url(#ag)' : tag.col === GREEN ? 'url(#gg)' : 'url(#rg)'} opacity={0.6} />
        <circle r={19} fill={fill} stroke={stroke} strokeWidth={3.5} />
        <text y={7.5} fontSize={21} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily={FONT}>{closed || visited ? '✓' : i + 1}</text>
        {pulseA > 0 && pulseA < 1 && <circle r={19 + 52 * eOut(pulseA)} fill="none" stroke={FIRE} strokeWidth={3} opacity={1 - pulseA} />}
        {burst > 0 && burst < 1 && (
          <>
            <circle r={19 + 110 * eOut(burst)} fill="none" stroke="#4ade80" strokeWidth={5 * (1 - burst) + 1} opacity={1 - burst} />
            <circle r={19 + 60 * eOut(Math.max(0, burst - 0.12) / 0.88)} fill="none" stroke="#fff" strokeWidth={2.5} opacity={0.8 * (1 - burst)} />
            {Array.from({ length: 10 }, (_, j) => { const a = (j / 10) * Math.PI * 2 + 0.3, r0 = 24 + 80 * eOut(burst); return <circle key={j} cx={Math.cos(a) * r0} cy={Math.sin(a) * r0} r={4 * (1 - burst)} fill={j % 2 ? '#4ade80' : GOLD} />; })}
          </>
        )}
      </g>,
    );
  });
  // closed label floating
  const closeLabels = CLOSE_IDX.map((si, k) => {
    const p = ramp(t, CLOSE_T[k], CLOSE_T[k] + 1.8);
    if (p <= 0 || p >= 1) return null;
    const q = sp(STOPS[si]);
    return (
      <div key={k} style={{ position: 'absolute', left: q.x - 70, top: q.y - 78 - 46 * eOut(p), width: 140, textAlign: 'center', opacity: Math.min(1, p * 6) * (1 - ramp(p, 0.65, 1)) }}>
        <span style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 20, background: GREEN, color: '#04210f', fontWeight: 800, fontSize: 22, boxShadow: '0 0 30px #22c55e88' }}>Closed ✓</span>
      </div>
    );
  });

  // ---- Karim marker position (along the route)
  let kPos = AQ;
  {
    let seg = -1;
    for (let i = 0; i < 5; i++) if (t >= ARRIVE(i) - 0.85) seg = i;
    if (seg >= 0) {
      const g = SEGS[seg], u = ramp(t, ARRIVE(seg) - 0.85, ARRIVE(seg), eIO);
      kPos = qp(g.a, g.c, g.b, u);
    }
  }
  const kq = sp(kPos);
  const kA = ramp(t, 17.0, 17.7, eBack);
  const kHop = t > 32 ? Math.sin(Math.min(1, ramp(t, 32.6, 33.4)) * 0) : 0;

  // ---- sparkles
  const sparkA = ramp(t, 34, 35);
  const sparkEls = sparkA > 0 ? SPARKS.map((p, i) => {
    const q = sp(p), tw = 0.8 + 0.25 * Math.sin(t * 3 + i * 2);
    return (
      <g key={i} opacity={sparkA}>
        <circle cx={q.x} cy={q.y} r={30} fill="url(#gold)" />
        <circle cx={q.x} cy={q.y} r={10} fill="none" stroke="#fde047" strokeWidth={2.2} />
        {[0, 1, 2, 3].map(k => <path key={k} d={starPath(q.x, q.y, tw * 0.9)} fill="#fef08a" transform={`rotate(${k * 90 + (k === 1 || k === 3 ? 0 : 0)} ${q.x} ${q.y})`} opacity={k % 2 ? 0.55 : 0.95} />)}
      </g>
    );
  }) : null;

  /* ------------------------------------------------------------------ HUD pieces */
  // plan panel slide
  const panelIn = ramp(t, 17.6, 18.4, eOut) - ramp(t, 29.9, 30.7, eIO) + ramp(t, 33.0, 33.9, eOut) - ramp(t, 49.9, 50.6, eIO) - 0;
  const panelX = (1 - Math.max(0, Math.min(1, panelIn))) * 560;
  const panelVisible = panelIn > 0.001;
  // summary card
  const sumIn = ramp(t, 25.4, 26.2, eOut) - ramp(t, 29.9, 30.7, eIO);
  const sumY = (1 - Math.max(0, Math.min(1, sumIn))) * 60;
  const press = ramp(t, 28.95, 29.05) - ramp(t, 29.05, 29.4);
  const btnScale = t < 28.9 ? 1 : t < 29.1 ? 1 - 0.07 * ramp(t, 28.9, 29.1) : 0.93 + 0.12 * Math.sin(Math.min(1, ramp(t, 29.1, 29.55)) * Math.PI) + 0.07 * ramp(t, 29.1, 29.55);
  const tapRing = ramp(t, 28.2, 28.95, eOut) * (1 - ramp(t, 28.95, 29.05));
  const rippleP = ramp(t, 29.0, 29.8);
  const routeP = Math.min(8, Math.max(0, (t - ROUTE_T0) / SEG));
  const stopsShown = Math.min(8, Math.ceil(routeP));
  const kmShown = Math.round(26 * ramp(t, ROUTE_T0, ROUTE_T0 + 4.0, eQ));
  const minShown = Math.round(55 * ramp(t, ROUTE_T0, ROUTE_T0 + 4.0, eQ));

  const visits = STOPS.slice(0, 5).filter((_, i) => t >= ARRIVE(i)).length;
  const closesN = CLOSE_T.filter(c => t >= c + 0.1).length;
  const chipsA = ramp(t, 32.3, 33.0, eOut) * (1 - ramp(t, 50.0, 50.6));
  const closeChipA = ramp(t, 40.2, 40.9, eOut);

  // stamp + confetti
  const stampT = 46.1;
  const stampA = ramp(t, stampT, stampT + 0.35) * (1 - ramp(t, 50.2, 50.9));
  const stampScale = 1 + 0.35 * (1 - eBack(ramp(t, stampT, stampT + 0.55)));
  const confetti: React.ReactNode[] = [];
  if (t > stampT && t < stampT + 3.6) {
    const tau = t - stampT - 0.12;
    if (tau > 0) for (let i = 0; i < 80; i++) {
      const wave = i < 56 ? 0 : 1, T0 = wave * 0.35, ta = tau - T0;
      if (ta <= 0) continue;
      const ang = -Math.PI / 2 + (rand(i, 1) - 0.5) * Math.PI * 1.45, sp0 = 480 + rand(i, 2) * 900;
      const k = 1.3, vx = Math.cos(ang) * sp0, vy = Math.sin(ang) * sp0;
      const x = 700 + vx * (1 - Math.exp(-k * ta)) / k, y = 235 + vy * (1 - Math.exp(-k * ta)) / k + 0.5 * 1500 * ta * ta;
      const life = 2.7 + rand(i, 3) * 0.7, alpha = 1 - ramp(ta, life - 0.7, life);
      if (alpha <= 0) continue;
      const colr = [GOLD, '#fde68a', BLUE, '#93c5fd', '#f8fafc'][i % 5];
      const rot = rand(i, 4) * 360 + ta * (180 + rand(i, 5) * 420), flip = Math.cos(ta * (4 + rand(i, 6) * 6));
      const w = 9 + rand(i, 7) * 10, h = 5 + rand(i, 8) * 6;
      confetti.push(
        <div key={i} style={{ position: 'absolute', left: x, top: y, width: w, height: i % 4 === 0 ? w : h, borderRadius: i % 4 === 0 ? '50%' : 2, background: colr, opacity: alpha, transform: `rotate(${rot}deg) scaleY(${0.35 + 0.65 * Math.abs(flip)})` }} />,
      );
    }
  }
  const ringP = ramp(t, stampT, stampT + 1.1);

  // scoreboard
  const sbIn = ramp(t, 50.5, 51.4, eBack);
  const kp = ramp(t, 52.0, 53.9);
  const slotY = (slot: number) => slot * 96;
  const board = [
    { n: 'Karim', s0: 3, s1: 7, slot: mix(2, 0, eIO(kp)) },
    { n: 'Cameron', s0: 5, s1: 5, slot: mix(0, 1, eIO(ramp(kp, 0.5, 0.92))) },
    { n: 'Venko', s0: 4, s1: 4, slot: mix(1, 2, eIO(ramp(kp, 0.22, 0.62))) },
    { n: 'Menna', s0: 2, s1: 3, slot: 3 },
  ];
  const sbOut = 1 - ramp(t, 55.0, 55.8);

  // end card
  const endBg = ramp(t, 55.4, 56.6);
  const l1 = ramp(t, 56.5, 57.2, eOut), l2 = ramp(t, 57.3, 57.9, eOut), l3 = ramp(t, 58.2, 58.9, eOut), l4 = ramp(t, 59.0, 59.5);

  // intro
  const typed = 'See where we win.';
  const nTyped = Math.min(typed.length, Math.max(0, Math.floor((t - 2.0) * 16)));
  const mmTyped = 'MONDAY · 8:02 AM';
  const nMM = Math.min(mmTyped.length, Math.max(0, Math.floor((t - 14.3) * 16)));
  const mmA = ramp(t, 14.2, 14.6) * (1 - ramp(t, 16.4, 17.0));
  const mmTitle = ramp(t, 15.0, 15.7, eOut);
  const introFade = 1 - ramp(t, 4.2, 5.0);
  const madIn = ramp(t, 1.7, 2.6, eOut);

  // wide captions
  const cap1 = ramp(t, 7.6, 8.4, eOut) * (1 - ramp(t, 13.2, 14.0, eIO));
  const cap2 = 1;
  const pctShown = Math.round(83 * ramp(t, 8.2, 11.2, eOut));

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT, overflow: 'hidden' }}>
      {/* ---------------- map */}
      <AbsoluteFill style={{ background: NAVY, opacity: mapOpacity }}>
        <AbsoluteFill style={{ filter: TILE_FILTER }}>{tiles}</AbsoluteFill>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <radialGradient id="wg"><stop offset="0" stopColor="#4ade80" stopOpacity="0.95" /><stop offset="0.4" stopColor="#22c55e" stopOpacity="0.35" /><stop offset="1" stopColor="#22c55e" stopOpacity="0" /></radialGradient>
            <radialGradient id="gg"><stop offset="0" stopColor="#4ade80" stopOpacity="0.8" /><stop offset="1" stopColor="#22c55e" stopOpacity="0" /></radialGradient>
            <radialGradient id="ag"><stop offset="0" stopColor="#fbbf24" stopOpacity="0.75" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></radialGradient>
            <radialGradient id="rg"><stop offset="0" stopColor="#f87171" stopOpacity="0.7" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></radialGradient>
            <radialGradient id="fire"><stop offset="0" stopColor="#fde047" stopOpacity="0.9" /><stop offset="0.5" stopColor="#f97316" stopOpacity="0.5" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></radialGradient>
            <radialGradient id="gold"><stop offset="0" stopColor="#fde047" stopOpacity="0.7" /><stop offset="1" stopColor="#fbbf24" stopOpacity="0" /></radialGradient>
          </defs>
          {hexEls}
          {ringEls}
          {pinEls}
          {routeEls}
          {sparkEls}
          {stopEls}
        </svg>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(10,16,36,0) 55%, rgba(5,8,20,0.65) 100%)` }} />
        <AbsoluteFill style={{ background: '#05081a', opacity: mapDim + 0.55 * (1 - ramp(t, 4.0, 5.0)) * (t < 5 ? 1 : 0) }} />
        {/* turf label */}
        {turfLabel && (
          <div style={{ position: 'absolute', left: turfLabel.x - 80, top: turfLabel.y - 18, width: 160, textAlign: 'center', opacity: ramp(t, 41, 41.6) }}>
            <span style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 18, background: 'rgba(30,64,175,0.85)', border: '1px solid #93c5fd88', color: '#fff', fontWeight: 700, fontSize: 20, letterSpacing: 3, textTransform: 'uppercase' }}>Karim</span>
          </div>
        )}
        {closeLabels}
        {/* Karim marker */}
        {kA > 0 && (
          <div style={{ position: 'absolute', left: kq.x - 40, top: kq.y - 40 + kHop, width: 80, textAlign: 'center', transform: `scale(${kA})`, transformOrigin: '40px 40px', opacity: 1 - ramp(t, 49.8, 50.6) * 0 }}>
            <div style={{ width: 76, height: 76, margin: '0 2px', borderRadius: '50%', background: BLUE, border: '4px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 900, color: '#fff', boxShadow: '0 0 34px #3b82f6cc' }}>K</div>
            <div style={{ position: 'absolute', left: -20, width: 120, top: 84 }}><span style={{ display: 'inline-block', background: 'rgba(15,23,42,0.88)', border: '1px solid #ffffff33', color: '#fff', borderRadius: 12, padding: '3px 14px', fontSize: 22, fontWeight: 700 }}>Karim</span></div>
          </div>
        )}
      </AbsoluteFill>

      {/* ---------------- intro */}
      {t < 5.1 && (
        <AbsoluteFill style={{ opacity: introFade, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', transform: `translateY(${(1 - madIn) * 16}px)` }}>
            <div style={{ opacity: madIn, filter: `blur(${(1 - madIn) * 14}px)`, fontSize: 200, lineHeight: 1, letterSpacing: -4, color: WHITE, fontWeight: 300, textShadow: '0 0 60px rgba(59,130,246,0.25)' }}>
              FlapKap <span style={{ fontWeight: 800, color: BLUE, textShadow: '0 0 70px rgba(59,130,246,0.6)' }}>Heat</span>
            </div>
            <div style={{ width: 160 * ramp(t, 1.6, 2.4, eOut), height: 4, background: BLUE, margin: '56px auto 30px', borderRadius: 2, boxShadow: '0 0 18px #3b82f6' }} />
            <div style={{ fontSize: 46, letterSpacing: 5, color: '#cbd5e1', fontWeight: 300, height: 60 }}>
              {typed.slice(0, nTyped)}<span style={{ opacity: Math.floor(t * 2.5) % 2 === 0 && t < 4.0 ? 1 : 0, color: BLUE }}>|</span>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ---------------- scene 3: Mad Monday card */}
      {mmA > 0.001 && (
        <AbsoluteFill style={{ opacity: mmA, alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, rgba(5,8,26,0.82) 0%, rgba(5,8,26,0.55) 70%)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 30, letterSpacing: 14, color: '#cbd5e1', fontWeight: 600, height: 42 }}>{mmTyped.slice(0, nMM)}</div>
            <div style={{ opacity: mmTitle, transform: `translateY(${(1 - mmTitle) * 18}px) scale(${0.96 + 0.04 * mmTitle})`, marginTop: 14, fontSize: 190, lineHeight: 1, letterSpacing: -4, color: WHITE, fontWeight: 300, textShadow: '0 0 60px rgba(59,130,246,0.25)' }}>
              Mad <span style={{ fontWeight: 800, color: BLUE, textShadow: '0 0 70px rgba(59,130,246,0.6)' }}>Monday</span>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ---------------- scene 2 captions */}
      {cap1 > 0.001 && (
        <div style={{ position: 'absolute', left: 64, top: 64, width: 780, padding: '34px 40px', ...glass, opacity: cap1, transform: `translateX(${(1 - cap1) * -40}px)` }}>
          <Caps size={20} color={BLUE2} spacing={7}>The neighbour effect</Caps>
          <div style={{ marginTop: 14 }}><Head light="Every client we fund" bold="has neighbours." size={58} /></div>
          <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid #ffffff22', opacity: cap2, transform: `translateY(${(1 - cap2) * 14}px)`, display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{ fontSize: 100, fontWeight: 800, color: BLUE, lineHeight: 1, minWidth: 190, letterSpacing: -2 }}>{pctShown}<span style={{ fontSize: 56 }}>%</span></div>
            <div style={{ fontSize: 28, color: '#cbd5e1', lineHeight: 1.3 }}>of open deals sit within <b style={{ color: WHITE }}>1 km</b> of a client we funded.</div>
          </div>
        </div>
      )}

      {/* ---------------- top-left chips */}
      {chipsA > 0.001 && (
        <div style={{ position: 'absolute', left: 60, top: 46, display: 'flex', gap: 16, opacity: chipsA, transform: `translateY(${(1 - chipsA) * -20}px)` }}>
          <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f9731666' }}>
            <span style={{ fontSize: 28 }}>🔥</span> Streak <span style={{ color: MUTED, fontWeight: 400 }}>·</span> <span style={{ color: '#fdba74' }}>3 Mondays</span>
          </div>
          <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ color: MUTED, fontWeight: 600, fontSize: 20, letterSpacing: 3 }}>VISITS</span>
            <span><span style={{ color: visits === 5 ? '#fdba74' : WHITE }}>{visits}</span><span style={{ color: MUTED }}>/5</span></span>
            <div style={{ width: 90, height: 8, borderRadius: 4, background: '#ffffff22', overflow: 'hidden' }}><div style={{ width: `${visits * 20}%`, height: '100%', background: FIRE, borderRadius: 4 }} /></div>
          </div>
          {closeChipA > 0.001 && (
            <div style={{ ...glass, borderRadius: 40, padding: '12px 26px', fontSize: 26, fontWeight: 700, color: WHITE, display: 'flex', alignItems: 'center', gap: 14, opacity: closeChipA, border: '1px solid #22c55e66' }}>
              <span style={{ color: MUTED, fontWeight: 600, fontSize: 20, letterSpacing: 3 }}>CLOSES</span>
              <span style={{ color: '#4ade80' }}>{closesN}</span>
            </div>
          )}
        </div>
      )}

      {/* ---------------- legend */}
      {t > 33.5 && t < 50.8 && (
        <div style={{ position: 'absolute', left: 60, bottom: 38, display: 'flex', gap: 14, opacity: ramp(t, 33.5, 34.3) * (1 - ramp(t, 50, 50.7)) }}>
          {[[GOLD, '✦ Big open deal: bonus'], [FIRE, '🔥 Visited this week'], [BLUE2, '⬢ Karim’s turf']].map(([c, l], i) => (
            <div key={i} style={{ ...glass, borderRadius: 30, padding: '8px 20px', fontSize: 20, fontWeight: 600, color: WHITE, border: `1px solid ${c}66` }}>{l}</div>
          ))}
        </div>
      )}

      {/* ---------------- plan panel */}
      {panelVisible && (
        <div style={{ position: 'absolute', left: 1400, top: 52, width: 460, padding: '24px 24px 20px', ...glass, transform: `translateX(${panelX}px)` }}>
          <Caps size={17} color={BLUE2} spacing={5}>Karim · Monday · Al Quoz</Caps>
          <div style={{ marginTop: 6, marginBottom: 14 }}><Head light="Plan my" bold="day" size={44} /></div>
          {STOPS.map((s, i) => {
            const k = ramp(t, PLAN_T(i), PLAN_T(i) + 0.45, eOut), tag = TAGS[s.l];
            const visited = i < 5 && t >= ARRIVE(i);
            const ci = CLOSE_OF[i], closed = ci !== undefined && t >= CLOSE_T[ci];
            const rowFlash = closed ? 1 - ramp(t, CLOSE_T[ci], CLOSE_T[ci] + 1.2) : 0;
            return (
              <div key={i} style={{ position: 'relative', height: 58, marginBottom: 6, borderRadius: 14, background: closed ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.045)', border: `1px solid ${closed ? '#22c55e77' : '#ffffff14'}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 14, boxShadow: rowFlash > 0 ? `0 0 ${30 * rowFlash}px #22c55e` : 'none' }}>
                {k < 1 && <div style={{ position: 'absolute', left: 14, right: 14, top: 18, height: 22, borderRadius: 8, background: '#ffffff0d', opacity: 1 - k }} />}
                <div style={{ opacity: k, transform: `translateX(${(1 - k) * 36}px)`, display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: closed ? GREEN : visited ? FIRE : '#0f172a', border: `2.5px solid ${closed ? '#fff' : visited ? '#fed7aa' : tag.col}`, color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{closed || visited ? '✓' : i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'inline-block', padding: '1px 12px', borderRadius: 14, background: (closed ? GREEN : tag.col) + '26', border: `1px solid ${(closed ? GREEN : tag.col)}77`, color: closed ? '#4ade80' : tag.col === RED ? '#f87171' : tag.col === GREEN ? '#4ade80' : '#fbbf24', fontWeight: 700, fontSize: 19 }}>{closed ? 'Closed' : tag.name}</span>
                    <div style={{ fontSize: 15, color: MUTED, marginTop: 2, whiteSpace: 'nowrap' }}>{closed ? 'Deal closed' : visited ? 'Visited' : tag.desc}</div>
                  </div>
                  <div style={{ fontSize: 18, color: MUTED, fontWeight: 600 }}>{STOP_TIMES[i]}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- summary card */}
      {sumIn > 0.001 && (
        <div style={{ position: 'absolute', left: 1400, top: 790, width: 460, padding: '22px 24px 24px', ...glass, border: '1px solid #3b82f688', opacity: Math.max(0, Math.min(1, sumIn)), transform: `translateY(${sumY}px)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {[[stopsShown, 'stops'], [kmShown, 'km'], [`${minShown} min`, 'driving']].map(([v, u], i) => (
              <div key={i} style={{ textAlign: 'center', flex: i === 2 ? 1.5 : 1 }}>
                <div style={{ fontSize: i === 2 ? 38 : 46, whiteSpace: 'nowrap', fontWeight: 800, color: WHITE, lineHeight: 1.1 }}>{v}</div>
                <div style={{ fontSize: 18, color: MUTED, letterSpacing: 2, fontWeight: 600 }}>{u}</div>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', marginTop: 20 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 16, border: `3px solid ${BLUE2}`, opacity: rippleP > 0 && rippleP < 1 ? 1 - rippleP : 0, transform: `scale(${1 + 0.25 * rippleP})` }} />
            <div style={{ height: 64, borderRadius: 16, background: `linear-gradient(180deg, ${BLUE2}, ${BLUE})`, color: '#fff', fontWeight: 800, fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${btnScale})`, boxShadow: '0 10px 30px #3b82f655', opacity: ramp(t, 26.4, 27.0) }}>
              Open in Google Maps ↗
            </div>
            {tapRing > 0 && <div style={{ position: 'absolute', left: 300, top: 18, width: 36, height: 36, borderRadius: '50%', background: '#ffffff55', border: '2px solid #fff', transform: `scale(${1.8 - 0.8 * tapRing})`, opacity: tapRing }} />}
          </div>
        </div>
      )}

      {/* ---------------- phone */}
      {t > 29.9 && t < 33.6 && <Phone t={t} />}

      {/* ---------------- stamp */}
      {stampA > 0.001 && (
        <>
          <div style={{ position: 'absolute', left: 140, top: 120, width: 1120, height: 250, background: 'radial-gradient(ellipse at center, rgba(5,8,26,0.8) 0%, rgba(5,8,26,0) 70%)', opacity: stampA }} />
          <div style={{ position: 'absolute', left: 0, width: 1400, top: 128, textAlign: 'center', opacity: stampA, transform: `scale(${stampScale})`, transformOrigin: '700px 90px' }}>
            <div style={{ fontSize: 24, letterSpacing: 10, color: '#cbd5e1', fontWeight: 600 }}>AL QUOZ · OCTOBER</div>
            <div style={{ fontSize: 112, fontWeight: 300, color: WHITE, lineHeight: 1.05, letterSpacing: -1, textShadow: '0 4px 40px #000a' }}>
              Area <span style={{ fontWeight: 800, color: BLUE, textShadow: '0 0 40px rgba(59,130,246,0.55)' }}>Dominator</span>
            </div>
            <div style={{ width: 160 * ramp(t, stampT + 0.3, stampT + 0.9, eOut), height: 4, background: GOLD, margin: '14px auto 0', borderRadius: 2, boxShadow: '0 0 16px #fbbf24' }} />
          </div>
          {ringP > 0 && ringP < 1 && <div style={{ position: 'absolute', left: 700 - 420 * eOut(ringP), top: 235 - 420 * eOut(ringP), width: 840 * eOut(ringP), height: 840 * eOut(ringP), borderRadius: '50%', border: `4px solid ${GOLD}`, opacity: 0.7 * (1 - ringP) }} />}
        </>
      )}
      {confetti}

      {/* ---------------- scoreboard */}
      {t > 50.4 && sbOut > 0.001 && (
        <div style={{ position: 'absolute', left: 1330, top: 120, width: 530, padding: '30px 32px 26px', ...glass, opacity: Math.min(1, sbIn * 2) * sbOut, transform: `translateX(${(1 - sbIn) * 600}px)` }}>
          <Caps size={20} color={MUTED} spacing={6}>Mad Monday · Week 3</Caps>
          <div style={{ position: 'relative', height: 96 * 4, marginTop: 14 }}>
            {board.map((r, idx) => {
              const sc = r.n === 'Karim' ? Math.round(mix(3, 7, eQ(kp))) : r.n === 'Menna' ? Math.round(mix(2, 3, ramp(kp, 0.3, 1))) : r.s0;
              const rank = Math.round(r.slot);
              const hot = r.n === 'Karim';
              const flames = Math.max(0, Math.min(3, sc - 2));
              const crown = hot ? ramp(t, 53.7, 54.3, eBack) : 0;
              return (
                <div key={r.n} style={{ position: 'absolute', left: 0, right: 0, top: slotY(r.slot), height: 84, borderRadius: 18, background: hot ? `rgba(59,130,246,${0.14 + 0.1 * kp})` : 'rgba(255,255,255,0.04)', border: `1px solid ${hot ? '#60a5fa88' : '#ffffff14'}`, boxShadow: hot ? `0 0 ${40 * kp}px rgba(59,130,246,0.45)` : 'none', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, zIndex: hot ? 2 : 1 }}>
                  <div style={{ width: 40, fontSize: 36, fontWeight: 800, color: rank === 0 ? BLUE2 : MUTED }}>{rank + 1}</div>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: hot ? BLUE : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: '#fff', border: hot ? '3px solid #fff' : '2px solid #ffffff22', flex: 'none' }}>{r.n[0]}</div>
                  <div style={{ flex: 1, fontSize: 34, fontWeight: hot ? 800 : 600, color: WHITE, whiteSpace: 'nowrap' }}>{r.n}{crown > 0 && <span style={{ display: 'inline-block', marginLeft: 10, fontSize: 34, transform: `scale(${crown}) rotate(${(1 - crown) * -30}deg)` }}>👑</span>}</div>
                  <div style={{ fontSize: 26, minWidth: 100, textAlign: 'right', whiteSpace: 'nowrap', letterSpacing: -2 }}>{'🔥'.repeat(flames)}</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: WHITE, width: 40, textAlign: 'right' }}>{sc}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #ffffff22', fontSize: 19, color: MUTED }}>🔥 streak = Mondays in a row at 5+ visits</div>
        </div>
      )}

      {/* ---------------- end card */}
      {endBg > 0.001 && (
        <AbsoluteFill style={{ opacity: endBg, background: `radial-gradient(ellipse at 50% 55%, #14214a 0%, ${NAVY} 62%, #060a18 100%)`, alignItems: 'center', justifyContent: 'center' }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
            {Array.from({ length: 9 }, (_, r) => Array.from({ length: 17 }, (_, q) => {
              const c = { x: q * 130 + (r % 2 ? 65 : 0) - 20, y: r * 117 - 20 }, d = Math.hypot(c.x - 960, c.y - 560);
              return <polygon key={r * 20 + q} points={hexPts(c, 62)} fill="none" stroke="#3b82f6" strokeOpacity={Math.max(0, 0.17 - d / 7000)} strokeWidth={1.5} />;
            }))}
          </svg>
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 26}px)`, fontSize: 112, fontWeight: 300, color: WHITE, letterSpacing: -2, lineHeight: 1.05 }}>
              More visits. <span style={{ fontWeight: 800, color: BLUE }}>More closes.</span>
            </div>
            <div style={{ opacity: l2, transform: `translateY(${(1 - l2) * 20}px)`, fontSize: 48, color: '#cbd5e1', fontWeight: 400, marginTop: 24, letterSpacing: 1 }}>A team that wants to win.</div>
            <div style={{ width: 120 * l3, height: 3, background: BLUE, margin: '64px auto 34px', borderRadius: 2, opacity: l3 }} />
            <div style={{ opacity: l3, transform: `scale(${0.94 + 0.06 * l3})`, fontSize: 84, fontWeight: 300, color: WHITE, letterSpacing: -1 }}>
              FlapKap <span style={{ fontWeight: 800, color: BLUE }}>Heat</span>
            </div>
            <div style={{ opacity: l4, marginTop: 14, fontSize: 22, letterSpacing: 12, color: MUTED, fontWeight: 600 }}>MAD MONDAY</div>
          </div>
        </AbsoluteFill>
      )}

      {/* map credit */}
      {t > 5 && t < 55.5 && <div style={{ position: 'absolute', right: 20, bottom: 10, fontSize: 13, color: '#94a3b8', opacity: 0.55 }}>Map © Esri, HERE, OpenStreetMap contributors</div>}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ phone with a stylised navigation view */
const Phone: React.FC<{ t: number }> = ({ t }) => {
  const inn = ramp(t, 29.9, 31.2, eBack), out = ramp(t, 32.6, 33.5, eIO);
  const drive = ramp(t, 31.0, 33.4, eQ) * 300;
  const turnY = 70 + drive, meters = Math.max(40, Math.round((600 - turnY) * 0.9 / 10) * 10);
  const PW = 364, PH = 752;
  const roads: React.ReactNode[] = [];
  for (let i = -6; i < 14; i++) roads.push(<line key={'h' + i} x1={-40} x2={400} y1={i * 96 + (i % 2) * 14} y2={i * 96 + (i % 2) * 14 - 10} stroke="#1b2848" strokeWidth={14} />);
  for (let i = -2; i < 6; i++) roads.push(<line key={'v' + i} x1={i * 112 + 20} x2={i * 112 + 20 + (i % 2) * 10} y1={-700} y2={1300} stroke="#1b2848" strokeWidth={14} />);
  roads.push(<line key="dg" x1={-60} y1={900} x2={420} y2={-300} stroke="#22305a" strokeWidth={20} />);
  return (
    <div style={{ position: 'absolute', left: 1650 - PW / 2 + (1 - inn) * 640 + out * 700, top: 150 + (1 - inn) * 80, width: PW, height: PH, transform: `rotate(${(1 - inn) * 8}deg)`, borderRadius: 60, background: '#05080f', border: '3px solid #475569', boxShadow: '0 40px 100px #000a, 0 0 0 10px #0f172a, 0 0 60px #3b82f655', overflow: 'hidden' }}>
      <svg width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`} style={{ position: 'absolute', inset: 0 }}>
        <rect width={PW} height={PH} fill="#0b1226" />
        <g transform={`translate(12,${drive - 140})`}>
          <rect x={200} y={-300} width={300} height={260} rx={30} fill="#0d1c40" />
          {roads}
          <path d={`M170 1500 L170 ${70} Q170 ${20} 220 ${20} L520 20`} fill="none" stroke="#3b82f6" strokeWidth={26} opacity={0.25} strokeLinecap="round" />
          <path d={`M170 1500 L170 ${70} Q170 ${20} 220 ${20} L520 20`} fill="none" stroke="#60a5fa" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(182,600)">
          <circle r={34} fill="#3b82f6" opacity={0.25} />
          <path d="M0 -24 L20 18 L0 8 L-20 18 Z" fill="#fff" stroke="#1d4ed8" strokeWidth={3} strokeLinejoin="round" />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 52, borderRadius: 22, background: 'rgba(15,23,42,0.92)', border: '1px solid #ffffff22', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 50, fontWeight: 800, color: '#fff', lineHeight: 1 }}>↱</div>
        <div><div style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{meters} m</div><div style={{ fontSize: 17, color: MUTED }}>Next: stop 1 of 8</div></div>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 14, width: 120, height: 26, borderRadius: 14, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 118, background: 'rgba(11,18,38,0.96)', borderTop: '1px solid #ffffff22', padding: '18px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div><div style={{ fontSize: 38, fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>55 min</div><div style={{ fontSize: 19, color: MUTED, marginTop: 6 }}>26 km · 8 stops</div></div>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</div>
      </div>
    </div>
  );
};
