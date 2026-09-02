// Excel 文档往返测试:打开 xlsx → Univer 渲染 → 改一格 → 自动回存 → 重开验证值还在。用法: node tools/e2e/sheet_roundtrip.mjs [baseURL]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:4244';
const OUT = process.env.OUT || '.';
const ID = process.env.SHEET || 'access_paichan';
const xlsxPath = new URL('../../data/' + ID + '.xlsx', import.meta.url).pathname;
const m0 = fs.statSync(xlsxPath).mtimeMs;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const saves = [];
page.on('response', r => { if (r.url().includes('api/save-xlsx')) saves.push(r.status()); });
page.on('console', m => { if (/\[jfe\]|error/i.test(m.text())) process.stdout.write('  console: ' + m.text().slice(0, 200) + '\n'); });
await page.goto(BASE + '/?file=' + ID);
await page.waitForSelector('.sheet-host canvas', { timeout: 30000 });
await page.waitForTimeout(2500);
const status0 = await page.evaluate(() => (document.querySelector('.status') || {}).textContent || '');
console.log('打开后状态', JSON.stringify(status0));
await page.screenshot({ path: OUT + '/sheet_open.png' });
// 用名称框跳到 B4 再输入(比点坐标稳)
const stamp = 'E2E-' + Date.now().toString().slice(-6);
const nameBox = page.locator('.univer-defined-name input, [class*="defined-name"] input, input[class*="name"]').first();
let usedNameBox = false;
try { await nameBox.waitFor({ timeout: 3000 }); await nameBox.fill('B4'); await nameBox.press('Enter'); usedNameBox = true; } catch {}
if (!usedNameBox) { await page.mouse.click(540, 282); await page.waitForTimeout(300); }   // 1600x1000 视口下 B4 的位置(截图核过)
await page.keyboard.type(stamp); await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const m1 = fs.statSync(xlsxPath).mtimeMs;
console.log('输入', stamp, '用名称框', usedNameBox, '保存响应', JSON.stringify(saves), 'xlsx 变了', m1 > m0);
await page.screenshot({ path: OUT + '/sheet_edited.png' });
// 重开验证
await page.goto(BASE + '/?file=' + ID);
await page.waitForSelector('.sheet-host canvas', { timeout: 30000 });
await page.waitForTimeout(2500);
const found = await page.evaluate((needle) => { const wb = window.__univerAPI && window.__univerAPI.getActiveWorkbook(); if (!wb) return 'no api'; const snap = wb.save(); return JSON.stringify(snap).includes(needle); }, stamp);
console.log('重开后能找到刚输入的值', found);
await page.screenshot({ path: OUT + '/sheet_reopened.png' });
await browser.close();
console.log(saves.some(s => s === 200) && m1 > m0 && found === true ? 'ALL PASS' : 'FAIL');
