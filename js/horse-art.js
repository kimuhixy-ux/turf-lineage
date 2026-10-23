import { coatById } from './horse.js';

// 馬は「体長220・地面 y=0・右向き」のローカル座標で描き、拡大縮小で使い回す
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
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

// 脚は3本の骨（前脚：前腕・管・繋ぎ／後脚：脛・管・繋ぎ）をつないで描く
const FORE_LEN = [56, 40, 14];
const HIND_LEN = [52, 48, 14];
const FORE_ROOT = { x: 50, y: -110 };
const HIND_ROOT = { x: -58, y: -114 };
// マイブリッジ「The Horse in Motion」（1878年・パブリックドメイン）の11コマから読み取った襲歩。
// 1歩を11等分し、着地の瞬間を0番として各骨の向きを度で持つ（真下が0、前向きが正）
const FORE_CYCLE = [
  [34, 26, 20], [10, 4, 36], [-12, -14, 40], [-30, -40, -10], [-20, -90, -120], [5, -115, -160],
  [25, -100, -150], [45, -50, -100], [64, 0, -40], [70, 50, 10], [52, 42, 24],
];
const HIND_CYCLE = [
  [0, 30, 28], [-30, 0, 40], [-58, -30, 10], [-75, -60, -50], [-70, -90, -100], [-45, -100, -120],
  [-15, -80, -125], [14, -35, -90], [30, 8, -40], [32, 38, 2], [16, 40, 22],
];
// 写真では後脚は約2.5コマ、前脚は約3.5コマのあいだ地面に着いている
const STANCE_KEYS = { fore: 3.6, hind: 2.6 };
// 写真では 右後→左後→右前→左前 の順に着地し、2〜4コマ目は4本とも宙に浮く
const LEGS = [
  { front: false, near: false, land: 4 / 11, sock: 0, stand: [-26, 2, 24] },
  { front: true, near: false, land: 6 / 11, sock: 1, stand: [-3, -1, 22] },
  { front: false, near: true, land: 5 / 11, sock: 2, stand: [-20, 6, 24] },
  { front: true, near: true, land: 7 / 11, sock: 3, stand: [3, 0, 22] },
];

// 角が出ないよう、前後2コマずつを使った曲線（Catmull-Rom）でコマの間をつなぐ
function smoothStep(a, b, c, d, t) {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

const legPhase = (leg, t) => ((t - leg.land) % 1 + 1) % 1;

function gallopAngles(leg, t) {
  const keys = leg.front ? FORE_CYCLE : HIND_CYCLE;
  const n = keys.length;
  const f = legPhase(leg, t) * n;
  const i = Math.floor(f);
  const k = (j) => keys[(i + j + n) % n];
  return k(0).map((_, s) => smoothStep(k(-1)[s], k(0)[s], k(1)[s], k(2)[s], f - i));
}

function legPoints(leg, angles, far) {
  const root = leg.front ? FORE_ROOT : HIND_ROOT;
  const lens = leg.front ? FORE_LEN : HIND_LEN;
  const pts = [{ x: root.x - (far ? 8 : 0), y: root.y }];
  angles.forEach((deg, i) => {
    const p = pts[i];
    pts.push({ x: p.x + Math.sin(deg * RAD) * lens[i], y: p.y + Math.cos(deg * RAD) * lens[i] });
  });
  return pts;
}

const hoofBottom = (leg, angles) => legPoints(leg, angles, false)[3].y + 5;

// 接地している脚のひづめが地面にちょうど着く高さを、1歩ぶん先に計算しておく
function buildGround(n) {
  const raw = Array.from({ length: n }, (_, i) => {
    const grounded = LEGS.filter((l) => legPhase(l, i / n) * 11 < STANCE_KEYS[l.front ? 'fore' : 'hind']);
    const ys = grounded.map((l) => hoofBottom(l, gallopAngles(l, i / n)));
    return ys.length ? -Math.max(...ys) : null;
  });
  const at = (i) => raw[(i + n) % n];
  const filled = raw.map((v, i) => {
    if (v != null) return v;
    let a = i;
    let b = i;
    while (at(a) == null) a -= 1;
    while (at(b) == null) b += 1;
    const u = (i - a) / (b - a);
    // 4本とも浮いている間は、前後の高さをつないで少し跳ね上げる
    return at(a) * (1 - u) + at(b) * u - Math.sin(u * Math.PI) * 6;
  });
  // 着地する脚が入れ替わる瞬間のガタつきをならす
  return filled.map((v, i) => (filled[(i + n - 1) % n] + v * 2 + filled[(i + 1) % n]) / 4);
}

const GROUND = buildGround(66);
const STAND_GROUND = -Math.max(...LEGS.map((l) => hoofBottom(l, l.stand)));

function groundAt(t) {
  const f = t * GROUND.length;
  const i = Math.floor(f);
  return GROUND[i % GROUND.length] * (1 - (f - i)) + GROUND[(i + 1) % GROUND.length] * (f - i);
}

function drawLeg(ctx, leg, angles, coat, sock, far) {
  const [root, joint, fetlock, hoof] = legPoints(leg, angles, far);
  const skin = far ? coat.shade : coat.body;
  const points = far ? shade(coat.points, -0.05) : coat.points;
  const lower = sock ? '#f4f1ea' : points;
  ctx.fillStyle = skin;
  if (leg.front) taper(ctx, root, joint, 24, 11);
  else taper(ctx, { x: root.x + 4, y: root.y - 12 }, joint, 30, 12);
  ctx.lineCap = 'round';
  ctx.strokeStyle = lower;
  ctx.lineWidth = 7.5;
  line(ctx, joint, fetlock);
  ctx.lineWidth = 6;
  line(ctx, fetlock, hoof);
  // 膝・飛節・球節（足首）の出っぱりを描くと、棒ではなく骨の通った脚に見える
  ctx.fillStyle = leg.front ? points : skin;
  dot(ctx, joint, leg.front ? 5.5 : 6.5);
  ctx.fillStyle = lower;
  dot(ctx, fetlock, 4.4);
  drawHoof(ctx, hoof, angles[2] * RAD, far ? '#151210' : '#2a2420');
}

function drawHoof(ctx, p, angle, color) {
  ctx.save();
  ctx.translate(p.x, p.y);
  // 蹄の前面は繋ぎとほぼ平行だが、底は地面に近い向きになるので回転を半分にする
  ctx.rotate(-angle * 0.5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-4.2, -2);
  ctx.lineTo(3.6, -2);
  ctx.lineTo(6.8, 5.5);
  ctx.lineTo(-4.6, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dot(ctx, p, r) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
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

// 写真の馬の輪郭に合わせた胴：丸い尻、低いき甲の後ろのくぼみ、深い胸、締まった腹
function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-62, -162);
  ctx.bezierCurveTo(-80, -160, -91, -142, -87, -124);
  ctx.bezierCurveTo(-84, -108, -75, -98, -62, -95);
  ctx.bezierCurveTo(-40, -88, 10, -81, 40, -85);
  ctx.bezierCurveTo(58, -87, 72, -100, 77, -118);
  ctx.bezierCurveTo(80, -132, 74, -146, 62, -156);
  ctx.bezierCurveTo(50, -165, 38, -167, 24, -163);
  ctx.bezierCurveTo(6, -155, -20, -155, -36, -158);
  ctx.bezierCurveTo(-46, -162, -54, -164, -62, -162);
  ctx.closePath();
}

function drawBody(ctx, coat) {
  const g = ctx.createLinearGradient(0, -166, 0, -82);
  g.addColorStop(0, shade(coat.body, 0.12));
  g.addColorStop(0.5, coat.body);
  g.addColorStop(1, coat.shade);
  bodyPath(ctx);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  // 尻と肩の筋肉に光を当て、腹の下を暗くして丸みを出す
  glow(ctx, -60, -140, 36, 'rgba(255,255,255,0.24)');
  glow(ctx, 50, -136, 28, 'rgba(255,255,255,0.2)');
  glow(ctx, -4, -80, 46, 'rgba(0,0,0,0.3)');
  drawMuscleLines(ctx);
  if (coat.dapple) drawDapples(ctx);
  ctx.restore();
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// 肩甲骨の線・脇腹のくぼみ・背中の照り返しを薄く重ねる
function drawMuscleLines(ctx) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.09)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(30, -160);
  ctx.quadraticCurveTo(46, -132, 66, -116);
  ctx.moveTo(-48, -98);
  ctx.quadraticCurveTo(-40, -116, -46, -134);
  ctx.moveTo(-6, -92);
  ctx.quadraticCurveTo(14, -100, 30, -96);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-78, -150);
  ctx.bezierCurveTo(-62, -163, -46, -160, -34, -156);
  ctx.bezierCurveTo(-18, -152, 6, -152, 22, -160);
  ctx.stroke();
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

// 3次ベジェ曲線上の点。たてがみの毛を首すじに沿って並べるのに使う
function bezierPoint(p, t) {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: w.reduce((s, k, i) => s + k * p[i][0], 0), y: w.reduce((s, k, i) => s + k * p[i][1], 0) };
}

const CREST = [[18, -160], [40, -178], [66, -198], [96, -207]];

function drawNeckHead(ctx, coat, markings) {
  const g = ctx.createLinearGradient(40, -206, 100, -130);
  g.addColorStop(0, shade(coat.body, 0.1));
  g.addColorStop(0.6, coat.body);
  g.addColorStop(1, shade(coat.body, -0.1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(...CREST[0]);
  ctx.bezierCurveTo(...CREST[1], ...CREST[2], ...CREST[3]);
  ctx.lineTo(108, -178);
  ctx.bezierCurveTo(96, -152, 86, -132, 77, -116);
  ctx.lineTo(56, -130);
  ctx.closePath();
  ctx.fill();
  headPath(ctx);
  ctx.fillStyle = coat.body;
  ctx.fill();
  ctx.save();
  headPath(ctx);
  ctx.clip();
  // ほお骨の丸みと、鼻すじに向かって細くなる顔の立体感
  glow(ctx, 112, -178, 14, 'rgba(255,255,255,0.22)');
  glow(ctx, 140, -158, 12, 'rgba(0,0,0,0.25)');
  ctx.restore();
  drawFaceDetails(ctx, coat, markings);
}

function headPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(94, -206);
  ctx.bezierCurveTo(100, -213, 108, -211, 114, -203);
  ctx.bezierCurveTo(124, -192, 138, -178, 147, -168);
  ctx.bezierCurveTo(151, -163, 149, -155, 142, -154);
  ctx.bezierCurveTo(138, -153, 134, -156, 130, -158);
  ctx.bezierCurveTo(124, -160, 120, -160, 116, -164);
  ctx.bezierCurveTo(106, -162, 100, -172, 104, -182);
  ctx.lineTo(96, -196);
  ctx.closePath();
}

function drawFaceDetails(ctx, coat, markings) {
  ctx.fillStyle = coat.shade;
  ctx.beginPath();
  ctx.moveTo(98, -206);
  ctx.quadraticCurveTo(97, -218, 101, -225);
  ctx.quadraticCurveTo(107, -214, 108, -206);
  ctx.closePath();
  ctx.fill();
  if (markings?.face && markings.face !== 'none') drawBlaze(ctx, markings.face);
  ctx.fillStyle = '#0d0907';
  ctx.beginPath();
  ctx.ellipse(115, -193, 3.4, 2.5, 0.7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  dot(ctx, { x: 116, y: -194 }, 0.9);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(143, -164, 3, 2, 0.8, 0, TAU);
  ctx.fill();
  // 頭絡（とうらく）＝顔につける馬具。描くと一気に競走馬らしくなる
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(104, -205);
  ctx.lineTo(114, -166);
  ctx.moveTo(124, -180);
  ctx.lineTo(136, -165);
  ctx.moveTo(138, -156);
  ctx.lineTo(132, -159);
  ctx.stroke();
}

function drawBlaze(ctx, face) {
  ctx.fillStyle = '#f6f3ec';
  ctx.beginPath();
  if (face === 'star') {
    ctx.ellipse(110, -199, 4, 3, 0.7, 0, TAU);
  } else {
    const w = face === 'blaze' ? 6 : 3;
    ctx.moveTo(107, -204);
    ctx.lineTo(113, -206);
    ctx.lineTo(146 + w * 0.3, -168);
    ctx.lineTo(140 - w, -162);
    ctx.closePath();
  }
  ctx.fill();
}

// たてがみは首すじに沿って細い毛を並べ、走るときは風で後ろへなびかせる
function drawMane(ctx, coat, phase, pose) {
  const run = pose !== 'stand';
  ctx.strokeStyle = coat.mane;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const p = bezierPoint(CREST, t);
    const wave = Math.sin(phase * TAU * (run ? 2 : 1) + i * 0.9) * (run ? 4 : 1.2);
    const len = 14 + Math.sin(t * Math.PI) * 6;
    ctx.globalAlpha = 0.75 + (i % 3) * 0.1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    if (run) ctx.quadraticCurveTo(p.x - len * 0.5, p.y - 6 + wave, p.x - len, p.y - 2 + wave);
    else ctx.quadraticCurveTo(p.x - 6, p.y + 2, p.x - 8 + wave, p.y + len * 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// 尻尾は毛束を何本も重ね、走るときは後ろへ流れ、止まると垂れ下がる
function drawTail(ctx, coat, phase, pose) {
  const run = pose !== 'stand';
  ctx.strokeStyle = coat.mane;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i += 1) {
    const spread = (i - 5.5) * (run ? 2.2 : 1.4);
    const swing = Math.sin(phase * TAU + i * 0.35) * (run ? 7 : 3);
    ctx.globalAlpha = 0.5 + (i % 4) * 0.12;
    ctx.lineWidth = i < 4 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(-82, -152);
    if (run) ctx.bezierCurveTo(-104, -156, -124, -146 + spread + swing, -150 - Math.abs(spread), -130 + spread * 1.6 + swing);
    else ctx.bezierCurveTo(-96, -146, -100 + spread, -110, -96 + spread + swing, -66 + Math.abs(spread));
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
  const phase = ((opts.phase ?? 0) % 1 + 1) % 1;
  const socks = opts.markings?.socks ?? [false, false, false, false];
  const stand = pose === 'stand';
  const angles = LEGS.map((l) => (stand ? l.stand : gallopAngles(l, phase)));
  const lift = stand ? STAND_GROUND + Math.sin(phase * TAU) * 0.8 : groundAt(phase);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(opts.scale, opts.scale);
  drawShadow(ctx, pose);
  ctx.translate(0, lift);
  if (!stand) ctx.rotate(Math.sin(phase * TAU + 1) * 0.025);
  // 脚の付け根は胴に隠れるよう、脚（奥→手前の順）を先に描いてから胴を重ねる
  LEGS.forEach((l, i) => { if (!l.near) drawLeg(ctx, l, angles[i], coat, socks[l.sock], true); });
  LEGS.forEach((l, i) => { if (l.near) drawLeg(ctx, l, angles[i], coat, socks[l.sock], false); });
  drawTail(ctx, coat, phase, pose);
  drawBody(ctx, coat);
  drawHeadGroup(ctx, coat, opts.markings, phase, pose);
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
  // 首は肩を支点に回す。走るときは首を前へ伸ばし、前脚が着地している間に下がり、宙に浮くと上がる
  const angle = pose === 'stand' ? -0.28 + Math.sin(phase * TAU * 0.5) * 0.02 : 0.32 + Math.cos(TAU * (phase - 0.78)) * 0.07;
  ctx.save();
  ctx.translate(50, -140);
  ctx.rotate(angle);
  ctx.translate(-50, 140);
  drawNeckHead(ctx, coat, markings);
  drawMane(ctx, coat, phase, pose);
  ctx.restore();
}
