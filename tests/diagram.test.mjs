// 画图 DSL 渲染:node tests/diagram.test.mjs
import { renderDiagram, normalizeDiagram } from '../js/diagram.js';
import { check, done } from './_check.mjs';

const bars = {
  kind: 'bars', title: '线段图',
  bars: [
    { label: '哥哥', parts: [{ size: 1, text: '1份' }, { size: 0.4, text: '多20', style: 'extra' }], total: '?个' },
    { label: '弟弟', parts: [{ size: 1, text: '1份' }] },
  ],
  braces: [{ from: 0, to: 1, text: '共 120 个' }], note: '去掉多的 20 个,剩下就是 2 份',
};
const svg = renderDiagram(bars);
check('bars 出 svg', svg.startsWith('<svg') && svg.endsWith('</svg>'));
check('bars 含 3 个矩形', (svg.match(/<rect /g) || []).length === 3);
check('bars 含标签与括号文字', svg.includes('哥哥') && svg.includes('共 120 个') && svg.includes('多20'));
check('extra 样式着色', svg.includes('#fde68a'));
const line = renderDiagram({ kind: 'line', marks: [{ at: 0, text: 'A地' }, { at: 300, text: 'B地' }], spans: [{ from: 0, to: 120, text: '甲 2 小时' }, { from: 100, to: 300, text: '乙' }] });
check('line 出 svg', line.startsWith('<svg') && line.includes('A地') && line.includes('甲 2 小时'));
check('重叠区间分层(两条括号)', (line.match(/stroke="#4f46e5"/g) || []).length === 2);
const evil = renderDiagram({ kind: 'bars', bars: [{ label: '<script>alert(1)</script>', parts: [{ size: 1, text: '"><img onerror=x>' }] }] });
check('文本转义防注入', !evil.includes('<script') && !evil.includes('<img') && evil.includes('&lt;'));
check('坏输入 → 空', renderDiagram(null) === '' && renderDiagram({ kind: 'bars', bars: [] }) === '' && renderDiagram({ kind: 'pie' }) === '');
check('svg 类型 node 环境不渲染(需浏览器清洗)', renderDiagram({ kind: 'svg', svg: '<svg><rect/></svg>' }) === '');
check('非 svg 开头拒绝', normalizeDiagram({ kind: 'svg', svg: '<div>' }) === null);
const n = normalizeDiagram({ kind: 'bars', bars: Array(10).fill({ label: 'x', parts: Array(30).fill({ size: 1e9 }) }) });
check('数量与尺寸有上限', n.bars.length === 6 && n.bars[0].parts.length === 12 && n.bars[0].parts[0].size === 1000);
check('幂等', JSON.stringify(normalizeDiagram(normalizeDiagram(bars))) === JSON.stringify(normalizeDiagram(bars)));
done();
