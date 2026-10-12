import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import data from './data.json';

// One moment ("Area Dominator" in Al Quoz) drawn in three styles, for picking the video's look.
export type Look = 'neon' | 'game' | 'premium';

const Z = 14, TILE = 256, N = 2 ** Z;
const px = (lng: number) => ((lng + 180) / 360) * N * TILE;
const py = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N * TILE; };
const CENTER = { lng: 55.228, lat: 25.138 }; // Al Quoz
const W = 1920, H = 1080;
const ox = px(CENTER.lng) - W / 2, oy = py(CENTER.lat) - H / 2;
const toS = (lng: number, lat: number) => ({ x: px(lng) - ox, y: py(lat) - oy });

const TILES: Record<Look, string> = {
  neon: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile',
  game: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile',
  premium: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile',
};
const THEME: Record<Look, any> = {
  neon: { bg: '#05060a', rep: '#ff2bd6', rep2: '#22d3ee', rep3: '#a3e635', text: '#fff', sub: '#9ca3af', font: 'Segoe UI, Arial', tileFilter: 'brightness(0.8) contrast(1.2)', card: 'rgba(10,10,20,0.75)', glow: true },
  game: { bg: '#e8f0ff', rep: '#ff6b00', rep2: '#2563eb', rep3: '#16a34a', text: '#1f1147', sub: '#4b5563', font: '"Arial Rounded MT Bold", "Segoe UI Black", Arial', tileFilter: 'saturate(1.4) brightness(1.03)', card: '#ffffff', glow: false },
  premium: { bg: '#0a1024', rep: '#3b82f6', rep2: '#94a3b8', rep3: '#64748b', text: '#f8fafc', sub: '#94a3b8', font: 'Segoe UI, Arial', tileFilter: 'brightness(0.75) sepia(0.6) hue-rotate(185deg) saturate(1.6)', card: 'rgba(15,23,42,0.72)', glow: false },
};

// hex grid in screen space; cells near the centre belong to the dominator
const R = 58;
const hexes: { x: number; y: number; owner: 0 | 1 | 2 | 3; fire: boolean }[] = [];
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let row = -2; row < H / (R * 1.5) + 2; row++) for (let col = -2; col < W / (R * Math.sqrt(3)) + 2; col++) {
  const x = col * R * Math.sqrt(3) + (row % 2 ? (R * Math.sqrt(3)) / 2 : 0), y = row * R * 1.5;
  const d = Math.hypot(x - W * 0.42, y - H * 0.52);
  const r = rnd();
  const owner = d < 190 ? 1 : d < 330 ? (r < 0.55 ? 1 : r < 0.75 ? 2 : 0) : r < 0.12 ? 2 : r < 0.2 ? 3 : 0;
  hexes.push({ x, y, owner: owner as any, fire: owner === 0 && d < 520 && r > 0.93 });
}
const hexPath = (x: number, y: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${x + R * Math.cos(a)},${y + R * Math.sin(a)}`; }).join(' ');

const pins = (data.pins as { x: number; y: number; l: string }[]).map(p => ({ ...toS(p.x, p.y), l: p.l })).filter(p => p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20);

export const Frame: React.FC<{ look: Look; bare?: boolean }> = ({ look, bare }) => {
  const t = THEME[look];
  const X0 = Math.floor(ox / TILE), Y0 = Math.floor(oy / TILE), X1 = Math.floor((ox + W) / TILE), Y1 = Math.floor((oy + H) / TILE);
  const tiles: React.ReactNode[] = [];
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++)
    tiles.push(<Img key={x + '/' + y} src={`${TILES[look]}/${Z}/${y}/${x}`} style={{ position: 'absolute', left: x * TILE - ox, top: y * TILE - oy, width: TILE, height: TILE }} />);
  const ownerCol = [null, t.rep, t.rep2, t.rep3];
  const big = pins.filter(p => p.l === 'p').slice(0, 3);
  const glow = (c: string, s = 18) => (t.glow ? `drop-shadow(0 0 ${s}px ${c}) drop-shadow(0 0 ${s / 2}px ${c})` : 'none');

  const board = [['Karim', 7, '👑'], ['Cameron', 5, ''], ['Venko', 4, ''], ['Menna', 3, '']];

  return (
    <AbsoluteFill style={{ background: t.bg, fontFamily: t.font, overflow: 'hidden' }}>
      <AbsoluteFill style={{ filter: t.tileFilter }}>{tiles}</AbsoluteFill>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="fire"><stop offset="0" stopColor="#fde047" stopOpacity="0.9" /><stop offset="0.5" stopColor="#f97316" stopOpacity="0.5" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></radialGradient>
          <radialGradient id="spot"><stop offset="0" stopColor="#fff" stopOpacity={look === 'game' ? 0 : 0.0} /><stop offset="1" stopColor="#000" stopOpacity={look === 'game' ? 0 : 0.55} /></radialGradient>
        </defs>
        {hexes.map((h, i) => h.owner ? (
          <polygon key={i} points={hexPath(h.x, h.y)} fill={ownerCol[h.owner]!} fillOpacity={h.owner === 1 ? (look === 'game' ? 0.42 : 0.33) : 0.16}
            stroke={ownerCol[h.owner]!} strokeOpacity={h.owner === 1 ? 0.95 : 0.4} strokeWidth={look === 'game' ? 4 : 2} style={{ filter: h.owner === 1 ? glow(t.rep, 10) : 'none' }} />
        ) : look === 'game' ? <polygon key={i} points={hexPath(h.x, h.y)} fill="none" stroke="#1f1147" strokeOpacity={0.06} strokeWidth={2} /> : null)}
        {hexes.filter(h => h.fire).map((h, i) => <circle key={'f' + i} cx={h.x} cy={h.y} r={55} fill="url(#fire)" />)}
        {pins.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={look === 'game' ? 8 : 6} fill={p.l === 'w' ? '#22c55e' : p.l === 'p' ? '#f59e0b' : '#ef4444'} stroke={look === 'game' ? '#fff' : '#0008'} strokeWidth={look === 'game' ? 3 : 1.5} />)}
        {big.map((p, i) => (
          <g key={'b' + i} style={{ filter: 'drop-shadow(0 0 12px #fde047)' }}>
            <circle cx={p.x} cy={p.y} r={16} fill="none" stroke="#fde047" strokeWidth={3} />
            {[0, 1, 2, 3].map(k => <path key={k} d={`M${p.x} ${p.y - 30} l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z`} fill="#fef08a" transform={`rotate(${k * 90} ${p.x} ${p.y})`} />)}
          </g>
        ))}
        {look !== 'game' && <rect width={W} height={H} fill="url(#spot)" />}
      </svg>

      {!bare && <>
      {/* rep marker on the dominated area */}
      <div style={{ position: 'absolute', left: W * 0.42 - 70, top: H * 0.52 - 150, width: 140, textAlign: 'center' }}>
        <div style={{ width: 92, height: 92, margin: '0 auto', borderRadius: '50%', background: t.rep, border: `5px solid ${look === 'game' ? '#fff' : t.text}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 900, color: '#fff', filter: glow(t.rep, 24), boxShadow: look === 'game' ? '0 8px 0 #c2410c' : 'none' }}>K</div>
        <div style={{ marginTop: 8, background: look === 'game' ? '#1f1147' : t.card, color: '#fff', borderRadius: 12, padding: '4px 10px', fontSize: 22, fontWeight: 800 }}>Karim</div>
      </div>

      {/* the stamp */}
      <div style={{ position: 'absolute', left: 0, right: 520, top: 70, textAlign: 'center' }}>
        {look === 'neon' && <>
          <div style={{ fontSize: 30, letterSpacing: 10, color: t.rep2, filter: glow(t.rep2, 14), fontWeight: 700 }}>AL QUOZ</div>
          <div style={{ fontSize: 118, fontWeight: 900, letterSpacing: 4, color: '#fff', textShadow: `0 0 18px ${t.rep}, 0 0 42px ${t.rep}, 0 0 80px ${t.rep}`, lineHeight: 1 }}>AREA DOMINATOR</div>
        </>}
        {look === 'game' && <>
          <div style={{ display: 'inline-block', transform: 'rotate(-4deg)', background: 'linear-gradient(180deg,#ffe14d,#ff9d00)', border: '8px solid #1f1147', borderRadius: 28, padding: '14px 46px', boxShadow: '0 12px 0 #1f1147' }}>
            <div style={{ fontSize: 30, color: '#1f1147', fontWeight: 900, letterSpacing: 2 }}>🔥 3 CLOSES · AL QUOZ 🔥</div>
            <div style={{ fontSize: 104, color: '#fff', fontWeight: 900, lineHeight: 1, WebkitTextStroke: '6px #1f1147', paintOrder: 'stroke fill' as any }}>AREA DOMINATOR!</div>
          </div>
        </>}
        {look === 'premium' && <>
          <div style={{ fontSize: 22, letterSpacing: 8, color: t.sub, fontWeight: 600 }}>AL QUOZ · OCTOBER</div>
          <div style={{ fontSize: 92, fontWeight: 300, letterSpacing: -1, color: t.text, lineHeight: 1.05 }}>Area <span style={{ fontWeight: 800, color: t.rep }}>Dominator</span></div>
          <div style={{ width: 120, height: 3, background: t.rep, margin: '18px auto 0' }} />
        </>}
      </div>

      {/* scoreboard */}
      <div style={{ position: 'absolute', right: 50, top: 60, width: 430, background: t.card, borderRadius: look === 'game' ? 26 : 18, padding: '22px 26px', border: look === 'game' ? '6px solid #1f1147' : `1px solid ${look === 'neon' ? t.rep2 + '66' : '#ffffff22'}`, boxShadow: look === 'game' ? '0 10px 0 #1f1147' : look === 'neon' ? `0 0 30px ${t.rep2}44` : '0 20px 60px #0006', backdropFilter: 'blur(8px)' }}>
        <div style={{ fontSize: 20, letterSpacing: 4, color: look === 'game' ? '#ff6b00' : t.sub, fontWeight: 800 }}>MAD MONDAY · WEEK 3</div>
        {board.map(([n, s, c], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: 16, gap: 14 }}>
            <div style={{ width: 40, fontSize: 28, fontWeight: 900, color: i === 0 ? t.rep : t.sub }}>{i + 1}</div>
            <div style={{ flex: 1, fontSize: 30, fontWeight: i === 0 ? 900 : 600, color: look === 'game' ? '#1f1147' : t.text }}>{n} {c}</div>
            <div style={{ fontSize: 26, color: look === 'game' ? '#ff6b00' : t.text, fontWeight: 800 }}>{'🔥'.repeat(Math.min(3, s as number - 2))} {s}</div>
          </div>
        ))}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${look === 'game' ? '#1f114722' : '#ffffff22'}`, fontSize: 20, color: look === 'game' ? '#4b5563' : t.sub }}>🔥 streak = Mondays in a row at 5+ visits</div>
      </div>

      {/* legend chips */}
      <div style={{ position: 'absolute', left: 50, bottom: 50, display: 'flex', gap: 14 }}>
        {[['#fde047', '✦ Big open deal: bonus'], ['#f97316', '🔥 Visited this week'], [t.rep, '⬢ Karim\'s turf']].map(([c, l], i) => (
          <div key={i} style={{ background: t.card, color: look === 'game' ? '#1f1147' : t.text, borderRadius: 30, padding: '10px 20px', fontSize: 22, fontWeight: 700, border: look === 'game' ? '4px solid #1f1147' : `1px solid ${c}66` }}>{l}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 50, bottom: 40, fontSize: 26, fontWeight: 800, color: look === 'game' ? '#1f1147' : t.text, opacity: 0.9 }}>FlapKap <span style={{ color: t.rep }}>Heat</span></div>
      </>}
    </AbsoluteFill>
  );
};
