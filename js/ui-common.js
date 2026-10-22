import { el, clamp } from './util.js';
import { drawHorse, FRAME_COLORS } from './horse-art.js';
import {
  STAT_KEYS, STAT_LABELS, SKILL_KEYS, SKILL_LABELS, gradeOf, conditionLabel, coatById, horseAge,
} from './horse.js';

const animations = new Set();

// 画面を作り直すたびに古いアニメーションを止め、裏で描き続けないようにする
export function stopAnimations() {
  for (const id of animations) cancelAnimationFrame(id.current);
  animations.clear();
}

export function animate(draw) {
  const handle = { current: 0 };
  let last = performance.now();
  const loop = (now) => {
    // 初回フレームの時刻が開始時刻より前になることがあるため、マイナスにしない
    draw(Math.max(0, (now - last) / 1000));
    last = now;
    handle.current = requestAnimationFrame(loop);
  };
  handle.current = requestAnimationFrame(loop);
  animations.add(handle);
  return handle;
}

export function hiDpiCanvas(w, h, cls) {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = el('canvas', { class: cls, width: Math.round(w * scale), height: Math.round(h * scale) });
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

export function openSheet(title, body, opts = {}) {
  const close = () => {
    layer.classList.add('is-closing');
    setTimeout(() => layer.remove(), 200);
    opts.onClose?.();
  };
  const layer = el('div', { class: 'sheet-layer', onclick: (e) => { if (e.target === layer) close(); } }, [
    el('section', { class: 'sheet', role: 'dialog', 'aria-label': title }, [
      el('header', { class: 'sheet-head' }, [
        el('h2', { text: title }),
        el('button', { class: 'icon-btn', 'aria-label': '閉じる', text: '×', onclick: close }),
      ]),
      el('div', { class: 'sheet-body' }, body),
    ]),
  ]);
  document.body.append(layer);
  return close;
}

export function confirmSheet(text, okLabel, onOk) {
  let close;
  const body = [
    el('p', { class: 'confirm-text', text }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', text: 'やめる', onclick: () => close() }),
      el('button', { class: 'btn btn-primary', text: okLabel, onclick: () => { close(); onOk(); } }),
    ]),
  ];
  close = openSheet('確認', body);
}

export function toast(text) {
  const node = el('div', { class: 'toast', role: 'status', text });
  document.body.append(node);
  setTimeout(() => node.classList.add('is-hidden'), 2200);
  setTimeout(() => node.remove(), 2600);
}

export function frameBadge(frame, number) {
  const dark = [2, 3, 4, 6].includes(frame);
  return el('span', {
    class: 'frame-badge', text: String(number),
    style: `background:${FRAME_COLORS[frame - 1]};color:${dark ? '#fff' : '#111'}`,
  });
}

export function conditionBadge(c) {
  const { text, tone } = conditionLabel(c);
  return el('span', { class: `badge tone-${tone}`, text });
}

export function gradeBadge(grade) {
  const cls = grade.startsWith('G') ? `grade-${grade.toLowerCase()}` : grade === 'OP' ? 'grade-op' : 'grade-class';
  return el('span', { class: `grade-badge ${cls}`, text: grade });
}

export function horseSubtitle(h, year) {
  const age = horseAge(h, year);
  return `${h.sex}${age}歳・${coatById(h.coat).name}・父 ${h.sireName}`;
}

// 牧場の柵と芝生を背景に、立ち姿の馬をゆっくり動かして見せる
export function paddockPortrait(h, silks) {
  const W = 480;
  const H = 270;
  const { canvas, ctx } = hiDpiCanvas(W, H, 'portrait');
  let phase = Math.random();
  animate((dt) => {
    phase = (phase + dt * 0.35) % 1;
    drawPaddock(ctx, W, H);
    drawHorse(ctx, { x: W * 0.47, y: H * 0.86, scale: 0.78, phase, coat: h.coat, markings: h.markings, pose: 'stand', silks });
  });
  return canvas;
}

function drawPaddock(ctx, W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#6fa8dc');
  sky.addColorStop(1, '#d9ecf7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7fa3b8';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.5);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H * (0.4 + Math.sin(x * 0.013) * 0.05 + Math.sin(x * 0.041) * 0.02));
  ctx.lineTo(W, H * 0.55);
  ctx.lineTo(0, H * 0.55);
  ctx.fill();
  const grass = ctx.createLinearGradient(0, H * 0.5, 0, H);
  grass.addColorStop(0, '#8dbd5a');
  grass.addColorStop(1, '#4f8a35');
  ctx.fillStyle = grass;
  ctx.fillRect(0, H * 0.52, W, H * 0.48);
  ctx.fillStyle = '#f4efe2';
  for (let x = 10; x < W; x += 70) ctx.fillRect(x, H * 0.5, 5, H * 0.13);
  ctx.fillRect(0, H * 0.52, W, 4);
  ctx.fillRect(0, H * 0.58, W, 4);
}

// 1頭を小さく描いた静止画（一覧用）。毎フレーム描かずに済むよう1回だけ描く
export function horseThumb(h, silks) {
  const { canvas, ctx } = hiDpiCanvas(96, 72, 'thumb');
  const g = ctx.createLinearGradient(0, 0, 0, 72);
  g.addColorStop(0, '#cfe6f3');
  g.addColorStop(0.6, '#cfe6f3');
  g.addColorStop(0.6, '#86b85a');
  g.addColorStop(1, '#5c9640');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 72);
  drawHorse(ctx, { x: 44, y: 66, scale: 0.21, phase: 0.2, coat: h.coat, markings: h.markings, pose: 'stand', silks });
  return canvas;
}

export function radarChart(h) {
  const size = 220;
  const { canvas, ctx } = hiDpiCanvas(size, size, 'radar');
  const cx = size / 2;
  const cy = size / 2 + 4;
  const R = 76;
  const n = STAT_KEYS.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
  };
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#333';
  ctx.strokeStyle = 'rgba(128,128,128,0.35)';
  for (const ring of [25, 50, 75, 100]) polygon(ctx, STAT_KEYS.map((_, i) => pt(i, ring)), false);
  ctx.fillStyle = 'rgba(214,170,60,0.18)';
  ctx.strokeStyle = 'rgba(214,170,60,0.9)';
  ctx.setLineDash([4, 3]);
  polygon(ctx, STAT_KEYS.map((k, i) => pt(i, h.estimate[k])), true);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(46,139,87,0.35)';
  ctx.strokeStyle = 'rgba(46,139,87,1)';
  ctx.lineWidth = 2;
  polygon(ctx, STAT_KEYS.map((k, i) => pt(i, h.stats[k])), true);
  ctx.fillStyle = ink;
  ctx.font = '11px -apple-system, "Hiragino Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  STAT_KEYS.forEach((k, i) => {
    const [x, y] = pt(i, 128);
    ctx.fillText(STAT_LABELS[k], x, y);
  });
  return canvas;
}

function polygon(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

function bar(label, value, marker, showGrade) {
  const v = clamp(value, 0, 100);
  return el('div', { class: 'stat-row' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-bar' }, [
      el('span', { class: 'stat-fill', style: `width:${v}%` }),
      marker == null ? null : el('span', { class: 'stat-marker', style: `left:${clamp(marker, 0, 100)}%` }),
    ]),
    el('span', { class: 'stat-value' }, [
      showGrade ? el('b', { class: `stat-grade g-${gradeOf(v).replace('+', 'p')}`, text: gradeOf(v) }) : null,
      String(Math.round(v)),
    ]),
  ]);
}

export function statBars(h) {
  return el('div', { class: 'stat-list' }, STAT_KEYS.map((k) => bar(STAT_LABELS[k], h.stats[k], h.estimate[k], true)));
}

export function skillBars(h) {
  return el('div', { class: 'stat-list' }, SKILL_KEYS.map((k) => bar(SKILL_LABELS[k], h.skills[k], null, false)));
}

export function meter(label, value, tone) {
  return el('div', { class: 'meter' }, [
    el('span', { class: 'meter-label', text: label }),
    el('span', { class: `meter-bar tone-${tone}` }, [el('span', { style: `width:${clamp(value, 0, 100)}%` })]),
  ]);
}

export function segmented(options, current, onPick) {
  return el('div', { class: 'segmented', role: 'radiogroup' }, options.map(([value, label, disabled]) => el('button', {
    class: value === current ? 'is-on' : '', role: 'radio', 'aria-checked': String(value === current), disabled: !!disabled,
    text: label, onclick: () => onPick(value),
  })));
}

// 血統表：4代分を CSS グリッドで並べる。代が進むほど1マスの縦幅を半分にする
export function pedigreeTable(ped, book, crossNames = []) {
  const cells = [];
  for (let k = 2; k < 32; k += 1) {
    const gen = 31 - Math.clz32(k);
    const span = 16 >> (gen - 1);
    const row = (k - (1 << gen)) * span + 1;
    const name = ped?.[k] || '—';
    const line = k % 2 === 0 ? book.lineOf(name) : '';
    const cls = `ped-cell ${k % 2 === 0 ? 'is-male' : 'is-female'}${crossNames.includes(name) ? ' is-cross' : ''}`;
    cells.push(el('div', { class: cls, style: `grid-column:${gen};grid-row:${row} / span ${span}` }, [
      el('span', { text: name }),
      line ? el('small', { text: line }) : null,
    ]));
  }
  return el('div', { class: 'ped-table' }, cells);
}

export const rankChip = (rank) => el('span', { class: `chip rank rank-${rank}`, text: `配合${rank}` });

export function breedingNotes(notes) {
  if (!notes.length) return el('p', { class: 'muted small', text: '目立った配合の特徴はありません（平凡な配合）。' });
  return el('div', { class: 'breed-notes' }, notes.map((n) => el('div', { class: `breed-note tone-${n.tone}` }, [
    el('b', { text: n.title }),
    el('span', { class: 'small', text: ` ${n.label}` }),
    el('div', { class: 'small', text: n.text }),
  ])));
}

export function openBreedingGuide(data) {
  openSheet('配合理論の解説', data.bloodlines.guide.flatMap((g) => [
    el('h4', { text: g.title }),
    el('p', { class: 'small', text: g.text }),
  ]).concat([
    el('h4', { text: '5つの系統' }),
    ...data.bloodlines.lines.map((l) => el('p', { class: 'small' }, [el('b', { text: `${l.name}（始祖 ${l.founder}）` }), ` ${l.desc}`])),
  ]));
}
