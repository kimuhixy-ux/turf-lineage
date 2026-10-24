import { seededRandom } from './util.js';

// 天気とレースの格で空の色合いを変える。G1は夕方の金色の光にして特別感を出す
export const PALETTES = {
  day: { sky: ['#4f93d8', '#a9d3f2', '#e4f2fb'], sun: 'rgba(255,250,225,0.9)', mountain: ['#8fb0c9', '#6f93ad'], tree: '#3f6b3a', grass: ['#5f9a45', '#4d8a39'], turf: ['#4f9a3c', '#5aa846'], grade: null },
  golden: { sky: ['#3c5c9c', '#e9a46a', '#fbd9a4'], sun: 'rgba(255,214,150,0.95)', mountain: ['#9a8aa6', '#76688c'], tree: '#3d5734', grass: ['#6b9a43', '#567f35'], turf: ['#5a9a3a', '#66a844'], grade: 'rgba(255,160,60,0.10)' },
  rain: { sky: ['#5c6772', '#8c97a1', '#b4bcc3'], sun: null, mountain: ['#7f8a94', '#6a7680'], tree: '#344c35', grass: ['#4a7a3c', '#3e6a33'], turf: ['#3f7d36', '#488a3d'], grade: 'rgba(30,50,80,0.16)' },
};
const DIRT = ['#9b7653', '#a8835e'];

function ridgeTile(width, height, color, seed, roughness) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const pts = [];
  // 左右の端を同じ高さにして、横に並べたとき継ぎ目が見えないようにする
  const n = 24;
  for (let i = 0; i <= n; i += 1) pts.push(i === n ? pts[0] : height * (0.25 + rng() * roughness));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i <= n; i += 1) {
    const x = (i / n) * width;
    const prev = (Math.max(0, i - 0.5) / n) * width;
    ctx.quadraticCurveTo(prev, pts[Math.max(0, i - 1)], x, pts[i]);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  return c;
}

function treeTile(width, height, color, seed) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  for (let x = -20; x < width + 20; x += 14 + rng() * 18) {
    const r = height * (0.25 + rng() * 0.25);
    const g = ctx.createRadialGradient(x - r * 0.3, height - r * 1.4, 1, x, height - r, r * 1.2);
    g.addColorStop(0, shadeAlpha(color, 1.25));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, height - r, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, height - 6, width, 6);
  return c;
}

function shadeAlpha(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.min(255, Math.round(v * factor));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function cloudSprite(w, h, seed, dark) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  for (let i = 0; i < 9; i += 1) {
    const x = w * (0.2 + rng() * 0.6);
    const y = h * (0.45 + rng() * 0.25);
    const r = h * (0.22 + rng() * 0.2);
    const g = ctx.createRadialGradient(x, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, dark ? 'rgba(200,205,212,0.9)' : 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export function buildScene(W, H, palette, seed) {
  const layout = { horizon: H * 0.36, treeLine: H * 0.47, trackTop: H * 0.6, trackBottom: H * 0.9 };
  const sky = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, layout.treeLine);
    palette.sky.forEach((c, i) => g.addColorStop(i / (palette.sky.length - 1), c));
    return g;
  };
  return {
    layout, palette,
    farRidge: ridgeTile(Math.ceil(W * 1.5), Math.ceil(H * 0.18), palette.mountain[0], seed, 0.5),
    nearRidge: ridgeTile(Math.ceil(W * 1.3), Math.ceil(H * 0.13), palette.mountain[1], seed + 7, 0.6),
    trees: treeTile(Math.ceil(W * 1.2), Math.ceil(H * 0.07), palette.tree, seed + 3),
    clouds: Array.from({ length: 6 }, (_, i) => ({
      img: cloudSprite(220, 90, seed + i * 11, palette === PALETTES.rain), x: i * (W / 4 + 60), y: H * (0.04 + (i % 3) * 0.07), s: 0.6 + (i % 3) * 0.3,
    })),
    skyFill: sky,
  };
}

function tileX(ctx, img, offset, y) {
  const w = img.width;
  let x = -((offset % w) + w) % w;
  for (; x < ctx.canvas.width; x += w) ctx.drawImage(img, x, y);
}

export function drawBackdrop(ctx, scene, camPx, W) {
  const { layout, palette } = scene;
  ctx.fillStyle = scene.skyFill(ctx);
  ctx.fillRect(0, 0, W, layout.treeLine + 2);
  if (palette.sun) {
    const g = ctx.createRadialGradient(W * 0.78, layout.horizon * 0.35, 4, W * 0.78, layout.horizon * 0.35, W * 0.35);
    g.addColorStop(0, palette.sun);
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, layout.treeLine);
  }
  for (const c of scene.clouds) {
    const span = W + 300;
    const x = (((c.x - camPx * 0.02) % span) + span) % span - 220;
    ctx.drawImage(c.img, x, c.y, c.img.width * c.s, c.img.height * c.s);
  }
  tileX(ctx, scene.farRidge, camPx * 0.04, layout.horizon - scene.farRidge.height * 0.55);
  tileX(ctx, scene.nearRidge, camPx * 0.08, layout.horizon - scene.nearRidge.height * 0.25);
  const haze = ctx.createLinearGradient(0, layout.horizon - 30, 0, layout.treeLine);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(1, 'rgba(255,255,255,0.28)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, layout.horizon - 30, W, layout.treeLine - layout.horizon + 30);
  const g = ctx.createLinearGradient(0, layout.treeLine, 0, layout.trackTop);
  g.addColorStop(0, palette.grass[1]);
  g.addColorStop(1, palette.grass[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, layout.treeLine - 2, W, layout.trackTop - layout.treeLine + 4);
  tileX(ctx, scene.trees, camPx * 0.22, layout.treeLine - scene.trees.height + 2);
}

// 内馬場の飾り（花壇・池・大型ビジョン）。世界座標(m)に置き、半分の速さで流す
export function drawInfield(ctx, scene, toScreen, ppm, distance) {
  const { layout } = scene;
  const y = (layout.treeLine + layout.trackTop) / 2;
  const half = (m) => toScreen(m, 0.5);
  const screenX = half(distance - 140);
  if (screenX > -200 && screenX < ctx.canvas.width + 200) drawBigScreen(ctx, screenX, layout.treeLine + 4, ppm);
  for (let m = 60; m < distance + 400; m += 170) {
    const x = half(m);
    if (x < -120 || x > ctx.canvas.width + 120) continue;
    const w = 26 * ppm * 0.5;
    ctx.fillStyle = m % 340 < 170 ? 'rgba(236,108,140,0.85)' : 'rgba(250,206,80,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, w, 4 + ppm * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(x - w * 0.2, y + 4, w * 0.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBigScreen(ctx, x, baseY, ppm) {
  const w = Math.max(80, ppm * 16);
  const h = w * 0.42;
  ctx.fillStyle = '#2b2f36';
  ctx.fillRect(x - w * 0.04, baseY - h - 10, w * 0.08, h + 10);
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(x - w / 2 - 3, baseY - h * 2 - 3, w + 6, h + 6);
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#3a8f5a');
  g.addColorStop(0.5, '#7ec98f');
  g.addColorStop(1, '#2f6f8f');
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, baseY - h * 2, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x - w / 2, baseY - h * 2, w, h * 0.35);
}

export function drawTrack(ctx, scene, toScreen, ppm, surface, W) {
  const { layout, palette } = scene;
  const colors = surface === 'turf' ? palette.turf : DIRT;
  const top = layout.trackTop;
  const bottom = layout.trackBottom + 30;
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, top, W, bottom - top);
  const band = surface === 'turf' ? 10 : 4;
  const first = Math.floor((toScreen.inverse(0) - 20) / band) * band;
  const skew = (bottom - top) * 0.35;
  ctx.fillStyle = colors[1];
  for (let m = first; toScreen(m) < W + skew + 20; m += band * 2) {
    const x = toScreen(m);
    const w = band * ppm;
    // 芝の刈り目は奥ほど狭く見えるよう、平行四辺形でななめに描く
    ctx.globalAlpha = surface === 'turf' ? 0.55 : 0.25;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + w, top);
    ctx.lineTo(x + w - skew, bottom);
    ctx.lineTo(x - skew, bottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const depth = ctx.createLinearGradient(0, top, 0, bottom);
  depth.addColorStop(0, 'rgba(255,255,255,0.12)');
  depth.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = depth;
  ctx.fillRect(0, top, W, bottom - top);
}

function railPosts(ctx, toScreen, parallax, step, y, h, W, width) {
  ctx.fillStyle = '#f7f7f3';
  const start = Math.floor(toScreen.inverse(0, parallax) / step) * step;
  for (let m = start; ; m += step) {
    const x = toScreen(m, parallax);
    if (x > W + 10) break;
    ctx.fillRect(x - width / 2, y, width, h);
  }
}

export function drawInnerRail(ctx, scene, toScreen, ppm, distance, W) {
  const y = scene.layout.trackTop;
  const h = Math.max(10, ppm * 0.9);
  railPosts(ctx, toScreen, 1, 3, y - h, h, W, Math.max(1.5, ppm * 0.07));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, y - h - 2, W, Math.max(3, ppm * 0.12));
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, y - h + 2, W, 1);
  for (let remain = 200; remain < distance; remain += 200) drawFurlong(ctx, toScreen(distance - remain), y - h, ppm, remain);
  drawGoalPost(ctx, toScreen(distance), scene.layout, ppm);
}

function drawFurlong(ctx, x, y, ppm, remain) {
  if (x < -40 || x > ctx.canvas.width + 40) return;
  const r = Math.max(7, ppm * 0.45);
  ctx.fillStyle = '#e9e6dd';
  ctx.fillRect(x - 1.5, y - r * 3, 3, r * 3);
  ctx.fillStyle = remain % 1000 === 0 ? '#d8262f' : '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y - r * 3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = remain % 1000 === 0 ? '#fff' : '#222';
  ctx.font = `bold ${Math.round(r * 1.1)}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(remain / 100), x, y - r * 3 + 0.5);
}

function drawGoalPost(ctx, x, layout, ppm) {
  if (x < -80 || x > ctx.canvas.width + 80) return;
  const top = layout.trackTop;
  const h = Math.max(70, ppm * 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, top - h, 4, h);
  const r = Math.max(14, ppm * 1.1);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, top - h, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8262f';
  ctx.beginPath();
  ctx.arc(x, top - h, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x - (layout.trackBottom - top) * 0.35, layout.trackBottom + 30);
  ctx.stroke();
}

export function drawStartGate(ctx, scene, toScreen, ppm, open) {
  const x = toScreen(0);
  if (x < -200 || x > ctx.canvas.width + 200) return;
  const { trackTop, trackBottom } = scene.layout;
  const h = Math.max(40, ppm * 3.4);
  ctx.fillStyle = '#2f7a4c';
  ctx.fillRect(x - ppm * 0.4, trackTop - h, ppm * 0.8, trackBottom - trackTop + h);
  ctx.fillStyle = '#3f9a62';
  ctx.fillRect(x - ppm * 2.2, trackTop - h, ppm * 2.6, h * 0.22);
  if (!open) {
    ctx.fillStyle = 'rgba(220,230,220,0.6)';
    ctx.fillRect(x + ppm * 0.4, trackTop - h * 0.2, ppm * 0.15, trackBottom - trackTop);
  }
}

// ゲートの枠の横壁。馬の手前に描いて胴を隠さないと、同じ立ち姿の馬が紙の束のように重なって見える
export function drawGateStalls(ctx, toScreen, ppm, y, s) {
  const x0 = toScreen(0) - ppm * 3.2;
  const x1 = toScreen(0) + ppm * 0.3;
  if (x1 < 0 || x0 > ctx.canvas.width) return;
  const top = y - 128 * s;
  const g = ctx.createLinearGradient(0, top, 0, y);
  g.addColorStop(0, '#4fa873');
  g.addColorStop(1, '#245c3a');
  ctx.fillStyle = g;
  ctx.fillRect(x0, top, x1 - x0, y - top + 6 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x0, top, x1 - x0, 5 * s);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = x0 + ppm * 0.8; x < x1; x += ppm * 0.8) ctx.fillRect(x, top, 3 * s, y - top);
}

export function drawOuterRail(ctx, scene, toScreen, ppm, distance, W, t) {
  const y = scene.layout.trackBottom + 26;
  const h = Math.max(16, ppm * 1.3);
  drawCrowd(ctx, scene, toScreen, distance, W, y, t);
  railPosts(ctx, toScreen, 1.25, 2.5, y - h, h + 30, W, Math.max(3, ppm * 0.12));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, y - h - 3, W, Math.max(5, ppm * 0.2));
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, y - h + Math.max(5, ppm * 0.2) - 3, W, 2);
}

// ゴール前だけ手前に観客を出し、盛り上がる場面を演出する
function drawCrowd(ctx, scene, toScreen, distance, W, y, t) {
  const start = distance - 420;
  const colors = ['#2b2f3a', '#3a3f4a', '#4a3a3a', '#2f3f4a', '#d8262f', '#f2cf1d', '#2357c7', '#f0f0f0'];
  const H = ctx.canvas.height;
  for (let m = start; m < distance + 160; m += 1.6) {
    const x = toScreen(m, 1.35);
    if (x < -20 || x > W + 20) continue;
    const i = Math.floor(m * 7.13) % colors.length;
    const jump = Math.max(0, Math.sin(t * 9 + m)) * 3;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x, y + 14 - jump, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 9, y + 18 - jump, 18, H);
  }
}

export function drawRain(ctx, W, H, t) {
  ctx.strokeStyle = 'rgba(220,230,245,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 140; i += 1) {
    const x = ((i * 97 + t * 900) % (W + 100)) - 50;
    const y = ((i * 61 + t * 1400) % (H + 40)) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + 16);
  }
  ctx.stroke();
}

export function drawGrade(ctx, scene, W, H) {
  if (scene.palette.grade) {
    ctx.fillStyle = scene.palette.grade;
    ctx.fillRect(0, 0, W, H);
  }
  const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
