// 规则诊断:node tests/diagnose.test.mjs
import { ruleDiagnose, numbersIn, countByType, isStubborn } from '../js/diagnose.js';
import { check, done } from './_check.mjs';

// 哥哥比弟弟多 20 个,两人共 120 个,哥哥有几个? 答 70;中间步:120-20=100,100÷2=50,50+20=70
const q = {
  zh: '哥哥和弟弟共有 120 个弹珠,哥哥比弟弟多 20 个。哥哥有多少个?',
  steps: [{ label: '去掉多的', text: '120 − 20 = 100' }, { label: '求弟弟', text: '100 ÷ 2 = 50' }, { label: '求哥哥', text: '50 + 20 = 70' }],
  answer: { value: 70, unit: '个' },
};
check('numbersIn 抽数', JSON.stringify(numbersIn('共 1,200 元,每份 2.5 元,120 个')) === JSON.stringify([1200, 2.5, 120]));
check('不会 → stuck', ruleDiagnose(q, null, { gaveUp: true }).type === 'stuck');
check('没作答 → stuck', ruleDiagnose(q, '').type === 'stuck');
check('求成另一个量 50(弟弟)→ question', ruleDiagnose(q, 50).type === 'question');
check('中间步 100 → partial', ruleDiagnose(q, 100).type === 'partial');
check('差 1 → calc', ruleDiagnose(q, 71).type === 'calc');
check('数字颠倒 07? 用 2 位数 → calc', ruleDiagnose({ ...q, answer: { value: 72 } }, 27).type === 'calc');
check('十倍 → calc', ruleDiagnose(q, 700).type === 'calc');
check('题干数 120 → read', ruleDiagnose(q, 120).type === 'read');
check('答案+已知量 → question', ruleDiagnose(q, 190).type === 'question');
check('答案+差 90 → question', ruleDiagnose(q, 90).type === 'question');
const q2 = { zh: 'Lily 和 Leo 一共有 28 枚邮票,Lily 比 Leo 多 6 枚。Leo 有多少枚?', steps: [{ label: 'a', text: '28 − 6 = 22' }, { label: 'b', text: '22 ÷ 2 = 11' }, { label: '验', text: 'Lily 17 枚 + Leo 11 枚 = 28 枚' }], answer: { value: 11 } };
check('答成 Lily 的 17(验算步里出现)→ question', ruleDiagnose(q2, 17).type === 'question');
check('只算到 22 → partial', ruleDiagnose(q2, 22).type === 'partial');
check('其他 → relation', ruleDiagnose(q, 33).type === 'relation');
check('答对 → unknown', ruleDiagnose(q, 70).type === 'unknown');
check('真题无数值答案 → unknown', ruleDiagnose({ zh: 'x', steps: [] }, 5).type === 'unknown');
check('自评未填 → unknown', ruleDiagnose(q, null, { selfGraded: true }).type === 'unknown');
const c = countByType([{ diag: { type: 'calc' } }, { diag: { type: 'calc' } }, {}, { diag: { type: 'zzz' } }]);
const c2 = countByType([{ diag: { type: 'constructor' } }, { diag: { type: '__proto__' } }]);
check('原型链键不被当成错因', c2.unknown === 2 && typeof c2.constructor !== 'string');
check('countByType', c.calc === 2 && c.unknown === 2);
check('顽固:错 3 次', isStubborn({ wrongCount: 3 }));
check('顽固:变式连错 2', isStubborn({ wrongCount: 1, chain: [{ correct: false }, { correct: false }] }));
check('不顽固', !isStubborn({ wrongCount: 2, chain: [{ correct: false }, { correct: true }] }));
done();
