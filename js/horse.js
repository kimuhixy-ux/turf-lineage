import { rand, randInt, pick, clamp, gauss, uid, weighted } from './util.js';

export const STAT_KEYS = ['speed', 'stamina', 'power', 'burst', 'guts', 'wisdom', 'flex'];
export const STAT_LABELS = {
  speed: 'スピード', stamina: 'スタミナ', power: 'パワー', burst: '瞬発力',
  guts: '根性', wisdom: '賢さ', flex: '柔軟性',
};
export const SKILL_KEYS = ['gate', 'calm', 'corner'];
export const SKILL_LABELS = { gate: 'ゲート', calm: '折り合い', corner: 'コーナー' };
export const STYLES = ['逃げ', '先行', '差し', '追込'];
export const GROWTH_LABELS = { early: '早熟', normal: '普通', late: '晩成' };

export const COATS = [
  { id: 'bay', name: '鹿毛', body: '#8a5230', shade: '#4a2814', mane: '#1b120d', points: '#1b120d', weight: 30 },
  { id: 'darkbay', name: '黒鹿毛', body: '#4f2f1d', shade: '#24150c', mane: '#100a07', points: '#100a07', weight: 18 },
  { id: 'chestnut', name: '栗毛', body: '#b8652e', shade: '#6a3514', mane: '#d29a5a', points: '#a05628', weight: 22 },
  { id: 'liver', name: '栃栗毛', body: '#74401f', shade: '#3c1d0d', mane: '#c09a6a', points: '#5e3017', weight: 6 },
  { id: 'brown', name: '青鹿毛', body: '#30231c', shade: '#140e0b', mane: '#0b0807', points: '#0b0807', weight: 10 },
  { id: 'black', name: '青毛', body: '#1f1d22', shade: '#09080a', mane: '#060506', points: '#060506', weight: 4 },
  { id: 'grey', name: '芦毛', body: '#bdbcb8', shade: '#7d7b78', mane: '#e8e6e1', points: '#5b5956', weight: 9, dapple: true },
  { id: 'white', name: '白毛', body: '#f4f2ed', shade: '#c9c5bd', mane: '#fbfaf7', points: '#d8d3ca', weight: 1 },
];
export const coatById = (id) => COATS.find((c) => c.id === id) ?? COATS[0];

// 年齢ごとの「伸びやすさ」と「到達できる上限の割合」。早熟・晩成の差はここで表す
const GROWTH_GAIN = {
  early: [0, 0.9, 1.2, 1.0, 0.6, 0.35, 0.2, 0.1],
  normal: [0, 0.7, 0.95, 1.15, 1.0, 0.7, 0.4, 0.2],
  late: [0, 0.55, 0.75, 0.95, 1.15, 1.1, 0.7, 0.4],
};
const MATURITY = {
  early: [0.35, 0.6, 0.86, 1, 1, 1, 1, 1],
  normal: [0.3, 0.5, 0.76, 0.93, 1, 1, 1, 1],
  late: [0.28, 0.45, 0.66, 0.83, 0.96, 1, 1, 1],
};
const DECLINE_AGE = { early: 5, normal: 6, late: 7 };

export const horseAge = (h, year) => year - h.birthYear;
const ageIndex = (h, year) => clamp(horseAge(h, year), 0, 7);
export const growthGain = (h, year) => GROWTH_GAIN[h.growth][ageIndex(h, year)];
export const statCeiling = (h, key, year) => h.potential[key] * MATURITY[h.growth][ageIndex(h, year)];
export const isDeclining = (h, year) => horseAge(h, year) >= DECLINE_AGE[h.growth];

export function gradeOf(v) {
  const table = [[95, 'S+'], [88, 'S'], [80, 'A'], [72, 'B'], [64, 'C'], [56, 'D'], [48, 'E'], [40, 'F']];
  for (const [min, label] of table) if (v >= min) return label;
  return 'G';
}

export function horseClass(h) {
  const r = h.record;
  if (r.starts === 0) return '新馬';
  if (r.wins === 0) return '未勝利';
  if (r.wins >= 4 || r.gradedWins > 0) return 'OP';
  return ['', '1勝', '2勝', '3勝'][r.wins];
}

// 血統表の祖先と同じ名前の馬が生まれると、別の馬なのにクロス扱いになるので避ける
const RESERVED_NAMES = new Set();
export const reserveNames = (list) => list.forEach((n) => n && RESERVED_NAMES.add(n));

export function makeName(names, taken = new Set()) {
  for (let i = 0; i < 40; i += 1) {
    const name = pick(names.head) + pick(names.tail);
    // 競走馬名は9文字以内という実際のルールに合わせる
    if (name.length <= 9 && !taken.has(name) && !RESERVED_NAMES.has(name)) return name;
  }
  return pick(names.head) + pick(names.tail);
}

function surfaceOf(parent) {
  if (parent.surface === 'dirt') return { turf: 0.86, dirt: 1 };
  if (parent.surface === 'both') return { turf: 0.96, dirt: 0.96 };
  return { turf: 1, dirt: 0.85 };
}

function inheritCoat(sire, dam) {
  if ((sire.coat === 'grey' || dam.coat === 'grey') && Math.random() < 0.5) return 'grey';
  const r = Math.random();
  if (r < 0.48) return sire.coat;
  if (r < 0.88) return dam.coat;
  return weighted(COATS, (c) => c.weight).id;
}

function randomMarkings() {
  const face = weighted([['none', 40], ['star', 25], ['stripe', 20], ['blaze', 15]], (m) => m[1])[0];
  const socks = [0, 1, 2, 3].map(() => Math.random() < 0.18);
  return { face, socks };
}

function inheritDistance(sire, dam) {
  const center = ((sire.dist[0] + sire.dist[1]) / 2) * 0.6 + ((dam.dist[0] + dam.dist[1]) / 2) * 0.4 + gauss() * 220;
  const width = randInt(2, 4) * 200;
  const min = clamp(Math.round((center - width / 2) / 200) * 200, 1000, 2800);
  return [min, clamp(min + width, 1200, 3600)];
}

function chooseStyle(stats) {
  const lean = (stats.burst - stats.speed) * 0.08 + (stats.wisdom - 60) * 0.01 + gauss() * 1.1;
  if (lean < -1.1) return '逃げ';
  if (lean < 0.1) return '先行';
  if (lean < 1.2) return '差し';
  return '追込';
}

// 父の型60%・母の型25%・残り15%は3つの型から均等
const GROWTH_FROM_SIRE = 0.6;
const GROWTH_FROM_DAM = 0.25;
const GROWTH_TYPES = ['early', 'normal', 'late'];

function inheritGrowth(sire, dam) {
  const r = Math.random();
  if (r < GROWTH_FROM_SIRE) return sire.growth;
  if (r < GROWTH_FROM_SIRE + GROWTH_FROM_DAM) return dam.growth;
  return pick(GROWTH_TYPES);
}

// 種付け前に産駒の成長型の見込みを見せるため、inheritGrowth と同じ割合で確率を出す
export function growthOdds(sire, dam) {
  const rest = (1 - GROWTH_FROM_SIRE - GROWTH_FROM_DAM) / GROWTH_TYPES.length;
  const odds = Object.fromEntries(GROWTH_TYPES.map((g) => [g, rest]));
  odds[sire.growth] += GROWTH_FROM_SIRE;
  odds[dam.growth] += GROWTH_FROM_DAM;
  return odds;
}

// 父と母（どちらも stats / dist / surface / growth / coat を持つ）から仔を作る
// diag は配合診断の結果。補正値と能力のブレ幅（sd）をここで反映する
export function breedFoal({ sire, dam, birthYear, names, sex, diag }) {
  const bonus = Math.random() < 0.06 ? rand(5, 10) : rand(-3, 3);
  const sd = diag?.sd ?? 1;
  const potential = {};
  for (const k of STAT_KEYS) {
    const theory = diag?.bonus[k] ?? 0;
    potential[k] = clamp(sire.stats[k] * 0.52 + dam.stats[k] * 0.48 + gauss() * 6 * sd + bonus - 4 + theory, 30, 100);
  }
  const s = surfaceOf(sire);
  const d = surfaceOf(dam);
  const apt = {
    turf: clamp((s.turf + d.turf) / 2 + gauss() * 0.04, 0.8, 1),
    dirt: clamp((s.dirt + d.dirt) / 2 + gauss() * 0.04, 0.8, 1),
  };
  return newHorse({
    sex: sex ?? (Math.random() < 0.5 ? '牡' : '牝'),
    birthYear, potential, apt,
    dist: inheritDistance(sire, dam),
    growth: inheritGrowth(sire, dam),
    coat: inheritCoat(sire, dam),
    sireId: sire.id, sireName: sire.name, sireLine: sire.line, damName: dam.name,
    ped: diag?.ped ?? null,
    name: makeName(names),
  });
}

function newHorse(base) {
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = base.potential[k] * MATURITY[base.growth][0] * rand(0.92, 1.05);
  const skills = { gate: rand(15, 40), calm: rand(15, 45), corner: rand(15, 40) };
  // 見込み値には誤差を入れ、セリや育成で「読み」の楽しさを残す
  const estimate = {};
  for (const k of STAT_KEYS) estimate[k] = clamp(base.potential[k] + gauss() * 5, 30, 100);
  return {
    id: uid(), ...base, stats, skills, estimate,
    style: chooseStyle(base.potential),
    markings: randomMarkings(),
    condition: randInt(45, 70), fatigue: 0, injury: null,
    weight: randInt(440, 500),
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, gradedWins: 0, titles: [], history: [] },
    train: { menuId: 'wood', intensity: 'normal' },
    entry: null,
  };
}

// セリに出てくる馬の母は架空の繁殖牝馬として作る
export function randomDam(sires, names) {
  const sire = pick(sires);
  const level = rand(58, 82);
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = clamp(level + gauss() * 7, 40, 92);
  const surface = weighted(['turf', 'dirt', 'both'], (x) => ({ turf: 6, dirt: 3, both: 2 }[x]));
  const start = randInt(5, 11) * 200;
  return {
    name: makeName(names), stats, surface,
    dist: [start, start + randInt(2, 4) * 200],
    growth: pick(['early', 'normal', 'late']),
    coat: weighted(COATS, (c) => c.weight).id,
    sireName: sire.name, level,
    damName: makeName(names),
    damSireName: pick(sires.filter((x) => x.id !== sire.id)).name,
  };
}

// 年齢 age の時点まで育った状態で馬を作る（セリ用）
export function grownHorse({ sire, dam, year, age, names, diag, sex }) {
  const h = breedFoal({ sire, dam, birthYear: year - age, names, diag, sex });
  for (const k of STAT_KEYS) h.stats[k] = statCeiling(h, k, year) * rand(0.78, 0.9);
  return h;
}

export const RATING_WEIGHTS = { speed: 0.24, stamina: 0.14, power: 0.14, burst: 0.18, guts: 0.1, wisdom: 0.1, flex: 0.1 };

export function overallRating(stats) {
  return STAT_KEYS.reduce((sum, k) => sum + stats[k] * RATING_WEIGHTS[k], 0);
}

export function conditionLabel(c) {
  if (c >= 85) return { text: '絶好調', tone: 'best' };
  if (c >= 65) return { text: '好調', tone: 'good' };
  if (c >= 40) return { text: '普通', tone: 'normal' };
  if (c >= 20) return { text: '不調', tone: 'bad' };
  return { text: '絶不調', tone: 'worst' };
}
