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

// 襲歩（ギャロップ）の脚の順番。後ろ脚→前脚の順で地面を蹴る
const GALLOP_LEGS = [
  { front: false, near: false, offset: 0.08 },
  { front: true, near: false, offset: 0.42 },
  { front: false, near: true, offset: 0 },
  { front: true, near: true, offset: 0.52 },
];

function legPose(leg, phase, pose) {
  if (pose === 'stand') {
    const lean = leg.near ? 0.02 : -0.04;
    return leg.front ? { upper: lean, lower: 0 } : { upper: -0.12 + lean, lower: 0.18 };
  }
  const th = TAU * (phase + leg.offset);
  if (leg.front) return { upper: 0.6 * Math.sin(th), lower: -Math.max(0, Math.sin(th + 1.4)) * 1.7 };
  return { upper: 0.55 * Math.sin(th) - 0.12, lower: Math.max(0, Math.sin(th + 1.1)) * 1.3 + 0.15 };
}

function drawLeg(ctx, leg, pose, coat, sock, far) {
  const root = leg.front ? { x: 50, y: -106 } : { x: -56, y: -116 };
  if (far) root.x -= 8;
  const up = leg.front ? 50 : 50;
  const low = leg.front ? 52 : 62;
  const k = { x: root.x + Math.sin(pose.upper) * up, y: root.y + Math.cos(pose.upper) * up };
  const a2 = pose.upper + pose.lower;
  const f = { x: k.x + Math.sin(a2) * low, y: k.y + Math.cos(a2) * low };
  const bodyColor = far ? coat.shade : coat.body;
  const lowerColor = sock ? '#f4f1ea' : (far ? shade(coat.points, -0.05) : coat.points);
  ctx.lineCap = 'round';
  ctx.fillStyle = bodyColor;
  taper(ctx, root, k, leg.front ? 22 : 34, leg.front ? 11 : 12);
  ctx.strokeStyle = lowerColor;
  ctx.lineWidth = 8;
  line(ctx, k, f);
  ctx.fillStyle = far ? '#151210' : '#2a2420';
  ctx.beginPath();
  ctx.ellipse(f.x + Math.sin(a2) * 3, f.y + 3, 6, 4.5, a2, 0, TAU);
  ctx.fill();
}

// 付け根が太く関節に向かって細くなる脚の上部（前腕・太もも）
function taper(ctx, a, b, w1, w2) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  const cx = Math.cos(ang);
  const cy = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(a.x + cx * w1 / 2, a.y + cy * w1 / 2);
  ctx.lineTo(b.x + cx * w2 / 2, b.y + cy * w2 / 2);
  ctx.arc(b.x, b.y, w2 / 2, ang, ang + Math.PI);
  ctx.lineTo(a.x - cx * w1 / 2, a.y - cy * w1 / 2);
  ctx.closePath();
  ctx.fill();
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-80, -128);
  ctx.bezierCurveTo(-84, -152, -62, -162, -40, -156);
  ctx.bezierCurveTo(-15, -148, 15, -148, 38, -156);
  ctx.bezierCurveTo(58, -162, 76, -142, 76, -118);
  ctx.bezierCurveTo(76, -100, 63, -90, 45, -90);
  ctx.bezierCurveTo(20, -85, -20, -85, -46, -92);
  ctx.bezierCurveTo(-66, -96, -82, -108, -80, -128);
  ctx.closePath();
}

function drawBody(ctx, coat) {
  const g = ctx.createLinearGradient(0, -162, 0, -86);
  g.addColorStop(0, shade(coat.body, 0.1));
  g.addColorStop(0.55, coat.body);
  g.addColorStop(1, coat.shade);
  bodyPath(ctx);
  ctx.fillStyle = g;
  ctx.fill();
  // 筋肉の盛り上がりに光を当てて立体感を出す
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  for (const [x, y, r] of [[-52, -134, 32], [50, -128, 26]]) {
    const hl = ctx.createRadialGradient(x - 6, y - 10, 2, x, y, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (coat.dapple) drawDapples(ctx);
  ctx.restore();
}

function drawDapples(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  const spots = [[-60, -130], [-45, -118], [-30, -138], [-15, -120], [0, -132], [15, -115], [30, -136], [45, -120], [-52, -145]];
  for (const [x, y] of spots) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.fill();
  }
}

function drawNeckHead(ctx, coat, markings) {
  const g = ctx.createLinearGradient(30, -200, 110, -120);
  g.addColorStop(0, shade(coat.body, 0.08));
  g.addColorStop(0.7, coat.body);
  g.addColorStop(1, shade(coat.body, -0.08));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(26, -150);
  ctx.quadraticCurveTo(58, -188, 96, -198);
  ctx.lineTo(114, -176);
  ctx.quadraticCurveTo(92, -140, 74, -114);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.moveTo(92, -200);
  ctx.quadraticCurveTo(104, -210, 116, -200);
  ctx.lineTo(148, -167);
  ctx.quadraticCurveTo(151, -156, 140, -153);
  ctx.lineTo(118, -159);
  ctx.quadraticCurveTo(106, -166, 102, -178);
  ctx.closePath();
  ctx.fill();
  drawFaceDetails(ctx, coat, markings);
}

function drawFaceDetails(ctx, coat, markings) {
  ctx.fillStyle = coat.shade;
  ctx.beginPath();
  ctx.moveTo(97, -202);
  ctx.lineTo(99, -220);
  ctx.lineTo(108, -204);
  ctx.closePath();
  ctx.fill();
  if (markings?.face && markings.face !== 'none') drawBlaze(ctx, markings.face);
  ctx.fillStyle = '#0d0907';
  ctx.beginPath();
  ctx.ellipse(115, -190, 3.4, 2.6, 0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(116, -191, 0.9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(141, -162, 3, 2, 0.8, 0, TAU);
  ctx.fill();
  // 頭絡（とうらく）＝顔につける馬具。描くと一気に競走馬らしくなる
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(104, -203);
  ctx.lineTo(112, -170);
  ctx.moveTo(122, -174);
  ctx.lineTo(136, -160);
  ctx.stroke();
}

function drawBlaze(ctx, face) {
  ctx.fillStyle = '#f6f3ec';
  ctx.beginPath();
  if (face === 'star') {
    ctx.ellipse(109, -196, 4, 3, 0.7, 0, TAU);
  } else {
    const w = face === 'blaze' ? 6 : 3;
    ctx.moveTo(106, -200);
    ctx.lineTo(112, -202);
    ctx.lineTo(143 + w * 0.3, -164);
    ctx.lineTo(137 - w, -160);
    ctx.closePath();
  }
  ctx.fill();
}

function drawMane(ctx, coat, phase, pose) {
  ctx.strokeStyle = coat.mane;
  ctx.lineCap = 'round';
  const wave = pose === 'stand' ? Math.sin(phase * TAU) * 1.5 : Math.sin(phase * TAU * 2) * 4;
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 30 + t * 64;
    const y = -156 - t * 40 + Math.sin(t * Math.PI) * -6;
    ctx.lineWidth = 7 - t * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 10, y - 2 + wave, x - 18 - wave, y + 8);
    ctx.stroke();
  }
}

function drawTail(ctx, coat, phase, pose) {
  const swing = pose === 'stand' ? Math.sin(phase * TAU) * 6 : Math.sin(phase * TAU) * 10;
  const lift = pose === 'stand' ? 0 : 22;
  ctx.strokeStyle = coat.mane;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    ctx.globalAlpha = 0.55 + i * 0.07;
    ctx.lineWidth = 9 - i;
    ctx.beginPath();
    ctx.moveTo(-80, -140);
    ctx.bezierCurveTo(-100, -142 + lift * 0.3, -116 - i * 2, -118 + swing - lift, -112 - i * 3 + swing, -70 - lift + i * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
 *         silks, number, frame, alpha, whip }
 */
export function drawHorse(ctx, opts) {
  const coat = coatById(opts.coat);
  const pose = opts.pose ?? 'gallop';
  const phase = opts.phase ?? 0;
  const socks = opts.markings?.socks ?? [false, false, false, false];
  const bob = pose === 'stand' ? Math.sin(phase * TAU) * 0.8 : -Math.cos(phase * TAU) * 5;
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(opts.scale, opts.scale);
  drawShadow(ctx, pose);
  ctx.translate(0, bob);
  if (pose !== 'stand') ctx.rotate(Math.sin(phase * TAU + 1) * 0.035);
  GALLOP_LEGS.filter((l) => !l.near).forEach((l, i) => drawLeg(ctx, l, legPose(l, phase, pose), coat, socks[i], true));
  drawTail(ctx, coat, phase, pose);
  drawBody(ctx, coat);
  drawHeadGroup(ctx, coat, opts.markings, phase, pose);
  GALLOP_LEGS.filter((l) => l.near).forEach((l, i) => drawLeg(ctx, l, legPose(l, phase, pose), coat, socks[i + 2], false));
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

function drawHeadGroup(ctx, coat, markings, phase, pose) {
  // 首は肩を支点に回す。走るときは首を前後に振り、立つときは首を上げる
  const angle = pose === 'stand' ? -0.28 + Math.sin(phase * TAU * 0.5) * 0.02 : Math.sin(phase * TAU + 0.6) * 0.07;
  ctx.save();
  ctx.translate(50, -140);
  ctx.rotate(angle);
  ctx.translate(-50, 140);
  drawNeckHead(ctx, coat, markings);
  drawMane(ctx, coat, phase, pose);
  ctx.restore();
}
