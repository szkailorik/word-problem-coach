// 模型学堂:绘本记忆 + 信号/避坑 + 三阶名师例题(逐步展开精讲) + 讲完即测
import { METHODS, EXAMPLES, familyOf, bankQuestionsByTag } from '../data.js';
import { GENERATORS, generate } from '../gen/generators.js';
import { esc, famClass, stemHTML, clip } from '../ui.js';
import { state, profile, getAiNote, setAiNote } from '../store.js';
import { ERROR_TYPES, countByType } from '../diagnose.js';
import { findQuestion } from '../qlookup.js';
import { aiAvailable, chatJSON } from '../ai/client.js';
import { trickCard } from '../ai/tutor.js';
import { navToken, stillOn } from '../nav.js';

// 没有名师例题的新模型:用生成器出 3 道固定标准例题(⭐→⭐⭐⭐,种子固定保证每次一样)
function generatedExamples(tag) {
  const meta = [['标准例题 · 认结构', '标杆'], ['进阶例题 · 换情境', '迁移'], ['挑战例题 · 加难度', '压轴']];
  const out = [];
  for (let lv = 1; lv <= 3; lv++) {
    try {
      const q = generate(tag, lv, lv);
      out.push({ title: meta[lv - 1][0], level: meta[lv - 1][1], zh: q.zh, en: q.en, stepRecords: q.steps, answer: { final: q.answer.sentence, detail: '' } });
    } catch (e) { /* 某档生成失败就少一道 */ }
  }
  return out;
}

export function renderLearn(el, tag, anchor = '') {
  const m = METHODS[tag];
  if (!m) { el.innerHTML = '<p class="empty">找不到这个模型。</p>'; return; }
  const fam = familyOf(tag);
  const examples = (EXAMPLES[tag] && EXAMPLES[tag].length) ? EXAMPLES[tag]
    : (GENERATORS[tag] ? generatedExamples(tag) : []);
  const bankCount = bankQuestionsByTag(tag).length;
  const mem = m.memory || {};

  const exampleCards = examples.map((ex, i) => exampleCard(ex, i)).join('');

  el.innerHTML = `
  <div class="learn ${famClass(fam.id)}">
    <a class="crumb" href="#/">← 返回地图</a>
    <div class="learn-head card">
      ${m.img ? `<img class="learn-img" src="${m.img}" alt="${esc(m.name)}">`
        : (mem.emoji ? `<div class="learn-img learn-emoji">${esc(mem.emoji)}</div>` : '')}
      <div>
        <div class="family-badge">${esc(fam.name)} · ${esc(fam.headline)}</div>
        <h1>${esc(m.name)}</h1>
        ${mem.mantra ? `<p class="mantra">🗣️ 口诀：<b>${esc(mem.mantra)}</b>${mem.cue ? `（记忆画面：${esc(mem.cue)}）` : ''}</p>` : ''}
        ${mem.beats ? `<ol class="beats">${mem.beats.map(b => `<li>${esc(b)}</li>`).join('')}</ol>` : ''}
      </div>
    </div>

    <div class="learn-cols">
      <div class="card">
        <h3>👀 什么时候用它（信号）</h3>
        <ul>${m.signals.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
      <div class="card">
        <h3>⚠️ 容易踩的坑</h3>
        <ul>${m.pitfalls.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        ${m.disambiguation ? `<p class="disamb"><b>别认错：</b>${esc(m.disambiguation.tellApart)}<br><b>换模型时机：</b>${esc(m.disambiguation.switchWhen)}</p>` : ''}
      </div>
    </div>

    ${examples.length ? `<h2 class="sec-title">${(EXAMPLES[tag] && EXAMPLES[tag].length) ? '🎓 名师三阶例题 <span class="sec-sub">标杆题立模型 → 迁移题换情境 → 压轴题加干扰</span>' : '🎓 三阶标准例题 <span class="sec-sub">认结构 → 换情境 → 加难度,逐步展开讲解</span>'}</h2>
    <div class="examples">${exampleCards}</div>` : ''}

    ${trickBlock(tag)}

    <div class="card learn-cta">
      <h3>✅ ${GENERATORS[tag] ? '讲完即测' : '去题库练习'}</h3>
      <p>${GENERATORS[tag] ? '三道例题走完，马上做几道同类新题,检验是不是真的会了。做错会自动进错题本。' : '这一类是直接列式的计算题,不用背模型,去题库按顺序练就行。'}</p>
      <div class="model-actions">
        ${GENERATORS[tag] ? `<a class="btn btn-primary" href="#/drill/${tag}">✏️ 来几道同类题</a>` : ''}
        ${bankCount ? `<a class="btn ${GENERATORS[tag] ? '' : 'btn-primary'}" href="#/bank?tag=${tag}">📚 题库真题 ${bankCount} 道</a>` : ''}
      </div>
    </div>
  </div>`;

  bindTrick(el, tag, m);
  if (anchor === 'trick') el.querySelector('#trick')?.scrollIntoView({ block: 'start' });

  // 逐步展开交互
  el.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.example-card');
      const hidden = card.querySelector('.step.hidden, .answer-card.hidden');
      if (hidden) {
        hidden.classList.remove('hidden');
        hidden.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const rest = card.querySelector('.step.hidden, .answer-card.hidden');
      if (!rest) {
        btn.textContent = '✅ 讲完了，去做同类题';
        btn.classList.add('btn-primary');
        btn.onclick = () => { location.hash = `#/drill/${tag}`; };
      } else {
        const total = card.querySelectorAll('.step').length + 1;
        const done = total - card.querySelectorAll('.step.hidden, .answer-card.hidden').length;
        btn.textContent = `👉 下一步（${done}/${total}）`;
      }
    });
  });
}

function exampleCard(ex, i) {
  const levelIcons = ['🏁', '🔁', '🏔️'];
  const stem = state.lang === 'en'
    ? `<p class="stem-en">${esc(ex.en)}</p>`
    : state.lang === 'zh'
      ? `<p class="stem-zh">${esc(ex.zh)}</p>`
      : `<p class="stem-zh">${esc(ex.zh)}</p><p class="stem-en">${esc(ex.en)}</p>`;
  const steps = (ex.stepRecords || []).map((s, j) => `
    <div class="step hidden">
      <span class="step-num">${j + 1}</span>
      <div><b>${esc(s.label)}</b><br>${esc(s.text)}</div>
    </div>`).join('');
  return `
  <div class="card example-card">
    <div class="example-head">
      <span class="level-chip">${levelIcons[i] || '⭐'} ${esc(ex.level || '')}</span>
      <h3>${esc(ex.title)}</h3>
    </div>
    ${stem}
    <div class="example-steps">${steps}</div>
    <div class="answer-card hidden">
      <b>📌 答案：</b>${esc(ex.answer?.final || '')}
      ${ex.answer?.detail ? `<div class="answer-detail">💡 ${esc(ex.answer.detail)}</div>` : ''}
    </div>
    <button class="btn btn-reveal" data-reveal>👉 开始讲解，一步一步来</button>
  </div>`;
}

// ── 🧭 我的套路卡:本地错因统计 + AI 结合孩子错题写的套路总结 ──
function tagErrors(tag) {
  return Object.values(profile().errorBook).filter(e => e.tag === tag).sort((a, b) => b.lastTs - a.lastTs);
}

function trickBlock(tag) {
  const errs = tagErrors(tag);
  const byType = countByType(errs);
  const types = Object.entries(byType).filter(([k, n]) => n && k !== 'unknown').sort((a, b) => b[1] - a[1]);
  const note = getAiNote('trick', tag);
  return `
  <div class="card trick-card" id="trick">
    <div class="ereport-head">
      <h3>🧭 我的套路卡 <span class="sec-sub">${errs.length ? `这个套路你错过 ${errs.length} 道` : '还没有错题,先看通用要点'}</span></h3>
      <button class="btn btn-sm ${note ? '' : 'btn-primary'}" id="gen-trick">${note ? '🔄 重新总结' : '✨ 让 AI 老师结合我的错题总结'}</button>
    </div>
    ${types.length ? `<div class="trick-mine">我的易错点:${types.map(([k, n]) => `<span class="etype etype-${k}">${ERROR_TYPES[k].icon} ${esc(ERROR_TYPES[k].name)} ×${n}</span>`).join('')}</div>` : ''}
    ${errs.length ? `<ul class="trick-errs">${errs.slice(0, 3).map(e => `<li>${esc(clip((findQuestion(e.qid) || {}).zh || '', 50))}${e.diag && e.diag.note ? `<small>💬 ${esc(clip(e.diag.note, 50))}</small>` : ''}</li>`).join('')}</ul>` : ''}
    <div id="trick-body">${note ? trickHTML(note.data, note.ts) : ''}</div>
  </div>`;
}

function trickHTML(t, ts) {
  const list = (title, arr) => arr && arr.length ? `<div><h4>${title}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  return `
  <div class="trick-ai">
    ${t.mantra ? `<div class="trick-mantra">🗣️ ${esc(t.mantra)}</div>` : ''}
    <div class="trick-grid">
      ${list('👀 看到什么想到它', t.signals)}
      ${t.steps.length ? `<div><h4>🪜 解题步骤</h4><ol>${t.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
      ${list('⚠️ 我的易错点', t.myPitfalls)}
      ${list('✅ 做完检查', t.checklist)}
    </div>
    ${t.example ? `<div class="trick-example"><b>📝 小例题:</b>${esc(t.example.zh)}<br><b>解法:</b>${esc(t.example.solution)}</div>` : ''}
    ${ts ? `<div class="coach-quota">🤖 AI 生成于 ${new Date(ts).toLocaleString()}</div>` : ''}
  </div>`;
}

function bindTrick(el, tag, m) {
  const btn = el.querySelector('#gen-trick');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const body = el.querySelector('#trick-body');
    const student = state.student, tok = navToken();
    btn.disabled = true;
    body.innerHTML = '<div class="coach-loading">⏳ AI 老师正在翻你的错题、总结套路……</div>';
    if (!(await aiAvailable())) {
      if (!stillOn(tok)) return;
      body.innerHTML = '<p class="coach-off">AI 老师需要登录后才能用(家庭网址 wp.kailorik.com)。</p>';
      btn.disabled = false;
      return;
    }
    const errs = tagErrors(tag).slice(0, 8).map(e => ({ stem: (findQuestion(e.qid) || {}).zh || '', diag: e.diag }));
    try {
      const t = await trickCard(m, errs, chatJSON);
      setAiNote('trick', t, tag, student);
      if (!stillOn(tok)) return;
      body.innerHTML = trickHTML(t, Date.now());
      btn.textContent = '🔄 重新总结';
    } catch (e) {
      if (!stillOn(tok)) return;
      body.innerHTML = `<p class="coach-off">😅 ${esc(e.message)}</p>`;
    }
    btn.disabled = false;
  });
}
