// SAP 101 题库:通关图(一眼看到做过/待训练)+ 筛选列表 + 一题一屏自评
import { QUESTIONS, METHODS, TAG_LIST, familyOf } from '../data.js';
import { esc, famClass, stemHTML, stepsHTML } from '../ui.js';
import { recordAttempt, addError, profile } from '../store.js';
import { statusMap, statusIcon, STATUS_META } from '../status.js';

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
  const st = params.get('st') || 'all';
  const qid = params.get('q') || '';

  const sm = statusMap();
  const list = QUESTIONS.filter(q =>
    (bank === 'all' || q.bank === bank) &&
    (!tag || q.tag === tag) &&
    (st === 'all' || (st === 'none' ? !sm[q.id] : sm[q.id] === st)));

  if (qid) {
    const idx = list.findIndex(x => x.id === qid);
    if (idx >= 0) return renderOne(el, list, idx, { bank, tag, st });
  }
  renderList(el, list, { bank, tag, st }, sm);
}

function link(opts, extra = {}) {
  const p = new URLSearchParams();
  const o = { ...opts, ...extra };
  if (o.bank && o.bank !== 'all') p.set('bank', o.bank);
  if (o.tag) p.set('tag', o.tag);
  if (o.st && o.st !== 'all') p.set('st', o.st);
  if (o.q) p.set('q', o.q);
  const s = p.toString();
  return '#/bank' + (s ? '?' + s : '');
}

function renderList(el, list, opts, sm) {
  const bankChips = BANKS.map(b =>
    `<a class="chip ${opts.bank === b.id ? 'chip-on' : ''}" href="${link({ ...opts, bank: b.id, q: '' })}">${b.name}</a>`).join('');

  const counts = { right: 0, train: 0, master: 0, none: 0 };
  for (const q of list) counts[sm[q.id] || 'none']++;

  const mapCells = list.map((q, i) => `
    <a class="map-cell ${sm[q.id] ? 'st-' + sm[q.id] : ''}" href="${link(opts, { q: q.id })}"
       title="${esc(q.zh.slice(0, 30))} · ${STATUS_META[sm[q.id] || 'none'].label}">${i + 1}</a>`).join('');

  const rows = list.map(q => `
    <a class="bank-row ${sm[q.id] ? 'st-' + sm[q.id] : ''}" href="${link(opts, { q: q.id })}">
      <span>${statusIcon(sm[q.id])}</span>
      <span>${esc(q.zh.slice(0, 44))}${q.zh.length > 44 ? '…' : ''}</span>
      <span class="bank-src">${esc(q.source || q.bank)}</span>
    </a>`).join('');

  el.innerHTML = `
  <div class="bank">
    <a class="crumb" href="#/">← 返回首页</a>
    <h1>📚 SAP 101 题库</h1>
    <div class="chip-row">${bankChips}</div>
    <div class="bank-toolbar">
      <select class="select" id="tagsel">
        <option value="">全部模型</option>
        ${TAG_LIST.map(t => `<option value="${t}" ${opts.tag === t ? 'selected' : ''}>${esc(METHODS[t].name)}</option>`).join('')}
      </select>
      <select class="select" id="stsel">
        <option value="all">全部状态</option>
        <option value="none" ${opts.st === 'none' ? 'selected' : ''}>⚪ 未做</option>
        <option value="train" ${opts.st === 'train' ? 'selected' : ''}>🔴 还要训练</option>
        <option value="right" ${opts.st === 'right' ? 'selected' : ''}>✅ 做对了</option>
        <option value="master" ${opts.st === 'master' ? 'selected' : ''}>🏆 已掌握</option>
      </select>
      <a class="btn btn-sm" href="#/print">🖨 去打印中心选题</a>
    </div>

    <div class="card map-card">
      <div class="map-legend">
        <span><i style="background:#e9edf3"></i>未做 ${counts.none}</span>
        <span><i style="background:#d1fae5"></i>做对 ${counts.right}</span>
        <span><i style="background:#ffe0e6"></i>还要训练 ${counts.train}</span>
        <span><i style="background:#fef3c7"></i>错过但已掌握 ${counts.master}</span>
        <span style="margin-left:auto">共 ${list.length} 道 · 已做 ${list.length - counts.none}</span>
      </div>
      <div class="map-grid">${mapCells || '<p class="empty">筛选下没有题。</p>'}</div>
    </div>

    <div class="bank-list">${rows}</div>
  </div>`;

  el.querySelector('#tagsel').addEventListener('change', e => { location.hash = link({ ...opts, tag: e.target.value, q: '' }); });
  el.querySelector('#stsel').addEventListener('change', e => { location.hash = link({ ...opts, st: e.target.value, q: '' }); });
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
