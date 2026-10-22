import { el, formatMoney } from './util.js';
import { STAT_KEYS, STAT_LABELS, GROWTH_LABELS, coatById, gradeOf, overallRating } from './horse.js';
import {
  allSires, auctionOpen, buyLot, breedMare, breedingSeason, deleteSave, BREEDING_WEEKS, AUCTION_WEEKS,
  bloodbook, breedingPlan,
} from './game.js';
import {
  openSheet, confirmSheet, toast, horseThumb, statBars, gradeBadge,
  pedigreeTable, rankChip, breedingNotes, openBreedingGuide,
} from './ui-common.js';
import { findCrosses } from './bloodline.js';

const surfaceText = (s) => ({ turf: '芝', dirt: 'ダート', both: '芝・ダ兼用' }[s]);

function sireSummary(s) {
  const best = [...STAT_KEYS].sort((a, b) => s.stats[b] - s.stats[a]).slice(0, 2).map((k) => STAT_LABELS[k]);
  return `${surfaceText(s.surface)}・${s.dist[0]}〜${s.dist[1]}m・${GROWTH_LABELS[s.growth]}・得意 ${best.join('/')}`;
}

function openPlanDetail(mare, sire, plan, book) {
  openSheet(`${sire.name} × ${mare.name}`, [
    el('p', {}, [rankChip(plan.rank), el('span', { class: 'muted small', text: ' 生まれる仔の血統表（★はクロス）' })]),
    pedigreeTable(plan.ped, book, plan.crossNames),
    breedingNotes(plan.items),
  ]);
}

function sireRow(s, mare, ctx, book, onBreed) {
  const plan = breedingPlan(ctx.state, ctx.data, mare, s, book);
  return el('div', { class: 'race-row' }, [
    el('div', {}, [
      el('b', { text: s.name }),
      el('span', { class: 'chip', text: gradeOf(overallRating(s.stats)) }),
      rankChip(plan.rank),
      el('div', { class: 'muted small', text: `${s.line}・${coatById(s.coat).name}・${sireSummary(s)}` }),
      el('div', { class: 'small', text: s.desc }),
      el('div', { class: 'tags' }, plan.items.map((it) => el('span', { class: `tag${it.tone === 'good' ? '' : ' is-down'}`, text: it.title }))),
    ]),
    el('div', { class: 'btn-col' }, [
      el('button', { class: 'btn btn-small', text: '配合診断', onclick: () => openPlanDetail(mare, s, plan, book) }),
      el('button', { class: 'btn btn-primary btn-small', text: formatMoney(s.fee), onclick: () => onBreed(s) }),
    ]),
  ]);
}

function openSirePicker(mare, ctx) {
  const { state, data, refresh } = ctx;
  const book = bloodbook(state, data);
  let close;
  const onBreed = (s) => {
    const err = breedMare(state, data, mare.id, s.id);
    if (err) return toast(err);
    close();
    toast(`${mare.name}に${s.name}を種付けしました。来年の1月に仔馬が生まれます`);
    refresh();
  };
  const rows = [...allSires(state, data)].sort((a, b) => b.fee - a.fee).map((s) => sireRow(s, mare, ctx, book, onBreed));
  close = openSheet(`${mare.name}の種付け`, [
    el('p', { class: 'muted small', text: `母の特徴：${sireSummary(mare)}。仔は父52%・母48%の割合で能力を受けつぎ、配合理論（クロス・ニックス・活力・母の実績）の補正が加わります。` }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn-small', text: '母の血統表', onclick: () => openSheet(`${mare.name}の血統`, [pedigreeTable(mare.ped, book)]) }),
      el('button', { class: 'btn btn-small', text: '配合理論の解説', onclick: () => openBreedingGuide(data) }),
    ]),
    ...rows,
  ]);
}

function mareCard(mare, ctx) {
  const { state } = ctx;
  const bredThisYear = mare.bred?.year === state.year;
  const status = bredThisYear ? `受胎：父 ${mare.bred.sireName}（来年1月に誕生）` : breedingSeason(state) ? '種付けできます' : `種付けは2〜5月（第${BREEDING_WEEKS[0]}〜${BREEDING_WEEKS[1]}週）`;
  return el('div', { class: 'horse-card' }, [
    horseThumb({ coat: mare.coat, markings: { face: 'none', socks: [false, false, false, false] } }, null),
    el('div', { class: 'horse-card-main' }, [
      el('div', { class: 'horse-card-name' }, [el('b', { text: mare.name }), el('span', { class: 'chip', text: gradeOf(overallRating(mare.stats)) })]),
      el('div', { class: 'muted small', text: `${coatById(mare.coat).name}・母父 ${mare.sireName}・${sireSummary(mare)}` }),
      el('div', { class: `plan small${bredThisYear ? ' is-race' : ''}`, text: status }),
      !bredThisYear && breedingSeason(state) ? el('button', { class: 'btn btn-primary btn-small', text: '種牡馬を選ぶ', onclick: () => openSirePicker(mare, ctx) }) : null,
    ]),
  ]);
}

function lotCard(lot, ctx, book) {
  const { state, refresh } = ctx;
  const h = lot.horse;
  const detail = () => openSheet(`${h.name}（上場馬）`, [
    el('p', { class: 'small', text: `${h.sex}・${coatById(h.coat).name}・父 ${h.sireName} ／ 母 ${h.damName}（母父 ${h.damSire}）` }),
    el('p', { class: 'small', text: `距離 ${h.dist[0]}〜${h.dist[1]}m・${GROWTH_LABELS[h.growth]}・脚質 ${h.style}` }),
    statBars(h),
    el('p', { class: 'muted small', text: '▼は相馬眼による伸びしろの見込みです（誤差あり）。' }),
    h.ped ? pedigreeTable(h.ped, book, findCrosses(h.ped, book).map((c) => c.name)) : null,
    h.breeding ? el('p', {}, [rankChip(h.breeding.rank)]) : null,
    h.breeding ? breedingNotes(h.breeding.notes) : null,
  ]);
  const buy = () => confirmSheet(`${h.name}を${formatMoney(lot.price)}で落札しますか？`, '落札する', () => {
    const err = buyLot(state, lot.id);
    toast(err ?? `${h.name}を落札しました！`);
    refresh();
  });
  return el('div', { class: `horse-card${lot.sold ? ' is-sold' : ''}` }, [
    horseThumb(h, null),
    el('div', { class: 'horse-card-main' }, [
      el('div', { class: 'horse-card-name' }, [el('b', { text: h.name }), el('span', { class: 'chip', text: `見込み ${gradeOf(overallRating(h.estimate))}` }), h.breeding ? rankChip(h.breeding.rank) : null]),
      el('div', { class: 'muted small', text: `${h.sex}・父 ${h.sireName}・${h.dist[0]}〜${h.dist[1]}m・${GROWTH_LABELS[h.growth]}` }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-small', text: '詳しく', onclick: detail }),
        lot.sold ? el('span', { class: 'badge', text: '売約済' }) : el('button', { class: 'btn btn-primary btn-small', text: formatMoney(lot.price), onclick: buy }),
      ]),
    ]),
  ]);
}

export function renderFarm(ctx) {
  const { state, data } = ctx;
  const open = auctionOpen(state);
  const book = bloodbook(state, data);
  return el('div', { class: 'page' }, [
    el('h3', { class: 'section-title', text: open ? (state.auction.key === 'start' ? '2歳トレーニングセール（開幕記念）' : '1歳馬セリ') : 'セリ' }),
    open ? el('p', { class: 'muted small', text: `資金 ${formatMoney(state.money)}。買った馬は厩舎に入ります。` }) : el('p', { class: 'muted small', text: `1歳馬のセリは毎年7〜8月（第${AUCTION_WEEKS[0]}〜${AUCTION_WEEKS[1]}週）に開かれます。` }),
    ...(open ? state.auction.lots.map((lot) => lotCard(lot, ctx, book)) : []),
    el('h3', { class: 'section-title', text: `繁殖牝馬（${state.mares.length}頭）` }),
    ...state.mares.map((m) => mareCard(m, ctx)),
    state.ownSires.length ? el('h3', { class: 'section-title', text: '自厩舎の種牡馬' }) : null,
    ...state.ownSires.map((s) => el('p', { class: 'small', text: `${s.name}（種付料 ${formatMoney(s.fee)}）${sireSummary(s)}` })),
    el('p', { class: 'muted small', text: `種牡馬は全${allSires(state, data).length}頭。G1を勝った牡馬は引退後に種牡馬になります。` }),
  ]);
}

export function renderRecords(ctx) {
  const { state, restart } = ctx;
  const reset = () => confirmSheet('セーブデータを消して最初からやり直しますか？元には戻せません。', '消して最初から', () => {
    deleteSave();
    restart();
  });
  return el('div', { class: 'page' }, [
    el('h3', { class: 'section-title', text: `重賞タイトル（${state.titles.length}）` }),
    ...(state.titles.length ? [...state.titles].reverse().map((t) => el('div', { class: 'race-row' }, [
      el('div', {}, [gradeBadge(t.grade), el('b', { text: ` ${t.name}` }), el('div', { class: 'muted small', text: `${t.year}年目・${t.horse}` })]),
    ])) : [el('p', { class: 'muted small', text: 'まだ重賞を勝っていません。' })]),
    el('h3', { class: 'section-title', text: `引退馬（${state.history.length}）` }),
    ...[...state.history].reverse().map((h) => el('p', { class: 'small', text: `${h.name}（${h.sex}・父 ${h.sireName}）${h.record.starts}戦${h.record.wins}勝・${formatMoney(h.record.earnings)}` })),
    el('h3', { class: 'section-title', text: '設定' }),
    el('button', { class: 'btn btn-ghost btn-danger', text: 'データを消して最初から', onclick: reset }),
  ]);
}
