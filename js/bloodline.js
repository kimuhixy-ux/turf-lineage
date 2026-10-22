import { clamp } from './util.js';
import { STAT_KEYS, reserveNames } from './horse.js';

// 血統表はヒープ順の配列で持つ。k番の馬の父は 2k、母は 2k+1。2〜31番で4代分になる
export const PED_SIZE = 32;
const genOf = (k) => 31 - Math.clz32(k);
const isSireSide = (k) => (k >> (genOf(k) - 1)) === 2;
export const isMaleSlot = (k) => k % 2 === 0;
const MALE_SLOTS = [2, 4, 6, 8, 10, 12, 14];
const BONUS_MIN = -10;
const BONUS_MAX = 8;

// 父と母の血統表をつなげて仔の血統表を作る（5代目以降は切り捨てる）
export function joinPed(sire, dam) {
  const ped = Array(PED_SIZE).fill('');
  ped[2] = sire.name ?? '';
  ped[3] = dam.name ?? '';
  for (let k = 2; k < 16; k += 1) {
    const g = genOf(k);
    if (sire.ped?.[k]) ped[k + (1 << g)] = sire.ped[k];
    if (dam.ped?.[k]) ped[k + (1 << (g + 1))] = dam.ped[k];
  }
  return ped;
}

// 記録のない昔の牝馬にも、毎回同じ名前が付くよう文字列から名前を決める
function fillerName(seed, names) {
  let h = 7;
  for (const ch of seed) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0;
  return names.head[h % names.head.length] + names.tail[(h >>> 8) % names.tail.length];
}

export function createBloodbook(data, ownSires = []) {
  const { lines, ancestors, pedigrees, nicks } = data.bloodlines;
  const recs = new Map(ancestors.map((a) => [a.name, a]));
  for (const s of data.sires) recs.set(s.name, { ...pedigrees[s.id], name: s.name, line: s.line });
  reserveNames([...recs.values()].flatMap((r) => [r.name, r.dam]));
  const ownLines = new Map(ownSires.map((s) => [s.name, s.line]));
  const nodes = new Map(ownSires.map((s) => [s.name, { name: s.name, ped: s.ped ?? [] }]));
  const stallion = (name) => {
    if (!nodes.has(name)) {
      const r = recs.get(name);
      nodes.set(name, { name, ped: r?.sire ? joinPed(stallion(r.sire), mareNode(r.dam, r.damSire)) : [] });
    }
    return nodes.get(name);
  };
  // dam を渡さないときは、母の名前だけ作って血統をそこで止める
  const mareNode = (name, sireName, dam = null) => {
    if (!sireName) return { name, ped: [] };
    return { name, ped: joinPed(stallion(sireName), dam ?? { name: fillerName(name, data.names), ped: [] }) };
  };
  return {
    stallion,
    mareNode,
    nicks,
    lineOf: (name) => ownLines.get(name) ?? recs.get(name)?.line ?? '',
    isFounder: (name) => Boolean(recs.get(name) && !recs.get(name).sire),
    traitsOf: (line) => lines.find((l) => l.name === line)?.traits ?? [],
  };
}

function rawCrosses(ped, book) {
  const seen = new Map();
  for (let k = 2; k < PED_SIZE; k += 1) {
    const name = ped[k];
    if (!name || book.isFounder(name)) continue;
    const e = seen.get(name) ?? { name, male: isMaleSlot(k), sire: [], dam: [], slots: [] };
    (isSireSide(k) ? e.sire : e.dam).push(genOf(k));
    e.slots.push(k);
    seen.set(name, e);
  }
  return [...seen.values()].filter((e) => e.sire.length && e.dam.length);
}

const isUnder = (k, top) => {
  for (let x = k; x >= top; x >>= 1) if (x === top) return true;
  return false;
};

// クロスした馬の祖先は自動的に重なるので、それより上の世代は数えない
export function findCrosses(ped, book) {
  const list = rawCrosses(ped, book).map((e) => ({
    ...e, pct: [...e.sire, ...e.dam].reduce((s, g) => s + 100 / 2 ** g, 0),
  })).sort((a, b) => Math.min(...a.slots) - Math.min(...b.slots));
  const kept = [];
  for (const c of list) {
    const implied = c.slots.every((k) => kept.some((p) => p.slots.some((top) => k !== top && isUnder(k, top))));
    if (!implied) kept.push(c);
  }
  return kept.sort((a, b) => b.pct - a.pct);
}

const addTo = (keys, amount, extra = {}) => {
  const bonus = { ...extra };
  for (const k of keys) bonus[k] = (bonus[k] ?? 0) + amount;
  return bonus;
};
const pctText = (pct) => `${Number(pct.toFixed(2))}%`;

function crossEffect(c, book) {
  const gens = `${c.sire.join('・')}×${c.dam.join('・')}`;
  const label = `${c.name} ${gens}（${pctText(c.pct)}）`;
  const traits = c.male ? book.traitsOf(book.lineOf(c.name)) : ['flex', 'wisdom'];
  const who = c.male ? `${book.lineOf(c.name) || 'この馬'}の長所` : '体質';
  const near = Math.min(...c.sire, ...c.dam);
  // 2×4（31.25%）までは実際の生産でも使われるので、危険扱いは 1×n と 2×3 以上に限る
  if (near === 1 || c.pct >= 37.5) {
    return { tone: 'bad', title: '危険な近親交配', label, text: '血が濃すぎて体質が弱くなります。柔軟性・根性・パワーが大きく落ち、能力のブレも大きくなります。', bonus: { flex: -9, guts: -6, power: -3 }, sd: 1.8, danger: true };
  }
  if (c.pct >= 25) {
    return { tone: 'warn', title: '強い近親', label, text: `${who}が強く出る一方、柔軟性が落ち、当たり外れが大きくなります。`, bonus: addTo(traits, 3, { flex: -4 }), sd: 1.35 };
  }
  if (c.pct >= 18) {
    return { tone: 'good', title: c.male ? '奇跡の血量' : '牝馬クロス（奇跡の血量）', label, text: `理想とされる18.75%のクロス。${who}が大きく伸び、瞬発力も増します。`, bonus: addTo(traits, 4, { burst: 2 }) };
  }
  return { tone: 'good', title: c.male ? 'ほどよいクロス' : '牝馬クロス', label, text: `${who}が少し伸びます。`, bonus: addTo(traits, 2) };
}

function nickEffect(ped, book) {
  const s = book.lineOf(ped[2]);
  const d = book.lineOf(ped[6]);
  if (!s || !d || s === d) return null;
  const n = book.nicks.find((x) => x.sire === s && x.damSire === d);
  if (!n) return null;
  const amount = { '◎': 4, '○': 2, '×': -3 }[n.grade];
  return { tone: amount > 0 ? 'good' : 'bad', title: `ニックス${n.grade}`, label: `父 ${s} × 母父 ${d}`, text: n.note, bonus: addTo(n.stats, amount) };
}

function vigorEffect(ped, book) {
  const lines = MALE_SLOTS.map((k) => book.lineOf(ped[k])).filter(Boolean);
  const kinds = new Set(lines);
  if (kinds.size >= 5) return { tone: 'good', title: '活力◎（全系統の血）', label: '3代以内に5系統すべて', text: '異なる血が集まり、丈夫で根性のある仔になります。', bonus: { guts: 3, flex: 3 } };
  if (kinds.size === 4) return { tone: 'good', title: '活力○', label: '3代以内に4系統', text: '血がほどよくばらけ、体質が丈夫になります。', bonus: { guts: 2, flex: 2 } };
  if (kinds.size === 0 || kinds.size > 2) return null;
  const main = [...kinds].sort((a, b) => lines.filter((l) => l === b).length - lines.filter((l) => l === a).length)[0];
  return { tone: 'warn', title: '系統が濃い', label: `3代以内が${[...kinds].join('・')}だけ`, text: `${main}の長所は濃くなりますが、体が硬くなりがちです。`, bonus: addTo(book.traitsOf(main), 2, { flex: -3 }) };
}

function damEffect(dam) {
  const titles = dam?.record?.titles ?? [];
  if (!titles.length) return null;
  const g1 = titles.some((t) => t.grade === 'G1');
  const amount = g1 ? 2 : 1;
  return { tone: 'good', title: g1 ? '名牝の仔' : '重賞馬の仔', label: `母 ${dam.name}（重賞${titles.length}勝）`, text: '母の底力を受けつぎ、全体に能力が上がります。', bonus: addTo(STAT_KEYS, amount) };
}

function rankOf(score, danger) {
  if (danger) return 'D';
  if (score >= 16) return 'S';
  if (score >= 10) return 'A';
  if (score >= 5) return 'B';
  if (score >= 0) return 'C';
  return 'D';
}

// 父と母（{name, ped}）から配合を診断し、仔の能力に足す補正と説明を返す
export function diagnose(book, sireNode, damNode, dam) {
  const ped = joinPed(sireNode, damNode);
  const crosses = findCrosses(ped, book);
  const items = [...crosses.map((c) => crossEffect(c, book)), nickEffect(ped, book), vigorEffect(ped, book), damEffect(dam)].filter(Boolean);
  const bonus = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  let sd = 1;
  for (const it of items) {
    for (const [k, v] of Object.entries(it.bonus)) bonus[k] += v;
    sd = Math.max(sd, it.sd ?? 1);
  }
  for (const k of STAT_KEYS) bonus[k] = clamp(bonus[k], BONUS_MIN, BONUS_MAX);
  const score = STAT_KEYS.reduce((s, k) => s + bonus[k], 0);
  const rank = rankOf(score, items.some((it) => it.danger));
  return { ped, items, bonus, sd, rank, crossNames: crosses.map((c) => c.name) };
}

// 仔に残すのは画面表示に使う分だけ（セーブデータを小さく保つため）
export const breedingRecord = (diag) => ({
  rank: diag.rank,
  notes: diag.items.map(({ tone, title, label, text }) => ({ tone, title, label, text })),
});
