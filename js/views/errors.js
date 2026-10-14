// 智能错题本(v2.0):错因画像 + AI 学情分析 + 按错因/套路筛选 + 每题错因徽章、闯关链、AI 讲解、变式闯关
import { METHODS } from '../data.js';
import { esc, fmtDate, boxDots, clip } from '../ui.js';
import { allErrors, dueErrors, removeError, BOX_DAYS, totals, lastAttemptOf, getAiNote, setAiNote, state } from '../store.js';
import { findQuestion } from '../qlookup.js';
import { ERROR_TYPES, countByType, isStubborn, isErrorType, errorTypeOf } from '../diagnose.js';
import { runCoach } from '../coach.js';
import { aiAvailable, chatJSON } from '../ai/client.js';
import { report as aiReport } from '../ai/tutor.js';
import { preselectForPrint } from './print.js';
import { navToken, stillOn } from '../nav.js';

const ui = { type: 'all', tag: '' }; // 筛选条件(切页面保留)

const mname = tag => (METHODS[tag]?.name || tag).replace(/^\d+\.\s*/, '');

export function renderErrors(el) {
  const due = dueErrors();
  const all = allErrors();
  const active = all.filter(e => !e.mastered);
  const mastered = all.filter(e => e.mastered);

  const byType = countByType(active);
  const tagCount = {};
  for (const e of active) tagCount[e.tag] = (tagCount[e.tag] || 0) + 1;
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const stubborn = active.filter(isStubborn);
  const chainAll = all.flatMap(e => e.chain || []);
  const chainWin = chainAll.filter(c => c.correct).length;

  const filtered = active.filter(e =>
    (ui.type === 'all' || (ui.type === 'stubborn' ? isStubborn(e) : ((e.diag && isErrorType(e.diag.type)) ? e.diag.type : 'unknown') === ui.type)) &&
    (!ui.tag || e.tag === ui.tag));

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
      <p>错题会按 ${BOX_DAYS.join(' / ')} 天的节奏自动安排复习;想趁热打铁,点任意错题的「🎯 变式闯关」。</p>
    </div>`;

  const maxType = Math.max(1, ...Object.values(byType));
  const typeBars = Object.entries(ERROR_TYPES).filter(([k]) => byType[k]).map(([k, t]) => `
    <button class="ebar ${ui.type === k ? 'ebar-on' : ''}" data-type="${k}" title="${esc(t.tip)}">
      <span class="ebar-name">${t.icon} ${esc(t.name)}</span>
      <span class="ebar-track"><i style="width:${Math.round(byType[k] / maxType * 100)}%"></i></span>
      <b>${byType[k]}</b>
    </button>`).join('');
  const topType = Object.entries(byType).filter(([k]) => k !== 'unknown').sort((a, b) => b[1] - a[1])[0];

  const profileBlock = active.length ? `
    <div class="card eprofile">
      <div>
        <h3>📊 错因画像</h3>
        ${typeBars || '<p class="empty">还没有诊断过的错题。</p>'}
        ${topType && topType[1] ? `<p class="eprofile-tip">最常见:<b>${ERROR_TYPES[topType[0]].icon} ${esc(ERROR_TYPES[topType[0]].name)}</b> —— ${esc(ERROR_TYPES[topType[0]].tip)}</p>` : ''}
      </div>
      <div>
        <h3>🧩 错得最多的套路</h3>
        <ul class="etop">${topTags.map(([tag, n]) => `
          <li><a href="#/learn/${esc(tag)}#trick">${esc(mname(tag))}</a><span>${n} 道</span>
            <button class="chip ${ui.tag === tag ? 'chip-on' : ''}" data-tag="${esc(tag)}">只看</button></li>`).join('')}</ul>
        <div class="estats">
          <span>🧱 顽固错题 <b>${stubborn.length}</b></span>
          <span>🎯 变式闯关 <b>${chainWin}/${chainAll.length}</b> 次做对</span>
        </div>
      </div>
    </div>
    ${reportBlock()}` : '';

  const typeChips = [['all', '全部', active.length], ['stubborn', '🧱 顽固', stubborn.length],
    ...Object.entries(ERROR_TYPES).filter(([k]) => byType[k]).map(([k, t]) => [k, `${t.icon} ${t.name}`, byType[k]])]
    .map(([k, name, n]) => `<button class="chip ${ui.type === k ? 'chip-on' : ''}" data-type="${k}">${esc(name)} ${n}</button>`).join('');

  el.innerHTML = `
  <div class="errors">
    <a class="crumb" href="#/">← 返回首页</a>
    <h1>📕 智能错题本 <span class="sec-sub">${active.length} 道在库 · ${mastered.length} 道已彻底掌握</span></h1>
    ${dueBlock}
    ${profileBlock}
    ${active.length ? `
      <h2 class="sec-title">还在闯关的错题 <span class="sec-sub">${filtered.length} 道${ui.tag ? ` · ${esc(mname(ui.tag))} <a href="javascript:void 0" data-tag="">✕</a>` : ''}</span></h2>
      <div class="chip-row">${typeChips}</div>`
      : `<p class="empty">错题本是空的——去练题吧,错了会自动收进来。</p>`}
    <div class="error-list">${filtered.map(row).join('')}</div>
    ${mastered.length ? `<h2 class="sec-title">🏆 已彻底掌握</h2><div class="error-list">${mastered.map(row).join('')}</div>` : ''}
  </div>`;

  el.querySelector('#print-due')?.addEventListener('click', () => {
    preselectForPrint(due.map(e => e.qid), '到期错题卷');
    location.hash = '#/print';
  });
  el.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
    ui.type = ui.type === b.dataset.type && b.dataset.type !== 'all' ? 'all' : b.dataset.type;
    renderErrors(el);
  }));
  el.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', () => {
    ui.tag = ui.tag === b.dataset.tag ? '' : b.dataset.tag;
    renderErrors(el);
  }));
  el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    if (confirm('确定把这道错题移出错题本吗?(其他设备同步后也会删掉)')) {
      removeError(b.dataset.remove);
      renderErrors(el);
    }
  }));
  el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const d = el.querySelector(`[data-detail="${b.dataset.toggle}"]`);
    d.classList.toggle('hidden');
    b.textContent = d.classList.contains('hidden') ? '看原题 ▾' : '收起 ▴';
  }));
  el.querySelectorAll('[data-coach]').forEach(b => b.addEventListener('click', () => {
    const qid = b.dataset.coach;
    const q = findQuestion(qid);
    const box = el.querySelector(`[data-coachbox="${CSS.escape(qid)}"]`);
    if (!q || !box) return;
    b.disabled = true;
    const last = lastAttemptOf(qid);
    runCoach(box, q, { answers: last && last.ans !== undefined ? [last.ans] : [], rootQid: qid, fromBook: true, selfGraded: !(q.answer && typeof q.answer.value === 'number') });
  }));
  bindReport(el, { active, mastered, byType, topTags, stubborn });
}

function chainHTML(e) {
  const c = e.chain || [];
  if (!c.length) return '';
  return `<span class="chain" title="变式闯关记录">原题❌${c.map(x => `<i class="${x.correct ? 'ok' : 'bad'}">→🎯${x.correct ? '✅' : '❌'}</i>`).join('')}</span>`;
}

function row(e) {
  const orig = findQuestion(e.qid);
  const stem = orig ? orig.zh : '(题目已不可用)';
  const dueTxt = e.mastered ? '已掌握 🏆' : e.due <= Date.now() ? '<b class="due-now">今天该复习</b>' : `下次复习 ${fmtDate(e.due)}`;
  const steps = orig && orig.steps ? orig.steps : [];
  const t = e.diag && isErrorType(e.diag.type) ? errorTypeOf(e.diag.type) : null;
  return `
  <div class="card error-row ${e.mastered ? 'error-mastered' : ''} ${isStubborn(e) && !e.mastered ? 'error-stubborn' : ''}">
    <div class="error-main">
      <div class="error-stem">${orig && orig.ai ? '<span class="g-var">AI 变式</span>' : ''}${esc(clip(stem, 60))}</div>
      <div class="error-meta">
        <span class="q-tag">${esc(METHODS[e.tag] ? METHODS[e.tag].name : e.tag)}</span>
        ${t ? `<span class="etype etype-${e.diag.type}" title="${esc(t.tip)}">${t.icon} ${esc(t.name)}${e.diag.source === 'ai' ? ' · AI' : ''}</span>` : ''}
        <span>错 ${e.wrongCount} 次</span>
        <span>首错 ${fmtDate(e.firstTs)}</span>
        ${boxDots(e.box, BOX_DAYS.length, e.mastered)}
        <span>${dueTxt}</span>
        ${chainHTML(e)}
      </div>
      ${e.diag && e.diag.note ? `<div class="error-diag">💬 ${esc(e.diag.note)}</div>` : ''}
    </div>
    <div class="error-actions">
      ${e.mastered ? '' : `<a class="btn btn-sm btn-primary" href="#/drill/variant/${encodeURIComponent(e.qid)}">🎯 变式闯关</a>`}
      ${orig ? `<button class="btn btn-sm" data-coach="${esc(e.qid)}">🤖 AI 讲解</button>` : ''}
      <a class="btn btn-sm" href="#/learn/${esc(e.tag)}#trick">🧭 套路卡</a>
      ${steps.length ? `<button class="btn btn-sm btn-ghost" data-toggle="${esc(e.qid)}">看原题 ▾</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-remove="${esc(e.qid)}">🗑</button>
    </div>
    <div class="error-coach" data-coachbox="${esc(e.qid)}"></div>
    ${steps.length ? `
    <div class="error-detail hidden" data-detail="${esc(e.qid)}">
      <p class="stem-zh">${esc(stem)}</p>
      ${steps.map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><div><b>${esc(s.label)}</b><br>${esc(s.text)}</div></div>`).join('')}
      ${orig && orig.answer ? `<div class="answer-card">📌 ${esc(orig.answer.sentence || '')}</div>` : ''}
    </div>` : ''}
  </div>`;
}

// ── AI 学情分析 ─────────────────────────────────────
function reportBlock() {
  const note = getAiNote('report');
  const r = note && note.data;
  return `
  <div class="card ereport" id="ereport">
    <div class="ereport-head">
      <h3>🤖 AI 学情分析 <span class="sec-sub">${note ? `${state.student} · 生成于 ${new Date(note.ts).toLocaleString()}` : '根据错因分布和最近错题,给出问题诊断和一周练习计划'}</span></h3>
      <button class="btn btn-sm ${r ? '' : 'btn-primary'}" id="gen-report">${r ? '🔄 重新分析' : '✨ 生成学情分析'}</button>
    </div>
    <div id="report-body">${r ? reportHTML(r) : ''}</div>
  </div>`;
}

function reportHTML(r) {
  return `
    ${r.summary ? `<p class="ereport-sum">${esc(r.summary)}</p>` : ''}
    ${r.weaknesses.length ? `<div class="ereport-weak">${r.weaknesses.map(w => `
      <div class="weak-card"><b>⚠️ ${esc(w.title)}</b>${w.evidence ? `<p>📌 ${esc(w.evidence)}</p>` : ''}${w.advice ? `<p>👉 ${esc(w.advice)}</p>` : ''}</div>`).join('')}</div>` : ''}
    ${r.plan.length ? `<h4>📅 接下来一周</h4><ol>${r.plan.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
    ${r.praise ? `<p class="ereport-praise">🌟 ${esc(r.praise)}</p>` : ''}`;
}

function bindReport(el, d) {
  const btn = el.querySelector('#gen-report');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const body = el.querySelector('#report-body');
    const student = state.student, tok = navToken();
    btn.disabled = true;
    body.innerHTML = '<div class="coach-loading">⏳ AI 老师正在分析最近的错题……</div>';
    if (!(await aiAvailable())) {
      if (!stillOn(tok)) return;
      body.innerHTML = '<p class="coach-off">AI 老师需要登录后才能用(家庭网址 wp.kailorik.com)。上面的错因画像是本地统计,随时可看。</p>';
      btn.disabled = false;
      return;
    }
    const t = totals();
    const stats = {
      total: t.total, acc: t.total ? Math.round(t.correct / t.total * 100) : 0,
      active: d.active.length, mastered: d.mastered.length, stubborn: d.stubborn.length,
      byType: d.byType, byTag: d.topTags.map(([tag, n]) => ({ name: mname(tag), n })),
    };
    const errs = [...d.active].sort((a, b) => b.wrongCount - a.wrongCount || b.lastTs - a.lastTs).slice(0, 15).map(e => ({
      method: mname(e.tag), stem: (findQuestion(e.qid) || {}).zh || '', wrongCount: e.wrongCount, diag: e.diag,
      chain: (e.chain || []).map(c => c.correct ? '✅' : '❌').join(''),
    }));
    try {
      const r = await aiReport(student, stats, errs, chatJSON);
      setAiNote('report', r, null, student);
      if (!stillOn(tok)) return;
      renderErrors(el);
      el.querySelector('#ereport')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if (!stillOn(tok)) return;
      body.innerHTML = `<p class="coach-off">😅 ${esc(e.message)}</p>`;
      btn.disabled = false;
    }
  });
}
