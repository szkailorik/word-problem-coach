// SAP 101 题库:按册/模型筛选,一题一屏,自评对错,错题自动入本
import { QUESTIONS, METHODS, TAG_LIST, familyOf } from '../data.js';
import { esc, famClass, stemHTML, stepsHTML } from '../ui.js';
import { recordAttempt, addError, profile } from '../store.js';

const BANKS = [
  { id: 'all', name: '全部' },
  { id: 'core', name: 'Core' },
  { id: 'book3', name: 'Book 3' },
  { id: 'book4', name: 'Book 4' },
  { id: 'book5', name: 'Book 5' },
  { id: 'book6', name: 'Book 6' },
];
const BANK_LEVEL = { core: 1, book3: 1, book4: 2, book5: 2, book6: 3 };

export function renderBank(el, query) {
  const params = new URLSearchParams(query || '');
  const bank = params.get('bank') || 'all';
  const tag = params.get('tag') || '';
  const qid = params.get('q') || '';

  const list = QUESTIONS.filter(q =>
    (bank === 'all' || q.bank === bank) && (!tag || q.tag === tag));

  if (qid) {
    const idx = list.findIndex(x => x.id === qid);
    if (idx >= 0) return renderOne(el, list, idx, { bank, tag });
  }
  renderList(el, list, { bank, tag });
}

function link(opts, extra = {}) {
  const p = new URLSearchParams();
  const o = { ...opts, ...extra };
  if (o.bank && o.bank !== 'all') p.set('bank', o.bank);
  if (o.tag) p.set('tag', o.tag);
  if (o.q) p.set('q', o.q);
  const s = p.toString();
  return '#/bank' + (s ? '?' + s : '');
}

function renderList(el, list, opts) {
  const doneMap = doneStatus();
  const bankChips = BANKS.map(b =>
    `<a class="chip ${opts.bank === b.id ? 'chip-on' : ''}" href="${link({ ...opts, bank: b.id, q: '' })}">${b.name}</a>`).join('');
  const tagChips = ['', ...TAG_LIST].map(t =>
    `<a class="chip ${opts.tag === t ? 'chip-on' : ''}" href="${link({ ...opts, tag: t, q: '' })}">${t ? esc(METHODS[t].name.replace(/^\d+\.\s*/, '')) : '全部模型'}</a>`).join('');

  const rows = list.map((q, i) => {
    const st = doneMap[q.id]; // 'right' | 'wrong' | undefined
    return `
    <a class="bank-row ${st ? 'bank-' + st : ''}" href="${link(opts, { q: q.id })}">
      <span class="bank-status">${st === 'right' ? '✅' : st === 'wrong' ? '❌' : '⚪'}</span>
      <span class="bank-stem">${esc(q.zh.slice(0, 44))}${q.zh.length > 44 ? '…' : ''}</span>
      <span class="bank-src">${esc(q.source || q.bank)}</span>
    </a>`;
  }).join('');

  const doneCount = list.filter(q => doneMap[q.id]).length;
  el.innerHTML = `
  <div class="bank">
    <a class="crumb" href="#/">← 返回首页</a>
    <h1>📚 SAP 101 题库 <span class="sec-sub">${list.length} 道 · 已做 ${doneCount}</span></h1>
    <div class="chip-row">${bankChips}</div>
    <div class="chip-row chip-row-wrap">${tagChips}</div>
    <div class="bank-list">${rows || '<p class="empty">这个筛选下没有题。</p>'}</div>
  </div>`;
}

function renderOne(el, list, idx, opts) {
  const q = list[idx];
  const m = METHODS[q.tag];
  const fam = familyOf(q.tag);
  let revealed = false;

  el.innerHTML = `
  <div class="drill ${famClass(fam.id)}">
    <div class="drill-top">
      <a class="crumb" href="${link(opts)}">← 题目列表</a>
      <span class="drill-title">${esc(q.source || q.bank)}</span>
      <span class="drill-progress">第 ${idx + 1} / ${list.length} 题</span>
    </div>
    <div class="card q-card">
      <div class="q-tag">${esc(m.name)}</div>
      ${stemHTML(q)}
      <p class="paper-note">✍️ 在草稿纸上完整做一遍,再对答案。</p>
      <div class="model-actions">
        <button class="btn btn-primary" id="reveal">做完了,看讲解 →</button>
        <a class="btn btn-sm" href="#/learn/${q.tag}">📖 复习这个模型</a>
      </div>
      <div id="solution" class="hidden">
        <h3>📖 逐步讲解</h3>
        ${stepsHTML(q.steps)}
        ${q.model && q.model.text ? `<div class="answer-card">🧮 ${esc(q.model.text)}</div>` : ''}
        <div class="grade-row">
          <span>你做对了吗?</span>
          <button class="btn btn-right" id="gright">✅ 做对了</button>
          <button class="btn btn-wrong" id="gwrong">❌ 做错了</button>
        </div>
      </div>
      <div id="nextrow" class="hidden">
        <div id="gradefb"></div>
        <button class="btn btn-big btn-primary" id="nextbtn">下一题 →</button>
      </div>
    </div>
  </div>`;

  const $ = id => el.querySelector('#' + id);
  $('reveal').addEventListener('click', () => {
    if (revealed) return; revealed = true;
    $('solution').classList.remove('hidden');
    $('reveal').disabled = true;
  });
  $('gright').addEventListener('click', () => grade(true));
  $('gwrong').addEventListener('click', () => grade(false));

  function grade(correct) {
    $('gright').disabled = true; $('gwrong').disabled = true;
    recordAttempt({ qid: q.id, tag: q.tag, correct, mode: 'bank', level: BANK_LEVEL[q.bank] || 1 });
    if (!correct) addError(q.id, q.tag, BANK_LEVEL[q.bank] || 1);
    $('nextrow').classList.remove('hidden');
    $('gradefb').innerHTML = correct
      ? `<div class="fb fb-right">✅ 记下来了,继续!</div>`
      : `<div class="fb fb-wrong">已收进错题本。明天会安排一道同类变式来复习;也可以<a href="#/drill/${q.tag}">现在就练几道同类题</a>。</div>`;
    const nb = $('nextbtn');
    if (idx + 1 >= list.length) { nb.textContent = '🏁 这组做完了,回列表'; }
    nb.addEventListener('click', () => {
      location.hash = idx + 1 < list.length ? link(opts, { q: list[idx + 1].id }) : link(opts);
    });
    nb.focus();
  }
}

// 最近一次作答状态
function doneStatus() {
  const map = {};
  for (const a of profile().attempts) {
    if (a.mode === 'bank') map[a.qid] = a.correct ? 'right' : 'wrong';
  }
  return map;
}
