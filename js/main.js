import { el, formatMoney, formatDate } from './util.js';
import { drawHorse } from './horse-art.js';
import { PALETTES, buildScene, drawBackdrop, drawTrack, drawInnerRail, drawGrade } from './race-scene.js';
import { newGame, loadGame, saveGame, runTrainingWeek, endWeek, migrateState, releaseUnqualifiedMares } from './game.js';
import { stopAnimations, animate, hiDpiCanvas, segmented, toast } from './ui-common.js';
import { renderStable, renderHorse } from './ui-stable.js';
import { runWeekRaces, showWeekReport, renderSchedule } from './ui-race.js';
import { renderFarm, renderRecords } from './ui-farm.js';

const DATA_FILES = ['trainings', 'sires', 'names', 'races', 'bloodlines', 'jockeys'];
const SILK_COLORS = ['#c0392b', '#1e3a8a', '#f5c518', '#16a085', '#ffffff', '#111111', '#8e44ad', '#e67e22', '#e84393', '#0984e3'];
const PATTERNS = [['plain', '無地'], ['hoops', '輪'], ['stripes', '縦縞'], ['sash', 'たすき'], ['cross', '十字'], ['diamonds', 'ダイヤ']];
const TABS = [['stable', '厩舎', '🐎'], ['schedule', '番組', '📅'], ['farm', '牧場', '🌾'], ['records', '記録', '🏆']];

const app = document.getElementById('app');
let data;
let state;
let view = { tab: 'stable' };
let busy = false;

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (name) => {
    const res = await fetch(`data/${name}.json`);
    if (!res.ok) throw new Error(`${name}.json を読み込めませんでした`);
    return [name, await res.json()];
  }));
  return Object.fromEntries(entries);
}

// タイトル画面の背景。レース画面と同じ部品で夕暮れの直線を走らせる
function titleBackdrop() {
  const W = Math.min(window.innerWidth, 900);
  const H = Math.min(window.innerHeight, 700);
  const { canvas, ctx } = hiDpiCanvas(W, H, 'title-canvas');
  const scene = buildScene(W, H, PALETTES.golden, 7);
  const ppm = W / 22;
  let m = 0;
  let phase = 0;
  animate((dt) => {
    m += dt * 16;
    phase = (phase + dt * 2.2) % 1;
    const toScreen = (x, p = 1) => W / 2 + (x - m) * ppm * p;
    toScreen.inverse = (x, p = 1) => m + (x - W / 2) / (ppm * p);
    drawBackdrop(ctx, scene, m * ppm, W);
    drawTrack(ctx, scene, toScreen, ppm, 'turf', W);
    drawInnerRail(ctx, scene, toScreen, ppm, 1e5, W);
    drawHorse(ctx, { x: W * 0.42, y: H * 0.8, scale: ppm * 2.6 / 220, phase, coat: 'darkbay', markings: { face: 'blaze', socks: [false, true, false, true] }, silks: { main: '#1e3a8a', sub: '#f5c518', pattern: 'hoops' }, number: 7, frame: 4 });
    drawGrade(ctx, scene, W, H);
  });
  return canvas;
}

function renderTitle() {
  stopAnimations();
  const saved = loadGame();
  app.replaceChildren(el('div', { class: 'title-screen' }, [
    titleBackdrop(),
    el('div', { class: 'title-panel' }, [
      el('h1', { class: 'title-logo', text: 'ターフの系譜' }),
      el('p', { class: 'title-sub', text: '血統をつなぎ、最強馬をつくる' }),
      saved ? el('button', { class: 'btn btn-primary btn-big', text: `つづきから（${formatDate(saved.year, saved.week)}）`, onclick: () => start(saved) }) : null,
      el('button', { class: `btn btn-big${saved ? '' : ' btn-primary'}`, text: '新しく始める', onclick: renderNewGame }),
    ]),
  ]));
}

function silksPreview(silks) {
  const { canvas, ctx } = hiDpiCanvas(300, 180, 'silks-preview');
  let phase = 0;
  animate((dt) => {
    phase = (phase + dt * 1.6) % 1;
    ctx.clearRect(0, 0, 300, 180);
    drawHorse(ctx, { x: 140, y: 172, scale: 0.6, phase, coat: 'bay', markings: { face: 'star', socks: [false, false, false, false] }, silks, number: 1, frame: 3 });
  });
  return canvas;
}

function swatches(current, onPick) {
  return el('div', { class: 'swatches' }, SILK_COLORS.map((c) => el('button', {
    class: `swatch${c === current ? ' is-on' : ''}`, style: `background:${c}`, 'aria-label': c, onclick: () => onPick(c),
  })));
}

function renderNewGame() {
  stopAnimations();
  const silks = { main: '#1e3a8a', sub: '#f5c518', pattern: 'hoops' };
  const name = el('input', { class: 'input', value: 'ターフ牧場', maxlength: 12, 'aria-label': '厩舎の名前' });
  const form = el('div', { class: 'page new-game' });
  const draw = () => {
    stopAnimations();
    form.replaceChildren(
      el('h2', { text: '新しい厩舎をつくる' }),
      el('label', { class: 'field' }, [el('span', { text: '厩舎（馬主）の名前' }), name]),
      el('h3', { text: '勝負服' }),
      silksPreview(silks),
      el('h4', { text: '地の色' }), swatches(silks.main, (c) => { silks.main = c; draw(); }),
      el('h4', { text: '模様の色' }), swatches(silks.sub, (c) => { silks.sub = c; draw(); }),
      el('h4', { text: '模様' }), segmented(PATTERNS, silks.pattern, (p) => { silks.pattern = p; draw(); }),
      el('p', { class: 'muted small', text: '資金8,000万円と繁殖牝馬1頭からスタート。まずは牧場タブのセリで2歳馬を買いましょう。' }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', text: '戻る', onclick: renderTitle }),
        el('button', { class: 'btn btn-primary btn-big', text: 'はじめる', onclick: () => start(newGame({ stableName: name.value.trim() || 'ターフ牧場', silks }, data), { tab: 'farm' }) }),
      ]),
    );
  };
  draw();
  app.replaceChildren(form);
}

function start(s, firstView = { tab: 'stable' }) {
  state = migrateState(s, data);
  releaseUnqualifiedMares(state);
  view = firstView;
  saveGame(state);
  render();
}

function go(next) {
  view = next;
  render();
  window.scrollTo(0, 0);
}

const ctx = () => ({ state, data, go, refresh: () => { saveGame(state); render(); }, restart: renderTitle });

function currentPage() {
  if (view.horseId) {
    const h = state.horses.find((x) => x.id === view.horseId);
    if (h) return renderHorse(h, ctx());
  }
  const pages = { stable: renderStable, schedule: renderSchedule, farm: renderFarm, records: renderRecords };
  return pages[view.tab](ctx());
}

function render() {
  stopAnimations();
  const entries = state.horses.filter((h) => h.entry).length;
  app.replaceChildren(
    el('header', { class: 'app-header' }, [
      el('div', {}, [el('b', { text: state.stableName }), el('div', { class: 'small', text: formatDate(state.year, state.week) })]),
      el('div', { class: `money${state.money < 0 ? ' warn' : ''}`, text: formatMoney(state.money) }),
    ]),
    el('main', { class: 'app-main' }, currentPage()),
    el('div', { class: 'advance-bar' }, [
      el('span', { class: 'small', text: entries ? `今週 ${entries}頭が出走` : '今週の出走なし' }),
      el('button', { class: 'btn btn-primary', text: '週を進める ▶', onclick: advanceWeek }),
    ]),
    el('nav', { class: 'tab-bar' }, TABS.map(([id, label, icon]) => el('button', {
      class: view.tab === id && !view.horseId ? 'is-on' : '', onclick: () => go({ tab: id }),
    }, [el('span', { class: 'tab-icon', text: icon }), el('span', { text: label })]))),
  );
}

async function advanceWeek() {
  if (busy) return;
  busy = true;
  try {
    const title = `${formatDate(state.year, state.week)}の報告`;
    const moneyBefore = state.money;
    const outcomes = await runWeekRaces(state, data);
    const reports = runTrainingWeek(state, data);
    const events = endWeek(state, data);
    saveGame(state);
    render();
    showWeekReport({ title, outcomes, reports, events, moneyBefore, moneyAfter: state.money });
  } catch (err) {
    console.error(err);
    toast('エラーが起きました。もう一度お試しください');
  } finally {
    busy = false;
  }
}

async function boot() {
  try {
    data = await loadData();
  } catch (err) {
    app.replaceChildren(el('p', { class: 'page', text: `データの読み込みに失敗しました：${err.message}` }));
    return;
  }
  renderTitle();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
