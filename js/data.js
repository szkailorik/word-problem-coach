// 数据加载:408 题库 / 15 模型词典 / 45 道名师例题
export let QUESTIONS = [];
export let QMAP = new Map();
export let METHODS = {};
export let FAMILIES = [];
export let EXAMPLES = {};
export let TAG_LIST = [];

export async function loadData() {
  // no-cache:每次向服务器校验(未变则 304),避免改版后长时间拿到旧题库
  const opt = { cache: 'no-cache' };
  const [qs, md, ex] = await Promise.all([
    fetch('data/questions.json', opt).then(r => r.json()),
    fetch('data/methods.json', opt).then(r => r.json()),
    fetch('data/examples.json', opt).then(r => r.json()),
  ]);
  QUESTIONS = qs;
  QMAP = new Map(qs.map(q => [q.id, q]));
  METHODS = md.methods;
  FAMILIES = md.families;
  EXAMPLES = ex;
  TAG_LIST = FAMILIES.flatMap(f => f.ids);
  for (const extra of ['basic', 'geometry']) {
    if (METHODS[extra]) TAG_LIST = [...TAG_LIST, extra];
  }
}

// 册与默认难度(bank.js / print.js / 快速出题共用)
export const BANKS = [
  { id: 'all', name: '全部册' }, { id: 'core', name: 'Core' },
  { id: 'book3', name: 'Book 3' }, { id: 'book4', name: 'Book 4' },
  { id: 'book5', name: 'Book 5' }, { id: 'book6', name: 'Book 6' },
];
export const BANK_LEVEL = { core: 1, book3: 1, book4: 2, book5: 2, book6: 3 };

// 题库直练分类(无生成器,不在五大母套路里)
export const EXTRA_FAMILIES = [
  { id: 'basic-fam', name: '基础综合', headline: '看清问句,按步就班', teacherLine: '', ids: ['basic'] },
  { id: 'geo-fam', name: '图形与度量', headline: '先认图形,再选公式', teacherLine: '', ids: ['geometry'] },
];

export function familyOf(tag) {
  return FAMILIES.find(f => f.ids.includes(tag))
    || EXTRA_FAMILIES.find(f => f.ids.includes(tag))
    || EXTRA_FAMILIES[0];
}

export function bankQuestionsByTag(tag) {
  return QUESTIONS.filter(q => q.tag === tag);
}
