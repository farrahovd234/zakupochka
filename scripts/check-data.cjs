"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(root, "data.js"), "utf8"),
  context,
);
const d = context.window.ZAKU_DATA;
const ids = (key) => new Set(d[key].map((item) => item.id));
assert.equal(d.profiles.length, 32);
assert.equal(d.scenes.length, 174);
assert.equal(d.arcs.length, 63);
assert.equal(d.entities.length, 76);
assert.equal(d.eras.length, 9);
assert.equal(d.paths.length, 10);
assert.equal(d.days.length, 417);
assert.equal(d.profiles.filter((p) => p.bot).length, 3);
for (const key of ["profiles", "scenes", "arcs", "entities", "eras", "paths"])
  assert.equal(ids(key).size, d[key].length, `duplicate ${key} ID`);
for (const key of ["profiles", "days", "months"])
  assert.equal(
    d[key].reduce((n, x) => n + x.messages, 0),
    108241,
    `${key} total`,
  );
assert.equal(
  d.eras.reduce((n, x) => n + x.stats.messages, 0),
  108241,
);
const dayAfter = (value) =>
  new Date(Date.parse(value + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
for (let i = 1; i < d.days.length; i++)
  assert.equal(d.days[i].date, dayAfter(d.days[i - 1].date));
assert.equal(d.eras[0].start, d.period.from);
assert.equal(d.eras.at(-1).end, d.period.to);
for (let i = 1; i < d.eras.length; i++)
  assert.equal(d.eras[i].start, dayAfter(d.eras[i - 1].end), "era gap/overlap");
for (const era of d.eras) {
  assert.equal(
    era.stats.messages,
    d.days
      .filter((day) => era.start <= day.date && day.date <= era.end)
      .reduce((n, x) => n + x.messages, 0),
  );
  for (const id of era.sceneIds) assert(ids("scenes").has(id));
  for (const id of era.peopleIds) assert(ids("profiles").has(id));
  for (const id of era.arcIds) assert(ids("arcs").has(id));
}
for (const scene of d.scenes) {
  assert(
    scene.summary.length > 0 && Number.isInteger(scene.ref) && scene.ref > 0,
  );
  const era = d.eras.find((e) => e.id === scene.eraId);
  assert(era && era.start <= scene.date && scene.date <= era.end);
  for (const id of scene.peopleIds) assert(ids("profiles").has(id));
}
for (const arc of d.arcs)
  for (const id of arc.sceneIds) assert(ids("scenes").has(id));
for (const thread of d.paths) {
  for (const [key, collection] of [
    ["sceneIds", "scenes"],
    ["personIds", "profiles"],
    ["arcIds", "arcs"],
  ])
    for (const id of thread[key]) assert(ids(collection).has(id));
}
for (const profile of d.profiles)
  assert.equal(
    Object.values(profile.monthly).reduce((n, v) => n + v, 0),
    profile.messages,
  );
const json = JSON.stringify(d);
// Exact archive display name explicitly retained at the user's request.
const originalAddressNick = "Сыромолотова 18 Новосинарский бульвар 7";
const privacyScan = json.replaceAll(originalAddressNick, "");
assert.equal(d.profiles.find((p) => p.id === "p07").name, originalAddressNick);
assert.equal(d.profiles.find((p) => p.id === "p18").name, "/219");
assert.equal(d.profiles.find((p) => p.id === "p25").name, "Адель");
for (const pattern of [
  /\/home\//,
  /file:\/\//,
  /Сыромолотова\s+18/,
  /Новосинарский/,
  /\b(?:github_pat_|ghp_|sk-)[A-Za-z0-9]{16,}/,
  /(?<!\w)@[A-Za-z][A-Za-z0-9_]{2,}/,
  /(?<!\d)(?:\+7|8)[ ()-]*(?:\d[ ()-]*){10}(?!\d)/,
])
  assert(!pattern.test(privacyScan), `private data pattern: ${pattern}`);
for (const field of ['"message_id"', '"reply_n"', '"forward_name"', '"text":'])
  assert(!json.includes(field), `raw corpus field: ${field}`);
assert.equal(d.entities.find((e) => e.id === "x12").name, "Тарасов");
assert.equal(d.entities.find((e) => e.id === "x25").name, "Борисов");
assert.equal(d.entities.find((e) => e.id === "x31").name, "Охотников");
assert(d.entities.find((e) => e.id === "x51").name.includes("литературные"));
console.log(
  "Data verified: 417 days, 9 contiguous eras, 174 scenes, 63 arcs, 32 profiles, 76 external records, 10 linked routes; public fields only.",
);
