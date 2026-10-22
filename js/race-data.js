import { rand, pick, clamp, gauss, seededRandom, weighted, monthOf, weekInMonth } from './util.js';
import { STAT_KEYS, STYLES, COATS, horseAge, horseClass, makeName } from './horse.js';

// 直線の長さと1周の長さ（m）。実在の競馬場の数値に近づけている
export const COURSES = {
  東京: { straight: 525, lap: 2083, dir: '左' },
  中山: { straight: 310, lap: 1840, dir: '右' },
  阪神: { straight: 473, lap: 2089, dir: '右' },
  京都: { straight: 404, lap: 1894, dir: '右' },
  中京: { straight: 412, lap: 1705, dir: '左' },
  新潟: { straight: 659, lap: 2223, dir: '左' },
  札幌: { straight: 266, lap: 1640, dir: '右' },
  函館: { straight: 262, lap: 1626, dir: '右' },
  福島: { straight: 292, lap: 1600, dir: '右' },
  小倉: { straight: 293, lap: 1615, dir: '右' },
};

const MONTH_COURSES = [
  ['中山', '京都'], ['東京', '京都'], ['中山', '阪神'], ['中山', '阪神'], ['東京', '京都'], ['東京', '阪神'],
  ['福島', '中京', '函館'], ['新潟', '札幌', '小倉'], ['中山', '阪神'], ['東京', '京都'], ['東京', '京都'], ['中山', '阪神'],
];

export const GRADE_ORDER = ['G1', 'G2', 'G3', 'OP', '3勝', '2勝', '1勝', '未勝利', '新馬'];
const LEVEL = { 新馬: 41, 未勝利: 45, '1勝': 53, '2勝': 59, '3勝': 64, OP: 67, G3: 70, G2: 73, G1: 77 };
const PURSE = { 新馬: 700, 未勝利: 550, '1勝': 1000, '2勝': 1500, '3勝': 1800, OP: 2400 };
const OP_NAMES = ['オーロラ', 'カトレア', 'ジャスミン', 'ペガサス', 'アンドロメダ', 'シリウス', 'ポラリス', 'ベガ', 'アルタイル', 'カノープス', 'リゲル', 'スピカ'];

function classRaceSpecs(month) {
  const specs = [];
  if (month >= 6) specs.push(['新馬', '2'], ['新馬', '2']);
  if (month <= 3) specs.push(['新馬', '3']);
  if (month >= 7) specs.push(['未勝利', '2'], ['未勝利', '2']);
  if (month <= 9) specs.push(['未勝利', '3'], ['未勝利', '3']);
  if (month >= 8) specs.push(['1勝', '2']);
  specs.push(['1勝', '3+'], ['1勝', '3+'], ['2勝', '3+'], ['3勝', '3+'], ['OP', '3+']);
  return specs;
}

function makeClassRace(spec, index, year, week, rng) {
  const [grade, age] = spec;
  const month = monthOf(week);
  const courses = MONTH_COURSES[month - 1];
  const course = courses[Math.floor(rng() * courses.length)];
  const surface = rng() < 0.62 ? 'turf' : 'dirt';
  const dists = surface === 'turf' ? [1200, 1400, 1600, 1800, 2000, 2200, 2400] : [1200, 1400, 1700, 1800, 2100];
  const distance = dists[Math.floor(rng() * dists.length)];
  const label = grade === 'OP' ? `${OP_NAMES[(week + index) % OP_NAMES.length]}ステークス` : `${age === '2' ? '2歳' : age === '3' ? '3歳' : '3歳以上'}${grade}`;
  return {
    id: `c-${year}-${week}-${index}`, name: label, grade, surface, distance, course, age,
    sex: 'any', purse: PURSE[grade], month, wk: weekInMonth(week), year, week,
  };
}

export function racesForWeek(data, year, week) {
  const month = monthOf(week);
  const wk = weekInMonth(week);
  const graded = data.races
    .filter((r) => r.month === month && r.wk === wk)
    .map((r) => ({ ...r, id: `${r.id}-${year}`, baseId: r.id, year, week }));
  const rng = seededRandom(year * 1000 + week);
  const generated = classRaceSpecs(month).map((spec, i) => makeClassRace(spec, i, year, week, rng));
  return [...graded, ...generated];
}

function ageOk(cond, age) {
  if (cond === '2') return age === 2;
  if (cond === '3') return age === 3;
  if (cond === '3+') return age >= 3;
  return age >= 4;
}

// 出走できない理由を返す（出られるなら null）。画面にそのまま表示する
export function entryBlocker(h, race, year) {
  const age = horseAge(h, year);
  if (age < 2) return 'まだデビュー前です';
  if (h.injury) return '故障で休養中です';
  if (!ageOk(race.age, age)) return '年齢条件が合いません';
  if (race.sex === 'mare' && h.sex !== '牝') return '牝馬限定戦です';
  const cls = horseClass(h);
  const r = h.record;
  if (['新馬', '未勝利', '1勝', '2勝', '3勝'].includes(race.grade)) {
    // 実際の競馬と同じく、4歳以上の未勝利馬は1勝クラスに挑戦できる
    if (cls === '未勝利' && age >= 4 && race.grade === '1勝') return null;
    return race.grade === cls ? null : `${cls}クラスの馬は出られません`;
  }
  if (r.wins === 0) return '1勝以上が必要です';
  if (race.grade === 'G1' && age >= 3 && r.earnings < 1500 && r.gradedWins === 0) return '賞金が足りません（1500万円以上 or 重賞勝ち）';
  return null;
}

export function weatherFor(month) {
  const rainy = [6, 7, 9].includes(month) ? 0.35 : 0.15;
  const r = Math.random();
  if (r < rainy * 0.3) return { weather: '雨', ground: '不良', level: 3 };
  if (r < rainy * 0.65) return { weather: '雨', ground: '重', level: 2 };
  if (r < rainy) return { weather: '曇', ground: '稍重', level: 1 };
  return { weather: Math.random() < 0.7 ? '晴' : '曇', ground: '良', level: 0 };
}

export function raceLevel(race) {
  let level = LEVEL[race.grade];
  if (race.age === '2') level -= race.month >= 10 ? 4 : 7;
  if (race.age === '3' && race.month <= 6) level -= 3;
  return level;
}

export function npcHorse(race, names, taken) {
  const level = raceLevel(race) + gauss() * 3.5;
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = clamp(level + gauss() * 6, 25, 99);
  const center = race.distance + gauss() * 300;
  const half = pick([200, 300, 400]);
  const onSurface = rand(0.94, 1);
  return {
    id: `npc-${Math.random().toString(36).slice(2, 8)}`,
    name: makeName(names, taken),
    sex: race.sex === 'mare' ? '牝' : (Math.random() < 0.75 ? '牡' : '牝'),
    stats,
    skills: { gate: rand(40, 85), calm: rand(40, 85), corner: rand(40, 85) },
    apt: race.surface === 'turf' ? { turf: onSurface, dirt: 0.88 } : { turf: 0.88, dirt: onSurface },
    dist: [center - half, center + half],
    style: weighted(STYLES, (s) => ({ 逃げ: 1.2, 先行: 3, 差し: 3, 追込: 1.6 }[s])),
    condition: rand(35, 85),
    coat: weighted(COATS, (c) => c.weight).id,
    markings: { face: pick(['none', 'star', 'stripe', 'blaze']), socks: [0, 1, 2, 3].map(() => Math.random() < 0.15) },
  };
}
