// 出题引擎基础设施:可复现随机数、素材池、数学工具
// 所有生成题目由 (tag, level, seed) 唯一决定,同一 id 永远生成同一道题。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  // 闭区间 [a, b] 整数
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  pick2(arr) {
    const i = Math.floor(this.next() * arr.length);
    let j = Math.floor(this.next() * (arr.length - 1));
    if (j >= i) j++;
    return [arr[i], arr[j]];
  }
  bool() { return this.next() < 0.5; }
}

export const NAMES = ['Mia', 'Leo', 'Ben', 'Amy', 'Sam', 'Ivy', 'Max', 'Zoe', 'Tom', 'Lily', 'Ken', 'Nora', 'Evan', 'Ella', 'Ryan', 'Kate'];

// 可数物品:zh 中文名 / cl 量词 / en 复数 / one 单数
export const ITEMS = [
  { zh: '贴纸', cl: '张', en: 'stickers', one: 'sticker' },
  { zh: '卡片', cl: '张', en: 'cards', one: 'card' },
  { zh: '弹珠', cl: '颗', en: 'marbles', one: 'marble' },
  { zh: '邮票', cl: '枚', en: 'stamps', one: 'stamp' },
  { zh: '贝壳', cl: '个', en: 'shells', one: 'shell' },
  { zh: '积木', cl: '块', en: 'building blocks', one: 'building block' },
  { zh: '糖果', cl: '颗', en: 'sweets', one: 'sweet' },
  { zh: '橡皮', cl: '块', en: 'erasers', one: 'eraser' },
  { zh: '故事书', cl: '本', en: 'storybooks', one: 'storybook' },
  { zh: '气球', cl: '个', en: 'balloons', one: 'balloon' },
];

// 便宜/贵成对物品(差价代换、等值代换用)
export const PRICE_PAIRS = [
  { cheapZh: '铅笔', cheapCl: '支', cheapEn: 'pencil', cheapEnPl: 'pencils', dearZh: '钢笔', dearCl: '支', dearEn: 'pen', dearEnPl: 'pens' },
  { cheapZh: '足球', cheapCl: '个', cheapEn: 'football', cheapEnPl: 'footballs', dearZh: '篮球', dearCl: '个', dearEn: 'basketball', dearEnPl: 'basketballs' },
  { cheapZh: '笔记本', cheapCl: '本', cheapEn: 'notebook', cheapEnPl: 'notebooks', dearZh: '文具盒', dearCl: '个', dearEn: 'pencil case', dearEnPl: 'pencil cases' },
  { cheapZh: '苹果', cheapCl: '个', cheapEn: 'apple', cheapEnPl: 'apples', dearZh: '菠萝', dearCl: '个', dearEn: 'pineapple', dearEnPl: 'pineapples' },
];

export function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
export function lcm(a, b) { return a / gcd(a, b) * b; }

// 生成器内部一致性校验:失败直接抛错,测试阶段兜住
export function invariant(cond, msg) {
  if (!cond) throw new Error('generator invariant failed: ' + msg);
}

export function q(fields) {
  const { tag, level, seed, zh, en, answer, steps, hint1, hint2 } = fields;
  invariant(typeof answer.value === 'number' && Number.isFinite(answer.value), 'answer.value must be number');
  invariant(Number.isInteger(answer.value), 'answer must be integer, got ' + answer.value);
  invariant(answer.value > 0, 'answer must be positive, got ' + answer.value);
  invariant(steps.length >= 2, 'need at least 2 steps');
  return {
    id: `g_${tag}_${level}_${seed}`,
    generated: true,
    tag, level, seed, zh, en, answer, steps, hint1, hint2,
  };
}
