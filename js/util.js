export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = () => Math.random().toString(36).slice(2, 10);

// 能力のばらつきを自然に見せるため、一様乱数ではなく正規分布を使う
export function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 同じ週なら同じレース番組になるよう、種から決まる乱数を使う
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function weighted(list, weightOf) {
  const total = list.reduce((sum, item) => sum + weightOf(item), 0);
  let r = Math.random() * total;
  for (const item of list) {
    r -= weightOf(item);
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

// innerHTML を使わずに要素を組み立てるための小さなヘルパー
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

// 金額は内部ではすべて「万円」単位の数値で持つ
export function formatMoney(man) {
  const sign = man < 0 ? '-' : '';
  const abs = Math.round(Math.abs(man));
  if (abs < 10000) return `${sign}${abs.toLocaleString()}万円`;
  const oku = Math.floor(abs / 10000);
  const rest = abs % 10000;
  return rest ? `${sign}${oku}億${rest.toLocaleString()}万円` : `${sign}${oku}億円`;
}

export const WEEKS_PER_YEAR = 48;
export const monthOf = (week) => Math.ceil(week / 4);
export const weekInMonth = (week) => ((week - 1) % 4) + 1;
export const formatDate = (year, week) => `${year}年目 ${monthOf(week)}月 第${weekInMonth(week)}週`;
