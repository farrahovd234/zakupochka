"use strict";
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(__dirname, "..");
const results = [];
let server;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".csv": "text/csv; charset=utf-8",
};
async function startServer() {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    ).replace(/^\/zakupochka\//, "/");
    const file = path.resolve(
      root,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
        })
        .end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}/zakupochka/`;
}
function check(name, condition) {
  assert(condition, name);
  results.push(name);
}
async function route(page, hash) {
  await page.evaluate((hash) => (location.hash = hash), hash);
  await page
    .locator(`[data-view="${hash.split("?")[0]}"]`)
    .waitFor({ state: "visible" });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
(async () => {
  const base = process.env.SITE_URL || (await startServer());
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const errors = [],
    failed = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        failed.push(response.status() + " " + response.url());
    });
    page.on("requestfailed", (request) =>
      failed.push(request.url() + " " + request.failure()?.errorText),
    );
    const response = await page.goto(base, { waitUntil: "networkidle" });
    check(
      "site and relative assets load under /zakupochka/",
      response.status() === 200,
    );
    const data = await page.evaluate(() => window.ZAKU_DATA);
    check(
      "cover has exactly 417 daily data marks",
      (await page.locator(".orbit-day").count()) === 417,
    );
    check(
      "cover links all nine eras",
      (await page.locator(".era-card").count()) === 9,
    );
    await page.locator("#orbit-range").fill("0");
    check(
      "cover day control updates actual first-day count",
      (await page.locator("#orbit-count").textContent()).includes("6 "),
    );
    check(
      "cover day control updates context link",
      (await page.locator("#orbit-link").getAttribute("href")).includes(
        "2025-09-17",
      ),
    );
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const hash of [
        "overview",
        "analysis",
        "chronicle",
        "people",
        "memes",
        "numbers",
        "cast",
        "method",
        "search",
        "thread?id=route-bots",
      ]) {
        await route(page, hash);
        check(
          `no overflow at ${width}px: ${hash}`,
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        check(
          `one page heading: ${width}px ${hash}`,
          (await page.locator("[data-view]:not([hidden]) h1").count()) === 1,
        );
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const era of data.eras) {
      await route(page, "analysis?era=" + era.id);
      check(
        "chapter " + era.id,
        (await page.locator(".chapter-title").textContent()) === era.title,
      );
    }
    for (const thread of data.paths) {
      await route(page, "thread?id=" + thread.id);
      check(
        "thread " + thread.id,
        (await page.locator(".thread-stop").count()) === thread.sceneIds.length,
      );
    }
    await route(page, "analysis?era=origins");
    await page.locator(".chapter-pagination a").last().click();
    check("next chapter goes to rituals", page.url().includes("era=rituals"));
    await page.locator(".scene-link").first().click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    check(
      "chapter scene opens source detail",
      (await page.locator(".source-note").textContent()).includes(
        "Опорная запись анализа",
      ),
    );
    await page.keyboard.press("Escape");
    check(
      "escape closes scene dialog",
      !(await page.locator("#detail-dialog").isVisible()),
    );
    await route(page, "people");
    check(
      "all profiles rendered",
      (await page.locator(".person-row").count()) === 32,
    );
    await page.selectOption("#people-type", "bot");
    check("bot filter", (await page.locator(".person-row").count()) === 3);
    await page.selectOption("#people-type", "human");
    check("human filter", (await page.locator(".person-row").count()) === 29);
    await page.selectOption("#people-type", "all");
    await page.fill("#people-query", "Паша");
    check("name filter", (await page.locator(".person-row").count()) === 1);
    await page.locator(".person-row").click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    check(
      "correct profile title",
      (await page.locator("#detail-title").textContent()) === "Паша",
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !location.hash.includes("person="));
    check(
      "profile URL parameter clears on close",
      !new URLSearchParams(page.url().split("?")[1]).has("person"),
    );
    check(
      "name filter survives closing profile",
      (await page.locator("#people-query").inputValue()) === "Паша",
    );
    await page.fill("#people-query", "");
    await page.selectOption("#people-sort", "characters");
    check(
      "text ranking uses characters",
      (await page.locator(".person-name").first().textContent()) === "Динар",
    );
    await route(page, "chronicle");
    check(
      "timeline first page",
      (await page.locator(".event-row").count()) === 20,
    );
    await page.click("#chronicle-next");
    check(
      "timeline second page",
      (await page.locator("#chronicle-page").textContent()).startsWith("2 /"),
    );
    await page.reload();
    check(
      "timeline page survives reload",
      (await page.locator("#chronicle-page").textContent()).startsWith("2 /"),
    );
    await page.selectOption("#chronicle-month", "2026-09");
    check(
      "month filter resets pagination",
      (await page.locator("#chronicle-page").textContent()).startsWith("1 /"),
    );
    await route(page, "chronicle?date=2026-09-11");
    check(
      "day context uses verified peak",
      /3\s116/.test(await page.locator(".day-context").textContent()),
    );
    const zero = data.days.find(
      (day) =>
        day.messages === 0 &&
        !data.scenes.some((scene) => scene.date === day.date),
    );
    await route(page, "chronicle?date=" + zero.date);
    check(
      "zero day shows nearby scenes explicitly",
      (await page.locator(".day-context").textContent()).includes("ближайшие"),
    );
    await route(page, "chronicle?from=invalid&to=bad");
    check(
      "invalid date parameters do not crash",
      (await page.locator(".event-row").count()) === 20,
    );
    await route(page, "chronicle?from=2025-09-17&to=2025-10-02");
    check(
      "chapter timeline range",
      (await page.locator(".event-row").count()) ===
        data.eras[0].allSceneIds.length,
    );
    await route(page, "chronicle?event=e159");
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    check(
      "corrected request is not completed assistance",
      (await page.locator("#detail-title").textContent()).includes("просит"),
    );
    await page.reload();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    check(
      "scene deep link survives reload",
      (await page.locator("#detail-title").textContent()).includes("опрос"),
    );
    await page.keyboard.press("Escape");
    await route(page, "memes");
    check("all memes", (await page.locator(".meme-entry").count()) === 63);
    await page.fill("#meme-query", "Мира");
    check("meme text search", (await page.locator(".meme-entry").count()) > 0);
    await page.locator(".meme-entry .text-link").first().click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    check(
      "meme source caveat visible",
      (await page.locator(".source-note").textContent()).includes(
        "не устанавливают рождение",
      ),
    );
    await page.keyboard.press("Escape");
    await route(page, "memes");
    const deepCard = page.locator(".meme-entry .text-link").nth(40);
    await deepCard.scrollIntoViewIfNeeded();
    await deepCard.focus();
    const scrollBefore = await page.evaluate(() => scrollY);
    await deepCard.click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog").open);
    check(
      "closing a deep card preserves reading position",
      Math.abs((await page.evaluate(() => scrollY)) - scrollBefore) < 5,
    );
    check(
      "closing a deep card restores trigger focus",
      await deepCard.evaluate((el) => el === document.activeElement),
    );
    await route(page, "chronicle?date=2026-09-11");
    await page.selectOption("#chronicle-kind", "Боты");
    check(
      "filtered day does not claim scenes are absent from archive",
      (await page.locator(".day-context").textContent()).includes(
        "По выбранным условиям",
      ),
    );
    await route(page, "memes?meme=m01");
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    await page.locator(".scene-link").first().click();
    await page.waitForFunction(
      () => document.querySelector("dialog").open &&
        document.querySelector("#detail-type").textContent.startsWith("Сцена"),
    );
    check(
      "dialog to dialog navigation works",
      (await page.locator("#detail-type").textContent()).startsWith("Сцена"),
    );
    check(
      "dialog keeps deep link after navigation",
      page.url().includes("event=e001"),
    );
    await page.keyboard.press("Escape");
    await route(page, "search");
    await page.fill("#global-query", "медовуха");
    check(
      "global search finds actual content",
      (await page.locator(".search-result").count()) > 0,
    );
    await page.locator("[data-search-kind=scene]").click();
    check(
      "search category filter",
      await page
        .locator(".result-category")
        .evaluateAll((nodes) =>
          nodes.every((node) => node.textContent.startsWith("Сцена")),
        ),
    );
    await page.reload();
    check(
      "search and category survive reload",
      (await page.locator("#global-query").inputValue()) === "медовуха" &&
        (await page
          .locator("[data-search-kind=scene]")
          .getAttribute("aria-pressed")) === "true",
    );
    await page.locator(".search-result").first().click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.goBack();
    await page.locator("#global-query").waitFor({ state: "visible" });
    check(
      "back restores search query",
      (await page.locator("#global-query").inputValue()) === "медовуха",
    );
    await page.fill("#global-query", "<img src=x onerror=alert(1)>");
    check(
      "untrusted search stays text",
      (await page.locator(".search-result").count()) === 0 &&
        (await page.locator("#search-results img").count()) === 0,
    );
    await route(page, "numbers");
    await page.fill("#chart-date", "2025-09-17");
    await page.locator("#chart-date").dispatchEvent("change");
    check(
      "chart day selection",
      (await page.locator("#chart-selection strong").textContent()) === "6",
    );
    for (const width of [375, 812, 375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      await page.waitForTimeout(150);
      check(
        "chart rotate/resize regression " + width,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.click("#theme-toggle");
    check(
      "dark mode",
      (await page.locator("html").getAttribute("data-theme")) === "dark",
    );
    await page.reload();
    check(
      "dark mode persists",
      (await page.locator("html").getAttribute("data-theme")) === "dark",
    );
    await page.click("#theme-toggle");
    await route(page, "overview");
    await page.keyboard.press("/");
    await page.locator("#global-query").waitFor({ state: "visible" });
    check(
      "keyboard search focus",
      await page
        .locator("#global-query")
        .evaluate((el) => el === document.activeElement),
    );
    await route(page, "overview");
    await page.click("#menu-toggle");
    check(
      "mobile menu expanded",
      (await page.locator("#menu-toggle").getAttribute("aria-expanded")) ===
        "true",
    );
    await page.locator("[data-nav=people]").click();
    await page.locator("[data-view=people]").waitFor({ state: "visible" });
    check(
      "mobile navigation closes menu",
      (await page.locator("#menu-toggle").getAttribute("aria-expanded")) ===
        "false",
    );
    for (const file of [
      "statistika.csv",
      "uchastniki.csv",
      "hronika.csv",
      "assets/Lora-OFL.txt",
      "assets/og.png",
    ]) {
      const response = await context.request.get(new URL(file, base).href);
      check("download " + file, response.status() === 200);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    check(
      "reduced motion",
      (await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      )) === "auto",
    );
    check("no JavaScript runtime errors", errors.length === 0);
    check("no failed resource requests", failed.length === 0);
    console.log(`${results.length} browser checks passed at ${base}`);
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (process.env.QA_REPORT)
      fs.writeFileSync(
        process.env.QA_REPORT,
        JSON.stringify(
          { checks: results.length, passed: results, errors, failed },
          null,
          2,
        ),
      );
  }
})().catch((error) => {
  console.error(error);
  if (server) server.close();
  process.exitCode = 1;
});
