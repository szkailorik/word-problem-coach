// 数据加载:408 题库 / 15 模型词典 / 45 道名师例题
export let QUESTIONS = [];
export let QMAP = new Map();
export let METHODS = {};
export let FAMILIES = [];
export let EXAMPLES = {};
export let TAG_LIST = [];

export async function loadData() {
  const [qs, md, ex] = await Promise.all([
    fetch('data/questions.json').then(r => r.json()),
    fetch('data/methods.json').then(r => r.json()),
    fetch('data/examples.json').then(r => r.json()),
  ]);
  QUESTIONS = qs;
  QMAP = new Map(qs.map(q => [q.id, q]));
  METHODS = md.methods;
  FAMILIES = md.families;
  EXAMPLES = ex;
  TAG_LIST = FAMILIES.flatMap(f => f.ids);
}

export function familyOf(tag) {
  return FAMILIES.find(f => f.ids.includes(tag));
}

export function bankQuestionsByTag(tag) {
  return QUESTIONS.filter(q => q.tag === tag);
}
