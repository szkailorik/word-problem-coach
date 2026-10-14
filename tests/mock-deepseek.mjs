// 本地模拟 DeepSeek(端到端测试用,不花真 Token):node tests/mock-deepseek.mjs [port]
// 配合 wrangler dev:.dev.vars 里 DEEPSEEK_BASE=http://127.0.0.1:5399
// 行为:第 1 次出变式故意给错答案(测"验算不过 → 重出"),之后正常;独立解题按题干里的数重算。
import http from 'node:http';

const port = Number(process.argv[2]) || 5399;
let variantN = 0;
const NAMES = [['姐姐', '妹妹', '贴纸', '张'], ['爸爸', '小明', '邮票', '枚'], ['A 班', 'B 班', '图书', '本'], ['小红', '小兰', '彩笔', '支']];

function variant() {
  variantN++;
  const [a, b, item, cl] = NAMES[variantN % NAMES.length];
  const small = 20 + variantN * 3, diff = 10 + variantN * 2, total = small * 2 + diff, big = small + diff;
  const wrong = variantN === 1; // 第一次故意算错
  return {
    zh: `${a}和${b}一共有 ${total} ${cl}${item},${a}比${b}多 ${diff} ${cl}。${a}有多少${cl}${item}?`,
    en: `${a} and ${b} have ${total} items in total. ${a} has ${diff} more than ${b}. How many does ${a} have?`,
    unit: cl, answer: wrong ? big + 5 : big, expression: `(${total} + ${diff}) ÷ 2`,
    steps: [{ label: '补齐', text: `把${b}补成和${a}一样多:${total} + ${diff} = ${total + diff}` }, { label: '平分', text: `${total + diff} ÷ 2 = ${big}` }],
    hint1: '和差问题:知道两数的和与差', hint2: `先把${b}补得和${a}一样多`, sentence: `${a}有 ${big} ${cl}${item}。`,
    diagram: { kind: 'bars', title: '线段图', bars: [{ label: a, parts: [{ size: small, text: '1份' }, { size: diff, text: `多${diff}`, style: 'extra' }], total: '?' }, { label: b, parts: [{ size: small, text: '1份' }] }], braces: [{ from: 0, to: 1, text: `共 ${total}` }] },
  };
}

function solve(text) {
  const m = /一共有 (\d+) .*?多 (\d+)/.exec(text);
  return m ? { work: '(和+差)÷2', answer: (Number(m[1]) + Number(m[2])) / 2 } : { answer: 0 };
}

function reply(messages) {
  const u = messages[messages.length - 1].content;
  if (u.includes('请独立解答')) return solve(u);
  if (u.includes('"变式题"')) return variant();
  if (u.includes('诊断孩子的错因')) return {
    errorType: 'partial', diagnosis: '你算出的是"去掉多的部分后一份的量",还差最后一步把多的加回去。',
    thinking: ['先找"和"和"差":两人一共多少,谁比谁多多少', '去掉多出来的部分,两人就一样多了', '剩下的平均分成 2 份,得到小的数', '小的数加上差,才是大的数'],
    keyIdea: '和差问题:大数 =(和 + 差)÷ 2', checkTip: '写答案前看问句:问的是谁?',
    diagram: { kind: 'bars', title: '线段图', bars: [{ label: '大的', parts: [{ size: 3, text: '1份' }, { size: 1, text: '差', style: 'extra' }], total: '?' }, { label: '小的', parts: [{ size: 3, text: '1份' }] }], braces: [{ from: 0, to: 1, text: '和' }], note: '去掉"差",剩下 2 个 1 份' },
  };
  if (u.includes('我的套路卡')) return {
    title: '和差问题', mantra: '和加差、除以二', signals: ['知道两个数的和', '知道两个数的差'],
    steps: ['画两条线段,标出和与差', '去掉差 → 两份一样多', '除以 2 得小数', '小数加差得大数'],
    myPitfalls: ['算到一份就停,忘了加回差', '把和当成大数'], checklist: ['大数+小数=和?', '大数−小数=差?'],
    example: { zh: '两数和 20,差 4,大数是几?', solution: '(20+4)÷2=12' },
  };
  if (u.includes('学情分析')) return {
    summary: '最近错题集中在和差类,主要是"只做了一半"。', weaknesses: [{ title: '最后一步漏掉', evidence: '3 道错题都停在中间结果', advice: '每题写完问一句"问的是谁"' }],
    plan: ['周一:和差问题 4 道 + 画线段图', '周三:变式闯关 2 轮', '周五:混合辨题 10 道'], praise: '你画图越来越熟练了,继续保持!',
  };
  return { note: 'unknown prompt' };
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404); return res.end(); }
    if (req.headers.authorization !== 'Bearer mock-key') { res.writeHead(401); return res.end('bad key'); }
    const { messages } = JSON.parse(body);
    const content = JSON.stringify(reply(messages));
    console.log('[mock]', messages[messages.length - 1].content.slice(0, 30).replace(/\n/g, ' '), '→', content.slice(0, 60));
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 100 } }));
    }, 300);
  });
}).listen(port, '127.0.0.1', () => console.log('mock deepseek on', port));
