import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import data from './data.json';

// --- Web Mercator at zoom Z, in pixels, origin = tile grid origin ---------------------------
const Z = 13, TILE = 256, N = 2 ** Z;
const px = (lng: number) => ((lng + 180) / 360) * N * TILE;
const py = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N * TILE;
};
// tile window covering Dubai (lng 54.9..55.65, lat 24.85..25.4)
const X0 = Math.floor(px(54.9) / TILE), X1 = Math.floor(px(55.65) / TILE);
const Y0 = Math.floor(py(25.4) / TILE), Y1 = Math.floor(py(24.85) / TILE);
const W = (X1 - X0 + 1) * TILE, H = (Y1 - Y0 + 1) * TILE;
const toLocal = (lng: number, lat: number) => ({ x: px(lng) - X0 * TILE, y: py(lat) - Y0 * TILE });

const GREEN = '#22c55e', AMBER = '#f59e0b', RED = '#ef4444', BRAND = '#7c3aed';
const col = (l: string) => (l === 'w' ? GREEN : l === 'p' ? AMBER : RED);

// camera: {cx, cy} map px at screen centre, scale
type Cam = { cx: number; cy: number; s: number };
const dubai = toLocal(55.27, 25.17);
const RT = (data.route as {x:number;y:number}[]).map(r => toLocal(r.x, r.y));
const rx = RT.map(r => r.x), ry = RT.map(r => r.y);
const deira = { x: (Math.min(...rx) + Math.max(...rx)) / 2 + 90, y: (Math.min(...ry) + Math.max(...ry)) / 2 };
const fitS = Math.min(1300 / (Math.max(...rx) - Math.min(...rx) + 200), 850 / (Math.max(...ry) - Math.min(...ry) + 200));
const CAMS: { t: number; c: Cam }[] = [
  { t: 0, c: { cx: dubai.x, cy: dubai.y, s: 0.44 } },
  { t: 2.0, c: { cx: dubai.x, cy: dubai.y, s: 0.45 } },
  { t: 4.5, c: { cx: dubai.x + 60, cy: dubai.y - 80, s: 0.75 } },
  { t: 6.0, c: { cx: deira.x, cy: deira.y, s: fitS } },
  { t: 10, c: { cx: deira.x + 20, cy: deira.y, s: fitS * 1.06 } },
];
const camAt = (t: number): Cam => {
  const ts = CAMS.map(k => k.t);
  const e = { easing: Easing.inOut(Easing.cubic), extrapolateRight: 'clamp' as const };
  return {
    cx: interpolate(t, ts, CAMS.map(k => k.c.cx), e),
    cy: interpolate(t, ts, CAMS.map(k => k.c.cy), e),
    s: interpolate(t, ts, CAMS.map(k => k.c.s), e),
  };
};

// pins sorted by distance from the Dubai centre so they pop outward
const pins = (data.pins as { x: number; y: number; l: string }[])
  .map(p => ({ ...toLocal(p.x, p.y), l: p.l }))
  .map(p => ({ ...p, d: Math.hypot(p.x - dubai.x, p.y - dubai.y) }))
  .sort((a, b) => a.d - b.d);
const route = (data.route as { x: number; y: number; n: string }[]).map(r => ({ ...toLocal(r.x, r.y), n: r.n }));
const routeLen = route.slice(1).reduce((s, r, i) => s + Math.hypot(r.x - route[i].x, r.y - route[i].y), 0);

export const Clip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const cam = camAt(t);

  // pins pop between 2.0 s and 4.8 s, inner ones first
  const popT = (i: number) => 2.0 + (i / pins.length) * 2.8;
  const pinScale = (i: number) => interpolate(t, [popT(i), popT(i) + 0.25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2)) });

  // rectangle draws 6.0 - 6.8 s, route draws 7.0 - 9.0 s
  const rectP = interpolate(t, [6.0, 6.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const routeP = interpolate(t, [7.0, 9.0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
  const km = Math.round(16 * routeP), mins = Math.round(45 * routeP);
  const xs = route.map(r => r.x), ys = route.map(r => r.y);
  const rect = { x: Math.min(...xs) - 40, y: Math.min(...ys) - 40, w: Math.max(...xs) - Math.min(...xs) + 80, h: Math.max(...ys) - Math.min(...ys) + 80 };
  const rectPeri = 2 * (rect.w + rect.h);

  const title = interpolate(t, [0.3, 1.0, 2.2, 2.8], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const counter = interpolate(t, [3.0, 3.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const planCard = interpolate(t, [7.2, 7.7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shown = Math.round(interpolate(t, [2.0, 4.8], [0, pins.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const won = Math.round(interpolate(t, [3.0, 4.8], [0, data.counts.won], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

  const tiles: React.ReactNode[] = [];
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++)
    tiles.push(<Img key={x + '/' + y} src={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${Z}/${y}/${x}`} style={{ position: 'absolute', left: (x - X0) * TILE, top: (y - Y0) * TILE, width: TILE, height: TILE }} />);

  const tx = width / 2 - cam.cx * cam.s, ty = height / 2 - cam.cy * cam.s;
  const pinR = 5 / Math.sqrt(cam.s);

  return (
    <AbsoluteFill style={{ background: '#0b0f17', fontFamily: 'Inter, Segoe UI, Arial, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `translate(${tx}px, ${ty}px) scale(${cam.s})`, transformOrigin: '0 0' }}>
        {tiles}
        <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {pins.slice(0, shown).map((p, i) => {
            const s = pinScale(i);
            return <circle key={i} cx={p.x} cy={p.y} r={pinR * s} fill={col(p.l)} fillOpacity={0.85} stroke="#fff" strokeWidth={0.6 / cam.s} />;
          })}
          {rectP > 0 && (
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={BRAND} fillOpacity={0.12 * rectP} stroke={BRAND} strokeWidth={2.5 / cam.s}
              strokeDasharray={rectPeri} strokeDashoffset={rectPeri * (1 - rectP)} />
          )}
          {routeP > 0 && (
            <>
              <polyline points={route.map(r => `${r.x},${r.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth={4 / cam.s} strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={routeLen} strokeDashoffset={routeLen * (1 - routeP)} opacity={0.95} />
              {route.map((r, i) => {
                const on = routeP >= (i / (route.length - 1)) - 0.01;
                return on ? (
                  <g key={i}>
                    <circle cx={r.x} cy={r.y} r={9 / cam.s} fill="#fff" stroke={BRAND} strokeWidth={3 / cam.s} />
                    <text x={r.x} y={r.y + 3.5 / cam.s} fontSize={10 / cam.s} fontWeight={700} fill={BRAND} textAnchor="middle">{i + 1}</text>
                  </g>
                ) : null;
              })}
            </>
          )}
        </svg>
      </div>

      {/* vignette */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

      {/* title */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: height * 0.38, textAlign: 'center', opacity: title, transform: `translateY(${(1 - title) * 20}px)` }}>
        <div style={{ color: '#fff', fontSize: 72, fontWeight: 800, letterSpacing: -1 }}>Every client. On the map.</div>
        <div style={{ color: '#cbd5e1', fontSize: 30, marginTop: 14 }}>{data.counts.exact.toLocaleString()} UAE companies, placed from their Google Maps listing</div>
      </div>

      {/* counters */}
      <div style={{ position: 'absolute', left: 60, top: 60, opacity: counter, display: 'flex', gap: 18 }}>
        {[[shown, 'locations', '#fff'], [won, 'funded', GREEN]].map(([v, k, c], i) => (
          <div key={i} style={{ background: 'rgba(15,20,30,0.78)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '14px 22px', minWidth: 190 }}>
            <div style={{ color: c as string, fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{(v as number).toLocaleString()}</div>
            <div style={{ color: '#94a3b8', fontSize: 18, marginTop: 6 }}>{k as string}</div>
          </div>
        ))}
      </div>

      {/* plan card */}
      <div style={{ position: 'absolute', right: 60, bottom: 60, width: 420, opacity: planCard, transform: `translateY(${(1 - planCard) * 30}px)`, background: 'rgba(15,20,30,0.85)', border: `1px solid ${BRAND}`, borderRadius: 20, padding: '22px 26px' }}>
        <div style={{ color: '#c4b5fd', fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>VISIT DAY · DEIRA & BUR DUBAI</div>
        <div style={{ color: '#fff', fontSize: 40, fontWeight: 800, marginTop: 6 }}>{Math.min(route.length, Math.ceil(routeP * route.length + 0.001))} stops</div>
        <div style={{ color: '#e2e8f0', fontSize: 24, marginTop: 4 }}>{km} km · {Math.floor(mins / 60)}h{String(mins % 60).padStart(2, '0')} driving</div>
        <div style={{ marginTop: 16, background: routeP >= 1 ? '#fff' : 'rgba(255,255,255,0.2)', color: routeP >= 1 ? '#111' : '#cbd5e1', fontWeight: 800, fontSize: 20, borderRadius: 12, padding: '12px 0', textAlign: 'center' }}>
          Open in Google Maps ↗
        </div>
      </div>

      <div style={{ position: 'absolute', left: 60, bottom: 50, color: '#64748b', fontSize: 16 }}>FlapKap · UAE coverage map · Esri, HERE, © OpenStreetMap</div>
    </AbsoluteFill>
  );
};
