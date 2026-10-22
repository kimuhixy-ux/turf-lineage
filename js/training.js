import { rand, randInt, pick, clamp, gauss } from './util.js';
import { STAT_KEYS, SKILL_KEYS, growthGain, statCeiling, isDeclining } from './horse.js';

export const INTENSITY = {
  easy: { label: '馬なり', gain: 0.6, fatigue: 0.55, risk: 0.4 },
  normal: { label: '強め', gain: 1, fatigue: 1, risk: 1 },
  hard: { label: '一杯', gain: 1.45, fatigue: 1.6, risk: 2.3 },
};

const INJURIES = [
  { name: '軽い捻挫', weeks: [2, 4], severe: false },
  { name: 'ソエ', weeks: [3, 6], severe: false },
  { name: 'フレグモーネ', weeks: [2, 3], severe: false },
  { name: '骨瘤', weeks: [4, 8], severe: false },
  { name: '屈腱炎', weeks: [16, 30], severe: true },
  { name: '剥離骨折', weeks: [10, 18], severe: true },
];

const GAIN_SCALE = 2.6;

function gainStat(h, key, amount, year) {
  if (SKILL_KEYS.includes(key)) {
    // 技術は上限100に向かって伸び、年齢の影響は受けにくい
    h.skills[key] = clamp(h.skills[key] + amount * (1 - h.skills[key] / 110), 0, 100);
    return;
  }
  if (amount < 0) {
    h.stats[key] = Math.max(20, h.stats[key] + amount * 0.6);
    return;
  }
  const ceiling = statCeiling(h, key, year);
  const room = Math.max(0, ceiling - h.stats[key]) / Math.max(ceiling, 1);
  h.stats[key] += amount * room * GAIN_SCALE;
}

const conditionMult = (h) => 0.8 + h.condition / 250;

function rollInjury(h, menu, it) {
  const fatigueFactor = 1 + Math.max(0, h.fatigue - 50) / 15;
  const p = (menu.risk ?? 0) * it.risk * fatigueFactor * (1.25 - h.stats.flex / 200);
  if (Math.random() >= p) return null;
  const injury = Math.random() < 0.12 ? pick(INJURIES.filter((x) => x.severe)) : pick(INJURIES.filter((x) => !x.severe));
  const weeks = randInt(injury.weeks[0], injury.weeks[1]);
  if (injury.severe) for (const k of STAT_KEYS) h.stats[k] *= 0.96;
  h.injury = { name: injury.name, weeks };
  h.condition = clamp(h.condition - 20, 0, 100);
  return h.injury;
}

const snapshot = (h) => ({ ...h.stats, ...h.skills, fatigue: h.fatigue, condition: h.condition });

function diff(before, h) {
  const after = snapshot(h);
  const result = {};
  for (const key of Object.keys(after)) {
    const d = after[key] - before[key];
    if (Math.abs(d) >= 0.05) result[key] = d;
  }
  return result;
}

// 毎週かならず起こる変化（自然な成長・衰え・調子のゆらぎ）
function weeklyDrift(h, year) {
  const g = growthGain(h, year);
  for (const k of STAT_KEYS) gainStat(h, k, 0.3 * g, year);
  if (isDeclining(h, year)) {
    for (const k of ['speed', 'burst', 'flex']) h.stats[k] = Math.max(20, h.stats[k] - rand(0.03, 0.09));
  }
  const tiredPenalty = h.fatigue > 70 ? -4 : 0;
  h.condition = clamp(h.condition + gauss() * 4 + tiredPenalty + (55 - h.condition) * 0.05, 0, 100);
}

export function applyTraining(h, menu, intensityId, year) {
  const it = menu.noIntensity ? INTENSITY.normal : INTENSITY[intensityId] ?? INTENSITY.normal;
  const before = snapshot(h);
  const tired = h.fatigue > 65 ? 0.65 : 1;
  const mult = it.gain * growthGain(h, year) * conditionMult(h) * tired;
  for (const [key, base] of Object.entries(menu.gains ?? {})) {
    gainStat(h, key, base < 0 ? base : base * mult, year);
  }
  const fatigue = menu.fatigue > 0 ? menu.fatigue * it.fatigue : menu.fatigue;
  h.fatigue = clamp(h.fatigue + fatigue, 0, 100);
  h.condition = clamp(h.condition + (menu.cond ?? 0) - (intensityId === 'hard' ? 2 : 0), 0, 100);
  weeklyDrift(h, year);
  const injured = rollInjury(h, menu, it);
  return { deltas: diff(before, h), injured, cost: menu.cost ?? 0 };
}

// 故障中・当歳馬など、調教できない馬の1週間
export function applyRest(h, year) {
  const before = snapshot(h);
  h.fatigue = clamp(h.fatigue - 25, 0, 100);
  weeklyDrift(h, year);
  let healed = false;
  if (h.injury) {
    h.injury.weeks -= 1;
    if (h.injury.weeks <= 0) {
      h.injury = null;
      healed = true;
    }
  }
  return { deltas: diff(before, h), healed, cost: 0 };
}

export function applyRaceAftermath(h, race) {
  h.fatigue = clamp(h.fatigue + 22 + race.distance / 120, 0, 100);
  h.condition = clamp(h.condition + rand(-8, 4), 0, 100);
}
