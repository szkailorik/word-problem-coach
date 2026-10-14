// AI 老师面板:做错之后出现——先给规则诊断(即时),再请 DeepSeek 细化错因 + 解题思路 + 画图
// 刷题机 / 题库 / 错题本共用。诊断结论写回错题本(错因画像的数据来源)。
import { METHODS } from './data.js';
import { esc, diagramHTML } from './ui.js';
import { ruleDiagnose, errorTypeOf } from './diagnose.js';
import { setDiag, profileOf, state } from './store.js';
import { navToken, stillOn } from './nav.js';
import { aiAvailable, chatJSON, cacheGet, cachePut, ai } from './ai/client.js';
import { diagnose } from './ai/tutor.js';

function typeBadge(type) {
  const t = errorTypeOf(type);
  return `<span class="etype etype-${type}">${t.icon} ${esc(t.name)}</span>`;
}

function ruleHTML(rule) {
  const t = errorTypeOf(rule.type);
  if (rule.type === 'unknown' && !rule.note) return '';
  return `
  <div class="coach-rule">
    ${typeBadge(rule.type)}
    ${rule.note ? `<span>${esc(rule.note)}</span>` : ''}
    ${t.tip ? `<div class="coach-tip">👉 ${esc(t.tip)}</div>` : ''}
  </div>`;
}

export function fullDiagHTML(d) {
  return `
  <div class="coach-ai">
    <div class="coach-head">${typeBadge(d.type)}<b>${esc(d.diagnosis)}</b></div>
    ${d.thinking.length ? `<h4>🧭 解题思路</h4><ol class="coach-steps">${d.thinking.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${diagramHTML(d.diagram, '🤖 AI 老师画的图')}
    ${d.keyIdea ? `<div class="coach-key">💡 套路:${esc(d.keyIdea)}</div>` : ''}
    ${d.checkTip ? `<div class="coach-key coach-check">✅ 下次检查:${esc(d.checkTip)}</div>` : ''}
  </div>`;
}

// box:容器元素;q:做错的题;ctx = { answers:[], gaveUp, rootQid, auto }
// 返回 Promise<diag>(diag.type/note 供变式题针对错因)
export async function runCoach(box, q, ctx = {}) {
  const answers = (ctx.answers || []).filter(x => x !== null && x !== undefined && x !== '');
  const last = answers.length ? answers[answers.length - 1] : null;
  const rule = ruleDiagnose(q, last, { gaveUp: ctx.gaveUp, selfGraded: ctx.selfGraded });
  const student = state.student, tok = navToken(); // 结果回来时可能已切学生/切页面
  const root = ctx.rootQid && profileOf(student).errorBook[ctx.rootQid];
  // 刚做错 = 新证据,规则诊断先顶上(AI 结果稍后覆盖);从错题本回看时不拿规则诊断覆盖已有的 AI 诊断
  if (root && rule.type !== 'unknown' && !(ctx.fromBook && root.diag && root.diag.source === 'ai')) setDiag(ctx.rootQid, rule, student);

  box.innerHTML = `<div class="card coach">
    <h3>🤖 AI 老师 · 帮你找卡点</h3>
    ${ruleHTML(rule)}
    <div class="coach-body"><div class="coach-loading">⏳ AI 老师正在看你的作答……</div></div>
  </div>`;
  const body = box.querySelector('.coach-body');

  const live = () => stillOn(tok) && box.isConnected;
  if (!(await aiAvailable())) {
    if (!live()) return { type: rule.type, note: rule.note, source: 'rule' };
    body.innerHTML = `<p class="coach-off">AI 老师需要登录后才能用(在家庭网址 wp.kailorik.com 登录即可)。先对照上面的标准讲解找卡点。</p>`;
    return { type: rule.type, note: rule.note, source: 'rule' };
  }

  const key = `diag|${q.id}|${answers.join(',')}|${ctx.gaveUp ? 1 : 0}`;
  let d = cacheGet(key);
  if (!d) {
    try {
      d = await diagnose(q, { answers, gaveUp: ctx.gaveUp, rule, method: METHODS[q.tag] }, chatJSON);
      cachePut(key, d);
    } catch (e) {
      if (!live()) return { type: rule.type, note: rule.note, source: 'rule' };
      body.innerHTML = `<p class="coach-off">😅 ${esc(e.message || 'AI 老师暂时没回应')}。<button class="btn btn-sm" data-retry>再试一次</button></p>`;
      body.querySelector('[data-retry]').addEventListener('click', () => runCoach(box, q, ctx));
      return { type: rule.type, note: rule.note, source: 'rule' };
    }
  }
  const diag = { type: d.type, note: d.diagnosis, source: 'ai' };
  if (ctx.rootQid && profileOf(student).errorBook[ctx.rootQid]) setDiag(ctx.rootQid, diag, student); // 花了 Token 的诊断先存下来
  if (!live()) return diag;
  body.innerHTML = fullDiagHTML(d);
  box.querySelector('.coach-rule')?.remove(); // AI 诊断到了,规则初判就不重复显示
  if (ai.quota) body.insertAdjacentHTML('beforeend', `<div class="coach-quota">今日 AI 已用 ${ai.quota.used}/${ai.quota.limit}</div>`);
  return diag;
}
