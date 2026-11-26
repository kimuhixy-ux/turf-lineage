import { el, formatMoney, formatDate, monthOf, WEEKS_PER_YEAR } from './util.js';
import {
  STYLES, STAT_KEYS, STAT_LABELS, GROWTH_LABELS, horseAge, horseClass, overallRating, gradeOf, statCeiling, isDeclining,
} from './horse.js';
import { INTENSITY, AUTO_MENU_ID } from './training.js';
import { entryBlocker, racesForWeek, raceLevel } from './race-data.js';
import {
  weekRaces, retireHorse, renameHorse, bloodbook, trainingPlan, qualifiesAsMare,
  bestJockey, takenJockeys, jockeyById, jockeyFeeLimit, CROWNS,
} from './game.js';
import { jockeyBonus } from './race-sim.js';
import { findCrosses } from './bloodline.js';
import {
  openSheet, confirmSheet, toast, paddockPortrait, horseThumb, radarChart, statBars, skillBars, meter,
  segmented, conditionBadge, gradeBadge, horseSubtitle, pedigreeTable, rankChip, breedingNotes, openBreedingGuide,
} from './ui-common.js';

export function planText(h, state, data) {
  const age = horseAge(h, state.year);
  if (age < 1) return '母のそばで成長中';
  if (h.injury) return `故障療養中（${h.injury.name}・あと${h.injury.weeks}週）`;
  if (h.entry) {
    const j = jockeyById(data, h.entry.jockeyId);
    const rider = j ? `・騎手 ${j.name}${h.entry.jockeyAuto ? '（おまかせ）' : ''}` : '・騎手 おまかせ';
    return `出走：${h.entry.raceName}（${h.entry.style}${rider}）`;
  }
  const plan = trainingPlan(h, data, state.year);
  const it = plan.menu.noIntensity ? '' : `・${INTENSITY[plan.intensity].label}`;
  if (h.train.menuId === AUTO_MENU_ID) return `調教：おまかせ（今週は ${plan.menu.name}${it}）`;
  return `調教：${plan.menu.name}${it}`;
}

function horseCard(h, ctx) {
  const { state, data, go } = ctx;
  const age = horseAge(h, state.year);
  return el('button', { class: 'horse-card', onclick: () => go({ tab: 'stable', horseId: h.id }) }, [
    horseThumb(h, age >= 2 ? state.silks : null),
    el('div', { class: 'horse-card-main' }, [
      el('div', { class: 'horse-card-name' }, [
        el('b', { text: h.name }),
        age >= 2 ? el('span', { class: 'chip', text: horseClass(h) }) : null,
        age >= 1 ? conditionBadge(h.condition) : null,
      ]),
      el('div', { class: 'muted small', text: horseSubtitle(h, state.year) }),
      el('div', { class: `plan small${h.entry ? ' is-race' : ''}`, text: planText(h, state, data) }),
      age >= 1 ? meter('疲労', h.fatigue, h.fatigue > 65 ? 'bad' : h.fatigue > 40 ? 'normal' : 'good') : null,
    ]),
  ]);
}

export function renderStable(ctx) {
  const { state } = ctx;
  const racing = state.horses.filter((h) => horseAge(h, state.year) >= 2);
  const young = state.horses.filter((h) => horseAge(h, state.year) < 2);
  const entries = state.horses.filter((h) => h.entry).length;
  return el('div', { class: 'page' }, [
    el('section', { class: 'hero-card' }, [
      el('div', { class: 'muted small', text: formatDate(state.year, state.week) }),
      el('div', { class: 'hero-money', text: formatMoney(state.money) }),
      el('div', { class: 'small', text: `現役 ${racing.length}頭・育成 ${young.length}頭・今週の出走 ${entries}頭` }),
    ]),
    state.horses.length === 0 ? el('div', { class: 'empty' }, [
      el('p', { text: 'まだ馬がいません。「牧場」タブのセリで2歳馬を買ってみましょう。' }),
      el('button', { class: 'btn btn-primary', text: 'セリ会場へ', onclick: () => ctx.go({ tab: 'farm' }) }),
    ]) : null,
    racing.length ? el('h3', { class: 'section-title', text: '現役馬' }) : null,
    ...racing.map((h) => horseCard(h, ctx)),
    young.length ? el('h3', { class: 'section-title', text: '育成牧場（1歳・当歳）' }) : null,
    ...young.map((h) => horseCard(h, ctx)),
  ]);
}

function profileRows(h, state) {
  const rows = [
    ['血統', `父 ${h.sireName} ／ 母 ${h.damName}${h.damSire ? `（母父 ${h.damSire}）` : ''}`],
    ['成長型', GROWTH_LABELS[h.growth]],
    ['得意な脚質', h.style],
    ['距離適性', `${h.dist[0]}〜${h.dist[1]}m`],
    ['芝／ダート', `芝 ${aptMark(h.apt.turf)} ／ ダ ${aptMark(h.apt.dirt)}`],
    ['馬体重', `${h.weight}kg`],
    ['総合評価', gradeOf(overallRating(h.stats))],
  ];
  return el('dl', { class: 'info-grid' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

// 配合理論を入れる前に生まれた馬には診断結果がないので、血統表だけ見せる
function pedigreeSection(h, ctx) {
  if (!h.ped) return null;
  const book = bloodbook(ctx.state, ctx.data);
  return el('section', { class: 'card' }, [
    el('h3', {}, ['血統表', h.breeding ? rankChip(h.breeding.rank) : null]),
    pedigreeTable(h.ped, book, findCrosses(h.ped, book).map((c) => c.name)),
    h.breeding ? breedingNotes(h.breeding.notes) : null,
    el('button', { class: 'btn btn-small', text: '配合理論の解説', onclick: () => openBreedingGuide(ctx.data) }),
  ]);
}

const aptMark = (v) => (v >= 0.97 ? '◎' : v >= 0.92 ? '○' : v >= 0.87 ? '△' : '×');

function recordTable(h) {
  const r = h.record;
  const list = [...r.history].reverse().slice(0, 12);
  return el('div', { class: 'record' }, [
    el('p', { class: 'small', text: `${r.starts}戦${r.wins}勝［${r.wins}-${r.seconds}-${r.thirds}-${r.starts - r.wins - r.seconds - r.thirds}］ 獲得賞金 ${formatMoney(r.earnings)}` }),
    r.titles.length ? el('p', { class: 'titles small', text: `重賞：${r.titles.map((t) => `${t.name}(${t.grade})`).join('、')}` }) : null,
    r.honors?.length ? el('p', { class: 'titles small', text: `栄誉：${r.honors.join('、')}` }) : null,
    list.length ? el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, ['時期', 'レース', '着'].map((t) => el('th', { text: t })))),
      el('tbody', {}, list.map((x) => el('tr', { class: x.rank === 1 ? 'is-win' : '' }, [
        el('td', { text: formatDate(x.year, x.week).replace('年目 ', '年').replace(' 第', '/') }),
        el('td', {}, [gradeBadge(x.grade), ` ${x.name}`]),
        el('td', { text: `${x.rank}/${x.field}` }),
      ]))),
    ]) : el('p', { class: 'muted small', text: 'まだ出走していません。' }),
  ]);
}

function planButtons(h, ctx) {
  const { state, data, refresh } = ctx;
  const age = horseAge(h, state.year);
  if (age < 1 || h.injury) return el('p', { class: 'muted small', text: planText(h, state, data) });
  return el('div', { class: 'btn-col' }, [
    el('div', { class: `plan${h.entry ? ' is-race' : ''}`, text: planText(h, state, data) }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', text: '調教を選ぶ', onclick: () => openTrainingPicker(h, ctx) }),
      age >= 2 ? el('button', { class: 'btn btn-primary', text: 'レースを選ぶ', onclick: () => openRacePicker(h, ctx) }) : null,
    ]),
    h.entry ? el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', text: '騎手を選ぶ', onclick: () => openJockeyPicker(h, ctx) }),
      el('button', { class: 'btn btn-ghost', text: '出走を取り消す', onclick: () => { h.entry = null; refresh(); } }),
    ]) : null,
  ]);
}

const surfaceText = (s) => (s === 'turf' ? '芝' : 'ダート');

function jockeyRow(j, { race, style, isBest, isTaken, isCurrent }, onPick) {
  const pct = ((jockeyBonus(j, race, style) - 1) * 100).toFixed(1);
  const over = j.fee > jockeyFeeLimit(race);
  return el('div', { class: `race-row${isTaken ? ' is-blocked' : ''}` }, [
    el('div', {}, [
      el('div', {}, [el('b', { text: j.name }), isBest ? el('span', { class: 'chip', text: 'おすすめ' }) : null, isCurrent ? el('span', { class: 'chip', text: '騎乗予定' }) : null]),
      el('div', { class: 'muted small', text: `腕前 ${gradeOf(j.skill)}・得意 ${j.style}・${surfaceText(j.surface)}・騎乗料 ${formatMoney(j.fee)}` }),
      el('div', { class: `small ${Number(pct) > 0 ? 'good' : 'muted'}`, text: isTaken ? '自厩舎の別の馬に騎乗予定' : `このレースでの効果 ${Number(pct) > 0 ? '+' : ''}${pct}%${over ? '（騎乗料が賞金の2%超）' : ''}` }),
    ]),
    isTaken ? null : el('button', { class: 'btn btn-primary btn-small', text: '選ぶ', onclick: onPick }),
  ]);
}

function openJockeyPicker(h, ctx) {
  const { state, data, refresh } = ctx;
  const race = weekRaces(state, data).find((r) => r.id === h.entry.raceId);
  if (!race) return;
  const style = h.entry.style;
  const taken = takenJockeys(state, h, race.id);
  const best = bestJockey(data, race, style, taken);
  let close;
  const choose = (j, auto) => {
    Object.assign(h.entry, { jockeyId: j.id, jockeyAuto: auto });
    close();
    refresh();
    toast(`${h.name}の騎手を${j.name}にしました`);
  };
  const sorted = [...data.jockeys].sort((a, b) => jockeyBonus(b, race, style) - jockeyBonus(a, race, style) || a.fee - b.fee);
  const body = el('div', { class: 'picker' }, [
    el('p', { class: 'muted small', text: `おまかせは、騎乗料が1着賞金の2%（${formatMoney(jockeyFeeLimit(race))}）までの騎手から、${surfaceText(race.surface)}・${style}にいちばん合う騎手を選びます。騎乗料は着順に関係なく払います。` }),
    best ? el('button', { class: 'btn btn-primary btn-big', text: `おまかせ（${best.name}）`, onclick: () => choose(best, true) }) : null,
    el('h4', { text: '騎手を指名する' }),
    ...sorted.map((j) => jockeyRow(j, {
      race, style, isBest: j === best, isTaken: taken.has(j.id), isCurrent: j.id === h.entry.jockeyId,
    }, () => choose(j, false))),
  ]);
  close = openSheet(`${h.name}の騎手`, body);
}

function manageButtons(h, ctx) {
  const { state, refresh, go } = ctx;
  const rename = () => {
    const input = el('input', { class: 'input', value: h.name, maxlength: 9, 'aria-label': '新しい馬名' });
    let close;
    close = openSheet('馬名を変える', [
      input,
      el('button', { class: 'btn btn-primary', text: '決定', onclick: () => {
        const err = renameHorse(state, h.id, input.value);
        if (err) return toast(err);
        close();
        refresh();
      } }),
    ]);
  };
  const mareNote = qualifiesAsMare(h) ? '（繁殖牝馬として牧場に残ります）' : '（重賞を勝っていないので繁殖牝馬にはなりません）';
  const retire = () => confirmSheet(`${h.name}を引退させますか？${h.sex === '牝' ? mareNote : ''}`, '引退させる', () => {
    const msg = retireHorse(state, h.id, true);
    toast(msg ?? `${h.name}が引退しました`);
    go({ tab: 'stable' });
  });
  return el('div', { class: 'btn-row' }, [
    horseAge(h, state.year) < 2 ? el('button', { class: 'btn btn-ghost', text: '名前を変える', onclick: rename }) : null,
    el('button', { class: 'btn btn-ghost btn-danger', text: '引退', onclick: retire }),
  ]);
}

// 調教師のひとこと。画面の数字だけでは分かりにくい素質・伸びしろ・使いどきを言葉で伝える
const TRAINER_LINES = 4;
const LOOKAHEAD_WEEKS = 8;

function healthLine(h) {
  if (h.injury) return 'ケガが治るまでは無理をさせません。焦らずいきましょう。';
  if (h.fatigue > 65) return '疲れがたまっています。放牧かケアで休ませてやってください。';
  if (h.condition >= 85) return '絶好調です。使うなら今ですよ。';
  return null;
}

// 同じ年に途中まで勝ち進んでいて、次のレースがまだ終わっていない冠だけを伝える
function crownLine(h, state, data) {
  const won = new Set(h.record.titles.filter((t) => t.year === state.year).map((t) => t.name));
  for (const c of CROWNS) {
    let done = 0;
    while (done < c.races.length && won.has(c.races[done])) done += 1;
    if (!done || done === c.races.length) continue;
    const next = data.races.find((r) => r.name === c.races[done]);
    if (!next || (next.month - 1) * 4 + next.wk < state.week) continue;
    return `${c.title}まであと${c.races.length - done}つ！ 次は${next.name}です。`;
  }
  return null;
}

// 出られて、距離と芝ダートが合い、今の力で戦える重賞のうち、いちばん賞金の高いものをすすめる
function raceLine(h, state, data) {
  if (horseAge(h, state.year) < 2 || h.injury) return null;
  const power = overallRating(h.stats);
  const end = Math.min(state.week + LOOKAHEAD_WEEKS, WEEKS_PER_YEAR);
  const picks = [];
  for (let w = state.week; w <= end; w += 1) {
    for (const r of racesForWeek(data, state.year, w)) {
      if (!r.grade.startsWith('G') || entryBlocker(h, r, state.year) || power < raceLevel(r) - 3) continue;
      const apt = r.surface === 'turf' ? h.apt.turf : h.apt.dirt;
      if (r.distance >= h.dist[0] && r.distance <= h.dist[1] && apt >= 0.92) picks.push(r);
    }
  }
  const best = picks.sort((a, b) => b.purse - a.purse)[0];
  if (!best) return null;
  return `${monthOf(best.week)}月の${best.name}（${best.grade}・${best.surface === 'turf' ? '芝' : 'ダート'}${best.distance}m）が合いそうです。`;
}

function roomLine(h, data, year) {
  const [key, room] = STAT_KEYS.map((k) => [k, statCeiling(h, k, year) - h.stats[k]]).sort((a, b) => b[1] - a[1])[0];
  if (room < 3) return null;
  const menu = data.trainings.filter((m) => m.gains?.[key] > 0).sort((a, b) => b.gains[key] - a.gains[key])[0];
  return `${STAT_LABELS[key]}にまだ伸びしろがあります${menu ? `。「${menu.name}」で鍛えるといいでしょう` : ''}。`;
}

function growthLine(h, year) {
  const age = horseAge(h, year);
  if (isDeclining(h, year)) return 'そろそろピークを過ぎてきました。引退の時期も考えておきましょう。';
  if (h.growth === 'late' && age <= 3) return '晩成型なので、本格化はまだ先です。今は土台作りの時期ですね。';
  if (h.growth === 'early' && age <= 2) return '早熟型です。2歳のうちからどんどん稼げますよ。';
  return null;
}

function potentialLine(h) {
  const v = overallRating(h.potential);
  if (v >= 80) return 'この馬の素質は本物です。G1を狙えますよ。';
  if (v >= 72) return '重賞でも戦える素質がありますね。';
  if (v >= 64) return 'オープンまでは十分に行ける素質です。';
  return '大きな舞台は厳しいかもしれませんが、条件戦でこつこつ稼げます。';
}

function trainerCard(h, ctx) {
  const { state, data } = ctx;
  // 当歳はまだ牧場で育てているだけで、調教師が見ていないので出さない
  if (horseAge(h, state.year) < 1) return null;
  const lines = [
    healthLine(h), crownLine(h, state, data), raceLine(h, state, data),
    roomLine(h, data, state.year), growthLine(h, state.year), potentialLine(h),
  ].filter(Boolean).slice(0, TRAINER_LINES);
  return el('section', { class: 'card' }, [
    el('h3', { text: '調教師のひとこと' }),
    ...lines.map((t) => el('p', { class: 'trainer-line', text: `「${t}」` })),
  ]);
}

export function renderHorse(h, ctx) {
  const { state, go } = ctx;
  const age = horseAge(h, state.year);
  return el('div', { class: 'page' }, [
    el('button', { class: 'back-btn', text: '‹ 厩舎へ戻る', onclick: () => go({ tab: 'stable' }) }),
    el('div', { class: 'portrait-wrap' }, [paddockPortrait(h, null)]),
    el('h2', { class: 'horse-name' }, [h.name, age >= 2 ? el('span', { class: 'chip', text: horseClass(h) }) : null]),
    el('p', { class: 'muted small', text: horseSubtitle(h, state.year) }),
    el('div', { class: 'cond-row' }, [
      age >= 1 ? conditionBadge(h.condition) : null,
      h.injury ? el('span', { class: 'badge tone-worst', text: `${h.injury.name} あと${h.injury.weeks}週` }) : null,
    ]),
    age >= 1 ? meter('疲労', h.fatigue, h.fatigue > 65 ? 'bad' : h.fatigue > 40 ? 'normal' : 'good') : null,
    el('section', { class: 'card' }, [el('h3', { text: '今週の予定' }), planButtons(h, ctx)]),
    trainerCard(h, ctx),
    el('section', { class: 'card' }, [
      el('h3', { text: '能力' }),
      el('div', { class: 'ability' }, [radarChart(h), statBars(h)]),
      el('p', { class: 'muted small', text: '緑＝今の能力、金の点線と▼＝伸びしろの見込み（推定なので誤差があります）' }),
      el('h4', { text: '技術' }),
      skillBars(h),
    ]),
    el('section', { class: 'card' }, [el('h3', { text: 'プロフィール' }), profileRows(h, state)]),
    pedigreeSection(h, ctx),
    el('section', { class: 'card' }, [el('h3', { text: '成績' }), recordTable(h)]),
    manageButtons(h, ctx),
  ]);
}

function gainTags(menu) {
  const labels = {
    speed: 'スピ', stamina: 'スタ', power: 'パワ', burst: '瞬発', guts: '根性', wisdom: '賢さ', flex: '柔軟',
    gate: 'ゲート', calm: '折合', corner: 'コーナー',
  };
  const tags = Object.entries(menu.gains ?? {}).map(([k, v]) => {
    const arrows = v < 0 ? '↓' : v >= 2.5 ? '↑↑↑' : v >= 1.4 ? '↑↑' : '↑';
    return el('span', { class: `tag${v < 0 ? ' is-down' : ''}`, text: `${labels[k]}${arrows}` });
  });
  tags.push(el('span', { class: `tag ${menu.fatigue < 0 ? 'is-rest' : 'is-tired'}`, text: menu.fatigue < 0 ? `疲労回復${-menu.fatigue}` : `疲労+${menu.fatigue}` }));
  if (menu.cond) tags.push(el('span', { class: 'tag is-rest', text: `調子+${menu.cond}` }));
  if (menu.cost) tags.push(el('span', { class: 'tag is-cost', text: `${menu.cost}万円` }));
  return tags;
}

function autoCard(h, close, refresh) {
  return el('button', {
    class: `menu-card${h.train.menuId === AUTO_MENU_ID ? ' is-on' : ''}`,
    onclick: () => { h.train.menuId = AUTO_MENU_ID; h.entry = null; close(); refresh(); },
  }, [
    el('b', { text: 'おまかせ' }),
    el('span', { class: 'small', text: '疲労・調子・能力の伸びしろを見て、毎週いちばん効率のよいメニューと強さを選びます。選んだメニューは週の結果に出ます。' }),
  ]);
}

function openTrainingPicker(h, ctx) {
  const { data, refresh } = ctx;
  const cats = [...new Set(data.trainings.map((m) => m.cat))];
  const current = data.trainings.find((m) => m.id === h.train.menuId);
  let cat = current?.cat ?? cats[0];
  const body = el('div', { class: 'picker' });
  let close;
  const draw = () => {
    const menus = data.trainings.filter((m) => m.cat === cat);
    body.replaceChildren(
      el('p', { class: 'muted small', text: `${h.name}　疲労 ${Math.round(h.fatigue)}　${h.fatigue > 65 ? '※疲れているので休養かケアがおすすめ' : ''}` }),
      autoCard(h, () => close(), refresh),
      el('div', { class: 'chip-tabs' }, cats.map((c) => el('button', { class: c === cat ? 'is-on' : '', text: c, onclick: () => { cat = c; draw(); } }))),
      el('h4', { text: '強さ' }),
      segmented(Object.entries(INTENSITY).map(([id, v]) => [id, v.label]), h.train.intensity, (v) => { h.train.intensity = v; draw(); }),
      ...menus.map((m) => el('button', {
        class: `menu-card${m.id === h.train.menuId ? ' is-on' : ''}`,
        onclick: () => { h.train.menuId = m.id; h.entry = null; close(); refresh(); },
      }, [el('b', { text: m.name }), el('span', { class: 'small', text: m.desc }), el('span', { class: 'tags' }, gainTags(m))])),
    );
  };
  draw();
  close = openSheet('調教メニュー', body);
}

function raceRow(h, race, style, ctx, close) {
  const { state, refresh } = ctx;
  const reason = entryBlocker(h, race, state.year);
  const pick = () => {
    const j = bestJockey(ctx.data, race, style, takenJockeys(state, h, race.id));
    h.entry = { raceId: race.id, raceName: race.name, style, jockeyId: j?.id ?? null, jockeyAuto: true };
    close();
    refresh();
    // 何頭も続けて登録しやすいよう、登録後は厩舎の一覧に戻す
    ctx.go({ tab: 'stable' });
    toast(`${race.name}に${style}で出走登録しました${j ? `（騎手 ${j.name}）` : ''}`);
  };
  return el('div', { class: `race-row${reason ? ' is-blocked' : ''}` }, [
    el('div', {}, [
      el('div', {}, [gradeBadge(race.grade), el('b', { text: ` ${race.name}` })]),
      el('div', { class: 'muted small', text: `${race.course} ${race.surface === 'turf' ? '芝' : 'ダート'}${race.distance}m・1着 ${formatMoney(race.purse)}` }),
      reason ? el('div', { class: 'small warn', text: reason }) : distanceHint(h, race),
    ]),
    reason ? null : el('button', { class: 'btn btn-primary btn-small', text: '出走', onclick: pick }),
  ]);
}

function distanceHint(h, race) {
  const fits = race.distance >= h.dist[0] && race.distance <= h.dist[1];
  const surface = race.surface === 'turf' ? h.apt.turf : h.apt.dirt;
  const text = `${fits ? '距離◎' : '距離△'}・${race.surface === 'turf' ? '芝' : 'ダ'}${aptMark(surface)}`;
  return el('div', { class: `small ${fits ? 'good' : 'muted'}`, text });
}

// 「レースを選ぶ」ボタンが出る条件と同じ。右クリックの近道でも同じ馬だけに出すため
export const canPickRace = (h, year) => horseAge(h, year) >= 2 && !h.injury;

export function openRacePicker(h, ctx, opts = {}) {
  const { state, data } = ctx;
  const races = weekRaces(state, data);
  let style = h.entry?.style ?? h.style;
  const body = el('div', { class: 'picker' });
  let close;
  const draw = () => {
    const ok = races.filter((r) => !entryBlocker(h, r, state.year));
    const ng = races.filter((r) => entryBlocker(h, r, state.year)).filter((r) => r.grade.startsWith('G') || r.grade === 'OP');
    body.replaceChildren(
      el('h4', { text: '作戦（脚質）' }),
      segmented(STYLES.map((s) => [s, s === h.style ? `${s}★` : s]), style, (v) => { style = v; draw(); }),
      el('p', { class: 'muted small', text: '★は得意な脚質。違う作戦も選べますが、少し力を出しにくくなります。' }),
      el('h4', { text: `今週出られるレース（${ok.length}）` }),
      ...ok.map((r) => raceRow(h, r, style, ctx, () => close())),
      ng.length ? el('h4', { text: '今週の重賞・OP（条件外）' }) : null,
      ...ng.map((r) => raceRow(h, r, style, ctx, () => close())),
    );
  };
  draw();
  close = openSheet(`${h.name}の出走`, body, opts);
  return close;
}
