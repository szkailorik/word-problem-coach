// 错题本:到期复习队列 + 全部错题档案;每道错题随时可生成同类变式
import { METHODS, QMAP } from '../data.js';
import { regenerate } from '../gen/generators.js';
import { esc, fmtDate, boxDots } from '../ui.js';
import { allErrors, dueErrors, removeError, BOX_DAYS } from '../store.js';
import { preselectForPrint } from './print.js';

export function renderErrors(el) {
  const due = dueErrors();
  const all = allErrors();
  const active = all.filter(e => !e.mastered);
  const mastered = all.filter(e => e.mastered);

  const dueBlock = due.length ? `
    <div class="card due-card">
      <h3>⏰ 今天到期的复习:${due.length} 道</h3>
      <p>每道错题会生成一道<b>同类新题</b>来检验。答对升一级,连闯 ${BOX_DAYS.length} 关(隔 ${BOX_DAYS.join('、')} 天)就算彻底掌握;答错则重新开始。</p>
      <div class="model-actions">
        <a class="btn btn-big btn-alert" href="#/drill/review">🔁 开始复习(${due.length} 道)</a>
        <button class="btn btn-big" id="print-due">🖨 打印这批错题(可附变式)</button>
      </div>
    </div>` : `
    <div class="card due-card">
      <h3>😌 今天没有到期的复习</h3>
      <p>错题会按 ${BOX_DAYS.join(' / ')} 天的节奏自动安排复习,到期了首页会提醒你。</p>
    </div>`;

  el.innerHTML = `
  <div class="errors">
    <a class="crumb" href="#/">← 返回首页</a>
    <h1>📕 错题本 <span class="sec-sub">${active.length} 道在库 · ${mastered.length} 道已彻底掌握</span></h1>
    ${dueBlock}
    ${active.length ? `<h2 class="sec-title">还在闯关的错题</h2>` : `<p class="empty">错题本是空的——去练题吧,错了会自动收进来。</p>`}
    <div class="error-list">${active.map(row).join('')}</div>
    ${mastered.length ? `<h2 class="sec-title">🏆 已彻底掌握</h2><div class="error-list">${mastered.map(row).join('')}</div>` : ''}
  </div>`;

  el.querySelector('#print-due')?.addEventListener('click', () => {
    preselectForPrint(due.map(e => e.qid), '到期错题卷');
    location.hash = '#/print';
  });
  el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    if (confirm('确定把这道错题移出错题本吗?')) {
      removeError(b.dataset.remove);
      renderErrors(el);
    }
  }));
  el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const d = el.querySelector(`[data-detail="${b.dataset.toggle}"]`);
    d.classList.toggle('hidden');
    b.textContent = d.classList.contains('hidden') ? '看原题 ▾' : '收起 ▴';
  }));
}

function row(e) {
  const m = METHODS[e.tag];
  const orig = QMAP.get(e.qid) || regenerate(e.qid);
  const stem = orig ? orig.zh : '(生成题)';
  const dueTxt = e.mastered ? '已掌握 🏆' : e.due <= Date.now() ? '<b class="due-now">今天该复习</b>' : `下次复习 ${fmtDate(e.due)}`;
  const steps = orig && orig.steps ? orig.steps : [];
  return `
  <div class="card error-row ${e.mastered ? 'error-mastered' : ''}">
    <div class="error-main">
      <div class="error-stem">${esc(stem.slice(0, 60))}${stem.length > 60 ? '…' : ''}</div>
      <div class="error-meta">
        <span class="q-tag">${esc(m ? m.name : e.tag)}</span>
        <span>错 ${e.wrongCount} 次</span>
        <span>首错 ${fmtDate(e.firstTs)}</span>
        ${boxDots(e.box, BOX_DAYS.length, e.mastered)}
        <span>${dueTxt}</span>
      </div>
    </div>
    <div class="error-actions">
      ${e.mastered ? '' : `<a class="btn btn-sm btn-primary" href="#/drill/review/${esc(e.qid)}">🔁 现在就练一道同类</a>`}
      <a class="btn btn-sm" href="#/learn/${e.tag}">📖 复习模型</a>
      ${steps.length ? `<button class="btn btn-sm btn-ghost" data-toggle="${esc(e.qid)}">看原题 ▾</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-remove="${esc(e.qid)}">🗑</button>
    </div>
    ${steps.length ? `
    <div class="error-detail hidden" data-detail="${esc(e.qid)}">
      <p class="stem-zh">${esc(stem)}</p>
      ${steps.map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><div><b>${esc(s.label)}</b><br>${esc(s.text)}</div></div>`).join('')}
      ${orig && orig.answer ? `<div class="answer-card">📌 ${esc(orig.answer.sentence || '')}</div>` : ''}
    </div>` : ''}
  </div>`;
}
