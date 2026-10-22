import { el, clamp, lerp } from './util.js';
import { drawHorse, FRAME_COLORS } from './horse-art.js';
import { COURSES } from './race-data.js';
import {
  PALETTES, buildScene, drawBackdrop, drawInfield, drawTrack, drawInnerRail,
  drawStartGate, drawOuterRail, drawRain, drawGrade,
} from './race-scene.js';

const LANES = 10;
const HORSE_M = 2.6;
const SPEED_KEY = 'turf-lineage-race-speed';
const PRE_ROLL = 1.6;

function loadSpeed() {
  try {
    return Number(localStorage.getItem(SPEED_KEY)) || 2;
  } catch {
    return 2;
  }
}

function saveSpeed(v) {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    // 保存できない環境でもレースは見られるので無視する
  }
}

export class RaceView {
  constructor(root, sim, onEnd) {
    this.sim = sim;
    this.onEnd = onEnd;
    this.speed = loadSpeed();
    this.particles = [];
    this.wall = 0;
    this.endTimer = 0;
    this.camX = 0;
    this.ppm = 30;
    this.focus = sim.runners.find((r) => r.isPlayer) ?? sim.runners[0];
    const ground = sim.ground;
    this.palette = ground.weather === '雨' ? PALETTES.rain : sim.race.grade === 'G1' ? PALETTES.golden : PALETTES.day;
    this.buildDom(root);
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.last = performance.now();
    this.frame = requestAnimationFrame((t) => this.loop(t));
  }

  buildDom(root) {
    this.canvas = el('canvas', { class: 'race-canvas' });
    this.mini = el('canvas', { class: 'race-minimap', width: 240, height: 140 });
    this.remainEl = el('div', { class: 'race-remain' });
    this.orderEl = el('ol', { class: 'race-order' });
    this.callEl = el('div', { class: 'race-call' });
    this.introEl = el('div', { class: 'race-intro' }, [
      el('div', { class: 'race-intro-grade', text: this.sim.race.grade }),
      el('div', { class: 'race-intro-name', text: this.sim.race.name }),
      el('div', { class: 'race-intro-sub', text: `${this.sim.race.course} ${this.sim.race.surface === 'turf' ? '芝' : 'ダート'}${this.sim.race.distance}m・${this.sim.ground.weather}・${this.sim.ground.ground}` }),
    ]);
    const speedButtons = [1, 2, 4].map((v) => el('button', {
      class: `race-btn${v === this.speed ? ' is-on' : ''}`, 'data-speed': v, text: `×${v}`,
      onclick: () => this.setSpeed(v),
    }));
    this.controls = el('div', { class: 'race-controls' }, [
      ...speedButtons,
      el('button', { class: 'race-btn race-skip', text: 'スキップ', onclick: () => this.skip() }),
    ]);
    this.stage = el('div', { class: 'race-stage' }, [
      this.canvas, this.introEl,
      el('div', { class: 'race-hud-top' }, [
        el('div', { class: 'race-title', text: `${this.sim.race.name}（${this.sim.race.grade}）` }),
        this.remainEl,
      ]),
      this.orderEl, this.mini, this.callEl, this.controls,
    ]);
    root.append(this.stage);
  }

  setSpeed(v) {
    this.speed = v;
    saveSpeed(v);
    for (const b of this.controls.querySelectorAll('[data-speed]')) b.classList.toggle('is-on', Number(b.dataset.speed) === v);
  }

  skip() {
    this.sim.runToEnd();
    this.end();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.stage.getBoundingClientRect();
    this.W = Math.max(320, rect.width);
    this.H = Math.max(240, rect.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scene = buildScene(this.W, this.H, this.palette, this.sim.race.distance);
  }

  loop(now) {
    // 初回フレームの時刻は開始時刻より前になることがあり、マイナスのdtで描画が壊れるため0で止める
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.wall += dt;
    if (this.wall > PRE_ROLL) {
      this.introEl.classList.add('is-hidden');
      this.sim.step(dt * this.speed * this.photoFinishFactor());
    }
    this.updateCamera(dt);
    this.updateParticles(dt);
    this.render(dt);
    if (Math.floor(this.wall * 10) !== Math.floor((this.wall - dt) * 10)) this.updateHud();
    if (this.sim.finished) {
      this.endTimer += dt;
      if (this.endTimer > 2.2) return this.end();
    }
    this.frame = requestAnimationFrame((t) => this.loop(t));
  }

  // ゴール前の大接戦だけスローモーションにして見せ場をつくる
  photoFinishFactor() {
    const order = this.sim.order();
    const [a, b] = order;
    const remain = this.sim.race.distance - a.pos;
    if (!a.done && remain < 40 && b && a.pos - b.pos < 1.2) return 0.35;
    return 1;
  }

  updateCamera(dt) {
    const order = this.sim.order();
    const lead = order[0];
    const f = this.focus;
    const span = Math.max(0, lead.pos - f.pos);
    const targetPpm = clamp((this.W * 0.72) / (span + 10), Math.max(6, this.W / 90), this.W / 13);
    this.ppm = lerp(this.ppm, targetPpm, Math.min(1, dt * 1.5));
    const target = f.pos + span * 0.5 + 1;
    this.camX = this.wall < 0.1 ? target : lerp(this.camX, target, Math.min(1, dt * 4));
  }

  toScreenFn() {
    const { W, camX, ppm } = this;
    const fn = (m, parallax = 1) => W / 2 + (m - camX) * ppm * parallax;
    fn.inverse = (x, parallax = 1) => camX + (x - W / 2) / (ppm * parallax);
    return fn;
  }

  laneY(lane) {
    const { trackTop, trackBottom } = this.scene.layout;
    return trackTop + ((lane + 0.7) / (LANES + 0.5)) * (trackBottom - trackTop);
  }

  render(dt) {
    const { ctx, W, H, scene, sim } = this;
    const toScreen = this.toScreenFn();
    ctx.clearRect(0, 0, W, H);
    drawBackdrop(ctx, scene, this.camX * this.ppm, W);
    drawInfield(ctx, scene, toScreen, this.ppm, sim.race.distance);
    drawTrack(ctx, scene, toScreen, this.ppm, sim.race.surface, W);
    drawInnerRail(ctx, scene, toScreen, this.ppm, sim.race.distance, W);
    drawStartGate(ctx, scene, toScreen, this.ppm, sim.t > 0);
    this.drawParticles(ctx, toScreen, 'back');
    this.drawRunners(ctx, toScreen, dt);
    drawOuterRail(ctx, scene, toScreen, this.ppm, sim.race.distance, W, this.wall);
    if (sim.ground.weather === '雨') drawRain(ctx, W, H, this.wall);
    drawGrade(ctx, scene, W, H);
  }

  drawRunners(ctx, toScreen, dt) {
    const sorted = [...this.sim.runners].sort((a, b) => a.lane - b.lane);
    for (const r of sorted) {
      const started = this.sim.t > r.startDelay;
      r.anim = (r.anim + (started ? dt * this.speed * (r.v / 7.4) : 0)) % 1;
      const depth = clamp(r.lane / LANES, 0, 1);
      const scale = (this.ppm * HORSE_M / 220) * (0.86 + depth * 0.26);
      const x = toScreen(r.pos) - 150 * scale;
      if (x < -260 * scale || x > this.W + 220 * scale) continue;
      const y = this.laneY(r.lane);
      const remain = this.sim.race.distance - r.pos;
      drawHorse(ctx, {
        x, y, scale, phase: r.anim, coat: r.horse.coat, markings: r.horse.markings,
        pose: started || r.v > 0.5 ? 'gallop' : 'stand', silks: r.silks, number: r.number, frame: r.frame,
        whip: remain < 300 && !r.done && Math.sin(this.wall * 8) > 0.6,
      });
      if (r.isPlayer) this.drawMarker(ctx, x + 40 * scale, y - 250 * scale, r.name);
      if (started && r.v > 8) this.spawnParticles(r, y);
    }
  }

  drawMarker(ctx, x, y, name) {
    ctx.save();
    ctx.font = 'bold 12px -apple-system, "Hiragino Sans", sans-serif';
    const w = ctx.measureText(name).width + 14;
    ctx.fillStyle = 'rgba(20,24,30,0.78)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 26, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y - 16);
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 5);
    ctx.lineTo(x + 6, y - 5);
    ctx.lineTo(x, y + 3);
    ctx.fill();
    ctx.restore();
  }

  spawnParticles(r, y) {
    if (this.particles.length > 260 || Math.random() > 0.35) return;
    const dirt = this.sim.race.surface === 'dirt';
    this.particles.push({
      m: r.pos - HORSE_M * 0.9, y, vy: -(1 + Math.random() * 2.5), dy: 0, life: dirt ? 0.9 : 0.5, age: 0,
      size: dirt ? 3 + Math.random() * 4 : 1.5 + Math.random() * 2,
      color: dirt ? 'rgba(196,160,120,0.45)' : (Math.random() < 0.5 ? 'rgba(90,70,40,0.8)' : 'rgba(70,130,50,0.8)'),
    });
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.dy += p.vy * dt * 30;
      p.vy += 9 * dt;
      p.m -= dt * 2;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  drawParticles(ctx, toScreen) {
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(toScreen(p.m), p.y + Math.min(0, p.dy), p.size * (1 + p.age), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  updateHud() {
    const { sim } = this;
    const order = sim.order();
    const remain = Math.max(0, Math.ceil((sim.race.distance - order[0].pos) / 10) * 10);
    this.remainEl.textContent = sim.finished || order[0].done ? 'ゴール！' : `残り ${remain}m`;
    const shown = order.slice(0, 5);
    const player = order.find((r) => r.isPlayer);
    if (player && !shown.includes(player)) shown.push(player);
    this.orderEl.replaceChildren(...shown.map((r) => el('li', { class: r.isPlayer ? 'is-player' : '' }, [
      el('span', { class: 'race-order-rank', text: String(order.indexOf(r) + 1) }),
      el('span', { class: 'frame-badge', style: `background:${FRAME_COLORS[r.frame - 1]};color:${[1, 2, 3, 5].includes(r.frame - 1) ? '#fff' : '#111'}`, text: String(r.number) }),
      el('span', { class: 'race-order-name', text: r.name }),
    ])));
    const last = sim.events[sim.events.length - 1];
    if (last && this.callEl.textContent !== last.text) {
      this.callEl.textContent = last.text;
      this.callEl.classList.remove('is-new');
      void this.callEl.offsetWidth;
      this.callEl.classList.add('is-new');
    }
    this.drawMinimap(order);
  }

  drawMinimap(order) {
    const ctx = this.mini.getContext('2d');
    const { straight, lap } = COURSES[this.sim.race.course];
    const R = (lap - 2 * straight) / (2 * Math.PI);
    const k = 200 / (straight + 2 * R);
    ctx.clearRect(0, 0, 240, 140);
    ctx.save();
    ctx.translate(120, 70);
    ctx.scale(k, k);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 7 / k;
    ctx.beginPath();
    ctx.roundRect(-straight / 2 - R, -R, straight + 2 * R, 2 * R, R);
    ctx.stroke();
    for (const r of [...order].reverse()) {
      const p = trackPoint(this.sim.race.distance - r.pos, straight, R, lap);
      ctx.fillStyle = r.isPlayer ? '#ffd34d' : FRAME_COLORS[r.frame - 1];
      ctx.beginPath();
      ctx.arc(p.x, p.y, (r.isPlayer ? 9 : 6) / k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    this.onEnd(this.sim.results);
  }
}

// ゴールから逆算した残り距離を、楕円コース上の座標に変換する（ゴールは右下）
function trackPoint(remain, S, R, lap) {
  const u = ((Math.max(0, remain) % lap) + lap) % lap;
  const corner = Math.PI * R;
  if (u <= S) return { x: S / 2 - u, y: R };
  if (u <= S + corner) {
    const a = (u - S) / R;
    return { x: -S / 2 - R * Math.sin(a), y: R * Math.cos(a) };
  }
  if (u <= 2 * S + corner) return { x: -S / 2 + (u - S - corner), y: -R };
  const a = (u - 2 * S - corner) / R;
  return { x: S / 2 + R * Math.sin(a), y: -R * Math.cos(a) };
}
