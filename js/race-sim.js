import { rand, clamp, gauss } from './util.js';
import { STYLES } from './horse.js';
import { COURSES } from './race-data.js';

export const SIM_DT = 1 / 30;
const EARLY = { 逃げ: 0.99, 先行: 0.968, 差し: 0.948, 追込: 0.935 };
const MID = { 逃げ: 0.957, 先行: 0.951, 差し: 0.945, 追込: 0.94 };
const SPURT_AT = { 逃げ: 480, 先行: 540, 差し: 620, 追込: 680 };
const SPURT_BONUS = { 逃げ: 0, 先行: 0.006, 差し: 0.014, 追込: 0.02 };
const STYLE_LANE = { 逃げ: 0, 先行: 1, 差し: 2.2, 追込: 3.2 };
const LENGTH_M = 2.4;

function distanceFit(range, distance) {
  const out = distance < range[0] ? range[0] - distance : Math.max(0, distance - range[1]);
  return Math.max(0.94, 1 - (out / 200) * 0.008);
}

function profile(h, race, ground, style) {
  const s = h.stats;
  const surface = race.surface === 'turf' ? h.apt.turf : h.apt.dirt;
  const styleGap = Math.abs(STYLES.indexOf(h.style) - STYLES.indexOf(style));
  const base = 14.95 + s.speed * 0.03 + (2000 - race.distance) * 0.0004 - (race.surface === 'dirt' ? 0.45 : 0) - ground.level * 0.12;
  const mult = (1 - (1 - surface) * 0.08)
    * distanceFit(h.dist, race.distance)
    * (0.984 + (h.condition / 100) * 0.024)
    * (1 - ground.level * 0.006 * (1.3 - s.power / 100))
    * (1 - styleGap * 0.01)
    * (1 + gauss() * 0.005);
  return {
    top: base * mult,
    accel: 1.6 + s.power * 0.018,
    hpMax: 600 + s.stamina * 7.5 + s.guts * 1.5,
    spurt: 1.012 + s.burst * 0.00045,
    exhaust: 0.86 + s.guts * 0.0009,
    cornerCap: 0.968 + h.skills.corner * 0.00022 + s.flex * 0.00012,
    wisdom: s.wisdom, guts: s.guts, calm: h.skills.calm,
  };
}

export function marginLabel(meters) {
  if (meters < 0.05) return '同着';
  if (meters < 0.3) return 'ハナ';
  if (meters < 0.6) return 'アタマ';
  if (meters < 1.0) return 'クビ';
  const len = meters / LENGTH_M;
  const steps = [[0.6, '1/2'], [0.85, '3/4'], [1.1, '1'], [1.35, '1 1/4'], [1.6, '1 1/2'], [1.85, '1 3/4'], [2.3, '2'],
    [2.8, '2 1/2'], [3.3, '3'], [3.8, '3 1/2'], [4.5, '4'], [5.5, '5'], [6.5, '6'], [7.5, '7'], [8.5, '8'], [9.5, '9'], [10.5, '10']];
  for (const [max, label] of steps) if (len < max) return label;
  return '大差';
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export class RaceSim {
  constructor(race, runners, ground) {
    this.race = race;
    this.ground = ground;
    this.course = COURSES[race.course];
    this.distFactor = Math.pow(2000 / race.distance, 0.5);
    this.runners = runners;
    this.t = 0;
    this.acc = 0;
    this.events = [];
    this.flags = new Set();
    this.finished = false;
    runners.forEach((r) => this.prepare(r));
  }

  prepare(r) {
    r.p = profile(r.horse, this.race, this.ground, r.style);
    Object.assign(r, { pos: 0, v: 0, hp: r.p.hpMax, kakari: 0, kakariCount: 0, done: false, blocked: 0 });
    r.lane = (r.gate - 1) * 0.42;
    r.targetLane = r.lane;
    const lateStart = Math.random() < 0.06 * (1 - r.horse.skills.gate / 100) * 2;
    r.startDelay = rand(0.05, 0.35) + (1 - r.horse.skills.gate / 100) * 0.5 + (lateStart ? rand(0.8, 1.4) : 0);
    r.anim = Math.random();
  }

  remainOf(r) {
    return this.race.distance - r.pos;
  }

  inCorner(remain) {
    const { straight, lap } = this.course;
    const radius = (lap - 2 * straight) / (2 * Math.PI);
    const u = ((remain % lap) + lap) % lap;
    const corner = Math.PI * radius;
    return (u > straight && u < straight + corner) || u > 2 * straight + corner;
  }

  step(dt) {
    this.acc += dt;
    while (this.acc >= SIM_DT && !this.finished) {
      this.acc -= SIM_DT;
      this.tick();
    }
  }

  runToEnd() {
    while (!this.finished) this.tick();
  }

  tick() {
    this.t += SIM_DT;
    for (const r of this.runners) this.moveRunner(r);
    this.commentate();
    const allDone = this.runners.every((r) => r.done);
    if (allDone || this.t > this.race.distance / 9) this.finish();
  }

  targetSpeed(r, remain) {
    const p = r.p;
    let mult;
    if (remain <= SPURT_AT[r.style] * (r.hp > p.hpMax * 0.15 ? 1 : 0.6)) mult = p.spurt + SPURT_BONUS[r.style];
    else if (r.pos / this.race.distance < 0.16) mult = EARLY[r.style];
    else mult = MID[r.style];
    if (r.kakari > 0) mult += 0.03;
    let target = p.top * mult;
    if (r.hp <= 0) target *= p.exhaust;
    if (this.inCorner(remain)) target = Math.min(target, p.top * p.cornerCap) * (1 - r.lane * 0.0022);
    if (remain < 200 && this.hasRivalBeside(r)) target *= 1 + p.guts * 0.00015;
    return target;
  }

  hasRivalBeside(r) {
    return this.runners.some((o) => o !== r && !o.done && Math.abs(o.pos - r.pos) < 1.2);
  }

  findAhead(r, lane, range = 2.8) {
    let best = null;
    for (const o of this.runners) {
      if (o === r) continue;
      const dx = o.pos - r.pos;
      if (dx > 0 && dx < range && Math.abs(o.lane - lane) < 0.85 && (!best || dx < best.pos - r.pos)) best = o;
    }
    return best;
  }

  laneFree(r, lane) {
    return !this.runners.some((o) => o !== r && Math.abs(o.pos - r.pos) < 2.6 && Math.abs(o.lane - lane) < 0.85);
  }

  traffic(r, target) {
    const ahead = this.findAhead(r, r.lane);
    if (!ahead || target <= ahead.v) {
      r.blocked = 0;
      return target;
    }
    r.blocked += SIM_DT;
    // 賢い馬ほど早く進路を外に切り替えられる
    if (Math.random() < SIM_DT * (0.6 + r.p.wisdom / 50) && this.laneFree(r, r.lane + 1)) r.targetLane = Math.min(10, r.lane + 1);
    return Math.min(target, ahead.v + 0.1);
  }

  steer(r, remain) {
    const inStretch = remain < this.course.straight;
    if (!inStretch && Math.random() < SIM_DT * 0.7) {
      const want = STYLE_LANE[r.style];
      if (r.lane > want + 0.3 && this.laneFree(r, r.lane - 1)) r.targetLane = Math.max(0, r.lane - 1);
    }
    const d = r.targetLane - r.lane;
    r.lane += clamp(d, -0.7 * SIM_DT, 0.7 * SIM_DT);
  }

  maybeKakari(r) {
    const prog = r.pos / this.race.distance;
    if (r.kakariCount > 0 || prog < 0.15 || prog > 0.7) return;
    const chance = (1 - r.p.calm / 100) * 0.03 * (r.style === '逃げ' ? 0.4 : 1);
    if (Math.random() < chance * SIM_DT) {
      r.kakari = rand(3, 7);
      r.kakariCount += 1;
      if (r.isPlayer) this.say(`${r.name}、少し行きたがっているか…！`);
    }
  }

  moveRunner(r) {
    if (this.t < r.startDelay) return;
    const remain = this.remainOf(r);
    if (r.done) {
      r.v = Math.max(9, r.v - 1.2 * SIM_DT);
      r.pos += r.v * SIM_DT;
      return;
    }
    this.maybeKakari(r);
    const target = this.traffic(r, this.targetSpeed(r, remain));
    r.v += clamp(target - r.v, -1.0 * SIM_DT, r.p.accel * SIM_DT);
    r.pos += r.v * SIM_DT;
    const burn = 0.6 * Math.pow(r.v / 16.5, 3) * this.distFactor * (r.kakari > 0 ? 1.7 : 1);
    r.hp -= burn * r.v * SIM_DT;
    if (r.kakari > 0) r.kakari -= SIM_DT;
    this.steer(r, remain);
    if (r.pos >= this.race.distance) {
      r.done = true;
      r.finishTime = this.t - (r.pos - this.race.distance) / Math.max(r.v, 1);
    }
  }

  order() {
    return [...this.runners].sort((a, b) => {
      if (a.done && b.done) return a.finishTime - b.finishTime;
      if (a.done !== b.done) return a.done ? -1 : 1;
      return b.pos - a.pos;
    });
  }

  say(text) {
    this.events.push({ t: this.t, text });
  }

  once(flag, fn) {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    fn();
  }

  commentate() {
    const order = this.order();
    const lead = order[0];
    const d = this.race.distance;
    const player = this.runners.find((r) => r.isPlayer);
    const rankOf = (r) => order.indexOf(r) + 1;
    const lengths = (a, b) => Math.max(0, Math.round((a.pos - b.pos) / LENGTH_M));
    if (this.t > 1.4) this.once('start', () => {
      const late = this.runners.filter((r) => r.startDelay > 1.0);
      this.say(late.length ? `スタート！ ${late.map((r) => r.name).join('、')}は出遅れた！` : 'きれいなスタートを切りました！');
    });
    if (lead.pos > d * 0.25) this.once('q1', () => {
      const tail = player ? `、${player.name}は${rankOf(player)}番手` : '';
      this.say(`先頭は${lead.name}、2番手に${order[1].name}${tail}`);
    });
    if (d - lead.pos < 1000 && d > 1400) this.once('1000', () => this.say(`残り1000m、${lead.name}のリードは${lengths(lead, order[1])}馬身`));
    if (d - lead.pos < this.course.straight) this.once('stretch', () => this.say(`4コーナーを回って最後の直線！ 先頭は${lead.name}！`));
    if (d - lead.pos < 400) this.once('400', () => {
      const charger = order.slice(1, 6).sort((a, b) => b.v - a.v)[0];
      this.say(`残り400！ ${lead.name}粘る、外から${charger.name}が迫る！`);
    });
    if (d - lead.pos < 200) this.once('200', () => this.say(`残り200！ ${lead.name}と${order[1].name}の叩き合い！`));
    if (lead.done) this.once('goal', () => this.say(`${lead.name}、1着でゴールイン！`));
  }

  finish() {
    this.finished = true;
    for (const r of this.runners) {
      if (!r.done) {
        r.done = true;
        r.finishTime = this.t + (this.race.distance - r.pos) / 15;
      }
    }
    const order = this.order();
    this.results = order.map((r, i) => {
      const prev = order[i - 1];
      const gap = prev ? (r.finishTime - prev.finishTime) * 16.5 : 0;
      return { runner: r, rank: i + 1, time: r.finishTime, margin: prev ? marginLabel(gap) : '' };
    });
  }
}
