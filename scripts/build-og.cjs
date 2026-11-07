"use strict";
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(root, "data.js"), "utf8"),
  context,
);
const data = context.window.ZAKU_DATA,
  max = Math.max(...data.days.map((day) => day.messages));
const lines = data.days
  .map((day, i) => {
    const angle = -Math.PI / 2 + (i / data.days.length) * Math.PI * 2,
      inner = 136,
      outer = inner + 5 + Math.sqrt(day.messages / max) * 65;
    return `<line x1="${220 + Math.cos(angle) * inner}" y1="${220 + Math.sin(angle) * inner}" x2="${220 + Math.cos(angle) * outer}" y2="${220 + Math.sin(angle) * outer}" stroke="${day.date >= "2026-09-01" ? "#7e8960" : "#c5c8b8"}" stroke-width="1.5"/>`;
  })
  .join("");
(async () => {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    const font = fs
      .readFileSync(path.join(root, "assets/lora-400.ttf"))
      .toString("base64");
    await page.setContent(
      `<!doctype html><html lang="ru"><meta charset="utf-8"><style>@font-face{font-family:Almanac;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#282c26;width:1200px;height:630px;padding:40px 56px;font-family:Arial,sans-serif}.top{display:flex;justify-content:space-between;border-bottom:1px solid #bfc0b3;padding-bottom:20px;font-size:14px;color:#6f7266}.content{display:grid;grid-template-columns:1.3fr 1fr;gap:40px;align-items:center}h1{font:400 88px/1.1 Almanac;margin:32px 0 24px;letter-spacing:-4px}.accent{color:#a13e2c}p{font:400 36px/1.35 Almanac;margin:0}small{display:block;margin-top:36px;font-size:16px;color:#5a5e53}.figure{position:relative;width:420px;height:420px;margin-top:16px}.figure svg{width:420px;height:420px}.center{position:absolute;inset:140px 80px;text-align:center;font:400 64px/1.1 Almanac}.center span{display:block;font:14px/22px Arial;margin-top:12px;color:#6f7266}.bottom{position:absolute;bottom:32px;left:56px;right:56px;border-top:1px solid #bfc0b3;padding-top:16px;font-size:12px;color:#6f7266}</style><div class="top"><span>Летопись общего чата</span><span>17.09.2025 — 07.11.2026</span></div><div class="content"><div><h1>ЗакупОчка<span class="accent">.</span></h1><p>На сбор друзей.<br>И целую историю.</p><small>${data.stats.calendarDays} дней · ${data.stats.messages.toLocaleString("ru-RU")} сообщение · ${data.stats.authorLabels} авторских имени</small></div><div class="figure"><svg viewBox="0 0 440 440">${lines}</svg><div class="center">417<span>дней одной<br>общей истории</span></div></div></div><div class="bottom">Девять глав · 174 опорные сцены · 63 сюжетные линии</div></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, "assets/og.png") });
    console.log("Built assets/og.png (1200 × 630) from public daily values.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
