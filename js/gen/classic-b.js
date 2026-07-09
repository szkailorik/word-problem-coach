// 经典应用题生成器 · B 组(年龄 / 利润折扣 / 植树间隔 / 周期)
// 与 generators.js / classic-a.js 同一套约定:fn(r, level, seed) → q({...})。
// 全部采用"先定答案、再倒推题面"的构造法,保证答案与所有中间量都是干净正整数。
// 本文件不修改任何现有模块,由 tests/classic-b.test.mjs 独立验证。

import { Rng, NAMES, invariant, q, gcd, lcm } from './engine.js';

// 按难度取参数(与 generators.js 的 scale 同义,本地自备一份)
function scale(level, s1, s2, s3) { return level === 1 ? s1 : level === 2 ? s2 : s3; }

const WEEK_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const WEEK_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ============================================================
 * 1. age_diff 年龄问题(守恒锚点族)
 * 模型思想:两人一起长大(或一起变小),年龄差永远不变——
 * 用"差"拆份数,是所有年龄倍数题的钥匙。
 * L1 几年后爸爸是孩子的 n 倍:差 = (n−1) 份,先定"那一年孩子几岁"倒推。
 * L2 几年前是 n 倍(年数 < 孩子年龄);或"n 倍时孩子几岁"。
 * L3 和倍复合:今年年龄和 S,k 年后是 n 倍——注意 k 年后和 = S + 2k。
 * 全部通过枚举合法组合再随机挑选,保证年龄真实感(孩子 3~14、家长 28~45)。
 * ============================================================ */
function genAgeDiff(r, level, seed) {
  const kid = r.pick(NAMES);
  const parent = r.pick(['爸爸', '妈妈']);
  const pEn = parent === '爸爸' ? 'father' : 'mother';

  if (level === 1) {
    // 构造:先定 n、未来孩子年龄 u、年数 x → 今年孩子 c = u−x,家长 = n·u − x
    const combos = [];
    for (const n of [2, 3, 4, 5])
      for (let c = 3; c <= 12; c++)
        for (let x = 1; x <= 15; x++) {
          const u = c + x, dad = u * n - x;
          if (dad >= 28 && dad <= 45 && dad - c >= 18 && dad - c <= 38) combos.push({ n, c, x, u, dad });
        }
    const { n, c, x, u, dad } = r.pick(combos);
    const diff = dad - c;
    invariant(diff % (n - 1) === 0 && diff / (n - 1) === u, 'age L1 clean');
    return q({
      tag: 'age_diff', level, seed,
      zh: `${kid} 今年 ${c} 岁，${parent}今年 ${dad} 岁。多少年后，${parent}的年龄正好是 ${kid} 的 ${n} 倍？`,
      en: `${kid} is ${c} years old. ${kid}'s ${pEn} is ${dad} years old. In how many years' time will the ${pEn} be ${n} times as old as ${kid}?`,
      answer: { value: x, unit: '年', sentence: `${x} 年后。` },
      steps: [
        { label: '差不变', text: `年龄差永远不变：两人一起长大，差始终是 ${dad} − ${c} = ${diff} 岁。` },
        { label: '拆份数', text: `那一年${parent}是 ${n} 份、${kid} 是 1 份，差 ${n} − 1 = ${n - 1} 份 = ${diff} 岁，1 份 = ${diff} ÷ ${n - 1} = ${u} 岁。` },
        { label: '算年数', text: `那时 ${kid} ${u} 岁，${u} − ${c} = ${x} 年后。` },
        { label: '验一验', text: `${x} 年后：${kid} ${u} 岁，${parent} ${dad} + ${x} = ${dad + x} 岁，正好 ${u} × ${n} = ${dad + x} ✓` },
      ],
      hint1: `年龄问题先抓一句话：两人的年龄差永远不变。`,
      hint2: `先算年龄差 ${dad} − ${c} = ${diff} 岁；到那一年，这个差正好是 ${n} − 1 份。`,
    });
  }

  if (level === 2) {
    if (r.bool()) {
      // 模板 a:几年前是 n 倍。构造:过去孩子 v 岁、家长 n·v 岁,x 年前 → 今年 v+x / n·v+x
      const combos = [];
      for (const n of [3, 4, 5, 6, 7])
        for (let v = 2; v <= 10; v++)
          for (let x = 1; x <= 8; x++) {
            const c = v + x, dad = n * v + x;
            if (c >= 5 && c <= 14 && dad >= 28 && dad <= 45 && dad - c >= 18 && dad - c <= 38) combos.push({ n, v, x, c, dad });
          }
      const { n, v, x, c, dad } = r.pick(combos);
      const diff = dad - c;
      invariant(x < c && diff === (n - 1) * v, 'age L2a years-ago valid');
      return q({
        tag: 'age_diff', level, seed,
        zh: `${kid} 今年 ${c} 岁，${parent}今年 ${dad} 岁。多少年前，${parent}的年龄正好是 ${kid} 的 ${n} 倍？`,
        en: `${kid} is ${c} years old. ${kid}'s ${pEn} is ${dad} years old. How many years ago was the ${pEn} ${n} times as old as ${kid}?`,
        answer: { value: x, unit: '年', sentence: `${x} 年前。` },
        steps: [
          { label: '差不变', text: `年龄差永远不变：往前倒回去，差也还是 ${dad} − ${c} = ${diff} 岁。` },
          { label: '拆份数', text: `那一年${parent}是 ${n} 份、${kid} 是 1 份，差 ${n - 1} 份 = ${diff} 岁，1 份 = ${diff} ÷ ${n - 1} = ${v} 岁。` },
          { label: '算年数', text: `那时 ${kid} ${v} 岁，${c} − ${v} = ${x} 年前（${x} < ${c}，倒得回去，合理）。` },
          { label: '验一验', text: `${x} 年前：${kid} ${v} 岁，${parent} ${dad} − ${x} = ${dad - x} 岁，正好 ${v} × ${n} = ${dad - x} ✓` },
        ],
        hint1: `"几年前"和"几年后"用的是同一把钥匙——年龄差永远不变。`,
        hint2: `差 ${diff} 岁在那一年是 ${n} − 1 份，先算出那时 ${kid} 几岁，再看倒回去几年。`,
      });
    }
    // 模板 b:当家长正好是 n 倍时,孩子几岁。构造:未来孩子 u 岁,家长今年 = c + (n−1)u
    const combos = [];
    for (const n of [2, 3, 4])
      for (let c = 3; c <= 12; c++)
        for (let u = c + 1; u <= c + 15; u++) {
          const dad = c + (n - 1) * u;
          if (dad >= 28 && dad <= 45 && dad - c >= 18 && dad - c <= 38) combos.push({ n, c, u, dad });
        }
    const { n, c, u, dad } = r.pick(combos);
    const diff = dad - c;
    invariant(diff === (n - 1) * u && u > c, 'age L2b valid');
    return q({
      tag: 'age_diff', level, seed,
      zh: `${kid} 今年 ${c} 岁，${parent}今年 ${dad} 岁。当${parent}的年龄正好是 ${kid} 的 ${n} 倍时，${kid} 多少岁？`,
      en: `${kid} is ${c} years old. ${kid}'s ${pEn} is ${dad} years old. When the ${pEn} is exactly ${n} times as old as ${kid}, how old will ${kid} be?`,
      answer: { value: u, unit: '岁', sentence: `那时 ${kid} ${u} 岁。` },
      steps: [
        { label: '差不变', text: `年龄差永远不变：不管过几年，差都是 ${dad} − ${c} = ${diff} 岁。` },
        { label: '拆份数', text: `${n} 倍时${parent}是 ${n} 份、${kid} 是 1 份，差 ${n} − 1 = ${n - 1} 份 = ${diff} 岁。` },
        { label: '算一份', text: `1 份 = ${diff} ÷ ${n - 1} = ${u} 岁，就是那时 ${kid} 的年龄。` },
        { label: '验一验', text: `那时${parent} ${u} + ${diff} = ${u + diff} 岁，${u} × ${n} = ${u * n}，两个数相同 ✓` },
      ],
      hint1: `问"几倍时孩子几岁"——不用一年一年试，用永远不变的年龄差拆份数。`,
      hint2: `那时的差还是 ${diff} 岁，正好是 ${n} − 1 份，一除就是孩子那时的岁数。`,
    });
  }

  // L3 和倍复合:今年和 S,k 年后是 n 倍。构造:先定 k 年后孩子 u 岁
  const combos = [];
  for (const n of [2, 3, 4])
    for (let u = 8; u <= 18; u++)
      for (let k = 1; k <= 6; k++) {
        const c = u - k, dad = n * u - k;
        if (c >= 3 && c <= 12 && dad >= 28 && dad <= 45 && dad - c >= 18 && dad - c <= 38) combos.push({ n, u, k, c, dad });
      }
  const { n, u, k, c, dad } = r.pick(combos);
  const S = c + dad;
  invariant(S + 2 * k === (n + 1) * u, 'age L3 sum clean');
  return q({
    tag: 'age_diff', level, seed,
    zh: `${kid} 和${parent}今年的年龄和是 ${S} 岁。${k} 年后，${parent}的年龄正好是 ${kid} 的 ${n} 倍。${kid} 今年多少岁？`,
    en: `The total age of ${kid} and ${kid}'s ${pEn} is ${S} years now. In ${k} years' time, the ${pEn} will be ${n} times as old as ${kid}. How old is ${kid} now?`,
    answer: { value: c, unit: '岁', sentence: `${kid} 今年 ${c} 岁。` },
    steps: [
      { label: '差不变和会变', text: `年龄差永远不变，但年龄和会变：每过 1 年两人各长 1 岁，和多 2 岁。${k} 年后的和 = ${S} + 2 × ${k} = ${S + 2 * k} 岁。` },
      { label: '拆份数', text: `那时${parent} ${n} 份、${kid} 1 份，和 = ${n} + 1 = ${n + 1} 份 = ${S + 2 * k} 岁，1 份 = ${S + 2 * k} ÷ ${n + 1} = ${u} 岁。` },
      { label: '退回今年', text: `那时 ${kid} ${u} 岁，今年 = ${u} − ${k} = ${c} 岁。` },
      { label: '验一验', text: `今年${parent} = ${S} − ${c} = ${dad} 岁；${k} 年后 ${kid} ${u} 岁、${parent} ${dad + k} 岁，${u} × ${n} = ${dad + k}，和 = ${S + 2 * k} ✓` },
    ],
    hint1: `年龄差永远不变；可这题给的是"和"——想想年龄和每年变多少。`,
    hint2: `${k} 年后两人各长 ${k} 岁，和变成 ${S} + 2 × ${k} 岁，那时正好是 ${n} + 1 份。`,
  });
}

/* ============================================================
 * 2. profit_discount 利润折扣(统一尺度族 · 百分数应用)
 * 模型思想:加价的单位 1 是"成本",打折的单位 1 是"定价"——
 * 认准每个百分数各自的单位 1,再一步一步换算。
 * 百分数只用干净集合:加价 {20%, 25%, 50%},折扣 {九折, 八折, 七五折, 五折};
 * 成本按整除步长构造,保证每一步金额都是整数元。
 * L1 成本加价求定价 / 定价打折求现价。
 * L2 先加价再打折,求实际利润(构造保证 > 0)。
 * L3 逆向:加价 p%、打 d 折、赚 R 元,反求成本。
 * ============================================================ */
const GOODS = [
  { zh: '外套', cl: '件', en: 'jacket' },
  { zh: '书包', cl: '个', en: 'school bag' },
  { zh: '电风扇', cl: '台', en: 'electric fan' },
  { zh: '运动鞋', cl: '双', en: 'pair of sports shoes' },
  { zh: '台灯', cl: '个', en: 'desk lamp' },
];

// 英文不定冠词(electric fan 要用 an)
function art(word) { return /^[aeiou]/i.test(word) ? 'an' : 'a'; }

function genProfitDiscount(r, level, seed) {
  const g = r.pick(GOODS);
  const aGoods = `${art(g.en)} ${g.en}`;

  if (level === 1) {
    if (r.bool()) {
      // 模板 a:成本 C,加价 p%,求定价。步长保证 C·p/100 为整数
      const opts = [{ p: 20, step: 5 }, { p: 25, step: 4 }, { p: 50, step: 2 }];
      const { p, step } = r.pick(opts);
      const C = step * r.int(Math.ceil(30 / step), Math.floor(200 / step));
      const add = C * p / 100;
      const marked = C + add;
      invariant(Number.isInteger(add) && marked > C, 'profit L1a clean');
      return q({
        tag: 'profit_discount', level, seed,
        zh: `商店进了一${g.cl}${g.zh}，成本 ${C} 元，按成本加价 ${p}% 定价。这${g.cl}${g.zh}的定价是多少元？`,
        en: `A shop buys ${aGoods} at a cost price of $${C}. It marks up the price by ${p}% of the cost. What is the marked price of the ${g.en}?`,
        answer: { value: marked, unit: '元', sentence: `定价是 ${marked} 元。` },
        steps: [
          { label: '认单位 1', text: `"加价 ${p}%"是把成本看作单位 1，加的是成本的 ${p}%。` },
          { label: '算加价', text: `加价 = ${C} × ${p}% = ${add} 元。` },
          { label: '算定价', text: `定价 = 成本 + 加价 = ${C} + ${add} = ${marked} 元。` },
          { label: '验一验', text: `定价比成本多 ${marked} − ${C} = ${add} 元，${add} ÷ ${C} = ${p}%，与"加价 ${p}%"相符 ✓` },
        ],
        hint1: `先认准单位 1："加价 ${p}%"是谁的 ${p}%？——是成本的。`,
        hint2: `先算成本的 ${p}% 是多少元，再加到成本上。`,
      });
    }
    // 模板 b:定价 P 打 d 折,求现价。步长保证现价为整数
    const opts = [
      { dz: '九折', pct: 90, step: 10 },
      { dz: '八折', pct: 80, step: 5 },
      { dz: '七五折', pct: 75, step: 4 },
      { dz: '五折', pct: 50, step: 2 },
    ];
    const { dz, pct, step } = r.pick(opts);
    const P = step * r.int(Math.ceil(40 / step), Math.floor(300 / step));
    const sale = P * pct / 100;
    invariant(Number.isInteger(sale) && sale > 0, 'profit L1b clean');
    return q({
      tag: 'profit_discount', level, seed,
      zh: `一${g.cl}${g.zh}定价 ${P} 元，现在打${dz}出售。现价是多少元？`,
      en: `The marked price of ${aGoods} is $${P}. It is now sold at a ${100 - pct}% discount. What is the selling price?`,
      answer: { value: sale, unit: '元', sentence: `现价是 ${sale} 元。` },
      steps: [
        { label: '认单位 1', text: `"打${dz}"是把定价看作单位 1，现价是定价的 ${pct}%。` },
        { label: '算现价', text: `现价 = ${P} × ${pct}% = ${sale} 元。` },
        { label: '看便宜', text: `比定价便宜了 ${P} − ${sale} = ${P - sale} 元，正好是定价的 ${100 - pct}%。` },
        { label: '验一验', text: `${sale} ÷ ${P} = ${pct}%，正好是打${dz} ✓` },
      ],
      hint1: `打${dz}的单位 1 是定价——现价是定价的百分之几？`,
      hint2: `打${dz}就是按定价的 ${pct}% 卖，用 ${P} × ${pct}% 算现价。`,
    });
  }

  if (level === 2) {
    // 先加价 p% 再打折,求利润。组合表保证每步整数且利润 > 0
    const opts = [
      { p: 50, dz: '九折', pct: 90, step: 20 },  // 利润 35%·C
      { p: 50, dz: '八折', pct: 80, step: 10 },  // 利润 20%·C
      { p: 25, dz: '九折', pct: 90, step: 8 },   // 利润 12.5%·C
      { p: 20, dz: '九折', pct: 90, step: 25 },  // 利润 8%·C
    ];
    const { p, dz, pct, step } = r.pick(opts);
    const C = step * r.int(2, Math.floor(280 / step));
    const marked = C * (100 + p) / 100;
    const sale = marked * pct / 100;
    const profit = sale - C;
    invariant(Number.isInteger(marked) && Number.isInteger(sale) && Number.isInteger(profit) && profit > 0, 'profit L2 clean');
    return q({
      tag: 'profit_discount', level, seed,
      zh: `一${g.cl}${g.zh}的成本是 ${C} 元，商店先按成本加价 ${p}% 定价，再按定价打${dz}出售。卖出这${g.cl}${g.zh}能赚多少元？`,
      en: `The cost price of ${aGoods} is $${C}. The shop first marks up the price by ${p}% of the cost, then sells it at a ${100 - pct}% discount off the marked price. How much profit does the shop make on this ${g.en}?`,
      answer: { value: profit, unit: '元', sentence: `能赚 ${profit} 元。` },
      steps: [
        { label: '认单位 1', text: `加价 ${p}% 的单位 1 是成本，打${dz}的单位 1 是定价——两个百分数的单位 1 不一样，要一步一步来。` },
        { label: '算定价', text: `定价 = ${C} × (1 + ${p}%) = ${marked} 元。` },
        { label: '算现价', text: `现价 = ${marked} × ${pct}% = ${sale} 元。` },
        { label: '算利润', text: `利润 = 现价 − 成本 = ${sale} − ${C} = ${profit} 元。` },
        { label: '验一验', text: `${C} 元进货、${sale} 元卖出，${C} + ${profit} = ${sale} 元，账正好对上 ✓` },
      ],
      hint1: `两个百分数、两个单位 1：加价看成本，打折看定价，别混在一起乘。`,
      hint2: `先用成本算出定价 ${C} × (1 + ${p}%)，再用定价算现价。`,
    });
  }

  // L3 逆向:加价 p%、打折卖出、赚 R 元,求成本。
  // 组合表:卖出价占成本的 rate%,利润率 = rate − 100,构造 R 使成本为整数
  const opts = [
    { p: 50, dz: '八折', pct: 80, rate: 120, step: 10, rk: 2 },  // C = 10k, R = 2k
    { p: 50, dz: '九折', pct: 90, rate: 135, step: 20, rk: 7 },  // C = 20k, R = 7k
    { p: 20, dz: '九折', pct: 90, rate: 108, step: 25, rk: 2 },  // C = 25k, R = 2k
  ];
  const { p, dz, pct, rate, step, rk } = r.pick(opts);
  const k = r.int(3, 15);
  const C = step * k;
  const R = rk * k;
  const marked = C * (100 + p) / 100;
  const sale = marked * pct / 100;
  invariant(Number.isInteger(marked) && Number.isInteger(sale) && sale - C === R && R > 0, 'profit L3 clean');
  return q({
    tag: 'profit_discount', level, seed,
    zh: `商店卖一${g.cl}${g.zh}：按成本加价 ${p}% 定价，再按定价打${dz}卖出，结果赚了 ${R} 元。这${g.cl}${g.zh}的成本是多少元？`,
    en: `A shop sells ${aGoods}. The price is marked up by ${p}% of the cost, then the ${g.en} is sold at a ${100 - pct}% discount off the marked price. The shop makes a profit of $${R}. What is the cost price of the ${g.en}?`,
    answer: { value: C, unit: '元', sentence: `成本是 ${C} 元。` },
    steps: [
      { label: '认单位 1', text: `成本不知道，就把成本看作单位 1（100 份）。加价 ${p}% 的单位 1 是成本，打${dz}的单位 1 是定价。` },
      { label: '连起来算', text: `定价 = 成本的 ${100 + p}%；现价 = 定价的 ${pct}% = 成本的 ${100 + p}% × ${pct}% = ${rate}%。` },
      { label: '对应利润', text: `赚的部分 = ${rate}% − 100% = ${rate - 100}%，对应 ${R} 元，成本 = ${R} ÷ ${rate - 100}% = ${C} 元。` },
      { label: '验一验', text: `成本 ${C} 元 → 定价 ${marked} 元 → 打${dz}卖 ${sale} 元，${sale} − ${C} = ${R} 元 ✓` },
    ],
    hint1: `成本不知道就设成本为单位 1，把"加价再打折"连成一个百分数。`,
    hint2: `现价是成本的 ${100 + p}% × ${pct}% = ${rate}%，多出来的 ${rate - 100}% 正好是赚的 ${R} 元。`,
  });
}

/* ============================================================
 * 3. interval 植树/间隔问题(点段定位族 · 核心:分清点与段)
 * 模型思想:画一画——点是树,段是间隔。两端都栽 = 段 + 1,
 * 一端栽 = 段,两端不栽 = 段 − 1,环形 = 段;锯木头/敲钟/爬楼同理。
 * L1 直线两端都栽:求棵数 / 反问路长 / 反问间隔(全部整除构造)。
 * L2 由 seed 定变式:一端不栽 / 两端不栽 / 锯木头 / 敲钟。
 * L3 环形带花费复合,或爬楼梯先归一再放大。
 * ============================================================ */
function genInterval(r, level, seed) {
  if (level === 1) {
    const d = r.pick([2, 3, 4, 5, 6]);
    const s = r.int(4, 15);           // 段数
    const L = d * s;
    const trees = s + 1;
    const v = seed % 3;
    if (v === 0) {
      return q({
        tag: 'interval', level, seed,
        zh: `一条小路长 ${L} 米，在路的一侧从一端到另一端每隔 ${d} 米栽一棵树，两端都要栽。一共要栽多少棵树？`,
        en: `A path is ${L} m long. Trees are planted along one side of the path at intervals of ${d} m, with a tree at each end. How many trees are needed?`,
        answer: { value: trees, unit: '棵', sentence: `一共要栽 ${trees} 棵树。` },
        steps: [
          { label: '画一画', text: `点是树，段是间隔。两端都栽时，最前面多出一棵——棵数 = 段数 + 1。` },
          { label: '算段数', text: `${L} ÷ ${d} = ${s} 段。` },
          { label: '加一', text: `棵数 = ${s} + 1 = ${trees} 棵。` },
          { label: '验一验', text: `${trees} 棵树之间有 ${trees} − 1 = ${s} 个间隔，${s} × ${d} = ${L} 米，正好是路长 ✓` },
        ],
        hint1: `先画几个点试试：两端都栽时，树的棵数和间隔的段数差几？`,
        hint2: `先算 ${L} ÷ ${d} 得段数，两端都栽要再加 1。`,
      });
    }
    if (v === 1) {
      return q({
        tag: 'interval', level, seed,
        zh: `在一条小路的一侧从一端到另一端每隔 ${d} 米栽一棵树，两端都栽，一共栽了 ${trees} 棵。这条小路长多少米？`,
        en: `Trees are planted along one side of a path at intervals of ${d} m, with a tree at each end. ${trees} trees are planted in all. How long is the path?`,
        answer: { value: L, unit: '米', sentence: `这条小路长 ${L} 米。` },
        steps: [
          { label: '画一画', text: `点是树，段是间隔。两端都栽：棵数 = 段数 + 1，所以段数 = 棵数 − 1。` },
          { label: '算段数', text: `${trees} − 1 = ${s} 段。` },
          { label: '算路长', text: `${s} × ${d} = ${L} 米。` },
          { label: '验一验', text: `${L} ÷ ${d} = ${s} 段，两端都栽是 ${s} + 1 = ${trees} 棵，和题目相符 ✓` },
        ],
        hint1: `路长藏在"段"里：先想清楚 ${trees} 棵树之间有几段。`,
        hint2: `两端都栽，段数 = 棵数 − 1，再乘上每段 ${d} 米。`,
      });
    }
    return q({
      tag: 'interval', level, seed,
      zh: `一条小路长 ${L} 米，在路的一侧从一端到另一端等距离栽了 ${trees} 棵树（两端都栽）。相邻两棵树之间相隔多少米？`,
      en: `A path is ${L} m long. ${trees} trees are planted at equal distances along one side of the path, with a tree at each end. What is the distance between two neighbouring trees?`,
      answer: { value: d, unit: '米', sentence: `相邻两棵树相隔 ${d} 米。` },
      steps: [
        { label: '画一画', text: `点是树，段是间隔。两端都栽：${trees} 棵树之间只有 ${trees} − 1 = ${s} 段。` },
        { label: '算间隔', text: `${L} ÷ ${s} = ${d} 米。` },
        { label: '防坑', text: `千万别用 ${L} ÷ ${trees}——除的应该是"段数"，不是"棵数"。` },
        { label: '验一验', text: `${s} 段 × ${d} 米 = ${L} 米，正好是路长 ✓` },
      ],
      hint1: `路长被分成的是"段"不是"棵"——${trees} 棵树把路分成几段？`,
      hint2: `两端都栽时段数 = ${trees} − 1，用路长除以段数。`,
    });
  }

  if (level === 2) {
    const v = seed % 4;
    if (v === 0) {
      // 一端栽、一端不栽:棵数 = 段数
      const d = r.pick([2, 3, 4, 5, 6, 8]);
      const s = r.int(5, 20);
      const L = d * s;
      return q({
        tag: 'interval', level, seed,
        zh: `一条走廊长 ${L} 米，从一端到另一端每隔 ${d} 米放一盆花，一端放、另一端不放。一共要放多少盆花？`,
        en: `A corridor is ${L} m long. Pots of flowers are placed every ${d} m from one end to the other, with a pot at one end but not at the other. How many pots are needed?`,
        answer: { value: s, unit: '盆', sentence: `一共要放 ${s} 盆花。` },
        steps: [
          { label: '画一画', text: `点是花盆，段是间隔。一端放、一端不放，点和段一一配对——盆数 = 段数，不加不减。` },
          { label: '算段数', text: `${L} ÷ ${d} = ${s} 段。` },
          { label: '落答案', text: `盆数 = 段数 = ${s} 盆。` },
          { label: '验一验', text: `${s} 盆花配 ${s} 段，${s} × ${d} = ${L} 米，正好到走廊另一端 ✓` },
        ],
        hint1: `画个示意图：只有一端放时，每一段正好"领"一盆花。`,
        hint2: `一端放一端不放：盆数 = 段数 = ${L} ÷ ${d}，不用加 1 也不用减 1。`,
      });
    }
    if (v === 1) {
      // 两端都不栽:棵数 = 段数 − 1
      const d = r.pick([2, 3, 4, 5, 6, 8]);
      const s = r.int(5, 20);
      const L = d * s;
      const trees = s - 1;
      invariant(trees >= 1, 'interval L2 neither-end positive');
      return q({
        tag: 'interval', level, seed,
        zh: `两座楼之间相距 ${L} 米，在两楼之间每隔 ${d} 米栽一棵树，紧挨两楼的两端都不栽。一共要栽多少棵树？`,
        en: `Two buildings are ${L} m apart. Trees are planted between them at intervals of ${d} m, with no tree at either end (next to the buildings). How many trees are needed?`,
        answer: { value: trees, unit: '棵', sentence: `一共要栽 ${trees} 棵树。` },
        steps: [
          { label: '画一画', text: `点是树，段是间隔。两端都不栽，两头各少一棵——棵数 = 段数 − 1。` },
          { label: '算段数', text: `${L} ÷ ${d} = ${s} 段。` },
          { label: '减一', text: `棵数 = ${s} − 1 = ${trees} 棵。` },
          { label: '验一验', text: `${trees} 棵树把 ${L} 米分成 ${trees} + 1 = ${s} 段，${s} × ${d} = ${L} 米 ✓` },
        ],
        hint1: `两端是楼不是树——和"两端都栽"比，少了几棵？`,
        hint2: `先算段数 ${L} ÷ ${d}，两端都不栽要减 1。`,
      });
    }
    if (v === 2) {
      // 锯木头:锯成 m 段要锯 m−1 次
      const m = r.int(4, 10);
      const t = r.int(2, 6);
      const ans = (m - 1) * t;
      return q({
        tag: 'interval', level, seed,
        zh: `把一根木头锯成 ${m} 段，每锯一次要用 ${t} 分钟。锯完一共要用多少分钟？`,
        en: `A log is sawn into ${m} pieces. Each cut takes ${t} minutes. How many minutes does it take altogether?`,
        answer: { value: ans, unit: '分钟', sentence: `一共要用 ${ans} 分钟。` },
        steps: [
          { label: '画一画', text: `点是"锯口"，段是木头。锯 1 次多 1 段——锯成 ${m} 段只要锯 ${m} − 1 次（次数 = 段数 − 1）。` },
          { label: '算次数', text: `${m} − 1 = ${m - 1} 次。` },
          { label: '算时间', text: `${m - 1} × ${t} = ${ans} 分钟。` },
          { label: '验一验', text: `锯 ${m - 1} 次，木头正好变成 ${m - 1} + 1 = ${m} 段 ✓` },
        ],
        hint1: `拿张纸撕撕看：撕 1 次变 2 片，撕 2 次变 3 片——次数和段数差 1。`,
        hint2: `锯成 ${m} 段只需要 ${m} − 1 次，别用 ${m} 去乘。`,
      });
    }
    // 敲钟:敲 n 下有 n−1 个间隔
    const n = r.int(4, 12);
    const gsec = r.int(2, 6);
    const ans = (n - 1) * gsec;
    return q({
      tag: 'interval', level, seed,
      zh: `大钟整点报时，一共敲 ${n} 下，相邻两下之间间隔 ${gsec} 秒。从敲第一下到敲完最后一下，一共经过多少秒？`,
      en: `A clock strikes ${n} times on the hour, with ${gsec} seconds between two strikes. How many seconds pass from the first strike to the last?`,
      answer: { value: ans, unit: '秒', sentence: `一共经过 ${ans} 秒。` },
      steps: [
        { label: '画一画', text: `点是"敲的那一下"，段是间隔。敲 ${n} 下，中间只有 ${n} − 1 个间隔（段数 = 点数 − 1）。` },
        { label: '算间隔数', text: `${n} − 1 = ${n - 1} 个间隔。` },
        { label: '算时间', text: `${n - 1} × ${gsec} = ${ans} 秒。` },
        { label: '验一验', text: `${n - 1} 个间隔隔开 ${n - 1} + 1 = ${n} 下钟声，和题目相符 ✓` },
      ],
      hint1: `钟声是"点"，等待是"段"——敲 ${n} 下之间有几段等待？`,
      hint2: `${n} 下钟声之间只有 ${n} − 1 个间隔，别乘成 ${n} 个。`,
    });
  }

  // L3:环形复合 或 爬楼梯归一复合
  if (r.bool()) {
    // 环形:棵数 = 段数(不加不减),再复合一步算花费
    const d = r.pick([2, 3, 4, 5, 6]);
    const s = r.int(6, 24);
    const L = d * s;
    const c = r.int(3, 15);
    const cost = s * c;
    return q({
      tag: 'interval', level, seed,
      zh: `一个圆形花坛的一圈长 ${L} 米，沿着边每隔 ${d} 米栽一棵树，每棵树苗 ${c} 元。买树苗一共要花多少元？`,
      en: `The border of a circular flower bed is ${L} m round. Trees are planted along the border at intervals of ${d} m. Each sapling costs $${c}. How much do all the saplings cost?`,
      answer: { value: cost, unit: '元', sentence: `买树苗一共要花 ${cost} 元。` },
      steps: [
        { label: '画一画', text: `点是树，段是间隔。环形一圈首尾相接，最后一段正好接回第一棵树——棵数 = 段数，不加 1 也不减 1。` },
        { label: '算棵数', text: `${L} ÷ ${d} = ${s} 段，就栽 ${s} 棵树。` },
        { label: '算花费', text: `${s} × ${c} = ${cost} 元。` },
        { label: '验一验', text: `${s} 棵树 ${s} 段，${s} × ${d} = ${L} 米，正好绕花坛一圈 ✓` },
      ],
      hint1: `直线两端都栽要加 1，可环形首尾接起来了——还要加吗？`,
      hint2: `环形上棵数 = 段数 = ${L} ÷ ${d}，再乘每棵 ${c} 元。`,
    });
  }
  // 爬楼梯:1 楼到 a 楼走 a−1 层,先归一再放大
  const name = r.pick(NAMES);
  const per = r.int(6, 20);
  const a = r.int(3, 6);
  const T = (a - 1) * per;
  const b = r.int(a + 2, 12);
  const ans = (b - 1) * per;
  invariant(b > a && ans > T, 'interval L3 stairs valid');
  return q({
    tag: 'interval', level, seed,
    zh: `${name} 从 1 楼走到 ${a} 楼一共用了 ${T} 秒。照这样的速度，${name} 从 1 楼走到 ${b} 楼要用多少秒？`,
    en: `${name} takes ${T} seconds to walk from the 1st storey to the ${a}th storey. At this speed, how many seconds will ${name} take to walk from the 1st storey to the ${b}th storey?`,
    answer: { value: ans, unit: '秒', sentence: `走到 ${b} 楼要用 ${ans} 秒。` },
    steps: [
      { label: '画一画', text: `楼层是"点"，楼梯是"段"。从 1 楼到 ${a} 楼只走 ${a} − 1 = ${a - 1} 层楼梯（段数 = 楼层数 − 1）。` },
      { label: '归一', text: `每层楼梯用 ${T} ÷ ${a - 1} = ${per} 秒。` },
      { label: '再放大', text: `到 ${b} 楼要走 ${b} − 1 = ${b - 1} 层楼梯，${b - 1} × ${per} = ${ans} 秒。` },
      { label: '验一验', text: `回代：${a - 1} 层 × ${per} 秒 = ${T} 秒，与题目相符 ✓` },
    ],
    hint1: `从 1 楼到 ${a} 楼，走的楼梯是 ${a} 层还是 ${a} − 1 层？先把这个数清楚。`,
    hint2: `先算每层楼梯的时间 ${T} ÷ (${a} − 1)，再看到 ${b} 楼要走几层。`,
  });
}

/* ============================================================
 * 4. cycle 周期问题(点段定位族 · 核心:余数定位)
 * 模型思想:除以周期长,余几就落在一组里的第几个;余 0 落在组尾。
 * L1 图案循环:前 N 个里某颜色有几个(完整组 × 组内个数 + 余数部分逐个数)。
 * L2 星期推算(答案 1~7,7=星期日,注意余 0)或"第 N 个是组里第几个"。
 * L3 两种周期叠加用 lcm,或跨月推星期(题面给出本月天数)。
 * ============================================================ */
const PATTERNS = [
  { seq: ['红', '红', '蓝', '黄'], itemZh: '珠子', cl: '颗', itemEn: 'beads' },
  { seq: ['红', '黄', '蓝'], itemZh: '旗子', cl: '面', itemEn: 'flags' },
  { seq: ['黑', '白', '白'], itemZh: '棋子', cl: '枚', itemEn: 'counters' },
  { seq: ['红', '红', '黄', '黄', '蓝'], itemZh: '气球', cl: '个', itemEn: 'balloons' },
];
const COLOR_EN = { 红: 'red', 黄: 'yellow', 蓝: 'blue', 绿: 'green', 黑: 'black', 白: 'white' };

function genCycle(r, level, seed) {
  if (level === 1) {
    const pat = r.pick(PATTERNS);
    const len = pat.seq.length;
    const color = r.pick([...new Set(pat.seq)]);
    const cIn = pat.seq.filter(x => x === color).length;
    const full = r.int(3, 12);
    const rem = r.int(0, len - 1);
    const N = full * len + rem;
    const inRem = pat.seq.slice(0, rem).filter(x => x === color).length;
    const ans = full * cIn + inRem;
    invariant(ans > 0, 'cycle L1 count positive');
    const seqZh = pat.seq.join('、');
    const seqEn = pat.seq.map(x => COLOR_EN[x]).join(', ');
    return q({
      tag: 'cycle', level, seed,
      zh: `按“${seqZh}”的顺序不断循环摆${pat.itemZh}。前 ${N} ${pat.cl}里一共有多少${pat.cl}${color}色${pat.itemZh}？`,
      en: `${pat.itemEn.charAt(0).toUpperCase() + pat.itemEn.slice(1)} are laid out in the repeating pattern "${seqEn}". How many ${COLOR_EN[color]} ${pat.itemEn} are there among the first ${N} ${pat.itemEn}?`,
      answer: { value: ans, unit: pat.cl, sentence: `前 ${N} ${pat.cl}里有 ${ans} ${pat.cl}${color}色${pat.itemZh}。` },
      steps: [
        { label: '找周期', text: `“${seqZh}”每 ${len} ${pat.cl}一组，每组里${color}色有 ${cIn} ${pat.cl}。` },
        { label: '分组', text: `${N} ÷ ${len} = ${full} 组余 ${rem}——除以周期长，余几就落在组里第几个；余 0 正好落在组尾。完整的 ${full} 组里有 ${full} × ${cIn} = ${full * cIn} ${pat.cl}${color}色。` },
        { label: '数零头', text: rem === 0 ? `余 0，没有零头，一${pat.cl}也不用再数。` : `余下的 ${rem} ${pat.cl}是一组的开头“${pat.seq.slice(0, rem).join('、')}”，其中${color}色有 ${inRem} ${pat.cl}。` },
        { label: '合计', text: `${full * cIn} + ${inRem} = ${ans} ${pat.cl}。` },
        { label: '验一验', text: `${full} × ${len} + ${rem} = ${N} ${pat.cl}，分组没有多也没有少 ✓` },
      ],
      hint1: `图案在"转圈"——先找到一组是几${pat.cl}，再看 ${N} 里装得下几组。`,
      hint2: `${N} ÷ ${len}，商是完整的组数，余数部分要对着一组的开头逐${pat.cl}数。`,
    });
  }

  if (level === 2) {
    if (r.bool()) {
      // 星期推算:今天星期 x,再过 N 天星期几(1~7,7=星期日)
      const x = r.int(1, 7);
      const N = r.int(10, 60);
      const rem = N % 7;
      const ans = ((x - 1 + N) % 7) + 1;
      invariant(ans >= 1 && ans <= 7, 'cycle L2 weekday range');
      return q({
        tag: 'cycle', level, seed,
        zh: `今天是星期${WEEK_ZH[x - 1]}。再过 ${N} 天是星期几？（答案用 1~7 表示，7 表示星期日）`,
        en: `Today is ${WEEK_EN[x - 1]}. What day of the week will it be ${N} days from now? (Answer with 1 to 7, where 7 stands for Sunday.)`,
        answer: { value: ans, unit: '（1~7，7=星期日）', sentence: `再过 ${N} 天是星期${WEEK_ZH[ans - 1]}（用数字表示是 ${ans}）。` },
        steps: [
          { label: '找周期', text: `星期 7 天一循环——每过 7 天又回到星期${WEEK_ZH[x - 1]}。` },
          { label: '除周期', text: `${N} ÷ 7 = ${Math.floor(N / 7)} 周余 ${rem}——除以周期长，余几就往后数几天；余 0 落在组尾，还是原来那天。` },
          { label: '定位', text: rem === 0 ? `余 0，${N} 天正好是整数周，还是星期${WEEK_ZH[x - 1]}。` : `整周不改变星期，只看余数：从星期${WEEK_ZH[x - 1]}往后数 ${rem} 天，是星期${WEEK_ZH[ans - 1]}。` },
          { label: '验一验', text: `7 × ${Math.floor(N / 7)} + ${rem} = ${N} 天，余数没算错 ✓` },
        ],
        hint1: `星期是 7 天一个周期——${N} 天里藏着几个整周？整周不改变星期几。`,
        hint2: `${N} ÷ 7 看余数：余几就从今天往后数几天，余 0 就还是今天这个星期几。`,
      });
    }
    // 第 N 个是一组里的第几个(余 0 → 组尾)
    const pat = r.pick(PATTERNS);
    const len = pat.seq.length;
    const N = r.int(20, 100);
    const rem = N % len;
    const ans = rem === 0 ? len : rem;
    invariant(ans === ((N - 1) % len) + 1, 'cycle L2 position clean');
    const seqZh = pat.seq.join('、');
    const seqEn = pat.seq.map(x => COLOR_EN[x]).join(', ');
    return q({
      tag: 'cycle', level, seed,
      zh: `按“${seqZh}”的顺序不断循环摆${pat.itemZh}。第 ${N} ${pat.cl}${pat.itemZh}是一组中的第几个？`,
      en: `${pat.itemEn.charAt(0).toUpperCase() + pat.itemEn.slice(1)} are laid out in the repeating pattern "${seqEn}". In which position of a group is the ${N}th one?`,
      answer: { value: ans, unit: '', sentence: `第 ${N} ${pat.cl}是一组中的第 ${ans} 个（${pat.seq[ans - 1]}色）。` },
      steps: [
        { label: '找周期', text: `“${seqZh}”每 ${len} ${pat.cl}一组。` },
        { label: '除周期', text: `${N} ÷ ${len} = ${Math.floor(N / len)} 组余 ${rem}——除以周期长，余几就落在组里第几个；余 0 落在组尾。` },
        { label: '定位', text: rem === 0 ? `余 0，第 ${N} ${pat.cl}正好是一组的最后一个，即第 ${len} 个（${pat.seq[len - 1]}色）。` : `余 ${rem}，第 ${N} ${pat.cl}是一组中的第 ${rem} 个（${pat.seq[rem - 1]}色）。` },
        { label: '验一验', text: `${Math.floor(N / len)} × ${len} + ${rem} = ${N}，定位没有偏 ✓` },
      ],
      hint1: `先找一组有几${pat.cl}，再用 ${N} 去除——落点全看余数。`,
      hint2: `${N} ÷ ${len} 余几就是第几个；要是余 0，说明正好数完整组，落在组尾。`,
    });
  }

  // L3
  if (r.bool()) {
    // 两种周期叠加:第一次再同时 = lcm
    const pairs = [[3, 4], [4, 5], [3, 5], [4, 6], [6, 8], [6, 9]];
    const [a, b] = r.pick(pairs);
    const m = lcm(a, b);
    invariant(m % a === 0 && m % b === 0 && m > 0, 'cycle L3 lcm clean');
    return q({
      tag: 'cycle', level, seed,
      zh: `节日彩灯每 ${a} 秒闪一次，音乐盒每 ${b} 秒响一次。两者同时开始后，至少再过多少秒它们又同时发生？`,
      en: `A festival light flashes every ${a} seconds and a music box chimes every ${b} seconds. They start together. After how many seconds, at the least, will they happen together again?`,
      answer: { value: m, unit: '秒', sentence: `至少再过 ${m} 秒又同时发生。` },
      steps: [
        { label: '认周期', text: `两个周期叠在一起：彩灯的时刻是 ${a} 的倍数，音乐盒的时刻是 ${b} 的倍数。` },
        { label: '找公倍数', text: `"又同时"的时刻必须既是 ${a} 的倍数又是 ${b} 的倍数——要找最小公倍数。` },
        { label: '算 lcm', text: `${a} 和 ${b} 的最小公倍数是 ${m}。` },
        { label: '验一验', text: `${m} ÷ ${a} = ${m / a}、${m} ÷ ${b} = ${m / b}，都除得尽；比 ${m} 更小的正整数做不到 ✓` },
      ],
      hint1: `两个周期各转各的——什么时刻能同时踩到两个周期的"整点"？`,
      hint2: `把 ${a} 的倍数和 ${b} 的倍数各列几个，第一个相同的数就是答案（最小公倍数）。`,
    });
  }
  // 跨月推星期(题面给出本月天数,避免记忆负担;不用二月)
  const months = [[1, 31], [3, 31], [4, 30], [5, 31], [6, 30], [7, 31], [8, 31], [9, 30], [10, 31], [11, 30]];
  const [mo, dim] = r.pick(months);
  const day1 = r.int(1, 20);
  const day2 = r.int(1, 27);
  const x = r.int(1, 7);
  const N = dim - day1 + day2;
  const rem = N % 7;
  const ans = ((x - 1 + N) % 7) + 1;
  invariant(N >= 1 && ans >= 1 && ans <= 7, 'cycle L3 weekday clean');
  const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return q({
    tag: 'cycle', level, seed,
    zh: `${mo} 月 ${day1} 日是星期${WEEK_ZH[x - 1]}。同一年 ${mo + 1} 月 ${day2} 日是星期几？（答案用 1~7 表示，7 表示星期日。已知 ${mo} 月有 ${dim} 天。）`,
    en: `${MONTH_EN[mo - 1]} ${day1} is a ${WEEK_EN[x - 1]}. What day of the week is ${MONTH_EN[mo]} ${day2} in the same year? (Answer with 1 to 7, where 7 stands for Sunday. ${MONTH_EN[mo - 1]} has ${dim} days.)`,
    answer: { value: ans, unit: '（1~7，7=星期日）', sentence: `${mo + 1} 月 ${day2} 日是星期${WEEK_ZH[ans - 1]}（用数字表示是 ${ans}）。` },
    steps: [
      { label: '算天数', text: `先算隔了多少天：${mo} 月还剩 ${dim} − ${day1} = ${dim - day1} 天，再加 ${mo + 1} 月的 ${day2} 天，一共过了 ${dim - day1} + ${day2} = ${N} 天。` },
      { label: '除周期', text: `${N} ÷ 7 = ${Math.floor(N / 7)} 周余 ${rem}——除以周期长，余几就往后数几天；余 0 落在组尾，星期不变。` },
      { label: '定位', text: rem === 0 ? `余 0，正好整数周，还是星期${WEEK_ZH[x - 1]}。` : `从星期${WEEK_ZH[x - 1]}往后数 ${rem} 天，是星期${WEEK_ZH[ans - 1]}。` },
      { label: '验一验', text: `7 × ${Math.floor(N / 7)} + ${rem} = ${N} 天，天数和余数都对得上 ✓` },
    ],
    hint1: `跨月的星期题分两步：先算隔了多少天，再用 7 天周期看余数。`,
    hint2: `${mo} 月还剩 ${dim} − ${day1} 天，加上 ${mo + 1} 月的 ${day2} 天，再除以 7 看余数。`,
  });
}

export const CLASSIC_B = {
  age_diff: genAgeDiff,
  profit_discount: genProfitDiscount,
  interval: genInterval,
  cycle: genCycle,
};
