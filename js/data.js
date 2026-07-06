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
  if (METHODS.basic) TAG_LIST = [...TAG_LIST, 'basic'];
}

const BASIC_FAMILY = { id: 'basic-fam', name: '基础综合', headline: '看清问句,按步就班', teacherLine: '', ids: ['basic'] };

export function familyOf(tag) {
  return FAMILIES.find(f => f.ids.includes(tag)) || BASIC_FAMILY;
}

export function bankQuestionsByTag(tag) {
  return QUESTIONS.filter(q => q.tag === tag);
}
