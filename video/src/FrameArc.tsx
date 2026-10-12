import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import data from './data.json';

// "Light arcs" game-mode look: tilted 3D map, city-light dots, glowing referral arcs
// (green: won client -> open deal nearby), Karim's Mad Monday route (purple).
const W = 1920, H = 1080, PW = 3600, PH = 2600;           // plane bigger than the screen so the tilt fills it
let A = (56 * Math.PI) / 180; const D = 1500; // A is set per render: 0 = flat 2D                  // tilt and perspective distance (CSS perspective/rotateX)
const Z = 13, TILE = 256, N = 2 ** Z;
const px = (lng: number) => ((lng + 180) / 360) * N * TILE;
const py = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N * TILE; };
const C = { lng: 55.21, lat: 25.13 };
const ox = px(C.lng) - PW / 2, oy = py(C.lat) - PH / 2 - 260;
// plane coords (0..PW, 0..PH) -> screen, matching the CSS transform below
const proj = (x: number, y: number) => {
  const dx = x - PW / 2, dy = y - PH / 2;
  const z = dy * Math.sin(A), s = D / (D - z);
  return { x: W / 2 + dx * s, y: H / 2 + dy * Math.cos(A) * s, s };
};
const plane = (lng: number, lat: number) => ({ x: px(lng) - ox, y: py(lat) - oy });

const pins = (data.pins as { x: number; y: number; l: string }[]).map(p => ({ ...plane(p.x, p.y), l: p.l }));
const won = pins.filter(p => p.l === 'w'), open = pins.filter(p => p.l === 'p');
// referral arcs: each of ~140 open deals to its nearest won client
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const arcs = open.filter(() => rnd() < 0.22).map(o => {
  let best = won[0], bd = 1e9; for (const w of won) { const d = Math.hypot(w.x - o.x, w.y - o.y); if (d < bd && d > 60) { bd = d; best = w; } }
  return { a: best, b: o };
}).filter(r => { const d = Math.hypot(r.a.x - r.b.x, r.a.y - r.b.y); return d > 40 && d < 700; });
// Karim's route: 8 open deals around Al Quoz
const q = plane(55.228, 25.138);
const route = open.slice().sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y)).slice(0, 40).filter((_, i) => i % 5 === 0).slice(0, 8)
  .sort((a, b) => Math.atan2(a.y - q.y, a.x - q.x) - Math.atan2(b.y - q.y, b.x - q.x));

const arcPath = (a: { x: number; y: number }, b: { x: number; y: number }, lift: number) => {
  const A1 = proj(a.x, a.y), B1 = proj(b.x, b.y);
  const mx = (A1.x + B1.x) / 2, my = (A1.y + B1.y) / 2, d = Math.hypot(A1.x - B1.x, A1.y - B1.y);
  return { d: `M${A1.x},${A1.y} Q${mx},${my - d * lift - 20} ${B1.x},${B1.y}`, A1, B1 };
};

export const FrameArc: React.FC<{ flat?: boolean; navy?: boolean; bare?: boolean }> = ({ flat, navy, bare }) => {
  A = flat ? 0 : (56 * Math.PI) / 180;
  const X0 = Math.floor(ox / TILE), Y0 = Math.floor(oy / TILE), X1 = Math.floor((ox + PW) / TILE), Y1 = Math.floor((oy + PH) / TILE);
  const tiles: React.ReactNode[] = [];
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++)
    tiles.push(<Img key={x + '/' + y} src={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${Z}/${y}/${x}`}
      style={{ position: 'absolute', left: x * TILE - ox, top: y * TILE - oy, width: TILE, height: TILE }} />);
  const dot = (p: { x: number; y: number; l: string }, i: number) => {
    const s = proj(p.x, p.y); if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) return null;
    const c = p.l === 'w' ? '#4ade80' : p.l === 'p' ? '#fbbf24' : '#fb923c';
    return <circle key={i} cx={s.x} cy={s.y} r={Math.max(1.4, 2.6 * s.s)} fill={c} />;
  };
  const kar = proj(q.x, q.y);
  return (
    <AbsoluteFill style={{ background: navy ? '#0a1024' : '#020308', overflow: 'hidden', fontFamily: 'Segoe UI, Arial' }}>
      <div style={{ position: 'absolute', inset: 0, perspective: D, perspectiveOrigin: '50% 50%' }}>
        <div style={{ position: 'absolute', left: (W - PW) / 2, top: (H - PH) / 2, width: PW, height: PH, transform: `rotateX(${(A * 180) / Math.PI}deg)`, transformOrigin: '50% 50%', filter: navy ? 'brightness(0.8) sepia(0.6) hue-rotate(185deg) saturate(1.6)' : 'brightness(0.95) contrast(1.25) saturate(0.7)' }}>
          {tiles}
        </div>
      </div>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="glowBig" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={navy ? '#0a1024' : '#020308'} stopOpacity="1" /><stop offset="0.28" stopColor="#020308" stopOpacity="0.15" /><stop offset="0.85" stopColor="#020308" stopOpacity="0" /><stop offset="1" stopColor="#020308" stopOpacity="0.55" /></linearGradient>
          <radialGradient id="dom"><stop offset="0" stopColor="#c084fc" stopOpacity="0.45" /><stop offset="1" stopColor="#c084fc" stopOpacity="0" /></radialGradient>
        </defs>
        <g filter="url(#glow)">{pins.map(dot)}</g>
        <ellipse cx={kar.x} cy={kar.y} rx={260 * kar.s} ry={260 * kar.s * Math.cos(A)} fill="url(#dom)" />
        <g filter="url(#glow)" fill="none" strokeLinecap="round">
          {arcs.map((r, i) => { const p = arcPath(r.a, r.b, 0.55); return (
            <g key={i}>
              <linearGradient id={'g' + i} gradientUnits="userSpaceOnUse" x1={p.A1.x} y1={p.A1.y} x2={p.B1.x} y2={p.B1.y}><stop offset="0" stopColor="#4ade80" /><stop offset="1" stopColor="#fbbf24" /></linearGradient>
              <path d={p.d} stroke={`url(#g${i})`} strokeWidth={2.2 * Math.min(2, p.A1.s)} opacity={0.85} />
            </g>); })}
        </g>
        <g filter="url(#glowBig)" fill="none" strokeLinecap="round">
          {[q, ...route].slice(0, -1).map((a, i) => { const b = [q, ...route][i + 1]; const p = arcPath(a, b, 0.6); return <path key={i} d={p.d} stroke="#c084fc" strokeWidth={4} />; })}
          {route.map((r, i) => { const s = proj(r.x, r.y); return <circle key={i} cx={s.x} cy={s.y} r={7 * s.s} fill="#f5d0fe" />; })}
        </g>
        <rect width={W} height={H} fill="url(#fog)" />
      </svg>
      {!bare && <>

      <div style={{ position: 'absolute', left: kar.x - 150, top: kar.y - 175, width: 300, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 30, background: 'rgba(30,10,50,0.75)', border: '1px solid #c084fc', color: '#fff', fontSize: 24, fontWeight: 800, boxShadow: '0 0 30px #c084fc88' }}>👑 Karim · Al Quoz</div>
      </div>
      <div style={{ position: 'absolute', left: 60, top: 54 }}>
        <div style={{ color: '#c084fc', fontSize: 20, letterSpacing: 6, fontWeight: 700 }}>{navy ? 'FLAPKAP HEAT' : 'GAME MODE · MAD MONDAY'}</div>
        <div style={{ color: '#fff', fontSize: 64, fontWeight: 800, lineHeight: 1.05, marginTop: 6, textShadow: '0 0 30px #4ade8055' }}>Every win lights up<br />the deals around it.</div>
      </div>
      <div style={{ position: 'absolute', left: 60, bottom: 50, display: 'flex', gap: 14, fontSize: 21, color: '#e5e7eb', fontWeight: 600 }}>
        {[['#4ade80', 'Referral arc: won → open deal nearby'], ['#c084fc', 'Today\'s route'], ['#fbbf24', 'Open deal']].map(([c, t], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 24, background: 'rgba(10,10,20,0.6)', border: `1px solid ${c}55` }}><span style={{ width: 12, height: 12, borderRadius: 6, background: c, boxShadow: `0 0 10px ${c}` }} />{t}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 60, bottom: 46, fontSize: 26, fontWeight: 800, color: '#fff' }}>FlapKap <span style={{ color: '#4ade80' }}>Heat</span></div>
      </>}
    </AbsoluteFill>
  );
};
