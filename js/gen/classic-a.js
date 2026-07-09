// 经典应用题生成器 · A 组(和差 / 和倍差倍 / 归一归总 / 平均数)
// 与 generators.js 同一套约定:fn(r, level, seed) → q({...})。
// 全部采用"先定答案、再倒推题面"的构造法,保证答案与所有中间量都是干净正整数。
// 本文件不修改任何现有模块,由 tests/classic-a.test.mjs 独立验证。

import { Rng, NAMES, ITEMS, invariant, q } from './engine.js';

// 按难度取参数(与 generators.js 的 scale 同义,本地自备一份)
function scale(level, s1, s2, s3) { return level === 1 ? s1 : level === 2 ? s2 : s3; }

/* ============================================================
 * 1. sum_diff 和差问题(落差剥离族 · 第 0 课)
 * 模型思想:知道两个数的"和"与"差",先抹平差距——去掉差(或补上差),
 * 两个数就一样多,除以 2 得到小数(或大数)。
 * L1 经典和差:共 S 个,甲比乙多 D 个,求某人。构造保证 (S±D)/2 整除。
 * L2 三步:乙比甲少 D1、丙比甲多 D2、三人共 S,以甲为标准抹平后 ÷3。
 * L3 隐差:甲给乙 k 个后还比乙多 m → 原差 = m + 2k,再配和做普通和差。
 * ============================================================ */
function genSumDiff(r, level, seed) {
  const [A, B] = r.pick2(NAMES);
  const it = r.pick(ITEMS);

  if (level === 1) {
    // 构造:先定小数 small 与差 D,和 = 2*small + D,奇偶自动配好
    const small = r.int(6, 45);
    const D = r.int(2, 20);
    const big = small + D;
    const S = big + small;
    const askBig = r.bool();
    const X = askBig ? A : B;
    const ans = askBig ? big : small;
    invariant(ans > 0, 'sum_diff L1 positive');
    return q({
      tag: 'sum_diff', level, seed,
      zh: `${A} 和 ${B} 一共有 ${S} ${it.cl}${it.zh}，${A} 比 ${B} 多 ${D} ${it.cl}。${X} 有多少${it.cl}${it.zh}？`,
      en: `${A} and ${B} have ${S} ${it.en} altogether. ${A} has ${D} more ${it.en} than ${B}. How many ${it.en} does ${X} have?`,
      answer: { value: ans, unit: it.cl, sentence: `${X} 有 ${ans} ${it.cl}${it.zh}。` },
      steps: [
        { label: '认题型', text: `知道两人的"和" ${S} 和"差" ${D}——这是和差问题。` },
        askBig
          ? { label: '补齐差距', text: `给 ${B} 也补上 ${D} ${it.cl}，两人就一样多：${S} + ${D} = ${S + D} ${it.cl}，正好是 2 个 ${A}。` }
          : { label: '抹平差距', text: `去掉差，两人变一样多：${S} − ${D} = ${S - D} ${it.cl}，正好是 2 个 ${B}。` },
        { label: '算一半', text: `${askBig ? S + D : S - D} ÷ 2 = ${ans} ${it.cl}，就是 ${X} 的数量。` },
        { label: '验一验', text: `${A} ${big} ${it.cl} + ${B} ${small} ${it.cl} = ${S} ${it.cl}，${big} − ${small} = ${D} ✓` },
      ],
      hint1: `一句话给"和"、一句话给"差"——和差问题。想想怎么让两人变得一样多。`,
      hint2: `抹平差距：从总数 ${S} 里去掉 ${A} 多出的 ${D}（或给 ${B} 补上 ${D}），两人就一样多了。`,
    });
  }

  if (level === 2) {
    // 构造:先定甲 a,乙 = a − D1,丙 = a + D2,和 S = 3a − D1 + D2
    const C = r.pick(NAMES.filter(n => n !== A && n !== B));
    const a = r.int(20, 60);
    const D1 = r.int(2, 15);
    const D2 = r.int(2, 20);
    const S = 3 * a - D1 + D2;
    invariant(a - D1 > 0, 'sum_diff L2 b positive');
    return q({
      tag: 'sum_diff', level, seed,
      zh: `${A}、${B}、${C} 三人一共有 ${S} ${it.cl}${it.zh}。${B} 比 ${A} 少 ${D1} ${it.cl}，${C} 比 ${A} 多 ${D2} ${it.cl}。${A} 有多少${it.cl}${it.zh}？`,
      en: `${A}, ${B} and ${C} have ${S} ${it.en} altogether. ${B} has ${D1} fewer ${it.en} than ${A}, and ${C} has ${D2} more ${it.en} than ${A}. How many ${it.en} does ${A} have?`,
      answer: { value: a, unit: it.cl, sentence: `${A} 有 ${a} ${it.cl}${it.zh}。` },
      steps: [
        { label: '定标准', text: `${B}、${C} 都在和 ${A} 比，就把 ${A} 当标准。` },
        { label: '抹平差距', text: `给 ${B} 补上 ${D1} ${it.cl}、把 ${C} 多的 ${D2} ${it.cl}去掉，三人都变得和 ${A} 一样多：${S} + ${D1} − ${D2} = ${3 * a} ${it.cl}。` },
        { label: '算一份', text: `${3 * a} ÷ 3 = ${a} ${it.cl}，就是 ${A} 的数量。` },
        { label: '验一验', text: `${B} = ${a} − ${D1} = ${a - D1}，${C} = ${a} + ${D2} = ${a + D2}；${a} + ${a - D1} + ${a + D2} = ${S} ✓` },
      ],
      hint1: `两个人都在和 ${A} 比——把 ${A} 当标准，先把另外两人"抹平"成 ${A}。`,
      hint2: `${B} 补上 ${D1}、${C} 去掉 ${D2}，总数变成 ${S} + ${D1} − ${D2}，正好是 3 个 ${A}。`,
    });
  }

  // L3 隐差:给 k 个后还多 m → 原差 = m + 2k
  const k = r.int(2, 10);
  const m = r.int(2, 12);
  const D = m + 2 * k;
  const small = r.int(10, 60);
  const big = small + D;
  const S = big + small;
  const askBig = r.bool();
  const X = askBig ? A : B;
  const ans = askBig ? big : small;
  invariant(big - k > small + k, 'sum_diff L3 still more after giving');
  return q({
    tag: 'sum_diff', level, seed,
    zh: `${A} 和 ${B} 一共有 ${S} ${it.cl}${it.zh}。如果 ${A} 给 ${B} ${k} ${it.cl}，${A} 还比 ${B} 多 ${m} ${it.cl}。${X} 原来有多少${it.cl}${it.zh}？`,
    en: `${A} and ${B} have ${S} ${it.en} altogether. If ${A} gives ${B} ${k} ${it.en}, ${A} will still have ${m} more ${it.en} than ${B}. How many ${it.en} does ${X} have?`,
    answer: { value: ans, unit: it.cl, sentence: `${X} 原来有 ${ans} ${it.cl}${it.zh}。` },
    steps: [
      { label: '找隐差', text: `${A} 给出 ${k} ${it.cl}自己少 ${k}，${B} 收到又多 ${k}，差一下缩小 2 × ${k} = ${2 * k} ${it.cl}；给完还多 ${m}，所以原差 = ${m} + ${2 * k} = ${D} ${it.cl}。` },
      { label: '化归和差', text: `现在知道和 ${S}、差 ${D}，变回普通和差问题。` },
      askBig
        ? { label: '抹平差距', text: `补上差：(${S} + ${D}) ÷ 2 = ${ans} ${it.cl}，就是 ${A} 原来的数量。` }
        : { label: '抹平差距', text: `去掉差，两人变一样多：(${S} − ${D}) ÷ 2 = ${ans} ${it.cl}，就是 ${B} 原来的数量。` },
      { label: '验一验', text: `原来 ${A} ${big}、${B} ${small}；${A} 给 ${B} ${k} 后是 ${big - k} 和 ${small + k}，${big - k} − ${small + k} = ${m}，和仍是 ${S} ✓` },
    ],
    hint1: `差被藏起来了：一边给出 ${k}、一边收到 ${k}，两人的差会变化 2 × ${k}。`,
    hint2: `给完还多 ${m}，说明原来的差 = ${m} + 2 × ${k}。求出差，再和 ${S} 配成和差问题。`,
  });
}

/* ============================================================
 * 2. ratio_units 和倍差倍(统一尺度族 · 地基)
 * 模型思想:把小的看作 1 份,大的就是 n 份,用"份"统一尺度后,
 * 和 = (n+1) 份,差 = (n−1) 份,一除就得到 1 份。
 * L1 和倍:甲是乙的 n 倍,共 S → 乙 = S/(n+1)。
 * L2 差倍:甲是乙的 n 倍,比乙多 D → 乙 = D/(n−1)。
 * L3 带尾巴:甲是乙的 n 倍多/少 m,给和或差,先去掉尾巴再切份。
 * ============================================================ */
function genRatioUnits(r, level, seed) {
  const [A, B] = r.pick2(NAMES);
  const it = r.pick(ITEMS);
  const n = r.int(2, 5);

  if (level === 1) {
    const u = r.int(5, 40);          // 乙 = 1 份(先定)
    const S = (n + 1) * u;
    const askBig = r.bool();
    const X = askBig ? A : B;
    const ans = askBig ? n * u : u;
    return q({
      tag: 'ratio_units', level, seed,
      zh: `${A} 的${it.zh}数是 ${B} 的 ${n} 倍，两人一共有 ${S} ${it.cl}${it.zh}。${X} 有多少${it.cl}${it.zh}？`,
      en: `${A} has ${n} times as many ${it.en} as ${B}. They have ${S} ${it.en} altogether. How many ${it.en} does ${X} have?`,
      answer: { value: ans, unit: it.cl, sentence: `${X} 有 ${ans} ${it.cl}${it.zh}。` },
      steps: [
        { label: '设份数', text: `把少的 ${B} 看作 1 份，${A} 就是 ${n} 份。` },
        { label: '算总份', text: `一共 1 + ${n} = ${n + 1} 份，对应 ${S} ${it.cl}。` },
        { label: '算一份', text: `1 份 = ${S} ÷ ${n + 1} = ${u} ${it.cl}${askBig ? `；${A} = ${n} 份 = ${n} × ${u} = ${ans} ${it.cl}` : `，就是 ${B} 的数量`}。` },
        { label: '验一验', text: `${A} ${n * u} + ${B} ${u} = ${S} ${it.cl}，且 ${n * u} = ${u} × ${n}，正好 ${n} 倍 ✓` },
      ],
      hint1: `"是几倍"加"一共"——和倍问题。先把小的 ${B} 看作 1 份。`,
      hint2: `${A} 是 ${n} 份、${B} 是 1 份，一共 ${n + 1} 份正好是 ${S} ${it.cl}。`,
    });
  }

  if (level === 2) {
    const u = r.int(5, 40);
    const D = (n - 1) * u;
    const askBig = r.bool();
    const X = askBig ? A : B;
    const ans = askBig ? n * u : u;
    return q({
      tag: 'ratio_units', level, seed,
      zh: `${A} 的${it.zh}数是 ${B} 的 ${n} 倍，${A} 比 ${B} 多 ${D} ${it.cl}。${X} 有多少${it.cl}${it.zh}？`,
      en: `${A} has ${n} times as many ${it.en} as ${B}, and ${A} has ${D} more ${it.en} than ${B}. How many ${it.en} does ${X} have?`,
      answer: { value: ans, unit: it.cl, sentence: `${X} 有 ${ans} ${it.cl}${it.zh}。` },
      steps: [
        { label: '设份数', text: `把 ${B} 看作 1 份，${A} 就是 ${n} 份。` },
        { label: '看差', text: `${A} 比 ${B} 多 ${n} − 1 = ${n - 1} 份，这 ${n - 1} 份正好是 ${D} ${it.cl}。` },
        { label: '算一份', text: `1 份 = ${D} ÷ ${n - 1} = ${u} ${it.cl}${askBig ? `；${A} = ${n} × ${u} = ${ans} ${it.cl}` : `，就是 ${B} 的数量`}。` },
        { label: '验一验', text: `${A} = ${n * u}、${B} = ${u}：${n * u} − ${u} = ${D}，${n * u} ÷ ${u} = ${n} 倍 ✓` },
      ],
      hint1: `"是几倍"加"多多少"——差倍问题。把小的 ${B} 看作 1 份。`,
      hint2: `${A} 比 ${B} 多出的部分是 ${n} − 1 = ${n - 1} 份，对应 ${D} ${it.cl}。`,
    });
  }

  // L3 带尾巴:甲 = n×乙 + m(倍多)或 n×乙 − m(倍少),给和或给差
  const u = r.int(6, 40);
  const m = r.int(2, Math.min(12, (n - 1) * u - 2)); // 保证倍少时甲仍比乙多
  const plus = r.bool();
  const useSum = r.bool();
  const big = n * u + (plus ? m : -m);
  invariant(big > u, 'ratio_units L3 big > small');
  const given = useSum ? big + u : big - u;
  const shares = useSum ? n + 1 : n - 1;
  const trimmed = plus ? given - m : given + m; // 去尾巴后的整份数
  invariant(trimmed === shares * u, 'ratio_units L3 clean shares');
  const tailZh = plus ? '多' : '少';
  const givenZh = useSum ? `两人一共有 ${given} ${it.cl}${it.zh}` : `${A} 比 ${B} 多 ${given} ${it.cl}`;
  const givenEn = useSum ? `They have ${given} ${it.en} altogether.` : `${A} has ${given} more ${it.en} than ${B}.`;
  return q({
    tag: 'ratio_units', level, seed,
    zh: `${A} 的${it.zh}数比 ${B} 的 ${n} 倍${tailZh} ${m} ${it.cl}，${givenZh}。${B} 有多少${it.cl}${it.zh}？`,
    en: `${A} has ${m} ${plus ? 'more' : 'fewer'} ${it.en} than ${n} times as many as ${B}. ${givenEn} How many ${it.en} does ${B} have?`,
    answer: { value: u, unit: it.cl, sentence: `${B} 有 ${u} ${it.cl}${it.zh}。` },
    steps: [
      { label: '设份数', text: `把 ${B} 看作 1 份，${A} 就是 ${n} 份${tailZh} ${m} ${it.cl}——多出一条"尾巴"。` },
      { label: '去尾巴', text: `先把尾巴处理掉：${useSum ? '总数' : '差'} ${given} ${plus ? '去掉' : '补上'} ${m}，得 ${trimmed} ${it.cl}，正好是整整 ${shares} 份。` },
      { label: '算一份', text: `1 份 = ${trimmed} ÷ ${shares} = ${u} ${it.cl}，就是 ${B} 的数量。` },
      { label: '验一验', text: `${A} = ${u} × ${n} ${plus ? '+' : '−'} ${m} = ${big} ${it.cl}；${useSum ? `${big} + ${u} = ${given}` : `${big} − ${u} = ${given}`} ✓` },
    ],
    hint1: `倍数后面拖了条"尾巴"（${tailZh} ${m}）——先把尾巴去掉，就变回普通的${useSum ? '和倍' : '差倍'}问题。`,
    hint2: `${useSum ? '总数' : '差'} ${given} ${plus ? '减去' : '加上'} ${m} 之后，剩下的正好是 ${shares} 份。`,
  });
}

/* ============================================================
 * 3. unit_rate 归一归总(过程效率族 · 族首)
 * 模型思想:先求"单一量"(每台每小时干多少)——这是工程问题的地基;
 * 归总则抓"总量不变",换一种分法再除一次。
 * L1 归一:a 台 b 小时产 c 个(整除),问 d 台 e 小时产多少。
 * L2 归总:每盒 x 个装 y 盒,改每盒 z 个能装几盒(x·y 被 z 整除)。
 * L3 双归一反问:已知一组数据,问"t 小时完成 W 个要几台"。
 * ============================================================ */

// 归一场景素材池(本文件私有)
const RATE_SCENES = [
  { zh: '织布机', cl: '台', prodZh: '布', unitZh: '米', verbZh: '织', enDoer: 'weaving machines', enProd: 'metres of cloth', enVerb: 'weave' },
  { zh: '打印机', cl: '台', prodZh: '资料', unitZh: '页', verbZh: '打印', enDoer: 'printers', enProd: 'pages', enVerb: 'print' },
  { zh: '工人', cl: '名', prodZh: '砖', unitZh: '块', verbZh: '搬', enDoer: 'workers', enProd: 'bricks', enVerb: 'move' },
];

function genUnitRate(r, level, seed) {
  const s = r.pick(RATE_SCENES);

  if (level === 1) {
    // 构造:先定单一量 p,再乘出 c 与答案
    const p = r.int(2, 6);
    const a = r.int(2, 4);
    const b = r.int(2, 4);
    const c = a * b * p;
    const d = r.int(a + 1, a + 4); // 保证 d ≠ a,题目不退化
    const e = r.int(2, 6);
    const ans = d * e * p;
    invariant(!(d === a && e === b), 'unit_rate L1 not degenerate');
    return q({
      tag: 'unit_rate', level, seed,
      zh: `${a} ${s.cl}${s.zh} ${b} 小时${s.verbZh} ${c} ${s.unitZh}${s.prodZh}。照这样计算，${d} ${s.cl}${s.zh} ${e} 小时能${s.verbZh}多少${s.unitZh}${s.prodZh}？`,
      en: `${a} ${s.enDoer} can ${s.enVerb} ${c} ${s.enProd} in ${b} hours. At this rate, how many ${s.enProd} can ${d} ${s.enDoer} ${s.enVerb} in ${e} hours?`,
      answer: { value: ans, unit: s.unitZh, sentence: `${d} ${s.cl}${s.zh} ${e} 小时能${s.verbZh} ${ans} ${s.unitZh}${s.prodZh}。` },
      steps: [
        { label: '求单一量', text: `先"归一"：1 ${s.cl}${s.zh} 1 小时${s.verbZh} ${c} ÷ ${a} ÷ ${b} = ${p} ${s.unitZh}。这一步是工程问题的地基。` },
        { label: '照样放大', text: `${d} ${s.cl} 1 小时${s.verbZh} ${p} × ${d} = ${p * d} ${s.unitZh}。` },
        { label: '再乘时间', text: `${e} 小时一共 ${p * d} × ${e} = ${ans} ${s.unitZh}。` },
        { label: '验一验', text: `回代原题：${p} × ${a} × ${b} = ${c} ${s.unitZh}，和题目相符 ✓` },
      ],
      hint1: `台数、小时都在变，不变的是"每${s.cl}每小时"的效率——先把这个单一量求出来。`,
      hint2: `${c} ÷ ${a} ÷ ${b}，先算 1 ${s.cl}${s.zh} 1 小时${s.verbZh}多少${s.unitZh}。`,
    });
  }

  if (level === 2) {
    // 归总:构造 T = x·z·k,则原来 y = z·k 盒,改装后 x·k 盒
    const it = r.pick(ITEMS);
    const k = r.int(2, 6);
    const x = r.int(3, 10);
    let z = r.int(2, 10);
    if (z === x) z = z === 10 ? 9 : z + 1;
    const y = z * k;
    const T = x * y;
    const ans = x * k;
    invariant(T === z * ans, 'unit_rate L2 total conserved');
    return q({
      tag: 'unit_rate', level, seed,
      zh: `把一批${it.zh}装盒：每盒装 ${x} ${it.cl}，恰好装满 ${y} 盒。如果改成每盒装 ${z} ${it.cl}，能装满多少盒？`,
      en: `A batch of ${it.en} is packed into boxes. If each box holds ${x} ${it.en}, exactly ${y} boxes are filled. If each box holds ${z} ${it.en} instead, how many boxes can be filled?`,
      answer: { value: ans, unit: '盒', sentence: `能装满 ${ans} 盒。` },
      steps: [
        { label: '抓不变量', text: `不管每盒装几${it.cl}，${it.zh}的总数不变——这是"归总"。` },
        { label: '求总量', text: `总数 = ${x} × ${y} = ${T} ${it.cl}。` },
        { label: '换个分法', text: `改成每盒 ${z} ${it.cl}：${T} ÷ ${z} = ${ans} 盒。` },
        { label: '验一验', text: `${z} × ${ans} = ${T} ${it.cl}，与 ${x} × ${y} 相同，总量守恒 ✓` },
      ],
      hint1: `换了盒子,${it.zh}一个也没多、一个也没少——先把总数求出来。`,
      hint2: `总数 = ${x} × ${y}，再用总数除以新的"每盒 ${z} ${it.cl}"。`,
    });
  }

  // L3 双归一带反问:先归一求效率,再反求台数
  const p = r.int(2, 6);
  const a = r.int(2, 5);
  const b = r.int(2, 5);
  const c = a * b * p;
  const t = r.int(2, 6);
  const nMachines = r.int(3, 9);
  const W = nMachines * t * p;
  invariant(W % (t * p) === 0, 'unit_rate L3 clean machines');
  return q({
    tag: 'unit_rate', level, seed,
    zh: `${a} ${s.cl}${s.zh} ${b} 小时能${s.verbZh} ${c} ${s.unitZh}${s.prodZh}。要在 ${t} 小时内${s.verbZh}完 ${W} ${s.unitZh}${s.prodZh}，需要多少${s.cl}这样的${s.zh}？`,
    en: `${a} ${s.enDoer} can ${s.enVerb} ${c} ${s.enProd} in ${b} hours. How many such ${s.enDoer} are needed to ${s.enVerb} ${W} ${s.enProd} in ${t} hours?`,
    answer: { value: nMachines, unit: s.cl, sentence: `需要 ${nMachines} ${s.cl}${s.zh}。` },
    steps: [
      { label: '求单一量', text: `先"归一"：1 ${s.cl}${s.zh} 1 小时${s.verbZh} ${c} ÷ ${a} ÷ ${b} = ${p} ${s.unitZh}——工程问题都从这块地基起步。` },
      { label: '算一台的量', text: `1 ${s.cl}${s.zh}干满 ${t} 小时能${s.verbZh} ${p} × ${t} = ${p * t} ${s.unitZh}。` },
      { label: '反求台数', text: `${W} ÷ ${p * t} = ${nMachines} ${s.cl}。` },
      { label: '验一验', text: `${nMachines} ${s.cl} × ${t} 小时 × 每小时 ${p} ${s.unitZh} = ${W} ${s.unitZh}，正好完成 ✓` },
    ],
    hint1: `先归一求出"每${s.cl}每小时"，再倒过来问：要完成任务得配几${s.cl}。`,
    hint2: `1 ${s.cl} 1 小时 = ${c} ÷ ${a} ÷ ${b} ${s.unitZh}；那 1 ${s.cl}干 ${t} 小时能完成多少？`,
  });
}

/* ============================================================
 * 4. average 平均数 · 移多补少(守恒锚点族)
 * 模型思想:总量守恒——平均数只是把总量"摊平";把多的补给少的,
 * 摊平之后每份一样多,这就是平均。
 * L1 求平均(总分整除次数)或已知平均反求总数。
 * L2 补缺:前 n 次平均 a 分,想让 n+1 次平均到 b 分,这次要考多少(≤100)。
 * L3 移多补少/变化:来了 k 人后人均从 a 变 b 反求人数;或两组加权平均。
 * ============================================================ */
function genAverage(r, level, seed) {
  const name = r.pick(NAMES);

  if (level === 1) {
    if (r.bool()) {
      // 求平均:三次测验,先定平均分 m,用"偏差和为 0"造出三个分数
      const m = r.int(72, 94);
      const d1 = r.int(1, 5);
      const d2 = r.int(1, 5);
      const s1 = m + d1, s2 = m + d2, s3 = m - d1 - d2;
      invariant(s1 <= 100 && s2 <= 100 && s3 > 0, 'average L1 scores valid');
      return q({
        tag: 'average', level, seed,
        zh: `${name} 三次数学测验分别得了 ${s1} 分、${s2} 分和 ${s3} 分。${name} 平均每次得多少分？`,
        en: `${name} scored ${s1} marks, ${s2} marks and ${s3} marks in three Maths quizzes. What was ${name}'s average score for the three quizzes?`,
        answer: { value: m, unit: '分', sentence: `${name} 平均每次得 ${m} 分。` },
        steps: [
          { label: '总量守恒', text: `平均分 = 总分 ÷ 次数，先把三次总分找出来。` },
          { label: '求总分', text: `${s1} + ${s2} + ${s3} = ${3 * m} 分。` },
          { label: '摊平', text: `${3 * m} ÷ 3 = ${m} 分。也可以移多补少：把高出 ${m} 分的部分补给低的，三次就摊平成一样高。` },
          { label: '验一验', text: `${m} × 3 = ${3 * m} 分，正好等于三次总分 ✓` },
        ],
        hint1: `平均数问题抓一句话：总量守恒，平均 = 总数 ÷ 份数。`,
        hint2: `先把三次分数加起来，再除以 3。`,
      });
    }
    // 反求总数:已知平均与人数
    const avg = r.int(4, 15);
    const cnt = r.int(4, 12);
    const T = avg * cnt;
    return q({
      tag: 'average', level, seed,
      zh: `手工课上，${name} 小组平均每人折了 ${avg} 只纸鹤，小组一共有 ${cnt} 个人。小组一共折了多少只纸鹤？`,
      en: `In craft class, ${name}'s group folded an average of ${avg} paper cranes per member. There are ${cnt} members in the group. How many paper cranes did the group fold altogether?`,
      answer: { value: T, unit: '只', sentence: `小组一共折了 ${T} 只纸鹤。` },
      steps: [
        { label: '认平均', text: `"平均每人 ${avg} 只"是摊平后的每份——总数 = 平均数 × 人数，总量守恒。` },
        { label: '算总数', text: `${avg} × ${cnt} = ${T} 只。` },
        { label: '验一验', text: `${T} ÷ ${cnt} = ${avg} 只，正好是平均每人的数量 ✓` },
      ],
      hint1: `平均数是"摊平"后的每份——每份 × 份数就回到总数。`,
      hint2: `用 ${avg} × ${cnt} 求总数。`,
    });
  }

  if (level === 2) {
    // 补缺:先定目标平均 b 与提升 g,倒推出 a 与第 n+1 次分数 x = b + n·g ≤ 100
    const cnt = r.int(2, 4);
    const b = r.int(80, 100 - cnt);
    const g = r.int(1, Math.floor((100 - b) / cnt));
    const a = b - g;
    const x = b + cnt * g;
    invariant(x > 0 && x <= 100, 'average L2 score within 100');
    return q({
      tag: 'average', level, seed,
      zh: `${name} 前 ${cnt} 次数学测验的平均分是 ${a} 分。${name} 想让 ${cnt + 1} 次测验的平均分达到 ${b} 分，第 ${cnt + 1} 次测验要考多少分？`,
      en: `${name}'s average score for the first ${cnt} Maths quizzes was ${a} marks. ${name} wants the average score of all ${cnt + 1} quizzes to be ${b} marks. How many marks must ${name} score in the next quiz?`,
      answer: { value: x, unit: '分', sentence: `第 ${cnt + 1} 次要考 ${x} 分。` },
      steps: [
        { label: '总量守恒', text: `平均分要涨，总分就得跟着涨——盯住两笔总分。` },
        { label: '已有总分', text: `前 ${cnt} 次共 ${a} × ${cnt} = ${a * cnt} 分。` },
        { label: '目标总分', text: `${cnt + 1} 次平均 ${b} 分，总分要有 ${b} × ${cnt + 1} = ${b * (cnt + 1)} 分。` },
        { label: '算这一次', text: `${b * (cnt + 1)} − ${a * cnt} = ${x} 分。也可以移多补少：这次先拿够自己的 ${b} 分，再给前 ${cnt} 次每次补 ${g} 分，${b} + ${cnt} × ${g} = ${x} 分。` },
        { label: '验一验', text: `(${a * cnt} + ${x}) ÷ ${cnt + 1} = ${b * (cnt + 1)} ÷ ${cnt + 1} = ${b} 分 ✓` },
      ],
      hint1: `平均分从 ${a} 涨到 ${b}，涨的分数得有人"出"——想想总分要增加多少。`,
      hint2: `先算前 ${cnt} 次的总分，再算 ${cnt + 1} 次平均 ${b} 分需要的总分，两笔一减。`,
    });
  }

  // L3
  if (r.bool()) {
    // 移多补少·来人重分:总量不变,人均从 aa 降到 bb,反求原人数
    // 构造:差 d、bb = d·j、原人数 n0 = j·kk,保证整除
    const it = r.pick(ITEMS);
    const d = r.int(1, 3);
    const j = r.int(2, 5);
    const kk = r.int(2, 4);
    const bb = d * j;
    const aa = bb + d;
    const n0 = j * kk;
    const T = aa * n0;
    invariant(T === bb * (n0 + kk), 'average L3 total conserved');
    return q({
      tag: 'average', level, seed,
      zh: `老师把一批${it.zh}分给小组的同学：原来平均每人分到 ${aa} ${it.cl}；又来了 ${kk} 名同学后，平均每人只分到 ${bb} ${it.cl}。原来小组有多少名同学？`,
      en: `A teacher shares a batch of ${it.en} equally among a group of children. At first each child gets ${aa} ${it.en}. After ${kk} more children join, each child gets only ${bb} ${it.en}. How many children were in the group at first?`,
      answer: { value: n0, unit: '名', sentence: `原来小组有 ${n0} 名同学。` },
      steps: [
        { label: '总量守恒', text: `${it.zh}的总数没有变，变的只是分的人数。` },
        { label: '找来源', text: `新来的 ${kk} 人一共分走 ${kk} × ${bb} = ${kk * bb} ${it.cl}——这些${it.zh}是原来的同学每人让出 ${aa} − ${bb} = ${d} ${it.cl}凑出来的（把多的补给少的）。` },
        { label: '算人数', text: `原来有 ${kk * bb} ÷ ${d} = ${n0} 名同学。` },
        { label: '验一验', text: `总数 = ${aa} × ${n0} = ${T} ${it.cl}；来人后 ${n0} + ${kk} = ${n0 + kk} 人，${T} ÷ ${n0 + kk} = ${bb} ${it.cl} ✓` },
      ],
      hint1: `${it.zh}总数从头到尾没变——新来的人分到的，都是原来的人"让"出来的。`,
      hint2: `新来 ${kk} 人共分走 ${kk} × ${bb} ${it.cl}；原来每人让出 ${aa} − ${bb} ${it.cl}，一除就是人数。`,
    });
  }
  // 加权平均:先定全班平均 m,用偏差平衡 n1·(a1−m) + n2·(a2−m) = 0 构造
  const m = r.int(76, 88);
  const n1 = r.int(4, 12);
  const n2 = r.int(4, 12);
  const a1 = m + n2;
  const a2 = m - n1;
  invariant(a1 <= 100 && a2 > 0, 'average L3 weighted scores valid');
  const T = n1 * a1 + n2 * a2;
  invariant(T === m * (n1 + n2), 'average L3 weighted balanced');
  return q({
    tag: 'average', level, seed,
    zh: `班里男生有 ${n1} 人，数学测验平均分是 ${a1} 分；女生有 ${n2} 人，平均分是 ${a2} 分。全班的平均分是多少分？`,
    en: `In a class, the ${n1} boys scored an average of ${a1} marks in a Maths test, and the ${n2} girls scored an average of ${a2} marks. What was the average score of the whole class?`,
    answer: { value: m, unit: '分', sentence: `全班平均分是 ${m} 分。` },
    steps: [
      { label: '总量守恒', text: `全班平均分 = 全班总分 ÷ 全班人数。两组人数不一样多，不能把 ${a1} 和 ${a2} 直接对半平均。` },
      { label: '求总分', text: `男生 ${n1} × ${a1} = ${n1 * a1} 分，女生 ${n2} × ${a2} = ${n2 * a2} 分，全班共 ${T} 分。` },
      { label: '摊平', text: `${T} ÷ (${n1} + ${n2}) = ${T} ÷ ${n1 + n2} = ${m} 分——把高分组多出的补给低分组，摊平就是平均。` },
      { label: '验一验', text: `${m} × ${n1 + n2} = ${T} 分，与两组总分之和一致 ✓` },
    ],
    hint1: `两组人数不同，平均分不能直接"加起来除以 2"——回到总分和总人数。`,
    hint2: `先算男生总分 ${n1} × ${a1} 和女生总分 ${n2} × ${a2}，加起来再除以全班人数。`,
  });
}

export const CLASSIC_A = {
  sum_diff: genSumDiff,
  ratio_units: genRatioUnits,
  unit_rate: genUnitRate,
  average: genAverage,
};
