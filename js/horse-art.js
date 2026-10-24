import { coatById } from './horse.js';

// 馬は「体長220・地面 y=0・右向き」のローカル座標で描き、拡大縮小で使い回す
const TAU = Math.PI * 2;
// 枠番ごとの帽子・ゼッケンの色（実際の競馬と同じ並び）
export const FRAME_COLORS = ['#f5f5f2', '#1b1b1b', '#d8262f', '#2357c7', '#f2cf1d', '#1f9a4a', '#f08a1c', '#f08bb4'];
const FRAME_TEXT = ['#111', '#fff', '#fff', '#fff', '#111', '#fff', '#111', '#111'];

export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

// 馬の形はマイブリッジ「The Horse in Motion」（1878年・パブリックドメイン）の写真12コマから
// 輪郭だけを取り出したデータ。1〜11コマ目が襲歩の1歩、12コマ目が立ち姿
const SHAPES = await fetch(new URL('../data/horse-shapes.json', import.meta.url)).then((r) => r.json());

function toPath(flat) {
  const p = new Path2D();
  p.moveTo(flat[0], flat[1]);
  for (let i = 2; i < flat.length; i += 2) p.lineTo(flat[i], flat[i + 1]);
  p.closePath();
  return p;
}

function buildFrame(f) {
  const body = new Path2D();
  f.outline.forEach((o) => body.addPath(toPath(o)));
  const legs = f.legs.map((l) => l && {
    point: toPath(l.point), sock: toPath(l.sock), tip: { x: l.tip[0], y: l.tip[1] }, far: l.far && toPath(l.far),
  });
  return { ...f, body, legs, tail: toPath(f.tail) };
}

// 18頭のレース中継で毎回作り直すと重いので、輪郭の Path2D は読み込み時に一度だけ作る
const FRAMES = SHAPES.frames.map(buildFrame);
const GALLOP_FRAMES = SHAPES.stand;

function dot(ctx, p, r) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawCoat(ctx, f, coat) {
  // 背は明るく、腹と脚の下ほど暗くして、上から光が当たっているように見せる
  const g = ctx.createLinearGradient(0, f.saddleY - 50, 0, 0);
  g.addColorStop(0, shade(coat.body, 0.1));
  g.addColorStop(0.35, coat.body);
  g.addColorStop(0.75, coat.shade);
  ctx.fillStyle = g;
  ctx.fill(f.body, 'evenodd');
  // 尻と肩の筋肉に光を当て、腹の下を暗くして丸みを出す
  glow(ctx, f.croupX + 48, f.saddleY + 20, 44, 'rgba(255,255,255,0.22)');
  glow(ctx, 64, f.saddleY + 32, 32, 'rgba(255,255,255,0.18)');
  glow(ctx, -12, f.saddleY + 80, 52, 'rgba(0,0,0,0.3)');
  if (coat.dapple) drawDapples(ctx, f);
}

// 芦毛の連銭（れんせん）＝灰色の毛に浮かぶ丸い斑点
const DAPPLES = Array.from({ length: 24 }, (_, i) => ({ x: ((i * 37) % 160) - 100, y: ((i * 23) % 56) + 14 }));

function drawDapples(ctx, f) {
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  DAPPLES.forEach((p) => dot(ctx, { x: p.x, y: f.saddleY + p.y }, 5));
}

// 影絵では手前と奥の脚が同じ色になり平たく見えるので、奥の脚は胴の陰に入ったように暗くする
function drawFarLegs(ctx, f) {
  const g = ctx.createLinearGradient(0, f.saddleY + 70, 0, f.saddleY + 100);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  f.legs.forEach((l) => { if (l?.far) ctx.fill(l.far); });
}

function drawPoints(ctx, f, coat, socks) {
  ctx.fillStyle = coat.mane;
  ctx.fill(f.tail);
  f.legs.forEach((l, i) => {
    if (!l) return;
    ctx.fillStyle = coat.points;
    ctx.fill(l.point);
    if (socks[i]) {
      ctx.fillStyle = '#f2efe8';
      ctx.fill(l.sock);
    }
    // 蹄は脚先の小さな範囲だけ塗る（輪郭で切り抜くので外へはみ出さない）
    ctx.fillStyle = '#1d1815';
    dot(ctx, l.tip, 5);
  });
}

// 耳（頭のてっぺん）から鼻先への向きを基準にして、目・鼻の穴・流星の位置を決める
function faceFrame(f) {
  const [ex, ey] = f.ear;
  const dx = f.nose[0] - ex;
  const dy = f.nose[1] - ey;
  const len = Math.hypot(dx, dy);
  const u = { x: dx / len, y: dy / len };
  return (a, b) => ({ x: ex + (u.x * a - u.y * b) * len, y: ey + (u.y * a + u.x * b) * len });
}

function drawFace(ctx, f, markings) {
  const at = faceFrame(f);
  if (markings?.face && markings.face !== 'none') drawBlaze(ctx, markings.face, at);
  ctx.fillStyle = '#0d0907';
  dot(ctx, at(0.3, 0.2), 3.2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  dot(ctx, at(0.28, 0.17), 0.9);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  dot(ctx, at(0.9, 0.06), 2.4);
  // 頭絡（とうらく）＝顔につける馬具。描くと一気に競走馬らしくなる
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = 2.2;
  line(ctx, at(0.08, 0.12), at(0.72, 0.32));
  line(ctx, at(0.74, -0.2), at(0.72, 0.32));
}

function drawBlaze(ctx, face, at) {
  ctx.fillStyle = '#f6f3ec';
  ctx.beginPath();
  if (face === 'star') {
    const p = at(0.24, -0.04);
    ctx.ellipse(p.x, p.y, 4, 3, 0, 0, TAU);
  } else {
    // 鼻すじは輪郭の前側（b が負の側）にあるので、はみ出した分は輪郭で切り抜かれる
    const w = face === 'blaze' ? 0.16 : 0.07;
    [at(0.2, -0.3), at(0.2, -0.08 + w * 0.4), at(1.1, -0.06 + w), at(1.1, -0.3)].forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
  }
  ctx.fill();
}

// 縁を全周同じ濃さにすると紙の切り口に見えるので、光の向きに合わせて
// 下向きの縁（腹・脚の後ろ）を暗く、上向きの縁（背・首すじ）を明るくする。
// 線を上下にずらして輪郭で切り抜くと、片側の縁だけに線が残る
function drawRim(ctx, f) {
  ctx.save();
  ctx.translate(0, -6);
  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = 12;
  ctx.stroke(f.body);
  ctx.translate(0, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 4;
  ctx.stroke(f.body);
  ctx.translate(0, 5);
  ctx.strokeStyle = 'rgba(255,244,226,0.32)';
  ctx.lineWidth = 4;
  ctx.stroke(f.body);
  ctx.restore();
}

// 奥のレーンの馬は手前の馬の陰に入るので少し暗くし、重なっても前後が分かるようにする
function drawDepth(ctx, depth) {
  if (depth == null || depth >= 1) return;
  ctx.fillStyle = `rgba(24,18,14,${((1 - depth) * 0.22).toFixed(3)})`;
  ctx.fillRect(-300, -300, 600, 320);
}

// たてがみは首すじの線に沿って太く塗り、毛先を走るときは後ろへ、止まると下へ流す
function drawMane(ctx, f, coat, stand) {
  const c = f.crest;
  ctx.strokeStyle = coat.mane;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 4; i < c.length - 2; i += 6) {
    ctx.moveTo(c[i], c[i + 1]);
    ctx.lineTo(c[i] + (stand ? 3 : -9), c[i + 1] + (stand ? 7 : -3));
  }
  ctx.stroke();
}

function silksPattern(ctx, silks) {
  ctx.fillStyle = silks.sub;
  if (silks.pattern === 'hoops') for (let y = -204; y < -170; y += 10) ctx.fillRect(-20, y, 70, 4);
  if (silks.pattern === 'stripes') for (let x = -14; x < 50; x += 10) ctx.fillRect(x, -210, 4, 50);
  if (silks.pattern === 'sash') {
    ctx.beginPath();
    ctx.moveTo(30, -206);
    ctx.lineTo(40, -200);
    ctx.lineTo(0, -168);
    ctx.lineTo(-10, -175);
    ctx.fill();
  }
  if (silks.pattern === 'cross') {
    ctx.fillRect(10, -210, 6, 50);
    ctx.fillRect(-20, -192, 70, 6);
  }
  if (silks.pattern === 'diamonds') for (let x = -10; x < 50; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, -188);
    ctx.lineTo(x + 6, -196);
    ctx.lineTo(x + 12, -188);
    ctx.lineTo(x + 6, -180);
    ctx.fill();
  }
}

function drawJockey(ctx, silks, cap, phase, whip) {
  const bob = Math.sin(phase * TAU * 2) * 1.5;
  ctx.save();
  // 騎手は実物の比率に近づけるため、鞍の位置を中心に拡大して描く
  ctx.translate(8, -150 + bob);
  ctx.scale(1.45, 1.45);
  ctx.translate(-8, 168);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#f2efe8';
  ctx.lineWidth = 9;
  line(ctx, { x: -2, y: -180 }, { x: 20, y: -166 });
  ctx.strokeStyle = '#1d1a18';
  ctx.lineWidth = 7;
  line(ctx, { x: 20, y: -166 }, { x: 10, y: -152 });
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(18, -190, 26, 11, -0.28, 0, TAU);
  ctx.fillStyle = silks.main;
  ctx.fill();
  ctx.clip();
  silksPattern(ctx, silks);
  // 勝負服も平らに塗ると切り絵に見えるので、背中を明るく腹側を暗くして丸みを出す
  const g = ctx.createLinearGradient(14, -202, 20, -178);
  g.addColorStop(0, 'rgba(255,255,255,0.3)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(-10, -204, 56, 28);
  ctx.restore();
  ctx.strokeStyle = silks.sleeve ?? silks.main;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(36, -197);
  ctx.lineTo(54, -182 + (whip ? -8 : 0));
  ctx.lineTo(72, -168);
  ctx.stroke();
  drawJockeyHead(ctx, cap);
  ctx.restore();
}

function drawJockeyHead(ctx, cap) {
  ctx.fillStyle = '#e8c4a0';
  ctx.beginPath();
  ctx.arc(52, -206, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(48, -209, 8.5, Math.PI * 0.95, Math.PI * 2.15);
  ctx.fill();
  ctx.fillRect(48, -210, 13, 3);
  ctx.fillStyle = 'rgba(30,30,40,0.8)';
  ctx.fillRect(51, -208, 7, 2.5);
}

function drawSaddleCloth(ctx, number, frame) {
  const i = Math.max(0, (frame ?? 1) - 1);
  ctx.fillStyle = FRAME_COLORS[i];
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-14, -160, 36, 30, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = FRAME_TEXT[i];
  ctx.font = 'bold 18px -apple-system, "Hiragino Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 4, -144);
}

/**
 * opts: { x, y, scale, phase, coat(id), markings, pose: 'gallop'|'stand',
 *         silks, number, frame, alpha, whip, depth(0=奥〜1=手前) }
 */
export function drawHorse(ctx, opts) {
  const coat = coatById(opts.coat);
  const pose = opts.pose ?? 'gallop';
  const phase = ((opts.phase ?? 0) % 1 + 1) % 1;
  const socks = opts.markings?.socks ?? [false, false, false, false];
  const f = FRAMES[pose === 'stand' ? SHAPES.stand : Math.round(phase * GALLOP_FRAMES) % GALLOP_FRAMES];
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(opts.scale, opts.scale);
  drawShadow(ctx, pose);
  ctx.save();
  ctx.clip(f.body, 'evenodd');
  drawCoat(ctx, f, coat);
  drawFarLegs(ctx, f);
  drawPoints(ctx, f, coat, socks);
  drawFace(ctx, f, opts.markings);
  drawRim(ctx, f);
  drawDepth(ctx, opts.depth);
  ctx.restore();
  drawMane(ctx, f, coat, pose === 'stand');
  // 騎手とゼッケンは背中の高さ -155 を基準に描いてあるので、コマごとの背中の高さへずらす
  ctx.translate(0, f.saddleY + 155);
  if (opts.number != null) drawSaddleCloth(ctx, opts.number, opts.frame);
  if (opts.silks) drawJockey(ctx, opts.silks, FRAME_COLORS[Math.max(0, (opts.frame ?? 1) - 1)], phase, opts.whip);
  ctx.restore();
}

function drawShadow(ctx, pose) {
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 110);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(pose === 'stand' ? 0 : 5, 2, 110, 12, 0, 0, TAU);
  ctx.fill();
}
