import { rand, randInt, pick, clamp, gauss, uid, monthOf, WEEKS_PER_YEAR } from './util.js';
import {
  STAT_KEYS, grownHorse, randomDam, breedFoal, horseAge, horseClass, overallRating, makeName,
} from './horse.js';
import { applyTraining, applyRest, applyRaceAftermath } from './training.js';
import { racesForWeek, npcHorse, weatherFor } from './race-data.js';

const SAVE_KEY = 'turf-lineage-save-v1';
const BOARD_FEE = 60;
const FARM_FEE = 15;
const PRIZE_SHARE = [1, 0.4, 0.25, 0.15, 0.1];
const OWNER_SHARE = 0.8;
export const BREEDING_WEEKS = [5, 20];
export const AUCTION_WEEKS = [25, 32];
const NPC_SILK_COLORS = ['#c0392b', '#1e3a8a', '#f5c518', '#16a085', '#ffffff', '#111111', '#8e44ad', '#e67e22', '#2ecc71', '#e84393', '#0984e3', '#6d214f'];
const PATTERNS = ['plain', 'hoops', 'stripes', 'sash', 'cross', 'diamonds'];

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 消せなくても新しいゲームで上書きされるので問題ない
  }
}

export const allSires = (state, data) => [...data.sires, ...state.ownSires];

function makeMare(dam) {
  return { id: uid(), name: dam.name, stats: dam.stats, surface: dam.surface, dist: dam.dist, growth: dam.growth, coat: dam.coat, sireName: dam.sireName, bred: null, record: null };
}

export function newGame({ stableName, silks }, data) {
  const state = {
    v: 1, stableName, silks, year: 1, week: 13, money: 8000,
    horses: [], mares: [], ownSires: [], history: [], titles: [], auction: null, news: [],
  };
  state.mares.push(makeMare(randomDam(data.sires, data.names)));
  state.auction = { key: 'start', until: 20, lots: makeLots(state, data, 2, 8) };
  return state;
}

function lotPrice(h, sire) {
  const ability = STAT_KEYS.reduce((s, k) => s + h.potential[k], 0) / STAT_KEYS.length;
  const base = Math.pow(Math.max(0, ability - 55), 2) * 7 + sire.fee * 0.6 + 200;
  return clamp(Math.round((base * rand(0.8, 1.25)) / 50) * 50, 300, 30000);
}

function makeLots(state, data, age, count) {
  const sires = allSires(state, data);
  return Array.from({ length: count }, () => {
    const sire = pick(sires);
    const dam = randomDam(data.sires, data.names);
    const horse = grownHorse({ sire, dam, year: state.year, age, names: data.names });
    horse.damSire = dam.sireName;
    return { id: uid(), horse, price: lotPrice(horse, sire), sold: false };
  });
}

export function auctionOpen(state) {
  const a = state.auction;
  if (!a) return false;
  if (a.key === 'start') return state.year === 1 && state.week <= a.until;
  return a.key === `y${state.year}` && state.week >= AUCTION_WEEKS[0] && state.week <= AUCTION_WEEKS[1];
}

export function buyLot(state, lotId) {
  const lot = state.auction?.lots.find((l) => l.id === lotId);
  if (!lot || lot.sold) return '売約済みです';
  if (state.money < lot.price) return '資金が足りません';
  state.money -= lot.price;
  lot.sold = true;
  state.horses.push(lot.horse);
  return null;
}

export const breedingSeason = (state) => state.week >= BREEDING_WEEKS[0] && state.week <= BREEDING_WEEKS[1];

export function breedMare(state, data, mareId, sireId) {
  const mare = state.mares.find((m) => m.id === mareId);
  const sire = allSires(state, data).find((s) => s.id === sireId);
  if (!mare || !sire) return '見つかりません';
  if (!breedingSeason(state)) return '種付けシーズン（2〜5月）ではありません';
  if (mare.bred?.year === state.year) return '今年はもう種付け済みです';
  if (state.money < sire.fee) return '資金が足りません';
  state.money -= sire.fee;
  mare.bred = { sireId, sireName: sire.name, year: state.year };
  return null;
}

export function retireHorse(state, horseId, toBreeding) {
  const i = state.horses.findIndex((h) => h.id === horseId);
  if (i < 0) return;
  const [h] = state.horses.splice(i, 1);
  state.history.push({ name: h.name, sex: h.sex, sireName: h.sireName, record: h.record, retiredYear: state.year, coat: h.coat });
  if (toBreeding && h.sex === '牝') {
    state.mares.push({ ...makeMare({ ...h, surface: h.apt.turf >= h.apt.dirt ? 'turf' : 'dirt' }), stats: { ...h.potential }, record: h.record });
  }
  const g1 = h.record.titles.filter((t) => t.grade === 'G1').length;
  if (h.sex === '牡' && g1 > 0) {
    state.ownSires.push({
      id: `own-${h.id}`, name: h.name, line: '自家生産', fee: 300 + g1 * 400, surface: h.apt.turf >= h.apt.dirt ? 'turf' : 'dirt',
      dist: h.dist, growth: h.growth, coat: h.coat, stats: { ...h.potential }, desc: `G1を${g1}勝した自厩舎の名馬。`,
    });
    return `${h.name}は種牡馬入りしました！`;
  }
  return null;
}

export function weekRaces(state, data) {
  return racesForWeek(data, state.year, state.week);
}

function frameCounts(n) {
  if (n <= 8) return Array.from({ length: n }, () => 1);
  const counts = Array(8).fill(Math.floor(n / 8));
  for (let i = 0; i < n % 8; i += 1) counts[7 - i] += 1;
  return counts;
}

function randomSilks() {
  const main = pick(NPC_SILK_COLORS);
  let sub = pick(NPC_SILK_COLORS);
  if (sub === main) sub = '#ffffff';
  return { main, sub, pattern: pick(PATTERNS) };
}

export function buildRunners(state, data, race, entries) {
  const size = race.grade === 'G1' ? 18 : race.grade.startsWith('G') ? 16 : randInt(12, 16);
  const taken = new Set(entries.map((e) => e.horse.name));
  const pool = entries.map((e) => ({ horse: e.horse, name: e.horse.name, style: e.style, isPlayer: true, silks: state.silks }));
  while (pool.length < size) {
    const h = npcHorse(race, data.names, taken);
    taken.add(h.name);
    pool.push({ horse: h, name: h.name, style: h.style, isPlayer: false, silks: randomSilks() });
  }
  pool.sort(() => Math.random() - 0.5);
  const counts = frameCounts(pool.length);
  let n = 0;
  counts.forEach((c, f) => {
    for (let i = 0; i < c; i += 1) Object.assign(pool[n++], { frame: f + 1 });
  });
  pool.forEach((r, i) => Object.assign(r, { number: i + 1, gate: i + 1 }));
  return withOdds(pool, race);
}

// 新聞の予想にあたる人気とオッズ。調子や適性も少し加味する
function withOdds(runners, race) {
  const score = (r) => overallRating(r.horse.stats) + (r.horse.condition - 50) * 0.06
    + (race.surface === 'turf' ? r.horse.apt.turf : r.horse.apt.dirt) * 40 + gauss() * 1.5;
  const scored = runners.map((r) => ({ r, s: score(r) }));
  const total = scored.reduce((sum, x) => sum + Math.exp(x.s * 0.35), 0);
  scored.sort((a, b) => b.s - a.s).forEach((x, i) => {
    const p = Math.exp(x.s * 0.35) / total;
    x.r.popularity = i + 1;
    x.r.odds = clamp(Math.round((0.8 / p) * 10) / 10, 1.1, 999.9);
    x.r.mark = ['◎', '○', '▲', '△', '△'][i] ?? '';
  });
  return runners;
}

export function makeGround(race) {
  return weatherFor(race.month);
}

export function applyRaceResults(state, race, results) {
  const out = [];
  for (const res of results) {
    if (!res.runner.isPlayer) continue;
    const h = state.horses.find((x) => x.id === res.runner.horse.id);
    if (!h) continue;
    const prize = res.rank <= 5 ? Math.round(race.purse * PRIZE_SHARE[res.rank - 1]) : 0;
    const r = h.record;
    r.starts += 1;
    if (res.rank === 1) r.wins += 1;
    if (res.rank === 2) r.seconds += 1;
    if (res.rank === 3) r.thirds += 1;
    r.earnings += prize;
    state.money += Math.round(prize * OWNER_SHARE);
    if (res.rank === 1 && race.grade.startsWith('G')) {
      r.gradedWins += 1;
      const title = { year: state.year, name: race.name, grade: race.grade, horse: h.name };
      r.titles.push(title);
      state.titles.push(title);
    }
    r.history.push({ year: state.year, week: state.week, name: race.name, grade: race.grade, rank: res.rank, field: results.length, time: res.time });
    applyRaceAftermath(h, race);
    out.push({ horse: h, rank: res.rank, prize: Math.round(prize * OWNER_SHARE) });
  }
  return out;
}

export function runTrainingWeek(state, data) {
  const reports = [];
  for (const h of state.horses) {
    if (h.entry) continue;
    const age = horseAge(h, state.year);
    const menu = data.trainings.find((m) => m.id === h.train.menuId) ?? data.trainings[0];
    let rep;
    if (age < 1 || h.injury) rep = { ...applyRest(h, state.year), menu: h.injury ? '故障療養' : '牧場で成長中' };
    else rep = { ...applyTraining(h, menu, h.train.intensity, state.year), menu: menu.name };
    state.money -= rep.cost;
    reports.push({ horse: h, ...rep });
  }
  return reports;
}

function newYear(state, data) {
  const events = [];
  state.year += 1;
  state.week = 1;
  for (const mare of state.mares) {
    if (mare.bred?.year !== state.year - 1) continue;
    const sire = allSires(state, data).find((s) => s.id === mare.bred.sireId);
    if (!sire) continue;
    const foal = breedFoal({ sire, dam: mare, birthYear: state.year, names: data.names });
    foal.damSire = mare.sireName;
    state.horses.push(foal);
    events.push(`${mare.name}に${foal.sex === '牡' ? '牡馬' : '牝馬'}が誕生しました（父 ${sire.name}）`);
    mare.bred = null;
  }
  for (const h of [...state.horses]) {
    if (horseAge(h, state.year) >= 8) {
      const msg = retireHorse(state, h.id, h.sex === '牝' && state.mares.length < 8);
      events.push(`${h.name}は8歳になり引退しました${msg ? `。${msg}` : ''}`);
    }
  }
  return events;
}

export function endWeek(state, data) {
  const events = [];
  for (const h of state.horses) h.entry = null;
  if (state.week % 4 === 0) {
    const racing = state.horses.filter((h) => horseAge(h, state.year) >= 1).length;
    const farm = state.mares.length + state.horses.length - racing;
    const cost = racing * BOARD_FEE + farm * FARM_FEE;
    if (cost > 0) {
      state.money -= cost;
      events.push(`${monthOf(state.week)}月の預託料 ${cost.toLocaleString()}万円を支払いました`);
    }
  }
  state.week += 1;
  if (state.week > WEEKS_PER_YEAR) events.push(...newYear(state, data));
  if (state.week === AUCTION_WEEKS[0]) {
    state.auction = { key: `y${state.year}`, lots: makeLots(state, data, 1, 8) };
    events.push('1歳馬のセリ（7〜8月）が開かれています');
  }
  if (state.week === BREEDING_WEEKS[0] && state.mares.length) events.push('種付けシーズンが始まりました（5月末まで）');
  return events;
}

export function nameTaken(state) {
  return new Set(state.horses.map((h) => h.name));
}

export function renameHorse(state, horseId, name) {
  const h = state.horses.find((x) => x.id === horseId);
  const trimmed = name.trim();
  if (!h || !trimmed) return '名前を入力してください';
  if (trimmed.length > 9) return '馬名は9文字以内です';
  h.name = trimmed;
  return null;
}

export { horseClass, makeName };
