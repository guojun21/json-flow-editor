// 规约面板所见即所得测试:点用例 → 在「触发」里打字 → 1.5s 自动存服务器 → 重新拉 JSON 里有这段字;顺带验证同边多线铺开。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:4244';
const OUT = process.env.OUT || '.';
const ID = process.env.DOC || 'e2e_uc';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const saves = [];
page.on('response', r => { if (r.url().includes('api/save')) saves.push(r.status()); });
await page.goto(BASE + '/?file=' + ID);
await page.waitForFunction(() => window.__jfe && __jfe.graph() && __jfe.graph().getNodes().length > 5);
await page.waitForTimeout(800);
// 同边铺开:找连线最多的元素,看落在同一边的锚点 y 是否各不相同
const fan = await page.evaluate(() => { const g = __jfe.graph(); let best = null; for (const n of g.getNodes()) { const es = g.getConnectedEdges(n); if (!best || es.length > best.es.length) best = { n, es }; } const fr = best.es.map(e => { const t = e.getSourceCellId() === best.n.id ? e.getSource() : e.getTarget(); return t.anchor ? t.anchor.args.dx + '/' + t.anchor.args.dy : 'none'; }); return { node: best.n.id, count: best.es.length, anchors: fr, distinct: new Set(fr).size }; });
console.log('同边铺开', JSON.stringify(fan));
// 点一个用例节点(usecase)让面板出现
const uc = await page.evaluate(() => { const g = __jfe.graph(); const n = g.getNodes().find(x => (x.getData() || {}).kind === 'usecase' && (x.getData() || {}).spec); const b = n.getBBox(); const c = g.localToClient(b.x + b.width / 2, b.y + b.height / 2); return { id: n.id, x: c.x, y: c.y, spec: n.getData().spec }; });
await page.mouse.click(uc.x, uc.y);
await page.waitForSelector('.detail textarea', { timeout: 5000 });
const stamp = 'E2E触发' + Date.now().toString().slice(-5);
const ta = page.locator('.detail .detail-row').nth(1).locator('textarea');   // 第二行 = 触发
await ta.click(); await ta.press('End'); await ta.type(' ' + stamp);
await page.waitForTimeout(2600);
await page.screenshot({ path: OUT + '/spec_panel.png', clip: { x: 1100, y: 0, width: 500, height: 700 } });
const served = await page.evaluate(async (id) => (await (await fetch('data/' + id + '.json?t=' + Date.now())).text()), ID);
const inDoc = await page.evaluate((id) => { const n = __jfe.graph().getCellById(id); return n.getData().spec.trigger; }, uc.id);
console.log('面板改动写进节点', inDoc.includes(stamp), '服务器文件含改动', served.includes(stamp), '保存响应', JSON.stringify(saves));
await browser.close();
console.log(inDoc.includes(stamp) && served.includes(stamp) && fan.distinct === fan.count ? 'ALL PASS' : 'FAIL');
