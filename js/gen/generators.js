// 15 大心智模型 · 参数化出题生成器
// 每个生成器由构造法保证:答案为正整数、中间步骤全为整数、数字干净。
// generate(tag, level, seed) 完全确定,可用 id 复现题目。

import { Rng, NAMES, ITEMS, PRICE_PAIRS, gcd, lcm, invariant, q } from './engine.js';

// 按难度取数量级
function scale(level, s1, s2, s3) { return level === 1 ? s1 : level === 2 ? s2 : s3; }

/* 1. 单边不变:一方不变作锚,另一方单向变化 */
function genAnchorSingle(r, level, seed) {
  const [A, B] = r.pick2(NAMES);
  const it = r.pick(ITEMS);
  const k = r.int(2, scale(level, 3, 4, 5));
  const f = r.int(scale(level, 12, 30, 60), scale(level, 40, 90, 200)); // B 固定数量
  const after = k * f;
  const buy = r.bool();
  const d = r.int(Math.max(2, Math.round(after * 0.15)), Math.round(after * 0.6));
  const orig = buy ? after - d : after + d;
  invariant(orig > 0, 'orig positive');
  const zhChange = buy ? `又买来 ${d} ${it.cl}` : `送出 ${d} ${it.cl}`;
  const enChange = buy ? `bought ${d} more ${it.en}` : `gave away ${d} ${it.en}`;
  return q({
    tag: 'anchor_single', level, seed,
    zh: `${A} 原来有一些${it.zh}。${B} 有 ${f} ${it.cl}${it.zh}，数量一直没变。${A} ${zhChange}后，${A} 的${it.zh}数正好是 ${B} 的 ${k} 倍。${A} 原来有多少${it.cl}${it.zh}？`,
    en: `${A} had some ${it.en}. ${B} had ${f} ${it.en}, and that number did not change. After ${A} ${enChange}, ${A} had ${k} times as many ${it.en} as ${B}. How many ${it.en} did ${A} have at first?`,
    answer: { value: orig, unit: it.cl, sentence: `${A} 原来有 ${orig} ${it.cl}${it.zh}。` },
    steps: [
      { label: '认锚点', text: `${B} 一直没变，${B} 就是不变量：${f} ${it.cl}。` },
      { label: '定后态', text: `${A} 后来是 ${B} 的 ${k} 倍：${f} × ${k} = ${after} ${it.cl}。` },
      { label: '退回去', text: buy ? `${A} 买来 ${d} ${it.cl}才变成 ${after}，原来是 ${after} − ${d} = ${orig} ${it.cl}。` : `${A} 送出 ${d} ${it.cl}才变成 ${after}，原来是 ${after} + ${d} = ${orig} ${it.cl}。` },
      { label: '验一验', text: buy ? `${orig} + ${d} = ${after}，正好是 ${f} 的 ${k} 倍 ✓` : `${orig} − ${d} = ${after}，正好是 ${f} 的 ${k} 倍 ✓` },
    ],
    hint1: `圈一圈：题目里谁的数量从头到尾没变？先把没变的一方钉住。`,
    hint2: `${B} 没变，先用 ${B} 算出 ${A} 后来有多少，再把变化退回去。`,
  });
}

/* 2. 内部转移:A 给 B,总数不变 */
function genAnchorTotal(r, level, seed) {
  const [A, B] = r.pick2(NAMES);
  const it = r.pick(ITEMS);
  if (level === 1 || (level === 2 && r.bool())) {
    // 模板 a:给多少后两人一样多
    const u = r.int(scale(level, 15, 30, 60), scale(level, 40, 90, 180)); // 最终各自数量
    const t = r.int(3, Math.min(u - 1, scale(level, 12, 25, 60)));       // 转移量(答案)
    const a0 = u + t, b0 = u - t;
    invariant(b0 > 0, 'b0 positive');
    return q({
      tag: 'anchor_total', level, seed,
      zh: `${A} 有 ${a0} ${it.cl}${it.zh}，${B} 有 ${b0} ${it.cl}${it.zh}。${A} 给 ${B} 多少${it.cl}${it.zh}后，两人的${it.zh}就一样多？`,
      en: `${A} has ${a0} ${it.en} and ${B} has ${b0} ${it.en}. How many ${it.en} must ${A} give ${B} so that they have the same number of ${it.en}?`,
      answer: { value: t, unit: it.cl, sentence: `${A} 给 ${B} ${t} ${it.cl}${it.zh}。` },
      steps: [
        { label: '总数不变', text: `一共 ${a0} + ${b0} = ${a0 + b0} ${it.cl}，给来给去总数不变。` },
        { label: '算目标', text: `一样多时每人 ${a0 + b0} ÷ 2 = ${u} ${it.cl}。` },
        { label: '算转移', text: `${A} 要从 ${a0} 变成 ${u}，给出 ${a0} − ${u} = ${t} ${it.cl}。` },
        { label: '验一验', text: `${B} 收到后 ${b0} + ${t} = ${u} ${it.cl}，两人一样多 ✓` },
      ],
      hint1: `${A} 给 ${B}，只是${it.zh}搬了家——两人的总数变了吗？`,
      hint2: `先算两人总共有多少，再除以 2 得到"一样多"时每人的数量。`,
    });
  }
  // 模板 b:转移 t 后 A 是 B 的 k 倍,问 A 原来
  const k = r.int(2, 4);
  const m = r.int(scale(level, 8, 15, 30), scale(level, 30, 60, 120)); // B 后态
  const t = r.int(2, m - 1);                                            // A 给 B 的数量
  const aAfter = k * m;
  const a0 = aAfter + t, b0 = m - t;
  invariant(b0 > 0, 'b0 positive');
  return q({
    tag: 'anchor_total', level, seed,
    zh: `${A} 和 ${B} 都有一些${it.zh}。${A} 给了 ${B} ${t} ${it.cl}后，${A} 的${it.zh}数正好是 ${B} 的 ${k} 倍，这时 ${B} 有 ${m} ${it.cl}。${A} 原来有多少${it.cl}${it.zh}？`,
    en: `${A} and ${B} each have some ${it.en}. After ${A} gave ${B} ${t} ${it.en}, ${A} had ${k} times as many ${it.en} as ${B}, and ${B} had ${m} ${it.en}. How many ${it.en} did ${A} have at first?`,
    answer: { value: a0, unit: it.cl, sentence: `${A} 原来有 ${a0} ${it.cl}${it.zh}。` },
    steps: [
      { label: '定后态', text: `给完后 ${B} 有 ${m} ${it.cl}，${A} 是它的 ${k} 倍：${m} × ${k} = ${aAfter} ${it.cl}。` },
      { label: '退回去', text: `${A} 给出过 ${t} ${it.cl}，原来是 ${aAfter} + ${t} = ${a0} ${it.cl}。` },
      { label: '验一验', text: `${a0} − ${t} = ${aAfter}，正好是 ${m} 的 ${k} 倍 ✓` },
    ],
    hint1: `${it.zh}只在两人之间转移。先看"给完之后"的状态清不清楚。`,
    hint2: `后态里 ${B} 有 ${m} ${it.cl}，先算出 ${A} 后来有多少，再把给出去的加回来。`,
  });
}

/* 3. 差额不变:同增同减,差不变(年龄是经典) */
function genAnchorDiff(r, level, seed) {
  if (r.bool()) {
    // 年龄模板:几年后爸爸年龄是孩子的 k 倍
    const kid = r.pick(NAMES);
    const parent = r.pick(['爸爸', '妈妈']);
    const parentEn = parent === '爸爸' ? 'father' : 'mother';
    const k = r.int(2, scale(level, 3, 4, 4));
    const uFuture = r.int(scale(level, 8, 10, 12), scale(level, 12, 16, 18)); // 未来孩子年龄
    const x = r.int(1, uFuture - scale(level, 5, 6, 6));                       // 几年后(答案)
    const kidNow = uFuture - x;
    const diff = uFuture * (k - 1);
    const parentNow = kidNow + diff;
    invariant(kidNow >= 3 && parentNow >= 20 && parentNow <= 70, 'ages plausible: ' + kidNow + '/' + parentNow);
    return q({
      tag: 'anchor_diff', level, seed,
      zh: `${kid} 今年 ${kidNow} 岁，${parent}今年 ${parentNow} 岁。多少年后，${parent}的年龄正好是 ${kid} 的 ${k} 倍？`,
      en: `${kid} is ${kidNow} years old and ${kid}'s ${parentEn} is ${parentNow} years old. In how many years will the ${parentEn} be ${k} times as old as ${kid}?`,
      answer: { value: x, unit: '年', sentence: `${x} 年后。` },
      steps: [
        { label: '差不变', text: `两人同时长大，年龄差永远是 ${parentNow} − ${kidNow} = ${diff} 岁。` },
        { label: '拆份数', text: `那时${parent}是 ${k} 份、${kid} 是 1 份，差 ${k} − 1 = ${k - 1} 份 = ${diff} 岁，1 份 = ${uFuture} 岁。` },
        { label: '算年数', text: `那时 ${kid} ${uFuture} 岁，${uFuture} − ${kidNow} = ${x} 年后。` },
        { label: '验一验', text: `${x} 年后：${kid} ${uFuture} 岁，${parent} ${parentNow + x} 岁 = ${uFuture} × ${k} ✓` },
      ],
      hint1: `两人一起长大，什么永远不变？——年龄差。`,
      hint2: `先算年龄差 ${diff} 岁；那一年差正好是 ${k} − 1 份。`,
    });
  }
  // 同得模板:两人各得 s 个后 A 是 B 的 k 倍
  const [A, B] = r.pick2(NAMES);
  const it = r.pick(ITEMS);
  const k = r.int(2, 4);
  const uAfter = r.int(scale(level, 8, 15, 30), scale(level, 25, 50, 100)); // B 后态
  const s = r.int(2, uAfter - 1);
  const d = uAfter * (k - 1);
  const b0 = uAfter - s, a0 = b0 + d;
  invariant(b0 > 0, 'b0 positive');
  return q({
    tag: 'anchor_diff', level, seed,
    zh: `${A} 的${it.zh}比 ${B} 多 ${d} ${it.cl}。两人各自又得到 ${s} ${it.cl}后，${A} 的${it.zh}数正好是 ${B} 的 ${k} 倍。${B} 原来有多少${it.cl}${it.zh}？`,
    en: `${A} has ${d} more ${it.en} than ${B}. After each of them received ${s} more ${it.en}, ${A} had ${k} times as many ${it.en} as ${B}. How many ${it.en} did ${B} have at first?`,
    answer: { value: b0, unit: it.cl, sentence: `${B} 原来有 ${b0} ${it.cl}${it.zh}。` },
    steps: [
      { label: '差不变', text: `两人同得 ${s} ${it.cl}，差始终是 ${d} ${it.cl}。` },
      { label: '拆份数', text: `后来 ${A} 是 ${k} 份、${B} 是 1 份，差 ${k - 1} 份 = ${d}，1 份 = ${uAfter} ${it.cl}。` },
      { label: '退回去', text: `后来 ${B} 有 ${uAfter} ${it.cl}，原来是 ${uAfter} − ${s} = ${b0} ${it.cl}。` },
      { label: '验一验', text: `原来 ${A} = ${b0} + ${d} = ${a0}；各得 ${s} 后 ${A} = ${a0 + s}，正好是 ${uAfter} × ${k} = ${uAfter * k} ✓` },
    ],
    hint1: `两人同增同减时，先问：它们的差变了吗？`,
    hint2: `差一直是 ${d} ${it.cl}；后来这个差正好是 ${k} − 1 份。`,
  });
}

/* 4. 双变比例:两边都变,用前后两个比 + 差不变/同加量解 */
function genAnchorDouble(r, level, seed) {
  const [A, B] = r.pick2(NAMES);
  // 前比 a:b(互质),各存入 s = m×u,后比 (a+m):(b+m) 需互质
  let a, b, m, tries = 0;
  do {
    a = r.int(1, scale(level, 4, 6, 8));
    b = a + r.int(1, scale(level, 3, 5, 7));
    m = r.int(1, 3);
    tries++;
  } while ((gcd(a, b) !== 1 || gcd(a + m, b + m) !== 1) && tries < 60);
  invariant(gcd(a, b) === 1 && gcd(a + m, b + m) === 1, 'coprime ratios');
  const u = r.int(scale(level, 4, 8, 15), scale(level, 12, 30, 60));
  const s = m * u;
  const a0 = a * u, b0 = b * u;
  return q({
    tag: 'anchor_double', level, seed,
    zh: `${A} 和 ${B} 存钱罐里钱数的比是 ${a}:${b}。两人各自又存入 ${s} 元后，钱数的比变成 ${a + m}:${b + m}。${A} 原来有多少元？`,
    en: `The ratio of ${A}'s savings to ${B}'s savings was ${a}:${b}. After each of them saved another $${s}, the ratio became ${a + m}:${b + m}. How much money did ${A} have at first?`,
    answer: { value: a0, unit: '元', sentence: `${A} 原来有 ${a0} 元。` },
    steps: [
      { label: '对齐尺子', text: `两个比里两人的差都是 ${b - a} 份，说明前后"1 份"一样大，可以放在同一把尺子上。` },
      { label: '找变化', text: `${A} 从 ${a} 份变成 ${a + m} 份，多了 ${m} 份，正好是存入的 ${s} 元，所以 1 份 = ${s} ÷ ${m} = ${u} 元。` },
      { label: '落答案', text: `${A} 原来 = ${a} 份 = ${a} × ${u} = ${a0} 元。` },
      { label: '验一验', text: `存入后 ${A} = ${a0 + s} 元、${B} = ${b0 + s} 元，比是 ${a + m}:${b + m} ✓` },
    ],
    hint1: `两人都在变——但两人存的一样多，差就没变。先看两个比里的"差"各是几份。`,
    hint2: `前后差都是 ${b - a} 份 → 1 份没变。${A} 多出的份数对应存入的 ${s} 元。`,
  });
}

/* 5. 公倍切分:比例/倍数关系 + 总量,切成同样的份 */
function genUnifyRatio(r, level, seed) {
  const it = r.pick(ITEMS);
  if (level >= 2 && r.bool()) {
    // 三人按比分:比 a:b:c,给总量,问最多的那人
    const [A, B] = r.pick2(NAMES);
    const C = r.pick(NAMES.filter(n => n !== A && n !== B));
    let a = r.int(1, 4), b = r.int(a + 1, 6), c = r.int(b + 1, 9);
    const u = r.int(scale(level, 5, 8, 12), scale(level, 15, 30, 60));
    const T = (a + b + c) * u;
    const ans = c * u;
    return q({
      tag: 'unify_ratio', level, seed,
      zh: `${A}、${B}、${C} 三人分 ${T} ${it.cl}${it.zh}，三人分到的数量比是 ${a}:${b}:${c}。分得最多的 ${C} 分到多少${it.cl}？`,
      en: `${A}, ${B} and ${C} share ${T} ${it.en} in the ratio ${a}:${b}:${c}. How many ${it.en} does ${C}, who gets the most, receive?`,
      answer: { value: ans, unit: it.cl, sentence: `${C} 分到 ${ans} ${it.cl}${it.zh}。` },
      steps: [
        { label: '算总份', text: `一共 ${a} + ${b} + ${c} = ${a + b + c} 份。` },
        { label: '算一份', text: `1 份 = ${T} ÷ ${a + b + c} = ${u} ${it.cl}。` },
        { label: '落答案', text: `${C} = ${c} 份 = ${c} × ${u} = ${ans} ${it.cl}。` },
        { label: '验一验', text: `${a * u} + ${b * u} + ${ans} = ${T} ✓` },
      ],
      hint1: `按比例分的题，先把总量切成同样大小的份。`,
      hint2: `先算总份数 ${a}+${b}+${c}，再用总量 ÷ 总份数得到 1 份。`,
    });
  }
  // 倍数和:第二个是第一个的 k 倍,第三个是第一个的 m 倍(或多 d),和为 T
  const k = r.int(2, scale(level, 3, 4, 5));
  const m = r.int(2, scale(level, 4, 5, 6));
  const u = r.int(scale(level, 10, 25, 50), scale(level, 45, 120, 300));
  const T = u + k * u + m * u;
  return q({
    tag: 'unify_ratio', level, seed,
    zh: `三个数的和是 ${T}。第二个数是第一个数的 ${k} 倍，第三个数是第一个数的 ${m} 倍。第一个数是多少？`,
    en: `The sum of three numbers is ${T}. The second number is ${k} times the first number. The third number is ${m} times the first number. What is the first number?`,
    answer: { value: u, unit: '', sentence: `第一个数是 ${u}。` },
    steps: [
      { label: '设一份', text: `把第一个数看作 1 份，第二个是 ${k} 份，第三个是 ${m} 份。` },
      { label: '算总份', text: `一共 1 + ${k} + ${m} = ${1 + k + m} 份 = ${T}。` },
      { label: '算一份', text: `第一个数 = ${T} ÷ ${1 + k + m} = ${u}。` },
      { label: '验一验', text: `${u} + ${k * u} + ${m * u} = ${T} ✓` },
    ],
    hint1: `三个数都和"第一个数"有关——把第一个数当作 1 份。`,
    hint2: `用份数把三个数写出来：1 份、${k} 份、${m} 份，加起来等于 ${T}。`,
  });
}

/* 6. 差价代换:两种东西差价固定,把贵的换成便宜的 */
function genUnifySubDiff(r, level, seed) {
  const p = r.pick(PRICE_PAIRS);
  const cheap = r.int(scale(level, 2, 4, 8), scale(level, 8, 15, 30));   // 便宜单价(答案)
  const d = r.int(scale(level, 2, 3, 5), scale(level, 6, 12, 25));      // 差价
  const m = r.int(2, scale(level, 4, 5, 7));                             // 贵的数量
  const n = r.int(2, scale(level, 5, 6, 8));                             // 便宜的数量
  const C = m * (cheap + d) + n * cheap;
  return q({
    tag: 'unify_sub_diff', level, seed,
    zh: `一${p.dearCl}${p.dearZh}比一${p.cheapCl}${p.cheapZh}贵 ${d} 元。买 ${m} ${p.dearCl}${p.dearZh}和 ${n} ${p.cheapCl}${p.cheapZh}一共用了 ${C} 元。一${p.cheapCl}${p.cheapZh}多少元？`,
    en: `A ${p.dearEn} costs $${d} more than a ${p.cheapEn}. ${m} ${p.dearEnPl} and ${n} ${p.cheapEnPl} cost $${C} altogether. How much does one ${p.cheapEn} cost?`,
    answer: { value: cheap, unit: '元', sentence: `一${p.cheapCl}${p.cheapZh} ${cheap} 元。` },
    steps: [
      { label: '做代换', text: `把每${p.dearCl}${p.dearZh}看成"一${p.cheapCl}${p.cheapZh} + ${d} 元"。` },
      { label: '剥差价', text: `${m} 个差价一共 ${m} × ${d} = ${m * d} 元；去掉后剩 ${C} − ${m * d} = ${C - m * d} 元，全是${p.cheapZh}的钱。` },
      { label: '均分', text: `一共 ${m} + ${n} = ${m + n} 个${p.cheapZh}价，${C - m * d} ÷ ${m + n} = ${cheap} 元。` },
      { label: '验一验', text: `${p.dearZh} ${cheap + d} 元：${m} × ${cheap + d} + ${n} × ${cheap} = ${C} ✓` },
    ],
    hint1: `两种东西价格不同但差价固定——能不能把贵的都"换成"便宜的？`,
    hint2: `每个${p.dearZh}换成${p.cheapZh}要吐出 ${d} 元差价，先把总价里的差价剥掉。`,
  });
}

/* 7. 等值代换:1 个大的 = k 个小的 */
function genUnifySubValue(r, level, seed) {
  const pairs = [
    { bigZh: '西瓜', bigEn: 'watermelon', bigEnPl: 'watermelons', smallZh: '苹果', smallEn: 'apple', smallEnPl: 'apples', clB: '个', clS: '个' },
    { bigZh: '钢笔', bigEn: 'pen', bigEnPl: 'pens', smallZh: '铅笔', smallEn: 'pencil', smallEnPl: 'pencils', clB: '支', clS: '支' },
    { bigZh: '大盒', bigEn: 'big box', bigEnPl: 'big boxes', smallZh: '小盒', smallEn: 'small box', smallEnPl: 'small boxes', clB: '个', clS: '个' },
  ];
  const p = r.pick(pairs);
  const k = r.int(2, scale(level, 3, 4, 6));                              // 1 大 = k 小
  const small = r.int(scale(level, 2, 3, 5), scale(level, 6, 12, 20));   // 小的单价(答案)
  const w = r.int(2, scale(level, 3, 4, 6));                              // 大的数量
  const a = r.int(2, scale(level, 5, 6, 10));                             // 小的数量
  const C = small * (w * k + a);
  return q({
    tag: 'unify_sub_value', level, seed,
    zh: `一${p.clB}${p.bigZh}的价钱等于 ${k} ${p.clS}${p.smallZh}的价钱。买 ${w} ${p.clB}${p.bigZh}和 ${a} ${p.clS}${p.smallZh}一共用了 ${C} 元。一${p.clS}${p.smallZh}多少元？`,
    en: `One ${p.bigEn} costs the same as ${k} ${p.smallEnPl}. ${w} ${p.bigEnPl} and ${a} ${p.smallEnPl} cost $${C} altogether. How much does one ${p.smallEn} cost?`,
    answer: { value: small, unit: '元', sentence: `一${p.clS}${p.smallZh} ${small} 元。` },
    steps: [
      { label: '做代换', text: `1 ${p.clB}${p.bigZh} = ${k} ${p.clS}${p.smallZh}，${w} ${p.clB}${p.bigZh}相当于 ${w} × ${k} = ${w * k} ${p.clS}${p.smallZh}。` },
      { label: '统一单位', text: `全部换成${p.smallZh}：${w * k} + ${a} = ${w * k + a} ${p.clS}。` },
      { label: '均分', text: `一${p.clS}${p.smallZh} = ${C} ÷ ${w * k + a} = ${small} 元。` },
      { label: '验一验', text: `${p.bigZh} ${small * k} 元：${w} × ${small * k} + ${a} × ${small} = ${C} ✓` },
    ],
    hint1: `题目给了"1 个大的 = 几个小的"——这是让你把两种东西换成同一种。`,
    hint2: `把 ${w} ${p.clB}${p.bigZh}全部换算成${p.smallZh}，总价就只和一种东西有关了。`,
  });
}

/* 8. 量率对应:分率 ↔ 具体数量对应 */
function genBaseMapping(r, level, seed) {
  const name = r.pick(NAMES);
  const denoms = level === 1 ? [2, 3, 4, 5] : level === 2 ? [3, 4, 5, 6, 8] : [4, 5, 6, 8, 9, 10];
  const b = r.pick(denoms);
  let a = r.int(1, b - 1);
  while (gcd(a, b) !== 1) a = a === b - 1 ? 1 : a + 1; // 分数必须最简
  const u = r.int(scale(level, 6, 10, 15), scale(level, 20, 40, 80));
  const T = b * u;
  const read = a * u;
  if (level >= 2 && r.bool()) {
    // 读了 a/b 又读 c 页,还剩 rest
    const c = r.int(2, Math.max(3, Math.floor((T - read) * 0.4)));
    const rest = T - read - c;
    invariant(rest > 0, 'rest positive');
    return q({
      tag: 'base_mapping', level, seed,
      zh: `${name} 看一本故事书，第一天看了全书的 ${a}/${b}，第二天又看了 ${c} 页，还剩 ${rest} 页没看。这本书一共有多少页？`,
      en: `${name} is reading a storybook. On the first day ${name} read ${a}/${b} of the book. On the second day ${name} read another ${c} pages. There are ${rest} pages left. How many pages does the book have?`,
      answer: { value: T, unit: '页', sentence: `这本书一共 ${T} 页。` },
      steps: [
        { label: '找对应', text: `第二天的 ${c} 页 + 剩下 ${rest} 页 = ${c + rest} 页，对应全书的 1 − ${a}/${b} = ${b - a}/${b}。` },
        { label: '算一份', text: `${b - a} 份 = ${c + rest} 页，1 份 = ${c + rest} ÷ ${b - a} = ${u} 页。` },
        { label: '落答案', text: `全书 = ${b} 份 = ${b} × ${u} = ${T} 页。` },
        { label: '验一验', text: `第一天 ${read} 页 + ${c} 页 + ${rest} 页 = ${T} 页 ✓` },
      ],
      hint1: `分率题先问：具体的页数对应全书的几分之几？`,
      hint2: `没看的部分是全书的 ${b - a}/${b}，它对应 ${c} + ${rest} 页。`,
    });
  }
  const rest = T - read;
  return q({
    tag: 'base_mapping', level, seed,
    zh: `${name} 看一本故事书，已经看了全书的 ${a}/${b}，还剩 ${rest} 页没看。这本书一共有多少页？`,
    en: `${name} has read ${a}/${b} of a storybook. There are ${rest} pages left. How many pages does the book have?`,
    answer: { value: T, unit: '页', sentence: `这本书一共 ${T} 页。` },
    steps: [
      { label: '找对应', text: `剩下的 ${rest} 页对应全书的 1 − ${a}/${b} = ${b - a}/${b}。` },
      { label: '算一份', text: `${b - a} 份 = ${rest} 页，1 份 = ${rest} ÷ ${b - a} = ${u} 页。` },
      { label: '落答案', text: `全书 = ${b} 份 = ${b} × ${u} = ${T} 页。` },
      { label: '验一验', text: `${T} × ${a}/${b} = ${read}，${read} + ${rest} = ${T} ✓` },
    ],
    hint1: `"剩下 ${rest} 页"这个具体数量，对应全书的几分之几？`,
    hint2: `已看 ${a}/${b}，没看的就是 ${b - a}/${b}——量和率要对上号。`,
  });
}

/* 9. 鸡兔同笼 / 假设法 */
function genFlattenAssume(r, level, seed) {
  const variants = [
    { aZh: '鸡', bZh: '兔', cl: '只', thingCl: '条', aEn: 'chickens', bEn: 'rabbits', la: 2, lb: 4, thing: '腿', thingEn: 'legs', place: '笼子里', placeEn: 'in a cage' },
    { aZh: '自行车', bZh: '三轮车', cl: '辆', thingCl: '个', aEn: 'bicycles', bEn: 'tricycles', la: 2, lb: 3, thing: '轮子', thingEn: 'wheels', place: '停车场里', placeEn: 'in a parking lot' },
    { aZh: '小船（坐 3 人）', bZh: '大船（坐 5 人）', cl: '艘', thingCl: '个', aEn: 'small boats (3 seats)', bEn: 'big boats (5 seats)', la: 3, lb: 5, thing: '人', thingEn: 'people', place: '湖面上', placeEn: 'on the lake' },
  ];
  const v = r.pick(variants);
  const ca = r.int(scale(level, 3, 6, 10), scale(level, 10, 20, 40)); // A 数量
  const cb = r.int(scale(level, 2, 4, 8), scale(level, 8, 15, 30));  // B 数量(答案)
  const h = ca + cb;
  const L = v.la * ca + v.lb * cb;
  const bShort = v.bZh.split('（')[0];
  return q({
    tag: 'flatten_assume', level, seed,
    zh: `${v.place}有${v.aZh}和${v.bZh}共 ${h} ${v.cl}，一共有 ${L} ${v.thingCl}${v.thing}。${bShort}有多少${v.cl}？`,
    en: `There are ${h} ${v.aEn} and ${v.bEn} altogether ${v.placeEn}. They have ${L} ${v.thingEn} in total. How many ${v.bEn} are there?`,
    answer: { value: cb, unit: v.cl, sentence: `${bShort}有 ${cb} ${v.cl}。` },
    steps: [
      { label: '先假设', text: `假设全是${v.aZh}：${h} × ${v.la} = ${h * v.la} ${v.thingCl}${v.thing}。` },
      { label: '看缺口', text: `实际有 ${L} ${v.thingCl}，多出 ${L} − ${h * v.la} = ${L - h * v.la} ${v.thingCl}${v.thing}。` },
      { label: '换一换', text: `每把一${v.cl}${v.aZh.split('（')[0]}换成${bShort}，多 ${v.lb} − ${v.la} = ${v.lb - v.la} ${v.thingCl}${v.thing}；${L - h * v.la} ÷ ${v.lb - v.la} = ${cb}。` },
      { label: '验一验', text: `${bShort} ${cb} ${v.cl}、${v.aZh.split('（')[0]} ${ca} ${v.cl}：${cb} × ${v.lb} + ${ca} × ${v.la} = ${L} ✓` },
    ],
    hint1: `两种东西混在一起,只知道总数——先大胆假设"全是同一种"。`,
    hint2: `假设全是${v.aZh.split('（')[0]}，算出来的${v.thing}数和实际差多少？这个缺口是谁造成的？`,
  });
}

/* 10. 盈亏缺口 / 多退少补 */
function genFlattenGap(r, level, seed) {
  const it = r.pick(ITEMS);
  const who = r.pick(['老师', '班长', '园长']);
  const whoEn = who === '老师' ? 'A teacher' : who === '班长' ? 'The class monitor' : 'The principal';
  const n = r.int(scale(level, 4, 8, 12), scale(level, 12, 25, 45)); // 人数
  const a = r.int(2, scale(level, 5, 8, 12));
  const gapPer = r.int(1, 3);
  const b = a + gapPer;
  const totalGap = gapPer * n;
  invariant(totalGap >= 2, 'gap big enough');
  const s = r.int(1, totalGap - 1);   // 盈
  const t = totalGap - s;             // 亏
  const total = a * n + s;
  const askPeople = level === 1 || r.bool();
  return q({
    tag: 'flatten_gap', level, seed,
    zh: `${who}把一批${it.zh}分给小朋友：每人分 ${a} ${it.cl}，还多 ${s} ${it.cl}；每人分 ${b} ${it.cl}，就少 ${t} ${it.cl}。${askPeople ? '一共有多少个小朋友？' : `这批${it.zh}一共有多少${it.cl}？`}`,
    en: `${whoEn} shares some ${it.en} among children. If each child gets ${a}, there are ${s} left over. If each child gets ${b}, there is a shortage of ${t}. ${askPeople ? 'How many children are there?' : `How many ${it.en} are there altogether?`}`,
    answer: askPeople
      ? { value: n, unit: '个', sentence: `一共有 ${n} 个小朋友。` }
      : { value: total, unit: it.cl, sentence: `这批${it.zh}一共 ${total} ${it.cl}。` },
    steps: [
      { label: '看缺口', text: `从"多 ${s}"到"少 ${t}"，一共差 ${s} + ${t} = ${totalGap} ${it.cl}。` },
      { label: '找原因', text: `每人多分 ${b} − ${a} = ${gapPer} ${it.cl}造成的，人数 = ${totalGap} ÷ ${gapPer} = ${n} 人。` },
      { label: '落答案', text: askPeople ? `一共 ${n} 个小朋友。` : `总数 = ${a} × ${n} + ${s} = ${total} ${it.cl}。` },
      { label: '验一验', text: `每人 ${b} ${it.cl}需要 ${b * n} ${it.cl}，${b * n} − ${total} = ${t} ${it.cl}，正好少 ${t} ✓` },
    ],
    hint1: `一次分多了、一次分少了——两次之间的总缺口是多少？`,
    hint2: `总缺口 ${s} + ${t} ${it.cl}，是每人多分 ${gapPer} ${it.cl}攒出来的。`,
  });
}

/* 11. 余数分支 / 层层剩余 */
function genFractionRem(r, level, seed) {
  const name = r.pick(NAMES);
  const money = r.bool();
  const it = r.pick(ITEMS);
  const unit = money ? '元' : it.cl;
  const thing = money ? '钱' : it.zh;
  const fr = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [1, 5]];
  const [a1, b1] = r.pick(fr);
  const [a2, b2] = r.pick(fr);
  const u = r.int(scale(level, 2, 4, 8), scale(level, 8, 20, 50));
  const T = b1 * b2 * u;
  const after1 = T * (b1 - a1) / b1;
  const rest = after1 * (b2 - a2) / b2;
  invariant(Number.isInteger(after1) && Number.isInteger(rest) && rest > 0, 'clean layers');
  const verbZh = money ? '用去' : '送出';
  const verbEn = money ? 'spent' : 'gave away';
  return q({
    tag: 'fraction_rem', level, seed,
    zh: `${name} 有一些${thing}。第一次${verbZh}全部的 ${a1}/${b1}，第二次${verbZh}剩下的 ${a2}/${b2}，最后还剩 ${rest} ${unit}。${name} 原来有多少${unit}${money ? '钱' : thing}？`,
    en: `${name} had some ${money ? 'money' : it.en}. First ${name} ${verbEn} ${a1}/${b1} of it. Then ${name} ${verbEn} ${a2}/${b2} of the remainder. In the end ${rest} ${money ? 'dollars' : it.en} were left. How ${money ? 'much money' : `many ${it.en}`} did ${name} have at first?`,
    answer: { value: T, unit, sentence: `${name} 原来有 ${T} ${unit}${money ? '' : thing}。` },
    steps: [
      { label: '从后倒推', text: `最后剩 ${rest} ${unit}，是"第一次剩下"的 ${b2 - a2}/${b2}，所以第一次剩下 = ${rest} ÷ ${b2 - a2} × ${b2} = ${after1} ${unit}。` },
      { label: '再倒一层', text: `${after1} ${unit}是全部的 ${b1 - a1}/${b1}，所以全部 = ${after1} ÷ ${b1 - a1} × ${b1} = ${T} ${unit}。` },
      { label: '验一验', text: `${T} → 第一次${verbZh} ${T * a1 / b1} 剩 ${after1} → 第二次${verbZh} ${after1 * a2 / b2} 剩 ${rest} ✓` },
    ],
    hint1: `"剩下的几分之几"——每一层的分率基准不一样，要一层一层剥。`,
    hint2: `从最后的 ${rest} ${unit}往回倒：它是"第一次剩下"的 ${b2 - a2}/${b2}。`,
  });
}

/* 12. 行程:追及 / 相遇 */
function genSpeedCatchup(r, level, seed) {
  const [A, B] = r.pick2(NAMES);
  if (level >= 2 && r.bool()) {
    // 相遇
    const t = r.int(2, scale(level, 3, 4, 5));
    const v1 = r.int(scale(level, 4, 40, 50), scale(level, 6, 60, 80));
    const v2 = v1 + r.int(scale(level, 1, 5, 10), scale(level, 3, 15, 20));
    const D = (v1 + v2) * t;
    const walk = v1 < 20;
    const unitV = walk ? '千米/小时' : '千米/小时';
    return q({
      tag: 'speed_catchup', level, seed,
      zh: `甲、乙两地相距 ${D} 千米。${A} 和 ${B} 同时从两地出发，相向而行。${A} 每小时行 ${v1} 千米，${B} 每小时行 ${v2} 千米。几小时后两人相遇？`,
      en: `Town A and Town B are ${D} km apart. ${A} and ${B} start at the same time from the two towns and travel towards each other. ${A} travels at ${v1} km/h and ${B} at ${v2} km/h. After how many hours will they meet?`,
      answer: { value: t, unit: '小时', sentence: `${t} 小时后相遇。` },
      steps: [
        { label: '合速度', text: `相向而行，每小时两人共靠近 ${v1} + ${v2} = ${v1 + v2} 千米。` },
        { label: '算时间', text: `${D} ÷ ${v1 + v2} = ${t} 小时。` },
        { label: '验一验', text: `${A} 行 ${v1 * t} 千米 + ${B} 行 ${v2 * t} 千米 = ${D} 千米 ✓` },
      ],
      hint1: `相向而行——两人的速度是在"合力"缩短距离。`,
      hint2: `每小时两人共走 ${v1} + ${v2} 千米，用总路程除一除。`,
    });
  }
  // 追及:v1 先走 t1 小时,v2 去追
  let v1, t1, dv, t, tries = 0;
  do {
    v1 = r.int(scale(level, 3, 4, 5), scale(level, 6, 10, 15));
    t1 = r.int(1, scale(level, 2, 3, 3));
    const gap = v1 * t1;
    const divisors = [];
    for (let x = 2; x <= gap; x++) if (gap % x === 0 && x >= 2 && x <= 20) divisors.push(x);
    if (!divisors.length) { tries++; continue; }
    dv = r.pick(divisors);
    t = gap / dv;
    tries++;
  } while ((!t || t < 1 || t > 8) && tries < 80);
  invariant(t >= 1 && t <= 12, 'catch time reasonable');
  const v2 = v1 + dv;
  const gap = v1 * t1;
  const askDist = level === 3 && r.bool();
  const dist = v2 * t;
  return q({
    tag: 'speed_catchup', level, seed,
    zh: `${A} 步行去图书馆，每小时走 ${v1} 千米。${A} 出发 ${t1} 小时后，${B} 骑自行车从同一地点出发去追，每小时行 ${v2} 千米。${askDist ? `${B} 追上 ${A} 时，离出发点多少千米？` : `${B} 出发后几小时追上 ${A}？`}`,
    en: `${A} walks to the library at ${v1} km/h. ${t1} hour${t1 > 1 ? 's' : ''} after ${A} leaves, ${B} sets off from the same place on a bicycle at ${v2} km/h to catch up. ${askDist ? `How far from the starting point does ${B} catch up with ${A}?` : `How many hours after setting off does ${B} catch up with ${A}?`}`,
    answer: askDist
      ? { value: dist, unit: '千米', sentence: `离出发点 ${dist} 千米。` }
      : { value: t, unit: '小时', sentence: `${B} 出发后 ${t} 小时追上。` },
    steps: [
      { label: '算差距', text: `${B} 出发时，${A} 已走 ${v1} × ${t1} = ${gap} 千米。` },
      { label: '追的速度', text: `每小时 ${B} 比 ${A} 多行 ${v2} − ${v1} = ${dv} 千米。` },
      { label: '算时间', text: `追上要 ${gap} ÷ ${dv} = ${t} 小时。` },
      ...(askDist ? [{ label: '算距离', text: `追上处离出发点 ${v2} × ${t} = ${dist} 千米。` }] : []),
      { label: '验一验', text: `那时 ${A} 走了 ${v1} × ${t1 + t} = ${v1 * (t1 + t)} 千米，${B} 行了 ${v2} × ${t} = ${dist} 千米，相等 ✓` },
    ],
    hint1: `追及问题的钥匙：先算两人差多远，再看每小时能追回多少。`,
    hint2: `${B} 出发时差距是 ${v1} × ${t1} 千米；每小时追回"速度差"那么多。`,
  });
}

/* 13. 工程效率 / 合作 */
function genWorkRate(r, level, seed) {
  const jobs = [
    { zh: '修一条路', en: 'repair a road', doerA: '甲队', doerB: '乙队', doerAEn: 'Team A', doerBEn: 'Team B' },
    { zh: '打印一批资料', en: 'print a stack of documents', doerA: 'A 打印机', doerB: 'B 打印机', doerAEn: 'Printer A', doerBEn: 'Printer B' },
    { zh: '粉刷一面墙', en: 'paint a wall', doerA: '师傅', doerB: '徒弟', doerAEn: 'The master', doerBEn: 'the apprentice' },
  ];
  const j = r.pick(jobs);
  const pairs = level === 1
    ? [[3, 6], [4, 12], [6, 12], [2, 2], [4, 4], [6, 3], [10, 10]]
    : level === 2
      ? [[6, 12], [10, 15], [8, 24], [12, 24], [5, 20], [12, 6], [15, 30], [18, 9]]
      : [[10, 15], [20, 30], [12, 24], [21, 28], [10, 40], [18, 36], [24, 8], [30, 20]];
  const [a, b] = r.pick(pairs);
  const W = lcm(a, b);
  const ra = W / a, rb = W / b;
  const t = W / (ra + rb);
  invariant(Number.isInteger(t), 'together days integer');
  if (level === 3 && r.bool()) {
    // 合作 c 天后 B 离开
    let c = 0, remDays = 0, ok = false;
    for (let cc = 1; cc < t; cc++) {
      const rem = W - cc * (ra + rb);
      if (rem > 0 && rem % ra === 0) { c = cc; remDays = rem / ra; ok = true; break; }
    }
    if (ok) {
      const totalDays = c + remDays;
      return q({
        tag: 'work_rate', level, seed,
        zh: `${j.zh}，${j.doerA}单独做要 ${a} 天，${j.doerB}单独做要 ${b} 天。两队先合做 ${c} 天，然后${j.doerB}离开，剩下的由${j.doerA}单独完成。${j.doerA}还要做多少天？`,
        en: `To ${j.en}, ${j.doerAEn} alone needs ${a} days and ${j.doerBEn} alone needs ${b} days. They work together for ${c} day${c > 1 ? 's' : ''}, then ${j.doerBEn} leaves and ${j.doerAEn} finishes the rest alone. How many more days does ${j.doerAEn} need?`,
        answer: { value: remDays, unit: '天', sentence: `${j.doerA}还要做 ${remDays} 天。` },
        steps: [
          { label: '定总量', text: `把工作总量设为 ${W} 份（${a} 和 ${b} 的最小公倍数）。` },
          { label: '算效率', text: `${j.doerA}每天 ${W} ÷ ${a} = ${ra} 份，${j.doerB}每天 ${W} ÷ ${b} = ${rb} 份。` },
          { label: '算剩余', text: `合做 ${c} 天完成 ${c} × ${ra + rb} = ${c * (ra + rb)} 份，还剩 ${W - c * (ra + rb)} 份。` },
          { label: '算天数', text: `${W - c * (ra + rb)} ÷ ${ra} = ${remDays} 天。` },
          { label: '验一验', text: `${c} × ${ra + rb} + ${remDays} × ${ra} = ${W} 份 ✓` },
        ],
        hint1: `工程题先把总量设成"份"——用两个天数的最小公倍数最干净。`,
        hint2: `总量设 ${W} 份，先算两人每天各做几份。`,
      });
    }
  }
  return q({
    tag: 'work_rate', level, seed,
    zh: `${j.zh}，${j.doerA}单独做要 ${a} 天，${j.doerB}单独做要 ${b} 天。两队一起做，多少天可以完成？`,
    en: `To ${j.en}, ${j.doerAEn} alone needs ${a} days and ${j.doerBEn} alone needs ${b} days. If they work together, how many days will they need?`,
    answer: { value: t, unit: '天', sentence: `一起做 ${t} 天完成。` },
    steps: [
      { label: '定总量', text: `把工作总量设为 ${W} 份（${a} 和 ${b} 的最小公倍数）。` },
      { label: '算效率', text: `${j.doerA}每天 ${W} ÷ ${a} = ${ra} 份，${j.doerB}每天 ${W} ÷ ${b} = ${rb} 份；合起来每天 ${ra + rb} 份。` },
      { label: '算时间', text: `${W} ÷ ${ra + rb} = ${t} 天。` },
      { label: '验一验', text: `${t} × ${ra + rb} = ${W} 份，正好做完 ✓` },
    ],
    hint1: `"单独做要几天"的题，先把整件工作变成可以数的"份"。`,
    hint2: `总量设成 ${a} 和 ${b} 的最小公倍数 ${W} 份，效率就都是整数了。`,
  });
}

/* 14. 容斥重叠 */
function genLogicOverlap(r, level, seed) {
  const subjects = [
    { aZh: '语文', bZh: '数学', aEn: 'Chinese', bEn: 'Maths', ctx: '喜欢', ctxEn: 'like' },
    { aZh: '足球', bZh: '篮球', aEn: 'football', bEn: 'basketball', ctx: '会玩', ctxEn: 'play' },
    { aZh: '钢琴', bZh: '游泳', aEn: 'the piano', bEn: 'swimming', ctx: '在学', ctxEn: 'are learning' },
  ];
  const s = r.pick(subjects);
  const both = r.int(scale(level, 3, 6, 10), scale(level, 10, 18, 30));   // 都(答案候选)
  const onlyA = r.int(scale(level, 4, 8, 12), scale(level, 12, 22, 40));
  const onlyB = r.int(scale(level, 4, 8, 12), scale(level, 12, 22, 40));
  const neither = level === 1 ? 0 : r.int(0, scale(level, 0, 6, 12));
  const n = onlyA + onlyB + both + neither;
  const x = onlyA + both, y = onlyB + both;
  return q({
    tag: 'logic_overlap', level, seed,
    zh: `班里有 ${n} 个同学。${s.ctx}${s.aZh}的有 ${x} 人，${s.ctx}${s.bZh}的有 ${y} 人${neither > 0 ? `，两样都不${s.ctx}的有 ${neither} 人` : `，每人至少${s.ctx}其中一样`}。两样都${s.ctx}的有多少人？`,
    en: `There are ${n} students in a class. ${x} students ${s.ctxEn} ${s.aEn} and ${y} students ${s.ctxEn} ${s.bEn}.${neither > 0 ? ` ${neither} students ${s.ctxEn} neither.` : ` Every student is in at least one of the two groups.`} How many students ${s.ctxEn} both?`,
    answer: { value: both, unit: '人', sentence: `两样都${s.ctx}的有 ${both} 人。` },
    steps: [
      { label: '先圈范围', text: neither > 0 ? `至少${s.ctx}一样的有 ${n} − ${neither} = ${n - neither} 人。` : `每人至少${s.ctx}一样，范围就是全班 ${n} 人。` },
      { label: '看重叠', text: `直接相加 ${x} + ${y} = ${x + y} 人，比 ${n - neither} 多——多出来的就是被数了两次的人。` },
      { label: '算重叠', text: `${x + y} − ${n - neither} = ${both} 人被数了两次，就是两样都${s.ctx}的人。` },
      { label: '验一验', text: `只${s.ctx}${s.aZh} ${onlyA} + 只${s.ctx}${s.bZh} ${onlyB} + 都${s.ctx} ${both}${neither > 0 ? ` + 都不 ${neither}` : ''} = ${n} 人 ✓` },
    ],
    hint1: `两个圈有重叠——直接把两个数加起来，谁被多数了一次？`,
    hint2: `${x} + ${y} 比实际人数多，多出来的部分正好是"两样都${s.ctx}"的人数。`,
  });
}

/* 15. 逆推还原 */
function genWorkBackwards(r, level, seed) {
  const name = r.pick(NAMES);
  if (level >= 2 && r.bool()) {
    // 经典:吃一半多 e,两层
    const it = r.pick(ITEMS);
    const e1 = r.int(1, 4), e2 = r.int(1, 4);
    const rest = r.int(scale(level, 2, 3, 5), scale(level, 8, 12, 30));
    const left1 = (rest + e2) * 2;
    const T = (left1 + e1) * 2;
    return q({
      tag: 'work_backwards', level, seed,
      zh: `${name} 有一袋${it.zh}。第一天吃了全部的一半多 ${e1} ${it.cl}，第二天吃了剩下的一半多 ${e2} ${it.cl}，最后还剩 ${rest} ${it.cl}。这袋${it.zh}原来有多少${it.cl}？`,
      en: `${name} has a bag of ${it.en}. On the first day ${name} ate half of them plus ${e1} more. On the second day ${name} ate half of the remainder plus ${e2} more. In the end ${rest} were left. How many ${it.en} were in the bag at first?`,
      answer: { value: T, unit: it.cl, sentence: `原来有 ${T} ${it.cl}${it.zh}。` },
      steps: [
        { label: '从后倒推', text: `第二天吃掉"剩下的一半 + ${e2}"后剩 ${rest} ${it.cl}，说明第一天吃完后有 (${rest} + ${e2}) × 2 = ${left1} ${it.cl}。` },
        { label: '再倒一层', text: `同理，原来有 (${left1} + ${e1}) × 2 = ${T} ${it.cl}。` },
        { label: '验一验', text: `${T} → 吃 ${T / 2}+${e1} 剩 ${left1} → 吃 ${left1 / 2}+${e2} 剩 ${rest} ✓` },
      ],
      hint1: `知道最后的结果、问最开始——把每一步"倒着做回去"。`,
      hint2: `倒推口诀：原来减法变加法、除法变乘法，从最后一步往前走。`,
    });
  }
  // 数字机器:( S × a + b ) − c = res
  const a = r.int(2, scale(level, 3, 4, 5));
  const S = r.int(scale(level, 3, 6, 12), scale(level, 12, 30, 80));
  const b = r.int(scale(level, 2, 5, 10), scale(level, 15, 40, 90));
  const c = r.int(2, S * a + b - 1);
  const res = S * a + b - c;
  invariant(res > 0, 'result positive');
  return q({
    tag: 'work_backwards', level, seed,
    zh: `${name} 心里想了一个数：先乘 ${a}，再加 ${b}，然后减 ${c}，结果是 ${res}。${name} 想的数是多少？`,
    en: `${name} thinks of a number. ${name} multiplies it by ${a}, then adds ${b}, then subtracts ${c}. The result is ${res}. What is the number?`,
    answer: { value: S, unit: '', sentence: `${name} 想的数是 ${S}。` },
    steps: [
      { label: '从后倒推', text: `最后一步是减 ${c}，倒回去：${res} + ${c} = ${res + c}。` },
      { label: '再倒一步', text: `上一步是加 ${b}，倒回去：${res + c} − ${b} = ${S * a}。` },
      { label: '倒最后一步', text: `第一步是乘 ${a}，倒回去：${S * a} ÷ ${a} = ${S}。` },
      { label: '验一验', text: `${S} × ${a} + ${b} − ${c} = ${res} ✓` },
    ],
    hint1: `结果已知、起点未知——像倒放录像一样，一步一步还原。`,
    hint2: `从"结果 ${res}"开始倒:先把减 ${c} 变成加 ${c}。`,
  });
}

export const GENERATORS = {
  anchor_single: genAnchorSingle,
  anchor_total: genAnchorTotal,
  anchor_diff: genAnchorDiff,
  anchor_double: genAnchorDouble,
  unify_ratio: genUnifyRatio,
  unify_sub_diff: genUnifySubDiff,
  unify_sub_value: genUnifySubValue,
  base_mapping: genBaseMapping,
  flatten_assume: genFlattenAssume,
  flatten_gap: genFlattenGap,
  fraction_rem: genFractionRem,
  speed_catchup: genSpeedCatchup,
  work_rate: genWorkRate,
  logic_overlap: genLogicOverlap,
  work_backwards: genWorkBackwards,
};

// 生成一道题;同一 (tag, level, seed) 永远得到同一道题
export function generate(tag, level, seed) {
  const fn = GENERATORS[tag];
  if (!fn) throw new Error('unknown tag: ' + tag);
  // 少数参数组合可能触发 invariant,自动顺延 seed 重试
  for (let s = seed, i = 0; i < 25; s++, i++) {
    try {
      const r = new Rng(s * 2654435761 + level * 97);
      const question = fn(r, level, s);
      question.id = `g_${tag}_${level}_${seed}`; // 保持外部 id 稳定
      return question;
    } catch (e) { /* try next internal seed */ }
  }
  throw new Error('generation failed for ' + tag + ' seed ' + seed);
}

// 从 id 复现题目
export function regenerate(id) {
  const m = /^g_([a-z_]+)_(\d)_(\d+)$/.exec(id);
  if (!m) return null;
  return generate(m[1], Number(m[2]), Number(m[3]));
}
