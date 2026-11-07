"use strict";
(() => {
  const D = window.ZAKU_DATA;
  const $ = (id) => document.getElementById(id);
  const E = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const N = (value) => Number(value).toLocaleString("ru-RU");
  const norm = (value) =>
    String(value ?? "")
      .toLocaleLowerCase("ru-RU")
      .replaceAll("ё", "е")
      .replace(/\bmira\b/g, "мира");
  const shortDate = (value) =>
    value.slice(8, 10) + "." + value.slice(5, 7) + "." + value.slice(2, 4);
  const dateLabel = (value) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
      .format(new Date(value + "T12:00:00"))
      .replace(" г.", "");
  const monthLabel = (value) =>
    new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
      .format(new Date(value + "-15T12:00:00"))
      .replace(" г.", "");
  const percent = (value) =>
    Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + "%";
  const dayWord = (n) =>
    n % 10 === 1 && n % 100 !== 11
      ? "день"
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? "дня"
        : "дней";
  const messageWord = (n) =>
    n % 10 === 1 && n % 100 !== 11
      ? "сообщение"
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? "сообщения"
        : "сообщений";
  const number = (i) => String(i + 1).padStart(2, "0");
  const byId = (key) => new Map(D[key].map((item) => [item.id, item]));
  const profiles = byId("profiles"),
    scenes = byId("scenes"),
    arcs = byId("arcs"),
    eras = byId("eras"),
    paths = byId("paths");
  const routes = new Set([
    "overview",
    "analysis",
    "people",
    "chronicle",
    "memes",
    "numbers",
    "cast",
    "method",
    "search",
    "thread",
  ]);
  const names = {
    overview: "Летопись общего чата",
    analysis: "История",
    people: "Действующие лица",
    chronicle: "Хроника",
    memes: "Мемный фонд",
    numbers: "В цифрах",
    cast: "Внешний круг",
    method: "Как считали",
    search: "Поиск",
    thread: "Нити истории",
  };
  const factLabels = {
    service: "Служебный факт",
    message: "Сообщение участника",
    joke: "Шутка или образ",
    plan: "План или предложение",
    analysis: "Редакторский вывод",
    report: "Рассказ участника",
  };
  let current = "overview",
    params = new URLSearchParams(),
    eventPage = 0,
    searchKind = "all",
    resizeTimer,
    activeDetail = null,
    routeVersion = 0;
  const peakDayIndex = D.days.reduce(
    (best, day, i) => (day.messages > D.days[best].messages ? i : best),
    0,
  );
  let selectedDay = peakDayIndex;
  const pageSize = 20;
  function url(view, values = {}) {
    const p = new URLSearchParams();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") p.set(k, v);
    });
    return "#" + view + (p.size ? "?" + p.toString() : "");
  }
  function replaceParams(values) {
    Object.entries(values).forEach(([k, v]) => {
      if (v === "" || v === null || v === undefined || v === "all")
        params.delete(k);
      else params.set(k, v);
    });
    history.replaceState(null, "", url(current, Object.fromEntries(params)));
  }
  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    storageSet("zakupochka-theme", theme);
    $("theme-toggle").setAttribute(
      "aria-label",
      theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему",
    );
    document
      .querySelector("meta[name=theme-color]")
      .setAttribute("content", theme === "dark" ? "#1b1e1a" : "#f5f2e9");
  }
  const storedTheme = storageGet("zakupochka-theme");
  setTheme(
    ["dark", "light"].includes(storedTheme)
      ? storedTheme
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
  );
  $("theme-toggle").addEventListener("click", () =>
    setTheme(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    ),
  );
  $("menu-toggle").addEventListener("click", () => {
    const open = $("navigation").classList.toggle("is-open");
    $("menu-toggle").setAttribute("aria-expanded", String(open));
    $("menu-toggle").querySelector("span").textContent = open ? "−" : "+";
  });
  function closeMenu() {
    $("navigation").classList.remove("is-open");
    $("menu-toggle").setAttribute("aria-expanded", "false");
    $("menu-toggle").querySelector("span").textContent = "+";
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
    if (
      event.key === "/" &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
      !document.activeElement.isContentEditable &&
      !$("detail-dialog").open &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (current === "search") $("global-query").focus();
      else location.hash = "#search";
    }
  });
  document.querySelector(".skip").addEventListener("click", (event) => {
    event.preventDefault();
    $("main").focus();
    $("main").scrollIntoView({ block: "start" });
  });
  function sceneLink(scene) {
    return `<a class="scene-link" href="${url("chronicle", { event: scene.id })}"><time datetime="${scene.date}">${shortDate(scene.date)}</time><h3>${E(scene.title)}</h3><span aria-hidden="true">↗</span></a>`;
  }
  function relatedLinks(ids, map, view, key) {
    return ids
      .filter((id) => map.has(id))
      .map(
        (id) =>
          `<a href="${url(view, { [key]: id })}">${E(map.get(id).name || map.get(id).title)}</a>`,
      )
      .join("");
  }
  function empty(title, body) {
    return `<div class="empty-state"><h2>${E(title)}</h2><p>${E(body)}</p></div>`;
  }
  function eraForDate(day) {
    return D.eras.find((era) => era.start <= day && day <= era.end);
  }
  function factLabel(scene) {
    return factLabels[scene.factKind] || "Редакторский пересказ";
  }

  // The cover and its 417 data marks share the same verified daily series as the chart.
  $("hero-message-count").textContent = N(D.stats.messages);
  const savedEra = storageGet("zakupochka-reading");
  if (eras.has(savedEra)) {
    $("start-reading").href = url("analysis", { era: savedEra });
    $("start-reading").innerHTML =
      'Продолжить историю <span aria-hidden="true">↗</span>';
  }
  $("era-shelf").innerHTML = D.eras
    .map(
      (era, i) =>
        `<a class="era-card" href="${url("analysis", { era: era.id })}"><div class="era-card-top"><span>${number(i)}</span><span class="mono">${shortDate(era.start)} — ${shortDate(era.end)}</span></div><h3>${E(era.title)}</h3><p>${E(era.kicker)}</p><div class="era-card-bottom"><span>${N(era.stats.messages)} отправок</span><span aria-hidden="true">↗</span></div></a>`,
    )
    .join("");
  const featuredPathIds = [
    "route-bots",
    "route-homework",
    "route-founders",
    "route-hundred",
  ];
  const pathRow = (path, i) =>
    `<a class="path-row" href="${url("thread", { id: path.id })}"><span class="path-number">${number(i)}</span><h3>${E(path.title)}</h3><p>${E(path.summary)}</p><span class="path-arrow" aria-hidden="true">↗</span></a>`;
  const featured = featuredPathIds.map((id) => paths.get(id));
  const otherPaths = D.paths.filter(
    (path) => !featuredPathIds.includes(path.id),
  );
  $("path-list").innerHTML =
    featured.map(pathRow).join("") +
    `<details class="more-paths"><summary>Ещё ${otherPaths.length} маршрутов <span aria-hidden="true">+</span></summary>${otherPaths.map((path, i) => pathRow(path, i + featured.length)).join("")}</details>`;
  $("people-preview").innerHTML = D.profiles
    .slice(0, 5)
    .map(
      (profile) =>
        `<a class="preview-person" href="${url("people", { person: profile.id })}"><span class="person-monogram" aria-hidden="true">${E(profile.name[0])}</span><h3>${E(profile.name)}</h3><span class="role">${E(profile.role)}</span><span class="count">${N(profile.messages)}<span>отправок</span></span><span class="arrow" aria-hidden="true">↗</span></a>`,
    )
    .join("");
  $("chronicle-month").innerHTML += D.months
    .map(
      (month) =>
        `<option value="${month.month}">${E(monthLabel(month.month))}</option>`,
    )
    .join("");
  $("chronicle-kind").innerHTML += [
    ...new Set(D.scenes.map((scene) => scene.kind)),
  ]
    .map((kind) => `<option value="${E(kind)}">${E(kind)}</option>`)
    .join("");

  function drawOrbit() {
    let html =
      '<svg viewBox="0 0 440 440" role="img" aria-labelledby="orbit-title orbit-desc"><title id="orbit-title">Пульс закупочки за 417 дней</title><desc id="orbit-desc">Длина каждой радиальной черты показывает относительную активность по нелинейной шкале. Точное число за день можно посмотреть ползунком под рисунком.</desc><circle class="orbit-guide" cx="220" cy="220" r="134"/><circle class="orbit-guide" cx="220" cy="220" r="204"/>';
    const max = Math.max(...D.days.map((day) => day.messages));
    D.days.forEach((day, i) => {
      const angle = -Math.PI / 2 + (i / D.days.length) * Math.PI * 2;
      const inner = 140,
        outer = inner + 5 + Math.sqrt(day.messages / max) * 65;
      const x = (r) => (220 + Math.cos(angle) * r).toFixed(2),
        y = (r) => (220 + Math.sin(angle) * r).toFixed(2);
      const cls =
        "orbit-day" +
        (day.date >= "2026-09-01" ? " autumn" : "") +
        (i === selectedDay ? " selected" : "");
      html += `<line class="${cls}" x1="${x(inner)}" y1="${y(inner)}" x2="${x(outer)}" y2="${y(outer)}" stroke-width="${i === selectedDay ? 2.4 : 1.25}"/>`;
      if (i === selectedDay)
        html += `<circle class="orbit-tip" cx="${x(outer + 6)}" cy="${y(outer + 6)}" r="3"/>`;
    });
    html += "</svg>";
    $("orbit-visual").querySelector("svg")?.remove();
    $("orbit-visual").insertAdjacentHTML("afterbegin", html);
    const day = D.days[selectedDay];
    $("orbit-date").textContent = dateLabel(day.date);
    $("orbit-count").textContent =
      N(day.messages) + " " + messageWord(day.messages);
    $("orbit-link").href = url("chronicle", { date: day.date });
    $("orbit-range").value = selectedDay;
    $("orbit-range").setAttribute(
      "aria-valuetext",
      dateLabel(day.date) +
        ", " +
        day.messages +
        " " +
        messageWord(day.messages),
    );
  }
  $("orbit-range").max = D.days.length - 1;
  $("orbit-range").addEventListener("input", (event) => {
    selectedDay = Number(event.target.value);
    drawOrbit();
  });
  document.querySelectorAll("[data-random]").forEach((button) =>
    button.addEventListener("click", () => {
      const scene = D.scenes[Math.floor(Math.random() * D.scenes.length)];
      location.hash = url("chronicle", { event: scene.id });
    }),
  );
  drawOrbit();

  function drawChapter() {
    const era = eras.get(params.get("era")) || D.eras[0],
      index = D.eras.indexOf(era);
    storageSet("zakupochka-reading", era.id);
    $("start-reading").href = url("analysis", { era: era.id });
    $("start-reading").innerHTML =
      'Продолжить историю <span aria-hidden="true">↗</span>';
    $("chapter-nav").innerHTML = D.eras
      .map(
        (e, i) =>
          `<a class="chapter-tab" href="${url("analysis", { era: e.id })}" ${e.id === era.id ? 'aria-current="step"' : ""}><span class="mono">${number(i)}</span><span>${E(e.title)}</span></a>`,
      )
      .join("");
    const prev = D.eras[index - 1],
      next = D.eras[index + 1];
    $("chapter-body").innerHTML =
      `<article><div class="chapter-kicker"><span class="chapter-ordinal">${number(index)}</span><span class="mono">${E(era.kicker)}<br>${shortDate(era.start)} — ${shortDate(era.end)}</span></div><div class="chapter-progress" role="img" aria-label="Глава ${index + 1} из ${D.eras.length}">${D.eras.map((_, i) => `<span class="${i <= index ? "done" : ""}"></span>`).join("")}</div><h2 class="chapter-title">${E(era.title)}</h2><p class="chapter-lede">${E(era.summary)}</p><div class="chapter-stats"><span><strong>${N(era.stats.messages)}</strong>отправок за этот период</span><span><strong>${era.stats.activeDays}</strong>активных дней</span><span><strong>${era.allSceneIds.length}</strong>опорных сцен</span></div><div class="prose chapter-prose">${era.paragraphs.map((p) => `<p>${E(p)}</p>`).join("")}</div><div class="chapter-scene-heading"><h3>Внутри этой главы</h3><a class="text-link" href="${url("chronicle", { from: era.start, to: era.end })}">Все сцены ↗</a></div><div class="scene-list">${era.sceneIds.map((id) => sceneLink(scenes.get(id))).join("")}</div>${era.peopleIds.length ? `<div class="related-block"><span class="eyebrow">Лица этой главы</span><div class="related-links">${relatedLinks(era.peopleIds, profiles, "people", "person")}</div></div>` : ""}${era.arcIds.length ? `<div class="related-block"><span class="eyebrow">Нити, которые тянутся дальше</span><div class="related-links">${relatedLinks(era.arcIds, arcs, "memes", "meme")}</div></div>` : ""}<nav class="chapter-pagination" aria-label="Переходы по главам">${prev ? `<a href="${url("analysis", { era: prev.id })}">← Предыдущая глава<strong>${E(prev.title)}</strong></a>` : `<a href="#overview">← Вернуться<strong>На обложку</strong></a>`}${next ? `<a href="${url("analysis", { era: next.id })}">Следующая глава →<strong>${E(next.title)}</strong></a>` : `<a href="#memes">Уйти по другой нити →<strong>Мемный фонд</strong></a>`}</nav></article>`;
    document.title = era.title + " — ЗакупОчка";
  }
  function drawThread() {
    const path = paths.get(params.get("id")) || D.paths[0];
    $("thread-heading").innerHTML =
      `<a class="back-link" href="#overview">← К другим нитям истории</a><span class="eyebrow thread-kicker">Тематический маршрут · ${path.sceneIds.length} сцен</span><h1>${E(path.title)}</h1><p>${E(path.summary)}</p>`;
    const pathScenes = path.sceneIds
      .map((id) => scenes.get(id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.ref - b.ref);
    $("thread-body").innerHTML =
      `<div class="thread-main"><div class="thread-label"><span class="mono">${shortDate(pathScenes[0].date)} — ${shortDate(pathScenes.at(-1).date)}</span><span>Читать по порядку или открыть любой поворот</span></div>${pathScenes.map((scene, i) => `<article class="thread-stop"><div class="thread-step mono">${number(i)}</div><div><a href="${url("chronicle", { event: scene.id })}"><time class="eyebrow" datetime="${scene.date}">${dateLabel(scene.date)}</time><h2>${E(scene.title)}</h2></a><p>${E(scene.teaser)}</p><a class="text-link caption" href="${url("analysis", { era: scene.eraId })}">Читать в контексте главы ↗</a></div></article>`).join("")}</div><aside class="thread-aside"><div class="related-block"><span class="eyebrow">Пересекающиеся сюжеты</span><div class="related-links vertical">${relatedLinks(path.arcIds, arcs, "memes", "meme")}</div></div><div class="related-block"><span class="eyebrow">Действующие лица</span><div class="related-links vertical">${relatedLinks(path.personIds, profiles, "people", "person")}</div></div><a class="text-link caption" href="#analysis">Вся история по главам ↗</a></aside>`;
    document.title = path.title + " — ЗакупОчка";
  }

  function drawPeople() {
    const q = norm($("people-query").value.trim()),
      type = $("people-type").value,
      sort = $("people-sort").value;
    const result = D.profiles.filter(
      (p) =>
        (type === "all" || (type === "bot") === p.bot) &&
        norm(p.name + " " + p.role + " " + p.bio).includes(q),
    );
    result.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "ru") : b[sort] - a[sort],
    );
    $("people-count").textContent =
      `Найдено имён: ${result.length} / ${D.profiles.length}`;
    $("people-list").innerHTML =
      result
        .map((profile, i) => {
          const max = Math.max(...Object.values(profile.monthly));
          const spark = D.months
            .map(
              (month) =>
                `<span style="--height:${Math.max(2, ((profile.monthly[month.month] || 0) / max) * 100)}%" class="${profile.monthly[month.month] === max ? "peak" : ""}"></span>`,
            )
            .join("");
          return `<a class="person-row" href="${url("people", { ...Object.fromEntries(params), person: profile.id })}"><span class="person-index">${number(i)}</span><span><span class="person-name">${E(profile.name)}${profile.bot ? '<span class="bot-label">бот</span>' : ""}</span><span class="person-role">${E(profile.role)}</span></span><span class="person-spark" aria-hidden="true">${spark}</span><span class="person-value">${N(profile.messages)}<span>отправок</span></span><span class="person-arrow" aria-hidden="true">↗</span></a>`;
        })
        .join("") ||
      empty(
        "Такого имени не нашлось",
        "Попробуй часть имени, другую роль или отключи фильтр ботов.",
      );
  }
  for (const id of ["people-query", "people-sort", "people-type"])
    $(id).addEventListener(id === "people-query" ? "input" : "change", () => {
      replaceParams({
        q: $("people-query").value,
        sort:
          $("people-sort").value === "messages" ? "" : $("people-sort").value,
        type: $("people-type").value,
      });
      drawPeople();
    });

  function drawChronicle() {
    const q = norm($("chronicle-query").value.trim()),
      month = $("chronicle-month").value,
      kind = $("chronicle-kind").value;
    const selectedDate = params.get("date");
    const validDay = (key) =>
      D.days.some((day) => day.date === params.get(key))
        ? params.get(key)
        : null;
    const from = validDay("from"),
      to = validDay("to");
    const validDate = D.days.find((day) => day.date === selectedDate);
    let result = D.scenes.filter(
      (scene) =>
        (month === "all" || scene.date.startsWith(month)) &&
        (kind === "all" || scene.kind === kind) &&
        (!from || scene.date >= from) &&
        (!to || scene.date <= to) &&
        norm(scene.title + " " + scene.summary + " " + scene.kind).includes(q),
    );
    let isNearby = false;
    $("chronicle-context").innerHTML = "";
    if (validDate) {
      const exact = result.filter((scene) => scene.date === selectedDate);
      if (exact.length) result = exact;
      else {
        isNearby = true;
        result = result
          .slice()
          .sort(
            (a, b) =>
              Math.abs(new Date(a.date) - new Date(selectedDate)) -
              Math.abs(new Date(b.date) - new Date(selectedDate)),
          )
          .slice(0, 5)
          .sort((a, b) => a.date.localeCompare(b.date) || a.ref - b.ref);
      }
      const era = eraForDate(selectedDate);
      $("chronicle-context").innerHTML =
        `<div class="day-context"><div><h2>${dateLabel(selectedDate)}</h2><p>${N(validDate.messages)} ${messageWord(validDate.messages)} в этот день. ${isNearby ? "По выбранным условиям сцен этого дня нет — ниже ближайшие подходящие по дате." : "Ниже сцены этого дня."}</p></div><a href="${url("analysis", { era: era.id })}" class="text-link">Читать главу ↗</a></div>`;
    } else if (from || to) {
      $("chronicle-context").innerHTML =
        `<div class="day-context"><div><h2>Отрезок истории</h2><p>${E(from ? dateLabel(from) : "Начало архива")} — ${E(to ? dateLabel(to) : "Конец архива")}</p></div><a href="#analysis" class="text-link">К оглавлению ↗</a></div>`;
    }
    const pages = Math.max(1, Math.ceil(result.length / pageSize));
    eventPage = Math.min(Math.max(0, eventPage), pages - 1);
    $("chronicle-count").textContent =
      `${isNearby ? "Ближайших сцен" : "Сцен"}: ${result.length} / ${D.scenes.length}`;
    let currentMonth = "";
    $("chronicle-list").innerHTML =
      result
        .slice(eventPage * pageSize, (eventPage + 1) * pageSize)
        .map((scene) => {
          let heading = "";
          if (scene.date.slice(0, 7) !== currentMonth) {
            currentMonth = scene.date.slice(0, 7);
            heading = `<div class="chronicle-month"><h2>${E(monthLabel(currentMonth))}</h2><span class="mono">${currentMonth.slice(0, 4)} / ${currentMonth.slice(5)}</span></div>`;
          }
          return (
            heading +
            `<a class="event-row" href="${url("chronicle", { ...Object.fromEntries(params), event: scene.id })}"><time class="event-date" datetime="${scene.date}">${shortDate(scene.date)}</time><span class="event-id">${scene.id.toUpperCase()}</span><div class="event-content"><h3>${E(scene.title)}</h3><p>${E(scene.teaser)}</p><div class="event-kind"><span>${E(scene.kind)}</span><span>${E(factLabel(scene))}</span></div></div><span class="event-arrow" aria-hidden="true">↗</span></a>`
          );
        })
        .join("") ||
      empty(
        "Здесь пока тихо",
        "По этим условиям сцен нет. Сбрось фильтры или попробуй другое слово.",
      );
    $("chronicle-page").textContent = `${eventPage + 1} / ${pages}`;
    $("chronicle-prev").disabled = eventPage === 0;
    $("chronicle-next").disabled = eventPage === pages - 1;
  }
  for (const id of ["chronicle-query", "chronicle-month", "chronicle-kind"])
    $(id).addEventListener(
      id === "chronicle-query" ? "input" : "change",
      () => {
        eventPage = 0;
        replaceParams({
          q: $("chronicle-query").value,
          month: $("chronicle-month").value,
          kind: $("chronicle-kind").value,
          page: null,
        });
        drawChronicle();
      },
    );
  $("chronicle-reset").addEventListener("click", () => {
    if (location.hash === "#chronicle") {
      params = new URLSearchParams();
      $("chronicle-query").value = "";
      $("chronicle-month").value = "all";
      $("chronicle-kind").value = "all";
      eventPage = 0;
      drawChronicle();
    } else location.hash = "#chronicle";
  });
  $("chronicle-prev").addEventListener("click", () => {
    eventPage--;
    replaceParams({ page: eventPage + 1 });
    drawChronicle();
    $("chronicle-count").scrollIntoView({ block: "start" });
  });
  $("chronicle-next").addEventListener("click", () => {
    eventPage++;
    replaceParams({ page: eventPage + 1 });
    drawChronicle();
    $("chronicle-count").scrollIntoView({ block: "start" });
  });

  function drawMemes() {
    const q = norm($("meme-query").value.trim()),
      sort = $("meme-sort").value;
    const result = D.arcs.filter((arc) =>
      norm(arc.title + " " + arc.hook + " " + arc.description).includes(q),
    );
    if (sort === "mentions") result.sort((a, b) => b.mentions - a.mentions);
    if (sort === "name")
      result.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    $("meme-count").textContent =
      `Сюжетов: ${result.length} / ${D.arcs.length}`;
    $("meme-list").innerHTML =
      result
        .map(
          (arc) =>
            `<article class="meme-entry"><span class="meme-index">Фонд · № ${arc.id.slice(1)}</span><h2>${E(arc.hook)}</h2><div class="meme-title">${E(arc.title)}</div><p>${E(arc.description)}</p><div class="meme-meta"><span>${N(arc.mentions)} поисковых совпадений</span><span>${arc.days} ${dayWord(arc.days)} с текстовым следом</span></div><a class="text-link" href="${url("memes", { ...Object.fromEntries(params), meme: arc.id })}">Распутать историю <span aria-hidden="true">↗</span></a></article>`,
        )
        .join("") ||
      empty(
        "Этот мем пока не найден",
        "Попробуй короткое слово или его смысл: в локальном языке бывают неожиданные формулировки.",
      );
  }
  $("meme-query").addEventListener("input", () => {
    replaceParams({ q: $("meme-query").value });
    drawMemes();
  });
  $("meme-sort").addEventListener("change", () => {
    replaceParams({
      sort: $("meme-sort").value === "editorial" ? "" : $("meme-sort").value,
    });
    drawMemes();
  });
  function drawCast() {
    const q = norm($("cast-query").value.trim());
    const result = D.entities.filter((entity) =>
      norm(entity.name + " " + entity.role).includes(q),
    );
    $("cast-count").textContent =
      `Карточек: ${result.length} / ${D.entities.length}`;
    $("cast-list").innerHTML =
      result
        .map(
          (entity, i) =>
            `<article class="cast-row"><span class="person-index">${number(i)}</span><div><h2>${E(entity.name)}</h2><p>${E(entity.role)}</p></div><div class="cast-count">${N(entity.mentions)}<span>совпадений</span></div></article>`,
        )
        .join("") ||
      empty("Таких карточек нет", "Поищи по фамилии или контексту упоминания.");
  }
  $("cast-query").addEventListener("input", () => {
    replaceParams({ q: $("cast-query").value });
    drawCast();
  });

  // Numbers are calculated from the data instead of repeated as decorative claims.
  $("number-strip").innerHTML = [
    [D.stats.messages, "сообщение в доступном экспорте"],
    [D.stats.activeDays, "активных дней из 417"],
    [D.stats.authorLabels, "авторских имени, включая ботов"],
    [D.stats.reactions, "доступных реакций"],
  ]
    .map(
      ([n, label]) =>
        `<div><strong>${N(n)}</strong><span>${E(label)}</span></div>`,
    )
    .join("");
  const september = D.months.find((m) => m.month === "2026-09"),
    august = D.months.find((m) => m.month === "2026-08");
  $("september-total").textContent = N(september.messages);
  $("september-ratio").innerHTML =
    "×" +
    (september.messages / august.messages).toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
    }) +
    "<span>к августу 2026</span>";
  const monthMax = Math.max(...D.months.map((m) => m.messages));
  $("month-list").innerHTML = D.months
    .map(
      (month) =>
        `<a class="month-row ${month.messages === monthMax ? "peak" : ""}" href="${url("chronicle", { month: month.month })}"><span>${E(monthLabel(month.month))}</span><span class="month-bar" aria-hidden="true"><span style="--width:${(month.messages / monthMax) * 100}%"></span></span><span class="mono">${N(month.messages)}</span><span class="caption">${month.active_days} ${dayWord(month.active_days)}</span></a>`,
    )
    .join("");
  $("method-register").innerHTML = [
    [D.stats.messages, "сообщение"],
    [D.stats.textMessages, "сообщений с текстом"],
    [D.stats.serviceEvents, "служебных события"],
    [D.stats.forwards, "пересылок"],
    [D.stats.replyLinks, "ссылок-ответов"],
    [D.stats.reactions, "доступных реакций"],
  ]
    .map(
      ([n, label]) =>
        `<div class="register-item"><strong>${N(n)}</strong><span>${E(label)}</span></div>`,
    )
    .join("");
  function selectChartDay(index) {
    selectedDay = Math.max(0, Math.min(D.days.length - 1, index));
    const day = D.days[selectedDay];
    $("chart-date").value = day.date;
    $("chart-selection").innerHTML =
      `<span>${dateLabel(day.date)}</span><strong>${N(day.messages)}</strong>`;
    $("chart-day-link").href = url("chronicle", { date: day.date });
    drawChart();
  }
  function drawChart() {
    if (current !== "numbers") return;
    const element = $("activity-chart"),
      width = Math.max(240, element.clientWidth),
      height = width < 500 ? 260 : 320;
    const left = 36,
      right = 12,
      top = 16,
      bottom = 36,
      innerWidth = width - left - right,
      innerHeight = height - top - bottom,
      max = 3200;
    const x = (i) => left + (i / (D.days.length - 1)) * innerWidth,
      y = (n) => top + innerHeight * (1 - n / max);
    const points = D.days.map(
        (day, i) => `${x(i).toFixed(2)},${y(day.messages).toFixed(2)}`,
      ),
      cut = D.days.findIndex((day) => day.date === "2026-09-01");
    let html = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="activity-title"><title id="activity-title">Сообщения за каждый день. Максимум: 3116 сообщений 11 сентября 2026 года. Выбрать день можно полем даты под графиком.</title>`;
    for (const value of [0, 1000, 2000, 3000])
      html += `<line class="chart-grid" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text class="chart-label" text-anchor="end" x="${left - 8}" y="${y(value) + 4}">${value === 0 ? "0" : value / 1000 + "к"}</text>`;
    html += `<path class="chart-fill" d="M${x(cut)},${y(0)} L${points.slice(cut).join(" L")} L${x(D.days.length - 1)},${y(0)} Z"/><polyline class="chart-past" points="${points.slice(0, cut + 1).join(" ")}"/><polyline class="chart-autumn" points="${points.slice(cut).join(" ")}"/>`;
    const ticks =
      width < 500
        ? [0, Math.round(D.days.length / 2), D.days.length - 1]
        : [0, 120, 240, D.days.length - 1];
    for (const i of ticks)
      html += `<text class="chart-label" x="${x(i)}" y="${height - 8}" text-anchor="${i === 0 ? "start" : i === D.days.length - 1 ? "end" : "middle"}">${shortDate(D.days[i].date)}</text>`;
    html += `<line class="chart-guide" x1="${x(selectedDay)}" y1="${top}" x2="${x(selectedDay)}" y2="${y(0)}"/><circle class="chart-dot" cx="${x(selectedDay)}" cy="${y(D.days[selectedDay].messages)}" r="5"/></svg>`;
    element.innerHTML = html;
    element.querySelector("svg").addEventListener("click", (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      selectChartDay(
        Math.round(
          ((((event.clientX - box.left) / box.width) * width - left) /
            innerWidth) *
            (D.days.length - 1),
        ),
      );
    });
  }
  $("chart-date").addEventListener("change", () => {
    const index = D.days.findIndex((day) => day.date === $("chart-date").value);
    if (index >= 0) selectChartDay(index);
  });
  const chartObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 80);
  });
  chartObserver.observe($("activity-chart"));
  selectChartDay(peakDayIndex);

  function showDetail(type, id) {
    let html = "",
      label = "";
    if (type === "person" && profiles.has(id)) {
      const p = profiles.get(id),
        max = Math.max(...Object.values(p.monthly)),
        related = D.scenes.filter((scene) => scene.peopleIds.includes(p.id));
      label = p.bot ? "Бот в истории закупочки" : "Действующее лицо";
      html = `<h2 class="dialog-title" id="detail-title">${E(p.name)}</h2><p class="dialog-role">${E(p.role)}</p><p class="dialog-bio">${E(p.bio)}</p><div class="dialog-stats"><div><strong>${N(p.messages)}</strong><span>отправок</span></div><div><strong>${p.activeDays}</strong><span>активных дней</span></div><div><strong>${percent(p.share)}</strong><span>всех отправок</span></div></div><div class="dialog-section"><h3>След по месяцам</h3><div class="profile-chart">${D.months.map((month) => `<a style="--height:${Math.max(2, ((p.monthly[month.month] || 0) / max) * 100)}%" class="${p.monthly[month.month] === max ? "peak" : ""}" href="${url("chronicle", { month: month.month })}" aria-label="${E(monthLabel(month.month))}: ${p.monthly[month.month] || 0} отправок. События месяца" title="${E(monthLabel(month.month))}: ${N(p.monthly[month.month] || 0)}"></a>`).join("")}</div><div class="profile-chart-labels"><span>Сентябрь ’25</span><span>Ноябрь ’26</span></div></div>${related.length ? `<div class="dialog-section"><h3>Появляется в сценах</h3><div class="scene-list">${related.slice(0, 6).map(sceneLink).join("")}</div>${related.length > 6 ? `<p class="caption dialog-extra">Показаны 6 из ${related.length} сцен с явной опорой на это имя</p>` : ""}</div>` : ""}<div class="source-note"><span class="mono">${shortDate(p.first)} — ${shortDate(p.last)} · доступный след имени</span><p>Роль — редакторская характеристика переписки. Отображаемое имя не считается полной биографией или надёжным идентификатором человека.</p></div>`;
    } else if (type === "event" && scenes.has(id)) {
      const scene = scenes.get(id),
        era = eras.get(scene.eraId),
        related = D.arcs.filter((arc) => arc.sceneIds.includes(id));
      label = "Сцена " + id.toUpperCase();
      html = `<div class="scene-dialog-date">${dateLabel(scene.date)} · ${E(scene.kind)}</div><h2 class="dialog-title" id="detail-title">${E(scene.title)}</h2><p class="dialog-bio">${E(scene.summary)}</p><div class="source-note"><span class="mono">Опорная запись анализа № ${N(scene.ref)}</span><p>${E(factLabel(scene))}. Это номер записи в разборе экспорта, а не Telegram-ID. На сайте показан публичный пересказ, полный частный корпус не публикуется.</p></div>${scene.peopleIds.length ? `<div class="related-block"><span class="eyebrow">Действующие лица</span><div class="related-links">${relatedLinks(scene.peopleIds, profiles, "people", "person")}</div></div>` : ""}${
        related.length
          ? `<div class="related-block"><span class="eyebrow">Сюжетные связи</span><div class="related-links">${relatedLinks(
              related.map((arc) => arc.id),
              arcs,
              "memes",
              "meme",
            )}</div></div>`
          : ""
      }<div class="dialog-actions"><a class="button primary" href="${url("analysis", { era: era.id })}">Читать главу ↗</a><button class="button secondary" data-copy-link>Скопировать ссылку</button></div>`;
    } else if (type === "meme" && arcs.has(id)) {
      const arc = arcs.get(id),
        related = arc.sceneIds
          .map((id) => scenes.get(id))
          .sort((a, b) => a.date.localeCompare(b.date) || a.ref - b.ref),
        thread = D.paths.find((path) => path.arcIds.includes(id));
      label = "Мемный фонд · № " + id.slice(1);
      html = `<p class="scene-dialog-date">${E(arc.title)}</p><h2 class="dialog-title" id="detail-title">${E(arc.hook)}</h2><p class="dialog-bio">${E(arc.description)}</p><div class="dialog-stats"><div><strong>${N(arc.mentions)}</strong><span>поисковых совпадений</span></div><div><strong>${arc.days}</strong><span>дней с текстовым следом</span></div><div><strong>${related.length}</strong><span>связанных опорных сцен</span></div></div>${related.length ? `<div class="dialog-section"><h3>Как это разворачивалось</h3><div class="scene-list">${related.map(sceneLink).join("")}</div></div>` : ""}<div class="source-note"><span class="mono">${shortDate(arc.first)} — ${shortDate(arc.last)} · найденный текстовый след</span><p>Поиск по шаблону может захватывать другие контексты. Эти даты не устанавливают рождение и конец мема; хронология проверенных сцен показана отдельно.</p></div>${thread ? `<div class="dialog-actions"><a class="button primary" href="${url("thread", { id: thread.id })}">Пройти по этой нити ↗</a></div>` : ""}`;
    } else return;
    activeDetail = type;
    $("detail-type").textContent = label;
    $("detail-content").innerHTML = html;
    if (!$("detail-dialog").open) $("detail-dialog").showModal();
    $("detail-dialog").scrollTop = 0;
  }
  $("detail-dialog").addEventListener("close", () => {
    if ($("detail-dialog").open) return;
    if (activeDetail && params.has(activeDetail)) {
      params.delete(activeDetail);
      history.replaceState(null, "", url(current, Object.fromEntries(params)));
    }
    activeDetail = null;
  });
  $("detail-dialog").addEventListener("click", (event) => {
    if (event.target === $("detail-dialog")) {
      const rect = event.target.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        $("detail-dialog").close();
    }
  });
  let toastTimer;
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-copy-link]")) {
      try {
        await navigator.clipboard.writeText(location.href);
        $("toast").textContent = "Ссылка на сцену скопирована";
      } catch {
        $("toast").textContent = "Ссылка на сцену — в адресной строке браузера";
      }
      $("toast").hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => ($("toast").hidden = true), 3200);
    }
  });

  const searchIndex = [
    ...D.eras.map((era) => ({
      kind: "era",
      label: "Глава " + number(D.eras.indexOf(era)),
      title: era.title,
      body: era.summary + " " + era.paragraphs.join(" "),
      href: url("analysis", { era: era.id }),
    })),
    ...D.profiles.map((p) => ({
      kind: "person",
      label: "Действующее лицо",
      title: p.name,
      body: p.role + ". " + p.bio,
      href: url("people", { person: p.id }),
    })),
    ...D.scenes.map((scene) => ({
      kind: "scene",
      label: "Сцена · " + shortDate(scene.date),
      title: scene.title,
      body: scene.summary,
      href: url("chronicle", { event: scene.id }),
    })),
    ...D.arcs.map((arc) => ({
      kind: "meme",
      label: "Мемный фонд",
      title: arc.title,
      body: arc.hook + ". " + arc.description,
      href: url("memes", { meme: arc.id }),
    })),
    ...D.entities.map((entity) => ({
      kind: "entity",
      label: "Внешний круг",
      title: entity.name,
      body: entity.role,
      href: url("cast", { q: entity.name }),
    })),
  ];
  function drawSearch() {
    const q = norm($("global-query").value.trim()),
      terms = q.split(/\s+/).filter(Boolean);
    document
      .querySelectorAll("[data-search-kind]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.searchKind === searchKind),
        ),
      );
    if (!q) {
      $("search-count").textContent = "Ищем по всей публичной летописи";
      $("search-results").innerHTML =
        '<div class="search-empty"><p>Можно начать с местной классики</p><div class="suggestions">' +
        ["Медовуха", "Слоты", "Мира", "Домашка", "Сотка", "Норильск"]
          .map(
            (word) =>
              `<button data-suggestion="${E(word)}">${E(word)}</button>`,
          )
          .join("") +
        "</div></div>";
      return;
    }
    const result = searchIndex
      .filter(
        (item) =>
          (searchKind === "all" || item.kind === searchKind) &&
          terms.every((term) =>
            norm(item.title + " " + item.body).includes(term),
          ),
      )
      .sort(
        (a, b) =>
          Number(norm(b.title).includes(q)) - Number(norm(a.title).includes(q)),
      );
    $("search-count").textContent = "Найдено: " + result.length;
    $("search-results").innerHTML =
      result
        .map(
          (item) =>
            `<a class="search-result" href="${item.href}"><span class="result-category">${E(item.label)}</span><div><h2>${E(item.title)}</h2><p>${E(item.body.length > 240 ? item.body.slice(0, 237) + "…" : item.body)}</p></div><span aria-hidden="true">↗</span></a>`,
        )
        .join("") ||
      empty(
        "Пока не нашлось",
        "Попробуй часть слова, имя или другую формулировку. Поиск идёт по публичным пересказам, не по исходной переписке.",
      );
  }
  $("global-query").addEventListener("input", () => {
    replaceParams({ q: $("global-query").value });
    drawSearch();
  });
  document.querySelectorAll("[data-search-kind]").forEach((button) =>
    button.addEventListener("click", () => {
      searchKind = button.dataset.searchKind;
      replaceParams({ kind: searchKind });
      drawSearch();
    }),
  );
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion]");
    if (button) {
      $("global-query").value = button.dataset.suggestion;
      replaceParams({ q: button.dataset.suggestion });
      drawSearch();
    }
  });

  function setSelect(id, value, fallback) {
    $(id).value = value || fallback;
    if (!$(id).value) $(id).value = fallback;
  }
  function renderRoute() {
    const version = ++routeVersion,
      hash = location.hash.slice(1),
      at = hash.indexOf("?"),
      raw = at < 0 ? hash : hash.slice(0, at),
      query = at < 0 ? "" : hash.slice(at + 1);
    const newParams = new URLSearchParams(query),
      next = routes.has(raw) ? raw : "overview";
    const detailKey = { people: "person", chronicle: "event", memes: "meme" }[
      next
    ];
    const baseParams = (value) =>
      [...value.entries()]
        .filter(([key]) => key !== detailKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => key + "=" + val)
        .join("&");
    // A card overlays the current reading position. Keep the background DOM and native return focus.
    if (
      detailKey &&
      current === next &&
      baseParams(params) === baseParams(newParams) &&
      (newParams.has(detailKey) || $("detail-dialog").open)
    ) {
      params = newParams;
      if (params.has(detailKey)) showDetail(detailKey, params.get(detailKey));
      else {
        activeDetail = null;
        if ($("detail-dialog").open) $("detail-dialog").close();
      }
      return;
    }
    activeDetail = null;
    if ($("detail-dialog").open) $("detail-dialog").close();
    params = newParams;
    current = next;
    closeMenu();
    document
      .querySelectorAll("[data-view]")
      .forEach(
        (section) => (section.hidden = section.dataset.view !== current),
      );
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === (current === "thread" ? "analysis" : current))
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.title = "ЗакупОчка — " + names[current];
    if (current === "overview") drawOrbit();
    if (current === "analysis") drawChapter();
    if (current === "thread") drawThread();
    if (current === "people") {
      $("people-query").value = params.get("q") || "";
      setSelect("people-sort", params.get("sort"), "messages");
      setSelect("people-type", params.get("type"), "all");
      drawPeople();
    }
    if (current === "chronicle") {
      $("chronicle-query").value = params.get("q") || "";
      setSelect("chronicle-month", params.get("month"), "all");
      setSelect("chronicle-kind", params.get("kind"), "all");
      eventPage = Math.max(0, (Number(params.get("page")) || 1) - 1);
      drawChronicle();
    }
    if (current === "memes") {
      $("meme-query").value = params.get("q") || "";
      setSelect("meme-sort", params.get("sort"), "editorial");
      drawMemes();
    }
    if (current === "cast") {
      $("cast-query").value = params.get("q") || "";
      drawCast();
    }
    if (current === "numbers") {
      selectChartDay(selectedDay);
    }
    if (current === "search") {
      $("global-query").value = params.get("q") || "";
      searchKind = ["all", "era", "person", "scene", "meme", "entity"].includes(
        params.get("kind"),
      )
        ? params.get("kind")
        : "all";
      drawSearch();
    }
    $("main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      if (version !== routeVersion) return;
      if (current === "search")
        $("global-query").focus({ preventScroll: true });
      if (current === "people" && params.has("person"))
        showDetail("person", params.get("person"));
      if (current === "chronicle" && params.has("event"))
        showDetail("event", params.get("event"));
      if (current === "memes" && params.has("meme"))
        showDetail("meme", params.get("meme"));
    });
  }
  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link && link.getAttribute("href") === location.hash) {
      event.preventDefault();
      renderRoute();
    }
  });
  renderRoute();
})();
