// 安全四则求值器:验算 AI 出的变式题(绝不 eval)
// 支持:整数/小数、+ - * /、× ÷ x ·、中英文括号、一元负号、百分号(30% = 0.3)
// 返回 number;非法表达式抛错。

function tokenize(src) {
  const s = String(src)
    .replace(/[×xX·]/g, '*').replace(/÷/g, '/')
    .replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/[−–—]/g, '-').replace(/，/g, ',')
    .trim();
  if (!s) throw new Error('empty expression');
  if (s.length > 200) throw new Error('expression too long');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; } // 空白只能出现在记号之间:"3 4" 不会被拼成 34
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(/,/g, '');
      if (!/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) throw new Error('bad number ' + raw);
      let v = Number(raw);
      if (s[j] === '%') { v /= 100; j++; }
      out.push({ t: 'n', v });
      i = j;
    } else if ('+-*/()'.includes(c)) {
      out.push({ t: c });
      i++;
    } else {
      throw new Error('bad char ' + c);
    }
  }
  return out;
}

// 递归下降:expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ; unary := '-' unary | atom
export function evalExpr(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  function atom() {
    const t = toks[p++];
    if (!t) throw new Error('unexpected end');
    if (t.t === 'n') return t.v;
    if (t.t === '(') {
      const v = expr();
      if (!toks[p] || toks[p].t !== ')') throw new Error('missing )');
      p++;
      return v;
    }
    throw new Error('unexpected ' + t.t);
  }
  function unary() {
    if (peek() && peek().t === '-') { p++; return -unary(); }
    if (peek() && peek().t === '+') { p++; return unary(); }
    return atom();
  }
  function term() {
    let v = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = toks[p++].t;
      const r = unary();
      if (op === '/') {
        if (r === 0) throw new Error('division by zero');
        v /= r;
      } else v *= r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = toks[p++].t;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = expr();
  if (p !== toks.length) throw new Error('trailing tokens');
  if (!Number.isFinite(v)) throw new Error('not finite');
  return v;
}

export function nearlyEqual(a, b) {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}
