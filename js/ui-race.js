import { el, formatMoney, formatDate, WEEKS_PER_YEAR } from './util.js';
import { STAT_LABELS, SKILL_LABELS, horseAge } from './horse.js';
import { RaceSim, formatTime } from './race-sim.js';
import { RaceView } from './race-view.js';
import { racesForWeek } from './race-data.js';
import { buildRunners, makeGround, applyRaceResults, weekRaces } from './game.js';
import { frameBadge, gradeBadge, openSheet, stopAnimations } from './ui-common.js';

const WEATHER_ICON = { 晴: '☀️', 曇: '☁️', 雨: '🌧️' };

function overlay(cls) {
  const node = el('div', { class: `overlay ${cls}` });
  document.body.append(node);
  return node;
}

function runnerAge(r, race, year) {
  if (r.horse.birthYear) return horseAge(r.horse, year);
  return race.age === '2' ? 2 : race.age === '3' ? 3 : 4 + (r.number % 3);
}

function raceHeader(race, ground) {
  return el('header', { class: 'card-head' }, [
    el('div', {}, [gradeBadge(race.grade), el('h2', { text: ` ${race.name}` })]),
    el('p', { class: 'small', text: `${race.course}競馬場 ${race.surface === 'turf' ? '芝' : 'ダート'}${race.distance}m　${WEATHER_ICON[ground.weather]}${ground.weather}・${race.surface === 'turf' ? '芝' : 'ダ'} ${ground.ground}　1着賞金 ${formatMoney(race.purse)}` }),
  ]);
}

function showRaceCard(state, race, runners, ground) {
  return new Promise((resolve) => {
    const node = overlay('race-card');
    const rows = runners.map((r) => el('tr', { class: r.isPlayer ? 'is-player' : '' }, [
      el('td', {}, frameBadge(r.frame, r.number)),
      el('td', { class: 'mark', text: r.mark }),
      el('td', {}, [el('b', { text: r.name }), el('div', { class: 'muted small', text: `${r.horse.sex}${runnerAge(r, race, state.year)}・${r.style}` })]),
      el('td', { class: 'num', text: `${r.popularity}番人気` }),
      el('td', { class: 'num', text: r.odds.toFixed(1) }),
    ]));
    const go = (skip) => {
      node.remove();
      resolve(skip);
    };
    node.append(el('div', { class: 'overlay-inner' }, [
      raceHeader(race, ground),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table card-table' }, [
        el('thead', {}, el('tr', {}, ['馬番', '印', '馬名', '人気', '単勝'].map((t) => el('th', { text: t })))),
        el('tbody', {}, rows),
      ])),
      el('div', { class: 'btn-row sticky-actions' }, [
        el('button', { class: 'btn', text: '結果だけ見る', onclick: () => go(true) }),
        el('button', { class: 'btn btn-primary btn-big', text: '発走！', onclick: () => go(false) }),
      ]),
    ]));
  });
}

function playRace(sim, skip) {
  if (skip) {
    sim.runToEnd();
    return Promise.resolve(sim.results);
  }
  return new Promise((resolve) => {
    const node = overlay('race-overlay');
    // レース中は裏の画面のアニメーションを止めて、描画を軽くする
    stopAnimations();
    new RaceView(node, sim, (results) => {
      node.remove();
      resolve(results);
    });
  });
}

function resultHeadline(outcomes) {
  const best = [...outcomes].sort((a, b) => a.rank - b.rank)[0];
  if (!best) return null;
  const text = best.rank === 1 ? `🏆 ${best.horse.name} 優勝！` : `${best.horse.name} ${best.rank}着`;
  return el('div', { class: `result-headline${best.rank === 1 ? ' is-win' : ''}`, text });
}

function showResult(race, ground, results, outcomes) {
  return new Promise((resolve) => {
    const node = overlay('race-result');
    const rows = results.map((res) => el('tr', { class: res.runner.isPlayer ? 'is-player' : '' }, [
      el('td', { class: 'num', text: String(res.rank) }),
      el('td', {}, frameBadge(res.runner.frame, res.runner.number)),
      el('td', { text: res.runner.name }),
      el('td', { class: 'num', text: formatTime(res.time) }),
      el('td', { class: 'num', text: res.margin }),
      el('td', { class: 'num', text: String(res.runner.popularity) }),
    ]));
    node.append(el('div', { class: 'overlay-inner' }, [
      raceHeader(race, ground),
      resultHeadline(outcomes),
      ...outcomes.map((o) => el('p', { class: 'small', text: `${o.horse.name}：${o.rank}着${o.prize ? `　賞金 ${formatMoney(o.prize)}（馬主取り分8割）` : ''}` })),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, [
        el('thead', {}, el('tr', {}, ['着', '番', '馬名', 'タイム', '着差', '人気'].map((t) => el('th', { text: t })))),
        el('tbody', {}, rows),
      ])),
      el('div', { class: 'btn-row sticky-actions' }, [
        el('button', { class: 'btn btn-primary btn-big', text: '次へ', onclick: () => { node.remove(); resolve(); } }),
      ]),
    ]));
  });
}

// 今週出走する馬のレースを1つずつ順番に見せる
export async function runWeekRaces(state, data) {
  const races = weekRaces(state, data);
  const outcomes = [];
  for (const race of races) {
    const entries = state.horses.filter((h) => h.entry?.raceId === race.id).map((h) => ({ horse: h, style: h.entry.style }));
    if (!entries.length) continue;
    const ground = makeGround(race);
    const runners = buildRunners(state, data, race, entries);
    const skip = await showRaceCard(state, race, runners, ground);
    const sim = new RaceSim(race, runners, ground);
    const results = await playRace(sim, skip);
    const out = applyRaceResults(state, race, results);
    outcomes.push(...out.map((o) => ({ ...o, race })));
    await showResult(race, ground, results, out);
  }
  return outcomes;
}

function deltaText(deltas) {
  const labels = { ...STAT_LABELS, ...SKILL_LABELS };
  return Object.entries(deltas)
    .filter(([k, v]) => labels[k] && Math.abs(v) >= 0.1)
    .map(([k, v]) => `${labels[k]}${v > 0 ? '+' : ''}${v.toFixed(1)}`)
    .join(' ');
}

export function showWeekReport({ title, outcomes, reports, events, moneyBefore, moneyAfter }) {
  const body = [
    el('p', { class: 'small', text: `資金 ${formatMoney(moneyBefore)} → ${formatMoney(moneyAfter)}` }),
    ...events.map((e) => el('p', { class: 'event', text: e })),
    outcomes.length ? el('h4', { text: 'レース' }) : null,
    ...outcomes.map((o) => el('p', { text: `${o.horse.name}：${o.race.name} ${o.rank}着` })),
    reports.length ? el('h4', { text: '調教' }) : null,
    ...reports.map((r) => el('div', { class: 'report-row' }, [
      el('b', { text: r.horse.name }),
      el('span', { class: 'muted small', text: ` ${r.menu}` }),
      el('div', { class: 'small good', text: deltaText(r.deltas) || '目立った変化なし' }),
      r.injured ? el('div', { class: 'small warn', text: `⚠️ ${r.injured.name}を発症（${r.injured.weeks}週の休養）` }) : null,
      r.healed ? el('div', { class: 'small good', text: '故障が治りました' }) : null,
    ])),
  ];
  openSheet(title, body);
}

function scheduleRow(race) {
  return el('div', { class: 'race-row' }, [el('div', {}, [
    el('div', {}, [gradeBadge(race.grade), el('b', { text: ` ${race.name}` })]),
    el('div', { class: 'muted small', text: `${race.course} ${race.surface === 'turf' ? '芝' : 'ダ'}${race.distance}m・${ageText(race)}・1着 ${formatMoney(race.purse)}` }),
  ])]);
}

const ageText = (race) => ({ 2: '2歳', 3: '3歳', '3+': '3歳以上', '4+': '4歳以上' }[race.age] ?? '') + (race.sex === 'mare' ? '牝馬' : '');

export function renderSchedule(ctx) {
  const { state, data } = ctx;
  const upcoming = [];
  for (let i = 1; i <= 16; i += 1) {
    const w = state.week + i;
    const year = state.year + Math.floor((w - 1) / WEEKS_PER_YEAR);
    const week = ((w - 1) % WEEKS_PER_YEAR) + 1;
    const graded = racesForWeek(data, year, week).filter((r) => r.grade.startsWith('G'));
    if (graded.length) upcoming.push(el('h4', { text: formatDate(year, week) }), ...graded.map(scheduleRow));
  }
  return el('div', { class: 'page' }, [
    el('h3', { class: 'section-title', text: `今週のレース（${formatDate(state.year, state.week)}）` }),
    ...weekRaces(state, data).map(scheduleRow),
    el('h3', { class: 'section-title', text: 'この先の重賞（16週）' }),
    ...upcoming,
  ]);
}
