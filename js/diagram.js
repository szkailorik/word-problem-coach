// 画图:AI 输出小型 DSL,这里渲染成 SVG(稳定、风格统一、可打印、没有注入风险)
//   bars —— 线段图/条形模型:每条线段由若干"份"组成,右侧标总量,可跨多条加大括号
//   line —— 数轴/路程图:点标记 + 区间跨度(行程、植树、周期)
//   svg  —— 仅几何图形:AI 直接给 SVG,前端白名单清洗后显示
// renderDiagram 纯字符串输出(node 可测);sanitizeSVG 依赖浏览器 DOMParser。

const W = 560;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, n = 40) => String(v ?? '').slice(0, n);

export function escXML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 粗估文字宽度(中文按 1em,其余按 0.6em)
function textW(s, size) {
  let w = 0;
  for (const ch of String(s)) w += /[⺀-鿿＀-￯]/.test(ch) ? size : size * 0.6;
  return w;
}

// ── 归一化:把 AI 给的东西收拾成安全、有界的结构;不合格返回 null ──
export function normalizeDiagram(d) {
  if (!d || typeof d !== 'object') return null;
  const kind = d.kind || d.type;
  const title = str(d.title, 30);
  const note = str(d.note, 80);
  if (kind === 'bars') {
    const bars = (Array.isArray(d.bars) ? d.bars : []).slice(0, 6).map(b => ({
      label: str(b && b.label, 8),
      total: str(b && b.total, 16),
      parts: (Array.isArray(b && b.parts) ? b.parts : []).slice(0, 12).map(p => ({
        size: Math.min(1000, Math.max(0.2, num(p && p.size, 1))),
        text: str(p && p.text, 14),
        style: ['unit', 'extra', 'unknown', 'gap'].includes(p && p.style) ? p.style : 'unit',
      })).filter(p => p.size > 0),
    })).filter(b => b.parts.length);
    if (!bars.length) return null;
    const braces = (Array.isArray(d.braces) ? d.braces : []).slice(0, 3).map(br => ({
      from: Math.max(0, Math.floor(num(br && br.from, 0))),
      to: Math.floor(num(br && br.to, 0)),
      text: str(br && br.text, 16),
    })).filter(br => br.to > br.from && br.to < bars.length);
    return { kind, title, note, bars, braces };
  }
  if (kind === 'line') {
    const marks = (Array.isArray(d.marks) ? d.marks : []).slice(0, 20).map(m => ({ at: num(m && m.at, NaN), text: str(m && m.text, 10) }))
      .filter(m => Number.isFinite(m.at));
    const spans = (Array.isArray(d.spans) ? d.spans : []).slice(0, 10).map(s => ({ from: num(s && s.from, NaN), to: num(s && s.to, NaN), text: str(s && s.text, 18) }))
      .filter(s => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to !== s.from);
    const all = [...marks.map(m => m.at), ...spans.flatMap(s => [s.from, s.to])];
    if (all.length < 2) return null;
    return { kind, title, note, marks, spans, min: Math.min(...all), max: Math.max(...all) };
  }
  if (kind === 'svg' && typeof d.svg === 'string' && d.svg.length < 8000 && /^\s*<svg[\s>]/i.test(d.svg)) {
    return { kind, title, note, svg: d.svg };
  }
  return null;
}

const STYLE = {
  unit: 'fill="#e0e7ff" stroke="#4f46e5"',
  extra: 'fill="#fde68a" stroke="#d97706"',
  unknown: 'fill="#ffffff" stroke="#e11d48" stroke-dasharray="5 3"',
  gap: 'fill="#fee2e2" stroke="#e11d48"',
};

function renderBars(d) {
  const LEFT = 64, RIGHT = 120, ROW = 52, TOP = d.title ? 30 : 10;
  const DW = W - LEFT - RIGHT;
  const totals = d.bars.map(b => b.parts.reduce((s, p) => s + p.size, 0));
  const unit = DW / Math.max(...totals);
  const braceX = LEFT + DW + 10;
  let out = '';
  const H = TOP + d.bars.length * ROW + (d.note ? 26 : 6);
  if (d.title) out += `<text x="${W / 2}" y="20" text-anchor="middle" font-size="15" font-weight="700" fill="#1e293b">${escXML(d.title)}</text>`;
  d.bars.forEach((b, i) => {
    const y = TOP + i * ROW + 14;
    out += `<text x="${LEFT - 8}" y="${y + 18}" text-anchor="end" font-size="14" fill="#1e293b">${escXML(b.label)}</text>`;
    let x = LEFT;
    for (const p of b.parts) {
      const w = p.size * unit;
      out += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="26" rx="2" ${STYLE[p.style]} stroke-width="1.5"/>`;
      const t = p.style === 'unknown' && !p.text ? '?' : p.text;
      if (t) {
        const fits = textW(t, 12.5) + 6 <= w;
        out += fits
          ? `<text x="${(x + w / 2).toFixed(1)}" y="${y + 18}" text-anchor="middle" font-size="12.5" fill="#1e293b">${escXML(t)}</text>`
          : `<text x="${(x + w / 2).toFixed(1)}" y="${y - 4}" text-anchor="middle" font-size="11.5" fill="#475569">${escXML(t)}</text>`;
      }
      x += w;
    }
    if (b.total) {
      // 单条线段右侧的小括号 + 总量
      out += `<path d="M${x + 4} ${y} q6 0 6 6 v4 q0 3 4 3 q-4 0 -4 3 v4 q0 6 -6 6" fill="none" stroke="#64748b" stroke-width="1.4"/>`;
      out += `<text x="${x + 18}" y="${y + 18}" font-size="13" fill="#1e293b">${escXML(b.total)}</text>`;
    }
  });
  for (const br of d.braces) {
    const y1 = TOP + br.from * ROW + 14, y2 = TOP + br.to * ROW + 40, mid = (y1 + y2) / 2;
    const bx = braceX + (d.bars.some(b => b.total) ? 70 : 0);
    out += `<path d="M${bx} ${y1} q8 0 8 8 V${mid - 6} q0 6 6 6 q-6 0 -6 6 V${y2 - 8} q0 8 -8 8" fill="none" stroke="#4f46e5" stroke-width="1.6"/>`;
    out += `<text x="${bx + 18}" y="${mid + 5}" font-size="13" font-weight="700" fill="#4f46e5">${escXML(br.text)}</text>`;
  }
  if (d.note) out += `<text x="${LEFT}" y="${H - 8}" font-size="12.5" fill="#64748b">${escXML(d.note)}</text>`;
  return svgWrap(out, H);
}

function renderLine(d) {
  const L = 40, R = 40, DW = W - L - R;
  const span = d.max - d.min || 1;
  const X = v => L + (v - d.min) / span * DW;
  // 区间分层:重叠的往上叠
  const levels = [];
  const placed = d.spans.map(s => {
    const a = Math.min(s.from, s.to), b = Math.max(s.from, s.to);
    let lv = 0;
    while ((levels[lv] || []).some(([p, q]) => a < q && b > p)) lv++;
    (levels[lv] = levels[lv] || []).push([a, b]);
    return { ...s, a, b, lv };
  });
  const nLv = levels.length;
  const TOP = (d.title ? 30 : 8) + nLv * 30;
  const lineY = TOP + 12;
  const H = lineY + 44 + (d.note ? 22 : 0);
  let out = '';
  if (d.title) out += `<text x="${W / 2}" y="20" text-anchor="middle" font-size="15" font-weight="700" fill="#1e293b">${escXML(d.title)}</text>`;
  out += `<line x1="${L - 10}" y1="${lineY}" x2="${W - R + 10}" y2="${lineY}" stroke="#1e293b" stroke-width="2"/>`;
  for (const s of placed) {
    const y = lineY - 14 - s.lv * 30;
    const x1 = X(s.a), x2 = X(s.b);
    out += `<path d="M${x1.toFixed(1)} ${y + 8} V${y} H${x2.toFixed(1)} V${y + 8}" fill="none" stroke="#4f46e5" stroke-width="1.5"/>`;
    out += `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${y - 4}" text-anchor="middle" font-size="12.5" fill="#4f46e5">${escXML(s.text)}</text>`;
  }
  for (const m of d.marks) {
    const x = X(m.at);
    out += `<line x1="${x.toFixed(1)}" y1="${lineY - 6}" x2="${x.toFixed(1)}" y2="${lineY + 6}" stroke="#1e293b" stroke-width="2"/>`;
    out += `<circle cx="${x.toFixed(1)}" cy="${lineY}" r="3" fill="#1e293b"/>`;
    out += `<text x="${x.toFixed(1)}" y="${lineY + 24}" text-anchor="middle" font-size="12.5" fill="#1e293b">${escXML(m.text)}</text>`;
  }
  if (d.note) out += `<text x="${L}" y="${H - 6}" font-size="12.5" fill="#64748b">${escXML(d.note)}</text>`;
  return svgWrap(out, H);
}

function svgWrap(inner, H) {
  return `<svg class="ai-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Math.ceil(H)}" width="100%" style="max-width:${W}px" role="img" font-family="PingFang SC, Microsoft YaHei, sans-serif">${inner}</svg>`;
}

// 返回 SVG 字符串;不认识/不合格返回 ''
export function renderDiagram(raw) {
  const d = normalizeDiagram(raw); // 幂等,已归一化的再过一遍也一样
  if (!d) return '';
  if (d.kind === 'bars') return renderBars(d);
  if (d.kind === 'line') return renderLine(d);
  if (d.kind === 'svg') return sanitizeSVG(d.svg);
  return '';
}

// ── 几何 SVG 白名单清洗(浏览器)────────────────────────
const OK_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'defs', 'marker']);
const OK_ATTRS = new Set(['viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity',
  'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'transform', 'id', 'markerWidth', 'markerHeight',
  'refX', 'refY', 'orient', 'marker-end', 'marker-start', 'xmlns', 'dx', 'dy']);

const SVG_NS = 'http://www.w3.org/2000/svg';

// 从解析结果里只挑白名单元素/属性,用 escXML 重新拼出字符串——注释、处理指令、CDATA、
// 非 SVG 命名空间节点一律丢弃(直接序列化原 DOM 会把 <!--><img onerror> 之类原样带出去)
export function sanitizeSVG(src) {
  if (typeof DOMParser === 'undefined') return '';
  let doc;
  try { doc = new DOMParser().parseFromString(src, 'image/svg+xml'); } catch (e) { return ''; }
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return '';
  let budget = 2000; // 元素个数上限
  const build = (el, isRoot) => {
    if (--budget < 0) return '';
    const tag = el.localName;
    let attrs = '';
    for (const a of [...el.attributes]) {
      if (a.namespaceURI || !OK_ATTRS.has(a.name) || a.name === 'xmlns') continue;
      const v = a.value || '';
      if (/url\s*\(|javascript:|expression\s*\(|[<>]/i.test(v)) continue;
      if (isRoot && (a.name === 'width' || a.name === 'height')) continue;
      attrs += ` ${a.name}="${escXML(v)}"`;
    }
    let inner = '';
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) inner += escXML(n.nodeValue || '');
      else if (n.nodeType === 1 && n.namespaceURI === SVG_NS && OK_TAGS.has(n.localName) && n.localName !== 'svg') inner += build(n, false);
      // 其他节点类型(注释 8、处理指令 7、CDATA 4……)直接丢弃
    }
    return `<${tag}${attrs}${isRoot ? ` xmlns="${SVG_NS}" class="ai-diagram" width="100%"${el.getAttribute('viewBox') ? '' : ' viewBox="0 0 400 300"'}` : ''}>${inner}</${tag}>`;
  };
  return build(root, true);
}
