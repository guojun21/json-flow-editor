// 真实鼠标事件驱动的连线吸附测试(Playwright + 本机 Chrome)。用法: node tools/e2e/drag_snap.mjs [baseURL]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.argv[2] || 'http://localhost:4244';
const OUT = process.env.OUT || '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', m => { if (/\[jfe\]/.test(m.text())) process.stdout.write('  console: ' + m.text() + '\n'); });
await page.goto(BASE + '/?file=er_paichan');
await page.waitForFunction(() => window.__jfe && window.__jfe.graph() && window.__jfe.graph().getEdges().length > 0);
await page.waitForTimeout(600);   // 等 buildFrom 之后 150ms 的兜底 fit 跑完,别让它在拖动中途改视口
await page.evaluate(() => { window.__jfeDebug = true; __jfe.autosave(false); const g = __jfe.graph(); g.zoomTo(1); g.centerCell(g.getCellById('tok')); });
await page.waitForTimeout(300);   // zoomTo 触发 scale → 120ms 防抖重挂工具,等它过去
const info = (id) => page.evaluate((id) => { const g = __jfe.graph(); const e = g.getCellById(id); if (!e) return null; const v = g.findViewByCell(e);
  const box = (cid) => { const n = g.getCellById(cid); if (!n) return null; const b = n.getBBox(); const tl = g.localToClient(b.x, b.y), br = g.localToClient(b.x + b.width, b.y + b.height); return { l: tl.x, t: tl.y, r: br.x, b: br.y }; };
  return { source: e.getSource(), target: e.getTarget(), sp: g.localToClient(v.sourcePoint), tp: g.localToClient(v.targetPoint), mid: g.localToClient(v.getPointAtRatio(0.5)), srcBox: box(e.getSourceCellId()), tgtBox: box(e.getTargetCellId()) }; }, id);
const drag = async (from, to, steps = 12) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await page.mouse.up(); };
const results = {};
// A) 选中 r0,把目标端从 tok 左边中点拖到 tok 左边下方 3/4 处(同一元素换落点)
let r = await info('r0'); console.log('初始 r0', JSON.stringify({ target: r.target, tp: r.tp, tgtBox: r.tgtBox }));
await page.mouse.click(r.mid.x, r.mid.y);
const sel = await page.evaluate(() => __jfe.graph().getSelectedCells().map(c => c.id)); console.log('点线后选中', sel);
const yA = r.tgtBox.t + (r.tgtBox.b - r.tgtBox.t) * 0.75;
// 抓箭头柄工具本身(而不是线端坐标):工具是个三角形,按在它的包围盒中心才算按到柄
await page.waitForSelector('[class*="arrowhead"]', { timeout: 4000 }).catch(() => console.log('等不到箭头柄元素'));
if (process.env.TRACE_M) await page.evaluate(() => { const g = __jfe.graph(); window.addEventListener('mousemove', e => { const r = g.container.getBoundingClientRect(); const m = g.view.svg.getScreenCTM(); console.log('[jfe] mm', e.clientX, e.clientY, 'scroll', scrollX, scrollY, 'box', Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), 'ctm', m.a.toFixed(2), Math.round(m.e), Math.round(m.f), 'local', JSON.stringify(g.clientToLocal(e.clientX, e.clientY))); }, true); });
if (process.env.TRACE_TOOLS) await page.evaluate(() => { const E = Object.getPrototypeOf(__jfe.graph().getCellById('r0')); for (const m of ['removeTools', 'addTools', 'setTools']) { const orig = E[m]; E[m] = function (...a) { console.log('[jfe] ' + m, this.id, (new Error().stack || '').split('\n').slice(2, 8).map(l => l.trim().replace(/^at /, '').replace(/\(.*\//, '(')).join(' | ')); return orig.apply(this, a); }; } });
if (process.env.TRACE_T) await page.evaluate(() => { const g = __jfe.graph(); const orig = g.translate.bind(g); g.translate = function (...a) { if (a.length) console.log('[jfe] translate', JSON.stringify(a), (new Error().stack || '').split('\n').slice(2, 7).join(' | ')); return orig(...a); }; });
const grip = await page.evaluate(() => { const els = [...document.querySelectorAll('[class*="arrowhead"]')]; const el = els.find(x => /target/.test(x.getAttribute('class') || '')) || els[els.length - 1]; if (!el) return { classes: [...document.querySelectorAll('[class*="tool"]')].map(x => x.getAttribute('class')).slice(0, 6) }; const b = el.getBoundingClientRect(); return { cls: el.getAttribute('class'), x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; });
console.log('箭头柄', JSON.stringify(grip));
await drag(grip && grip.x ? grip : r.tp, { x: r.tgtBox.l + 3, y: yA });
r = await info('r0'); results.A = { target: r.target, tp: r.tp, expectY: yA }; console.log('A 同元素换点', JSON.stringify(results.A));
await page.screenshot({ path: OUT + '/e2e_A.png', clip: { x: 250, y: 120, width: 900, height: 600 } });
const hl = await page.evaluate(() => [...document.querySelectorAll('[class*="highlight"]')].map(el => el.getAttribute('class') + ' @ ' + (el.closest('[data-cell-id]') || {}).getAttribute?.('data-cell-id')));
console.log('拖完后残留高亮元素', JSON.stringify(hl));
const r0info = await page.evaluate(() => { const g = __jfe.graph(); const e = g.getCellById('r0'); const v = g.findViewByCell(e); return { source: e.getSource(), sp: g.localToClient(v.sourcePoint) }; });
console.log('r0 源端', JSON.stringify(r0info));
if (process.env.ONLY_A) { await browser.close(); process.exit(0); }
// B) 把 r0 目标端拖到另一元素 ses 的底边 1/3 处(离底边 8px 外侧,考验 18px 吸附带)
const sesBox = await page.evaluate(() => { const g = __jfe.graph(); const b = g.getCellById('ses').getBBox(); const tl = g.localToClient(b.x, b.y), br = g.localToClient(b.x + b.width, b.y + b.height); return { l: tl.x, t: tl.y, r: br.x, b: br.y }; });
r = await info('r0');
await drag(r.tp, { x: sesBox.l + (sesBox.r - sesBox.l) / 3, y: sesBox.b + 8 });
r = await info('r0'); results.B = { target: r.target, tp: r.tp, sesBox }; console.log('B 跨元素+带外吸附', JSON.stringify(results.B));
// C) 从 tok 的右边 1/4 高处起新线,落到 ses 左边 2/3 高处
const tokBox = await page.evaluate(() => { const g = __jfe.graph(); const b = g.getCellById('tok').getBBox(); const tl = g.localToClient(b.x, b.y), br = g.localToClient(b.x + b.width, b.y + b.height); return { l: tl.x, t: tl.y, r: br.x, b: br.y }; });
const before = await page.evaluate(() => __jfe.graph().getEdges().length);
await page.mouse.click(600, 900);   // 先点空白取消选择
await drag({ x: tokBox.r - 2, y: tokBox.t + (tokBox.b - tokBox.t) / 4 }, { x: sesBox.l - 6, y: sesBox.t + (sesBox.b - sesBox.t) * 2 / 3 });
const after = await page.evaluate(() => { const g = __jfe.graph(); const es = g.getEdges(); const e = es[es.length - 1]; return { n: es.length, source: e.getSource(), target: e.getTarget() }; });
results.C = { before, ...after }; console.log('C 新线', JSON.stringify(results.C));
await page.screenshot({ path: OUT + '/e2e_C.png', clip: { x: 250, y: 120, width: 900, height: 600 } });
// D) 把 r0 目标端拖到空白处 → 应回退到 B 的落点
r = await info('r0');
await drag(r.tp, { x: 700, y: 950 });
r = await info('r0'); results.D = { target: r.target }; console.log('D 丢空回退', JSON.stringify(results.D));
// E) 新线丢空 → 应被删除
const n0 = await page.evaluate(() => __jfe.graph().getEdges().length);
await drag({ x: tokBox.r - 2, y: tokBox.t + (tokBox.b - tokBox.t) / 2 }, { x: 700, y: 950 });
const n1 = await page.evaluate(() => __jfe.graph().getEdges().length);
results.E = { n0, n1 }; console.log('E 新线丢空', JSON.stringify(results.E));
await browser.close();
const ok = results.A.target.anchor && Math.abs(results.A.tp.y - results.A.expectY) < 3 && results.B.target.cell === 'ses' && results.B.target.anchor && results.C.n === before + 1 && results.C.target.cell === 'ses' && results.C.source.anchor && results.D.target.cell === 'ses' && n1 === n0;
console.log(ok ? 'ALL PASS' : 'FAIL');
