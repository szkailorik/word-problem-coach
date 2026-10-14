// 刷题机:参数化生成新题 + 自动判分 + 三级提示阶梯 + 错题自动归档
// 模式:
//   #/drill/<tag>          无限刷某个模型(可切难度)
//   #/drill/daily          每日特训:到期错题变式 + 薄弱模型新题,共 6 题
//   #/drill/review         错题复习:全部到期错题,每道配一道同类变式
//   #/drill/variant/<qid>  v2.0 变式闯关:围绕一道错题出变式,错了再出,直到做对
// v2.0:任何一道题做错 → AI 老师诊断(错因 + 思路 + 线段图)→ 一键"变式闯关"插入下一题
import { generate, GENERATORS } from '../gen/generators.js';
import { METHODS, TAG_LIST, familyOf } from '../data.js';
import { esc, famClass, stemHTML, stepsHTML, diagramHTML } from '../ui.js';
import { state, recordAttempt, addError, reviewResult, dueErrors, nextSeed, tagStats, weakestTags, profile, pushChain } from '../store.js';
import { findQuestion } from '../qlookup.js';
import { navToken, stillOn } from '../nav.js';
import { runCoach } from '../coach.js';
import { produceVariant } from '../variant.js';
import { isErrorType, errorTypeOf } from '../diagnose.js';

export function levelForTag(tag) {
  const m = tagStats(tag);
  const acc = m.seen ? m.correct / m.seen : 0;
  if (m.seen >= 20 && acc >= 0.85) return 3;
  if (m.seen >= 8 && acc >= 0.8) return 2;
  return 1;
}

function makeGenItem(tag, level) {
  return { kind: 'gen', tag, level, seed: nextSeed(tag) };
}

// 快速出题面板预置的题单(内存态,刷新即失效,重出一份就好)
// 记住出题时的学生:中途切学生不能把 A 的题单记到 B 头上
let customPlaylist = null;
export function setCustomPlaylist(items, title) { customPlaylist = { items, title, student: state.student }; }

function buildPlaylist(mode, param) {
  if (mode === 'custom') {
    return { items: customPlaylist?.items || [], title: customPlaylist?.title || '⚡ 快速训练', finite: true, rec: 'drill' };
  }
  if (mode === 'daily') {
    const items = dueErrors().slice(0, 3).map(e => ({ kind: 'review', error: e }));
    const fill = 6 - items.length;
    const weak = weakestTags(TAG_LIST.filter(t => GENERATORS[t]), 3);
    for (let i = 0; i < fill; i++) {
      const tag = weak[i % weak.length];
      items.push(makeGenItem(tag, levelForTag(tag)));
    }
    return { items, title: '🚀 每日特训', finite: true, rec: 'daily' };
  }
  if (mode === 'review') {
    let errs = dueErrors();
    if (param) errs = Object.values(profile().errorBook).filter(e => e.qid === param);
    if (!errs.length) errs = dueErrors();
    const items = errs.slice(0, 10).map(e => ({ kind: 'review', error: e }));
    return { items, title: '🔁 错题复习', finite: true, rec: 'review' };
  }
  if (mode === 'variant') {
    const e = profile().errorBook[param];
    return { items: findQuestion(param) ? [{ kind: 'variant', rootQid: param, depth: 0, diag: e ? e.diag : null }] : [], title: '🎯 变式闯关', finite: true, rec: 'variant' };
  }
  return { items: null, tag: mode, title: null, finite: false, rec: 'drill' }; // endless per-tag
}

export function renderDrill(el, mode, param) {
  if (mode === 'custom' && !(customPlaylist && customPlaylist.items.length && customPlaylist.student === state.student)) {
    el.innerHTML = `<div class="card empty-card"><h2>题单已失效</h2><p>快速出题的题单只在本次打开期间、给出题时选中的学生有效——回首页重新出一份就好。</p><div class="model-actions"><a class="btn btn-primary" href="#/">返回首页</a></div></div>`;
    return;
  }
  if (!['daily', 'review', 'custom', 'variant'].includes(mode) && !GENERATORS[mode]) {
    el.innerHTML = `<div class="card empty-card"><h2>这一类没有出题机</h2><p>这一类直接看题作答就好,去题库按顺序练即可。</p><div class="model-actions"><a class="btn btn-primary" href="#/bank?tag=${mode}">📚 去题库练</a><a class="btn" href="#/">返回首页</a></div></div>`;
    return;
  }
  const pl = buildPlaylist(mode, param);
  const session = { idx: 0, results: [], streak: 0, level: pl.finite ? null : levelForTag(mode), pending: null, view: 0 };
  const tok = navToken(); // 异步出题回来时页面可能已经切走(或同一地址重新进入了一次)
  // 本会话还停在发起时的那一屏吗?(session.view 每换一屏 +1)
  const sameScreen = v => stillOn(tok) && session.view === v;

  if (pl.finite && !pl.items.length) {
    el.innerHTML = mode === 'variant'
      ? `<div class="card empty-card"><h2>找不到这道错题</h2><p>可能已经被删掉了。</p><div class="model-actions"><a class="btn btn-primary" href="#/errors">回错题本</a></div></div>`
      : `<div class="card empty-card"><h2>🎉 没有待复习的错题</h2><p>错题本很干净,去刷点新题吧!</p><div class="model-actions"><a class="btn btn-primary" href="#/drill/daily">每日特训</a><a class="btn" href="#/">返回首页</a></div></div>`;
    return;
  }

  next();

  function next() {
    let item;
    if (session.pending) {
      item = session.pending; session.pending = null;
    } else if (pl.finite) {
      if (session.idx >= pl.items.length) return summary();
      item = pl.items[session.idx];
    } else {
      item = makeGenItem(pl.tag, session.level);
    }
    if (item.kind === 'variant') return loadVariant(item);
    // 生成本题
    let q, origin = null;
    if (item.kind === 'review') {
      const e = item.error;
      const orig = findQuestion(e.qid);
      if (GENERATORS[e.tag]) {
        q = generate(e.tag, e.level || 1, nextSeed(e.tag));
        origin = { error: e, orig };
      } else {
        // 基础综合等无生成器的类型:重做原题,自评对错
        q = orig;
        origin = { error: e, orig: null, selfGrade: true };
      }
      if (!q) { session.idx++; return next(); }
    } else {
      q = generate(item.tag, item.level, item.seed);
    }
    renderQuestion(q, item, origin, null);
  }

  // 变式题要等 AI 出题 + 验算,先给个等待页
  async function loadVariant(item) {
    const myView = ++session.view;
    const root = findQuestion(item.rootQid);
    if (!root) { if (pl.finite) session.idx++; return next(); }
    const stageText = { write: '🤖 AI 老师正在针对你的错因出一道变式题…', retry: '🔁 上一道没通过验算,AI 老师在重出…', verify: '🧮 出好了,正在独立验算答案…' };
    el.innerHTML = `
    <div class="drill">
      <div class="drill-top"><a class="crumb" href="#/errors">← 退出</a><span class="drill-title">${pl.title || '🎯 变式闯关'}</span><span></span></div>
      <div class="card q-card variant-loading">
        <div class="spinner"></div>
        <p id="vstage">${stageText.write}</p>
        <p class="sec-sub">变式题会过三道验算闸:综合算式核对 → 答案合法 → 独立解题复核,一般 10~30 秒。</p>
      </div>
    </div>`;
    const res = await produceVariant(root, {
      depth: item.depth, diag: item.diag,
      onStage: s => { const p = el.querySelector('#vstage'); if (p) p.textContent = stageText[s] || stageText.write; },
    });
    if (!sameScreen(myView)) return;
    if (!res.q) {
      el.innerHTML = `
      <div class="card empty-card">
        <h2>暂时出不了变式题</h2><p>${esc(res.note)}</p>
        <div class="model-actions">
          <button class="btn btn-primary" id="vskip">${pl.finite && session.idx + 1 < pl.items.length ? '下一题 →' : '完成 🏁'}</button>
          <a class="btn" href="#/errors">回错题本</a>
        </div>
      </div>`;
      el.querySelector('#vskip').addEventListener('click', () => { if (pl.finite) pl.items.splice(session.idx, 1); next(); });
      return;
    }
    renderQuestion(res.q, item, null, { rootQid: item.rootQid, depth: item.depth, by: res.by, note: res.note, root });
  }

  function variantItemFor(rootQid, depth, diag) {
    return { kind: 'variant', rootQid, depth, diag };
  }

  function queueVariant(vitem) {
    if (pl.finite) pl.items.splice(session.idx, 0, vitem);
    else session.pending = vitem;
    next();
  }

  // vctx:变式闯关上下文 { rootQid, depth, by, note, root }
  function renderQuestion(q, item, origin, vctx) {
    const myView = ++session.view;
    const m = METHODS[q.tag];
    const fam = familyOf(q.tag);
    const total = pl.finite ? pl.items.length : null;
    let tries = 2, hintsUsed = 0, done = false;
    const answers = [];
    const rootE = vctx ? profile().errorBook[vctx.rootQid] : null;
    const vdiag = vctx && rootE && rootE.diag && isErrorType(rootE.diag.type) ? errorTypeOf(rootE.diag.type) : null;

    el.innerHTML = `
    <div class="drill ${famClass(fam.id)}">
      <div class="drill-top">
        <a class="crumb" href="${origin || vctx ? '#/errors' : '#/'}">← 退出</a>
        <span class="drill-title">${pl.title || esc(m.name)}</span>
        <span class="drill-progress">${total ? `第 ${session.idx + 1} / ${total} 题` : `🔥 连对 ${session.streak}`}</span>
      </div>
      ${!pl.finite && !vctx ? `
      <div class="level-picker">
        难度:
        ${[1, 2, 3].map(l => `<button class="chip ${session.level === l ? 'chip-on' : ''}" data-level="${l}">${'⭐'.repeat(l)}</button>`).join('')}
      </div>` : ''}
      ${origin ? `<div class="origin-note">🔁 ${origin.selfGrade ? '这道基础计算错题到期了,重做一遍原题' : `这是错题「${esc(originLabel(origin))}」的同类变式`} · 已闯 ${origin.error.box}/4 关</div>` : ''}
      ${vctx ? `<div class="origin-note variant-note">🎯 变式闯关 · 第 ${vctx.depth + 1} 关${vctx.depth >= 2 ? '(降一档,先把关键一步走通)' : ''}
        · ${vctx.by === 'ai' ? '🤖 AI 出题 · 已验算' : '🎲 出题机出题'}${vdiag ? ` · 针对「${vdiag.icon} ${esc(vdiag.name)}」` : ''}
        <div class="variant-root">原题:${esc(clipText(vctx.root.zh, 46))}</div>
        ${vctx.note ? `<div class="sec-sub">(AI 这次没出成:${esc(clipText(vctx.note, 60))},换出题机出一道)</div>` : ''}</div>` : ''}
      <div class="card q-card">
        <div class="q-tag">${esc(m.name)}</div>
        ${stemHTML(q)}
        ${origin && origin.selfGrade ? `
        <p class="paper-note">✍️ 在草稿纸上完整做一遍,再对答案。</p>
        <div class="model-actions"><button class="btn btn-primary" id="reveal">做完了,看讲解 →</button></div>
        <div id="feedback"></div>
        <div id="solution" class="hidden">
          <h3>📖 逐步讲解</h3>
          ${stepsHTML(q.steps || [])}
          ${q.answer ? `<div class="answer-card">📌 ${esc(q.answer.sentence)}</div>` : (q.model && q.model.text ? `<div class="answer-card">🧮 ${esc(q.model.text)}</div>` : '')}
          <div class="grade-row">
            <span>你做对了吗?</span>
            <button class="btn btn-right" id="gright">✅ 做对了</button>
            <button class="btn btn-wrong" id="gwrong">❌ 做错了</button>
          </div>
        </div>` : `
        <div class="answer-row">
          <label>答案:</label>
          <input type="number" inputmode="decimal" step="any" id="ans" placeholder="?" autocomplete="off">
          <span class="unit">${esc(q.answer.unit || '')}</span>
          <button class="btn btn-primary" id="submit">交卷 ✓</button>
        </div>
        <div class="hint-row">
          <button class="btn btn-sm" id="hint1">💡 提示 1 · 认题型</button>
          <button class="btn btn-sm" id="hint2">🧭 提示 2 · 第一步</button>
          <button class="btn btn-sm btn-ghost" id="giveup">😵 不会,看讲解</button>
        </div>
        <div id="hintbox"></div>
        <div id="feedback"></div>
        <div id="solution" class="hidden">
          <h3>📖 逐步讲解</h3>
          ${stepsHTML(q.steps)}
          ${diagramHTML(q.diagram)}
          <div class="answer-card">📌 ${esc(q.answer.sentence)}</div>
        </div>`}
        <div id="coach"></div>
        <div id="nextrow" class="hidden">
          <button class="btn btn-big btn-primary" id="nextbtn">下一题 →</button>
        </div>
      </div>
    </div>`;

    const $ = id => el.querySelector('#' + id);
    if (origin && origin.selfGrade) {
      $('reveal').addEventListener('click', () => {
        $('solution').classList.remove('hidden');
        $('reveal').disabled = true;
      });
      $('gright').addEventListener('click', () => finish(true, false));
      $('gwrong').addEventListener('click', () => finish(false, false));
      return; // 自评模式不需要下面的输入判分逻辑
    }
    const input = $('ans');
    input.focus();

    if (!pl.finite && !vctx) {
      el.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
        session.level = Number(b.dataset.level);
        next();
      }));
    }

    $('hint1').addEventListener('click', () => {
      hintsUsed = Math.max(hintsUsed, 1);
      $('hintbox').innerHTML += `<div class="hint">💡 ${esc(q.hint1)}</div>`;
      $('hint1').disabled = true;
    });
    $('hint2').addEventListener('click', () => {
      hintsUsed = 2;
      $('hintbox').innerHTML += `<div class="hint">🧭 ${esc(q.hint2)}</div>`;
      $('hint2').disabled = true;
    });
    $('giveup').addEventListener('click', () => finish(false, true));
    $('submit').addEventListener('click', check);
    // preventDefault:交卷后焦点会移到"下一题/变式闯关"按钮,不拦住这次回车的后续 keypress 会把那个按钮也按下去
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });

    function check() {
      if (done) return;
      const v = Number(input.value.trim());
      if (input.value.trim() === '' || Number.isNaN(v)) {
        $('feedback').innerHTML = `<div class="fb fb-warn">先填一个数字再交卷哦</div>`;
        return;
      }
      answers.push(v);
      if (Math.abs(v - q.answer.value) < 1e-9) return finish(true, false);
      tries--;
      if (tries > 0) {
        $('feedback').innerHTML = `<div class="fb fb-wrong">❌ 还不对——再检查一下,你还有 1 次机会。<b>需要的话点上面的提示。</b></div>`;
        input.select();
      } else {
        finish(false, false);
      }
    }

    function finish(correct, gaveUp) {
      if (done) return;
      done = true;
      const sg = !!(origin && origin.selfGrade);
      for (const id of sg ? ['gright', 'gwrong'] : ['submit', 'hint1', 'hint2', 'giveup']) { const b = $(id); if (b) b.disabled = true; }
      if (!sg && $('ans')) $('ans').disabled = true;

      if (correct) {
        session.streak++;
        const milestone = { 5: '🎖 连对 5 题,手感来了!', 10: '🏅 连对 10 题,太稳了!', 20: '🏆 连对 20 题,今天是大师!' }[session.streak] || '';
        const vwin = vctx ? `<br><b>🎉 变式闯关成功!${vctx.depth ? `连闯 ${vctx.depth + 1} 关才拿下,这一步你真的走通了!` : '一次就做对,说明刚才的讲解你听懂了!'}</b>` : '';
        $('feedback').innerHTML = `<div class="fb fb-right">✅ ${sg ? '很好,这道错题闯过一关!' : `答对了!${esc(q.answer.sentence)}${hintsUsed ? '(用了提示也很棒)' : ' 干净利落!'}`}${milestone ? `<br><b>${milestone}</b>` : ''}${vwin}</div>`;
      } else {
        session.streak = 0;
        $('feedback').innerHTML = `<div class="fb fb-wrong">${sg ? '没关系,重新回到第一关,过几天再来。' : gaveUp ? '没关系,先看懂讲解 👇' : `❌ 正确答案是 <b>${esc(q.answer.value)}${esc(q.answer.unit || '')}</b>,看讲解找找卡点 👇`}</div>`;
        $('solution').classList.remove('hidden');
      }

      // 记录
      const level = q.level || (origin && origin.error.level) || 1;
      recordAttempt({ qid: q.id, tag: q.tag, correct, mode: vctx ? 'variant' : origin ? 'review' : pl.rec, level, ans: answers.length ? answers[answers.length - 1] : null });
      if (vctx) {
        pushChain(vctx.rootQid, { qid: q.id, correct, by: vctx.by });
      } else if (origin) {
        reviewResult(origin.error.qid, correct);
      } else if (!correct) {
        addError(q.id, q.tag, q.level);
      }
      session.results.push({ q, correct, variant: !!vctx });
      session.idx++;

      // 做错:AI 老师诊断 + 变式闯关入口
      const rootQid = vctx ? vctx.rootQid : origin ? origin.error.qid : q.id;
      let diagP = null;
      if (!correct) diagP = runCoach($('coach'), q, { answers, gaveUp, rootQid, selfGraded: sg });

      $('nextrow').classList.remove('hidden');
      const nb = $('nextbtn');
      if (pl.finite && session.idx >= pl.items.length) nb.textContent = '看成绩单 🏁';
      if (!correct) {
        nb.classList.remove('btn-primary');
        nb.textContent = pl.finite && session.idx >= pl.items.length ? '先不闯了,看成绩单' : '先跳过,下一题 →';
        nb.insertAdjacentHTML('beforebegin', `<button class="btn btn-big btn-primary" id="varbtn">🎯 变式闯关:再来一道同类题</button>`);
        $('varbtn').addEventListener('click', async () => {
          $('varbtn').disabled = true;
          $('varbtn').textContent = '⏳ 准备变式题…';
          const diag = diagP ? await diagP : null;
          if (!sameScreen(myView)) return; // 等诊断期间孩子点了"下一题"或退出了
          queueVariant(variantItemFor(rootQid, vctx ? vctx.depth + 1 : 0, diag));
        });
      }
      nb.addEventListener('click', next);
      (correct ? nb : $('varbtn')).focus();
      // 答对也可以翻讲解(自评模式讲解已经展开,不需要)
      if (correct && !sg) {
        $('nextrow').insertAdjacentHTML('beforebegin', `<button class="btn btn-sm btn-ghost" id="peek">📖 看看标准讲解</button>`);
        $('peek').addEventListener('click', () => { $('solution').classList.remove('hidden'); $('peek').remove(); });
      }
    }
  }

  function clipText(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function originLabel(origin) {
    if (origin.orig) return clipText(origin.orig.zh, 24);
    return METHODS[origin.error.tag]?.name || origin.error.tag;
  }

  function summary() {
    const right = session.results.filter(r => r.correct).length;
    const total = session.results.length;
    const pct = total ? Math.round(right / total * 100) : 0;
    const rows = session.results.map(r => `
      <li class="${r.correct ? 'ok' : 'bad'}">
        <span>${r.correct ? '✅' : '❌'}</span>
        <span>${r.variant ? '🎯 ' : ''}${esc((state.lang === 'en' ? r.q.en : r.q.zh).slice(0, 40))}…</span>
        <span>${esc(METHODS[r.q.tag].name)}</span>
      </li>`).join('');
    el.innerHTML = `
    <div class="card summary-card">
      <h2>${pct === 100 ? '🏆 全对!太厉害了!' : pct >= 60 ? '🎉 完成!' : '💪 完成,错题已收进错题本'}</h2>
      <div class="summary-score">${right} / ${total}</div>
      <ul class="summary-list">${rows}</ul>
      <div class="model-actions">
        <a class="btn btn-primary" href="#/">返回首页</a>
        ${right < total ? `<a class="btn btn-alert" href="#/errors">📕 去看错题本</a>` : ''}
        ${mode === 'variant' ? '' : '<button class="btn" id="again">再来一轮</button>'}
      </div>
    </div>`;
    el.querySelector('#again')?.addEventListener('click', () => {
      // 快速训练"再来一轮"要换新题:同模型同难度、全新种子(原题单答案刚看过,重刷没意义)
      if (mode === 'custom' && customPlaylist) {
        customPlaylist.items = customPlaylist.items.map(it =>
          it.kind === 'gen' ? { ...it, seed: nextSeed(it.tag) } : it).filter(it => it.kind !== 'variant');
      }
      renderDrill(el, mode, param);
    });
  }
}
