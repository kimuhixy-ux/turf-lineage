import { rand, randInt, pick, clamp, gauss, uid, monthOf, WEEKS_PER_YEAR } from './util.js';
import {
  STAT_KEYS, COATS, GROWTH_LABELS, grownHorse, randomDam, breedFoal, horseAge, horseClass, overallRating, makeName,
} from './horse.js';
import { applyTraining, applyRest, applyRaceAftermath, chooseAutoTraining, AUTO_MENU_ID, INTENSITY } from './training.js';
import { createBloodbook, diagnose, breedingRecord, joinPed } from './bloodline.js';
import { racesForWeek, npcHorse, weatherFor, ageOk } from './race-data.js';
import { jockeyBonus } from './race-sim.js';

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
export const bloodbook = (state, data) => createBloodbook(data, state.ownSires);

function makeMare(dam) {
  return { id: uid(), name: dam.name, stats: dam.stats, surface: dam.surface, dist: dam.dist, growth: dam.growth, coat: dam.coat, sireName: dam.sireName, ped: dam.ped ?? null, bred: null, record: null };
}

// 架空の繁殖牝馬に、父・母父から3代分の血統表を付ける
function pedigreedDam(data, book) {
  const dam = randomDam(data.sires, data.names);
  dam.ped = book.mareNode(dam.name, dam.sireName, book.mareNode(dam.damName, dam.damSireName)).ped;
  return dam;
}

export function breedingPlan(state, data, mare, sire, book = bloodbook(state, data)) {
  return diagnose(book, book.stallion(sire.name), { name: mare.name, ped: mare.ped ?? [] }, mare);
}

export function newGame({ stableName, silks }, data) {
  const state = {
    v: 2, stableName, silks, year: 1, week: 13, money: 8000,
    horses: [], mares: [], ownSires: [], history: [], titles: [], auction: null, news: [],
  };
  state.mares.push(makeMare(pedigreedDam(data, bloodbook(state, data))));
  state.auction = { key: 'start', until: 20, lots: makeLots(state, data, 2, 8) };
  return state;
}

function lotPrice(h, sire) {
  const ability = STAT_KEYS.reduce((s, k) => s + h.potential[k], 0) / STAT_KEYS.length;
  const base = Math.pow(Math.max(0, ability - 55), 2) * 7 + sire.fee * 0.6 + 200;
  return clamp(Math.round((base * rand(0.8, 1.25)) / 50) * 50, 300, 30000);
}

// シンフォニアレクスと配合Sになる母を手に入れやすいよう、グランシャトー産駒の牝馬を多めに上場する
const FEATURED_FILLY_SIRE = 's02';
const FEATURED_FILLY_RATE = 0.3;

function makeLot(state, data, book, sire, age, sex) {
  const dam = pedigreedDam(data, book);
  const diag = breedingPlan(state, data, dam, sire, book);
  const horse = grownHorse({ sire, dam, year: state.year, age, names: data.names, diag, sex });
  horse.damSire = dam.sireName;
  horse.breeding = breedingRecord(diag);
  return { id: uid(), horse, price: lotPrice(horse, sire), sold: false };
}

function makeLots(state, data, age, count) {
  const sires = allSires(state, data);
  const book = bloodbook(state, data);
  const featured = sires.find((s) => s.id === FEATURED_FILLY_SIRE);
  return Array.from({ length: count }, () => {
    const isFeatured = featured && Math.random() < FEATURED_FILLY_RATE;
    return makeLot(state, data, book, isFeatured ? featured : pick(sires), age, isFeatured ? '牝' : undefined);
  });
}

// 値だけ吊り上げると平凡な馬が億になるので、良血の候補から出来のよい1頭を選んで目玉にする
const STAR_LOT_FEE = 3000;
const STAR_LOT_CANDIDATES = 6;
const STAR_LOT_PRICE = [10000, 50000];

function makeStarLot(state, data) {
  const all = allSires(state, data);
  const top = all.filter((s) => s.fee >= STAR_LOT_FEE);
  const sires = top.length ? top : all;
  const book = bloodbook(state, data);
  const candidates = Array.from({ length: STAR_LOT_CANDIDATES }, () => makeLot(state, data, book, pick(sires), 1));
  const best = candidates.reduce((a, b) => (overallRating(b.horse.potential) > overallRating(a.horse.potential) ? b : a));
  best.price = clamp(Math.round((best.price * 1.6) / 50) * 50, ...STAR_LOT_PRICE);
  return best;
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
  if (horseAge(lot.horse, state.year) === 1) lot.horse.train.menuId = AUTO_MENU_ID;
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

// 重賞を勝った牝馬だけを繁殖に上げる。レースに出ていない基礎の牝馬（record なし）はそのまま残す
export function qualifiesAsMare(h) {
  return !h.record || h.record.gradedWins > 0;
}

// 旧ルールで入った重賞未勝利の牝馬を外す。受胎中の馬は仔が生まれてから外す
export function releaseUnqualifiedMares(state) {
  const released = state.mares.filter((m) => !qualifiesAsMare(m) && !m.bred);
  state.mares = state.mares.filter((m) => !released.includes(m));
  return released.map((m) => m.name);
}

// 開き直して高値を引き直せないよう、乱数を入れず能力と重賞実績だけで値段を決める
export function marePrice(mare) {
  const ability = Math.pow(Math.max(0, overallRating(mare.stats) - 55), 2) * 5;
  const titles = (mare.record?.titles ?? []).reduce((sum, t) => sum + (t.grade === 'G1' ? 1500 : 500), 0);
  return clamp(Math.round((ability + titles + 200) / 50) * 50, 200, 30000);
}

// 受胎中に売ると払った種付け料と仔が消えてしまうので、出産まで売れないようにする
export const canSellMare = (state, mare) => mare.bred?.year !== state.year;

export function sellMare(state, mareId) {
  const mare = state.mares.find((m) => m.id === mareId);
  if (!mare) return '見つかりません';
  if (!canSellMare(state, mare)) return '受胎中は売却できません';
  state.money += marePrice(mare);
  state.mares = state.mares.filter((m) => m !== mare);
  return null;
}

export function retireHorse(state, horseId, toBreeding) {
  const i = state.horses.findIndex((h) => h.id === horseId);
  if (i < 0) return;
  const [h] = state.horses.splice(i, 1);
  state.history.push({ name: h.name, sex: h.sex, sireName: h.sireName, record: h.record, retiredYear: state.year, coat: h.coat });
  if (toBreeding && h.sex === '牝' && qualifiesAsMare(h)) {
    state.mares.push({ ...makeMare({ ...h, surface: h.apt.turf >= h.apt.dirt ? 'turf' : 'dirt' }), stats: { ...h.potential }, record: h.record });
  }
  const g1 = h.record.titles.filter((t) => t.grade === 'G1').length;
  if (h.sex === '牡' && g1 > 0) {
    state.ownSires.push({
      id: `own-${h.id}`, name: h.name, line: h.sireLine ?? '自家生産', ped: h.ped, fee: 300 + g1 * 400, surface: h.apt.turf >= h.apt.dirt ? 'turf' : 'dirt',
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

// 安いレースに名手を乗せると騎乗料で赤字になるので、おまかせは1着賞金の2%までの騎手から選ぶ
const JOCKEY_FEE_RATE = 0.02;

export const jockeyFeeLimit = (race) => race.purse * JOCKEY_FEE_RATE;
export const jockeyById = (data, id) => data.jockeys.find((j) => j.id === id) ?? null;

// 同じレースに自厩舎の馬が2頭いるとき、1人の騎手を取り合わないようにする
export function takenJockeys(state, h, raceId) {
  return new Set(state.horses.filter((o) => o !== h && o.entry?.raceId === raceId && o.entry.jockeyId).map((o) => o.entry.jockeyId));
}

export function bestJockey(data, race, style, taken = new Set()) {
  const free = data.jockeys.filter((j) => !taken.has(j.id));
  const affordable = free.filter((j) => j.fee <= jockeyFeeLimit(race));
  const pool = affordable.length ? affordable : free;
  const better = (a, b) => {
    const d = jockeyBonus(b, race, style) - jockeyBonus(a, race, style);
    return d > 1e-9 || (Math.abs(d) <= 1e-9 && b.fee < a.fee) ? b : a;
  };
  return pool.length ? pool.reduce(better) : null;
}

function assignJockeys(data, race, pool) {
  const used = new Set();
  for (const r of pool.filter((x) => x.isPlayer)) {
    r.jockey = jockeyById(data, r.horse.entry?.jockeyId) ?? bestJockey(data, race, r.style, used);
    if (r.jockey) used.add(r.jockey.id);
  }
  const rest = data.jockeys.filter((j) => !used.has(j.id)).sort(() => Math.random() - 0.5);
  pool.filter((x) => !x.isPlayer).forEach((r, i) => { r.jockey = rest[i] ?? null; });
}

// 同期の宿敵。自分の馬がいる世代ごとに1頭だけ生まれ、重賞でたびたび立ちはだかる。
// 毎回作り直すNPCと違って能力を保存しておき、何度も戦ううちに因縁が生まれるようにする
const RIVAL_BASE = [80, 83];
// 年齢ごとの強さの上下。2歳はまだ幼く、4〜5歳が全盛、6歳から衰える
const RIVAL_AGE_SHIFT = { 2: -5, 3: -1, 4: 0, 5: 0, 6: -2, 7: -4 };
const RIVAL_G23_RATE = 0.5;

function makeRival(data, birthYear, taken) {
  const center = pick([1600, 2000, 2400]);
  const surface = Math.random() < 0.8 ? 'turf' : 'dirt';
  return {
    id: `rival-${birthYear}`,
    name: makeName(data.names, taken),
    sex: Math.random() < 0.75 ? '牡' : '牝',
    birthYear,
    base: rand(...RIVAL_BASE),
    // 能力ごとの得手不得手を固定し、毎回同じ個性で現れるようにする
    offsets: Object.fromEntries(STAT_KEYS.map((k) => [k, gauss() * 4])),
    skills: { gate: rand(60, 90), calm: rand(60, 90), corner: rand(60, 90) },
    surface,
    apt: surface === 'turf' ? { turf: 1, dirt: 0.88 } : { turf: 0.88, dirt: 1 },
    dist: [center - 400, center + 400],
    style: pick(['先行', '差し']),
    coat: pick(COATS).id,
    markings: { face: pick(['star', 'stripe', 'blaze']), socks: [0, 1, 2, 3].map(() => Math.random() < 0.3) },
    silks: randomSilks(),
    record: { starts: 0, wins: 0, gradedWins: 0 },
    vs: { meets: 0, ahead: 0 },
  };
}

// 自分の馬が2歳になった世代に宿敵を用意する。新しく現れた宿敵の知らせを返す
export function ensureRivals(state, data) {
  state.rivals ??= [];
  const taken = new Set([...nameTaken(state), ...state.rivals.map((r) => r.name)]);
  const news = [];
  const years = new Set(state.horses.filter((h) => horseAge(h, state.year) >= 2).map((h) => h.birthYear));
  for (const birthYear of years) {
    if (state.rivals.some((r) => r.birthYear === birthYear)) continue;
    const r = makeRival(data, birthYear, taken);
    taken.add(r.name);
    state.rivals.push(r);
    news.push(`同期の宿敵 ${r.name}（${r.sex}・${r.surface === 'turf' ? '芝' : 'ダート'}${r.dist[0]}〜${r.dist[1]}m が得意）が現れました`);
  }
  return news;
}

function rivalAge(r, year) {
  return year - r.birthYear;
}

function rivalFits(r, race, year) {
  const age = rivalAge(r, year);
  if (!(age in RIVAL_AGE_SHIFT) || !ageOk(race.age, age)) return false;
  if (race.sex === 'mare' && r.sex !== '牝') return false;
  return race.surface === r.surface && race.distance >= r.dist[0] - 200 && race.distance <= r.dist[1] + 200;
}

// G1には必ず、G2・G3には半分の確率で出てくる。自分の馬と同じ世代の宿敵を優先する
function pickRival(state, race, entries) {
  if (!race.grade.startsWith('G')) return null;
  if (race.grade !== 'G1' && Math.random() >= RIVAL_G23_RATE) return null;
  const fits = (state.rivals ?? []).filter((r) => rivalFits(r, race, state.year));
  const sameCrop = fits.filter((r) => entries.some((e) => e.horse.birthYear === r.birthYear));
  return pick(sameCrop.length ? sameCrop : fits) ?? null;
}

function rivalHorse(r, year) {
  const shift = RIVAL_AGE_SHIFT[rivalAge(r, year)];
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, clamp(r.base + shift + r.offsets[k], 25, 99)]));
  return {
    id: r.id, name: r.name, sex: r.sex, birthYear: r.birthYear, stats, skills: r.skills, apt: r.apt, dist: r.dist,
    style: r.style, condition: rand(55, 85), coat: r.coat, markings: r.markings,
  };
}

// 宿敵が走ったレースの成績と対戦成績を記録し、結果画面に出す一言を返す
export function applyRivalResult(state, race, results) {
  const res = results.find((x) => x.runner.isRival);
  const r = res && state.rivals.find((x) => x.id === res.runner.horse.id);
  if (!r) return null;
  r.record.starts += 1;
  if (res.rank === 1) r.record.wins += 1;
  if (res.rank === 1 && race.grade.startsWith('G')) r.record.gradedWins += 1;
  const best = Math.min(...results.filter((x) => x.runner.isPlayer).map((x) => x.rank));
  const won = best < res.rank;
  r.vs.meets += 1;
  if (won) r.vs.ahead += 1;
  // 年度表彰で自分の馬と比べられるよう、宿敵にも重賞の着順を残す
  (r.history ??= []).push({ year: state.year, grade: race.grade, rank: res.rank });
  const tally = `対戦成績 ${r.vs.ahead}勝${r.vs.meets - r.vs.ahead}敗`;
  return `${won ? '⚔️ 宿敵に先着！' : '宿敵に敗れました…'} ${r.name}は${res.rank}着（${tally}）`;
}

export function buildRunners(state, data, race, entries) {
  const size = race.grade === 'G1' ? 18 : race.grade.startsWith('G') ? 16 : randInt(12, 16);
  const taken = new Set(entries.map((e) => e.horse.name));
  const pool = entries.map((e) => ({ horse: e.horse, name: e.horse.name, style: e.style, isPlayer: true, silks: state.silks }));
  const rival = pickRival(state, race, entries);
  if (rival) {
    taken.add(rival.name);
    pool.push({ horse: rivalHorse(rival, state.year), name: rival.name, style: rival.style, isPlayer: false, isRival: true, silks: rival.silks });
  }
  while (pool.length < size) {
    const h = npcHorse(race, data.names, taken);
    taken.add(h.name);
    pool.push({ horse: h, name: h.name, style: h.style, isPlayer: false, silks: randomSilks() });
  }
  assignJockeys(data, race, pool);
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

// 決まった大レースを同じ年にすべて勝つと、特別な称号と褒賞金がもらえる。最後のレースを勝った時点で判定する
export const CROWNS = [
  { title: '三冠馬', races: ['王冠賞', '東都ダービー', '菊花の頂'], bonus: 20000 },
  { title: '牝馬三冠', races: ['花冠賞', '優駿乙女賞', '乙女の冠'], bonus: 10000 },
  { title: '帝王賞春秋連覇', races: ['春の帝王賞', '秋の帝王賞'], bonus: 8000 },
  { title: '秋の古馬三冠', races: ['秋の帝王賞', 'ワールドターフカップ', '大晦グランプリ'], bonus: 20000 },
];

function checkCrown(state, h, race) {
  const won = new Set(h.record.titles.filter((t) => t.year === state.year).map((t) => t.name));
  const crown = CROWNS.find((c) => c.races.at(-1) === race.name && c.races.every((n) => won.has(n)));
  if (!crown) return null;
  state.money += crown.bonus;
  const honor = { year: state.year, title: crown.title, horse: h.name, amount: crown.bonus };
  (h.record.honors ??= []).push(`${state.year}年目${crown.title}`);
  (state.honors ??= []).push(honor);
  return honor;
}

export function applyRaceResults(state, race, results) {
  const out = [];
  for (const res of results) {
    if (!res.runner.isPlayer) continue;
    const h = state.horses.find((x) => x.id === res.runner.horse.id);
    if (!h) continue;
    const prize = res.rank <= 5 ? Math.round(race.purse * PRIZE_SHARE[res.rank - 1]) : 0;
    const r = h.record;
    let crown = null;
    r.starts += 1;
    if (res.rank === 1) r.wins += 1;
    if (res.rank === 2) r.seconds += 1;
    if (res.rank === 3) r.thirds += 1;
    r.earnings += prize;
    const fee = res.runner.jockey?.fee ?? 0;
    state.money += Math.round(prize * OWNER_SHARE) - fee;
    if (res.rank === 1 && race.grade.startsWith('G')) {
      r.gradedWins += 1;
      const title = { year: state.year, name: race.name, grade: race.grade, horse: h.name };
      r.titles.push(title);
      state.titles.push(title);
      crown = checkCrown(state, h, race);
    }
    r.history.push({ year: state.year, week: state.week, name: race.name, grade: race.grade, rank: res.rank, field: results.length, time: res.time });
    applyRaceAftermath(h, race);
    out.push({ horse: h, rank: res.rank, prize: Math.round(prize * OWNER_SHARE), jockey: res.runner.jockey, fee, crown });
  }
  return out;
}

// おまかせのときは、その週に選んだメニューと強さを名前に出して調教の参考にできるようにする
export function trainingPlan(h, data, year) {
  if (h.train.menuId === AUTO_MENU_ID) {
    const { menu, intensity } = chooseAutoTraining(h, data.trainings, year);
    const it = menu.noIntensity ? '' : `・${INTENSITY[intensity].label}`;
    return { menu, intensity, label: `おまかせ：${menu.name}${it}` };
  }
  const menu = data.trainings.find((m) => m.id === h.train.menuId) ?? data.trainings[0];
  return { menu, intensity: h.train.intensity, label: menu.name };
}

export function runTrainingWeek(state, data) {
  const reports = [];
  for (const h of state.horses) {
    if (h.entry) continue;
    const age = horseAge(h, state.year);
    let rep;
    if (age < 1 || h.injury) rep = { ...applyRest(h, state.year), menu: h.injury ? '故障療養' : '牧場で成長中' };
    else {
      const plan = trainingPlan(h, data, state.year);
      rep = { ...applyTraining(h, plan.menu, plan.intensity, state.year), menu: plan.label };
    }
    state.money -= rep.cost;
    reports.push({ horse: h, ...rep });
  }
  return reports;
}

// 年度表彰。その年の重賞の着順を点数にして部門ごとに選ぶ。宿敵も候補に入るので、賞を奪われることもある
const AWARD_POINTS = { G1: [10, 4, 2], G2: [6, 2, 1], G3: [4, 1] };
const AWARD_MIN_POINTS = 4;
const AWARDS = [
  { title: '最優秀2歳牡馬', fits: (c) => c.age === 2 && c.sex === '牡', bonus: 2000 },
  { title: '最優秀2歳牝馬', fits: (c) => c.age === 2 && c.sex === '牝', bonus: 2000 },
  { title: '最優秀3歳牡馬', fits: (c) => c.age === 3 && c.sex === '牡', bonus: 3000 },
  { title: '最優秀3歳牝馬', fits: (c) => c.age === 3 && c.sex === '牝', bonus: 3000 },
  { title: '最優秀古馬', fits: (c) => c.age >= 4, bonus: 3000 },
  // 年度代表馬だけはG1を勝っていることを条件にする
  { title: '年度代表馬', fits: (c) => c.g1Win, bonus: 5000 },
];

function awardCandidate(x, history, year, isRival) {
  const races = history.filter((r) => r.year === year);
  const points = races.reduce((sum, r) => sum + (AWARD_POINTS[r.grade]?.[r.rank - 1] ?? 0), 0);
  const g1Win = races.some((r) => r.grade === 'G1' && r.rank === 1);
  return { x, name: x.name, sex: x.sex, age: year - x.birthYear, points, g1Win, isRival };
}

function yearEndAwards(state) {
  const year = state.year;
  const pool = [
    ...state.horses.map((h) => awardCandidate(h, h.record.history, year, false)),
    ...(state.rivals ?? []).map((r) => awardCandidate(r, r.history ?? [], year, true)),
  ].filter((c) => c.points >= AWARD_MIN_POINTS);
  const events = [];
  for (const award of AWARDS) {
    const best = pool.filter(award.fits).sort((a, b) => b.points - a.points || a.isRival - b.isRival)[0];
    if (!best) continue;
    if (best.isRival) {
      events.push(`🏅 ${year}年目の${award.title}は宿敵 ${best.name}が受賞しました`);
      continue;
    }
    state.money += award.bonus;
    (best.x.record.honors ??= []).push(`${year}年目${award.title}`);
    (state.honors ??= []).push({ year, title: award.title, horse: best.name, amount: award.bonus });
    events.push(`🏅 ${best.name}が${year}年目の${award.title}に選ばれました（表彰金 ${award.bonus.toLocaleString()}万円）`);
  }
  return events;
}

function newYear(state, data) {
  const events = yearEndAwards(state);
  state.year += 1;
  state.week = 1;
  for (const mare of state.mares) {
    if (mare.bred?.year !== state.year - 1) continue;
    const sire = allSires(state, data).find((s) => s.id === mare.bred.sireId);
    if (!sire) continue;
    const diag = breedingPlan(state, data, mare, sire);
    const foal = breedFoal({ sire, dam: mare, birthYear: state.year, names: data.names, diag });
    foal.damSire = mare.sireName;
    foal.breeding = breedingRecord(diag);
    state.horses.push(foal);
    events.push(`${mare.name}に${foal.sex === '牡' ? '牡馬' : '牝馬'}が誕生しました（父 ${sire.name}・${GROWTH_LABELS[foal.growth]}）`);
    mare.bred = null;
  }
  for (const name of releaseUnqualifiedMares(state)) events.push(`${name}は重賞未勝利のため繁殖牝馬の登録を外れました`);
  const yearlings = state.horses.filter((h) => horseAge(h, state.year) === 1);
  for (const h of yearlings) h.train.menuId = AUTO_MENU_ID;
  if (yearlings.length) events.push(`${yearlings.map((h) => h.name).join('、')}が1歳になり、調教をおまかせで始めました`);
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
  events.push(...ensureRivals(state, data));
  if (state.week === AUCTION_WEEKS[0]) {
    state.auction = { key: `y${state.year}`, lots: [...makeLots(state, data, 1, 7), makeStarLot(state, data)] };
    events.push('1歳馬のセリ（7〜8月）が開かれています');
  }
  if (state.week === BREEDING_WEEKS[0] && state.mares.length) events.push('種付けシーズンが始まりました（5月末まで）');
  return events;
}

// 配合理論を入れる前（v1）のセーブには血統表がないので、分かる範囲で作り直す
export function migrateState(state, data) {
  if ((state.v ?? 1) >= 2) return state;
  const book = bloodbook(state, data);
  for (const h of state.horses) {
    if (h.ped) continue;
    h.ped = joinPed(book.stallion(h.sireName), book.mareNode(h.damName, h.damSire ?? pick(data.sires).name));
    h.sireLine = allSires(state, data).find((x) => x.name === h.sireName)?.line;
  }
  for (const m of state.mares) {
    if (!m.ped) m.ped = book.mareNode(m.name, m.sireName, book.mareNode(makeName(data.names), pick(data.sires).name)).ped;
  }
  state.v = 2;
  return state;
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
