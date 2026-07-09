// 辨题快闪:只给题干、不解题,四选一"这是哪个套路"。
// 交错练习(interleaved practice)——题型识别是题型多了之后的最大瓶颈,
// 只练"认",10 秒一题;答错当场对比"你选的模型典型题 vs 正确模型典型题"。
// 成绩单独记 quizLog(不进错题本:认错类不是解题错)。
import { METHODS, QUESTIONS, familyOf } from '../data.js';
import { GENERATORS, generate } from '../gen/generators.js';
import { esc, famClass, stemHTML } from '../ui.js';
import { recordQuiz, quizStats } from '../store.js';
import { masteryLevel, openErrorTagSet } from '../status.js';

const ROUND = 10;

function shortName(tag) { return (METHODS[tag]?.name || tag).replace(/^\d+\.\s*/, ''); }
function rnd(n) { return Math.floor(Math.random() * n); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// 随机一道该模型的"典型题"题干(生成器出,题面不入库)
function sampleStem(tag) {
  try { return generate(tag, 1, 1 + rnd(300)).zh; } catch (e) { return ''; }
}

// 题源池:已学过的模型(练过至少一题)累积交错,再掺 1 个新面孔;不足 4 个就全量
function buildPool() {
  const genTags = Object.keys(GENERATORS).filter(t => METHODS[t]);
  const open = openErrorTagSet();
  const learned = genTags.filter(t => masteryLevel(t, open) >= 1);
  if (learned.length < 4) return genTags;
  const fresh = genTags.filter(t => !learned.includes(t));
  return fresh.length ? [...learned, fresh[rnd(fresh.length)]] : learned;
}

function makeItem(pool, prevTag) {
  let tag = pool[rnd(pool.length)];
  if (pool.length > 1) while (tag === prevTag) tag = pool[rnd(pool.length)];
  // 一半用真题题干,一半用生成题干
  const bank = QUESTIONS.filter(q => q.tag === tag && !q.needsFigure);
  const q = (bank.length && Math.random() < 0.5) ? bank[rnd(bank.length)] : generate(tag, 1 + rnd(2), 1 + rnd(300));
  // 干扰项:易混表优先,不够拿同族兄弟凑,再不够全池随机
  const distract = [];
  const add = t => { if (t !== tag && METHODS[t] && !distract.includes(t)) distract.push(t); };
  (METHODS[tag].confusable || []).forEach(add);
  familyOf(tag).ids.forEach(add);
  shuffle(pool.slice()).forEach(add);
  return { tag, q, options: shuffle([tag, ...distract.slice(0, 3)]) };
}

export function renderQuiz(el) {
  const pool = buildPool();
  const session = { idx: 0, right: 0, wrongs: [] };
  let prevTag = null;

  next();

  function next() {
    if (session.idx >= ROUND) return summary();
    const item = makeItem(pool, prevTag);
    prevTag = item.tag;
    draw(item);
  }

  function draw(item) {
    const fam = familyOf(item.tag);
    el.innerHTML = `
    <div class="quiz ${famClass(fam.id)}">
      <div class="drill-top">
        <a class="crumb" href="#/">← 退出</a>
        <span class="drill-title">🧠 辨题快闪</span>
        <span class="drill-progress">第 ${session.idx + 1} / ${ROUND} 题 · 对 ${session.right}</span>
      </div>
      <div class="card q-card">
        <p class="paper-note">别解题!只判断:这道题是哪个套路?</p>
        ${stemHTML(item.q)}
        <div class="quiz-opts">
          ${item.options.map(t => `<button class="btn quiz-opt" data-t="${t}">${esc(shortName(t))}</button>`).join('')}
        </div>
        <div id="feedback"></div>
        <div id="nextrow" class="hidden"><button class="btn btn-big btn-primary" id="nextbtn">下一题 →</button></div>
      </div>
    </div>`;

    el.querySelectorAll('.quiz-opt').forEach(b => b.addEventListener('click', () => {
      const pick = b.dataset.t;
      const correct = pick === item.tag;
      recordQuiz({ tag: item.tag, pick, correct });
      el.querySelectorAll('.quiz-opt').forEach(x => {
        x.disabled = true;
        if (x.dataset.t === item.tag) x.classList.add('quiz-hit');
        else if (x === b) x.classList.add('quiz-miss');
      });
      if (correct) {
        session.right++;
        el.querySelector('#feedback').innerHTML = `<div class="fb fb-right">✅ 对!${esc(shortName(item.tag))}——${esc(METHODS[item.tag].memory?.mantra || '')}</div>`;
      } else {
        session.wrongs.push({ tag: item.tag, pick });
        el.querySelector('#feedback').innerHTML = `
        <div class="fb fb-wrong">❌ 这是「${esc(shortName(item.tag))}」。对比感受一下:</div>
        <div class="quiz-compare">
          <div class="qc-col qc-bad"><b>你选的「${esc(shortName(pick))}」长这样:</b><p>${esc(sampleStem(pick) || (METHODS[pick].signals || [])[0] || '')}</p></div>
          <div class="qc-col qc-good"><b>「${esc(shortName(item.tag))}」的关键信号:</b><p>${(METHODS[item.tag].signals || []).slice(0, 2).map(esc).join('<br>')}</p></div>
        </div>`;
      }
      session.idx++;
      el.querySelector('#nextrow').classList.remove('hidden');
      const nb = el.querySelector('#nextbtn');
      if (session.idx >= ROUND) nb.textContent = '看成绩 🏁';
      nb.addEventListener('click', next);
      nb.focus();
    }));
  }

  function summary() {
    const qs = quizStats();
    const weakRows = Object.entries(qs)
      .filter(([, s]) => s.seen >= 3)
      .map(([t, s]) => ({ t, acc: s.correct / s.seen, seen: s.seen }))
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 3);
    el.innerHTML = `
    <div class="card summary-card">
      <h2>${session.right === ROUND ? '🏆 火眼金睛,全对!' : session.right >= 7 ? '🎉 辨题小能手!' : '💪 多看几眼,套路会自己跳出来'}</h2>
      <div class="summary-score">${session.right} / ${ROUND}</div>
      ${session.wrongs.length ? `
      <ul class="summary-list">
        ${session.wrongs.map(w => `<li class="bad"><span>❌</span><span>把「${esc(shortName(w.tag))}」认成了「${esc(shortName(w.pick))}」</span><span><a href="#/learn/${w.tag}">去复习 →</a></span></li>`).join('')}
      </ul>` : ''}
      ${weakRows.length ? `<p class="paper-note">累计最容易认错:${weakRows.map(r => `${esc(shortName(r.t))} ${Math.round(r.acc * 100)}%`).join(' · ')}</p>` : ''}
      <div class="model-actions">
        <button class="btn btn-primary" id="again">再来一轮</button>
        <a class="btn" href="#/">返回首页</a>
      </div>
    </div>`;
    el.querySelector('#again').addEventListener('click', () => renderQuiz(el));
  }
}
