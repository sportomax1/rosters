"use strict";

const rosterUi = {
  source: document.getElementById("rosterSource"),
  scan: document.getElementById("scanRoster"),
  search: document.getElementById("rosterSearch"),
  limit: document.getElementById("rosterLimit"),
  export: document.getElementById("exportRosterCsv"),
  summary: document.getElementById("rosterSummary"),
  head: document.getElementById("rosterHead"),
  rows: document.getElementById("rosterRows")
};

const rosterState = { players: [], filtered: [] };
const RECORD_SIZE = 268;
const FIRST_NAME_OFFSET = 0xD0;
const LAST_NAME_OFFSET = 0xFB;

const FIELD_GROUPS = [
  {
    label: "Basic Information",
    fields: [
      ["first", "First Name"], ["last", "Last Name"], ["homeState", "Home State"],
      ["primaryPosition", "Primary Position"], ["secondaryPosition", "Secondary Position"],
      ["jerseyNumber", "Jersey No."], ["handedness", "Handedness"], ["school", "School"],
      ["year", "Year"], ["juco", "JUCO"]
    ]
  },
  {
    label: "Player Ratings",
    fields: [
      ["fieldGoal", "Field Goal"], ["threePoint", "Three Point"], ["freeThrow", "Free Throw"],
      ["dunk", "Dunk"], ["steals", "Steals"], ["block", "Block"],
      ["offensiveRebounds", "Off. Rebounds"], ["defensiveRebounds", "Def. Rebounds"],
      ["passing", "Passing"], ["offenseAbility", "Offense Ability"],
      ["defenseAbility", "Defense Ability"], ["speed", "Speed"], ["quickness", "Quickness"],
      ["vertical", "Vertical"], ["dribble", "Dribble"], ["strength", "Strength"],
      ["durability", "Durability"], ["shootingRange", "Shooting Range"],
      ["stamina", "Stamina"], ["insideScoring", "Inside Scoring"]
    ]
  },
  {
    label: "Accessories",
    fields: [
      ["headband", "Headband"], ["rightBicepTattoo", "Right Bicep Tattoo"],
      ["leftBicepTattoo", "Left Bicep Tattoo"], ["rightBicepAccessory", "Right Bicep Accessory"],
      ["leftBicepAccessory", "Left Bicep Accessory"], ["rightForearmBand", "Right Forearm Band"],
      ["leftForearmBand", "Left Forearm Band"], ["rightElbow", "Right Elbow"],
      ["leftElbow", "Left Elbow"], ["rightWristAccessory", "Right Wrist Accessory"],
      ["leftWristAccessory", "Left Wrist Accessory"], ["rightKnee", "Right Knee"]
    ]
  }
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((group) => group.fields.map(([key, label]) => ({ key, label, group: group.label })));

function isNameByte(value) {
  return (value >= 65 && value <= 90) || value === 32 || value === 39 || value === 45 || value === 46;
}

function readFixedName(bytes, offset, maxLength) {
  if (offset < 0 || offset + maxLength > bytes.length) return "";
  const chars = [];
  let ended = false;
  for (let i = 0; i < maxLength; i += 1) {
    const value = bytes[offset + i];
    if (value === 0) { ended = true; break; }
    if (!isNameByte(value)) return "";
    chars.push(String.fromCharCode(value));
  }
  const text = chars.join("").trim().replace(/\s+/g, " ");
  if (!ended || text.length < 2 || text.length > 24 || !/[A-Z]/.test(text)) return "";
  return text;
}

function validGuess(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99 ? value : null;
}

function emptyConfigurableFields() {
  return Object.fromEntries(ALL_FIELDS.map(({ key }) => [key, null]));
}

function scanPlayerRecords(bytes) {
  const found = [];
  const maxStart = bytes.length - RECORD_SIZE;
  for (let start = 0; start <= maxStart; start += 1) {
    const firstByte = bytes[start + FIRST_NAME_OFFSET];
    const lastByte = bytes[start + LAST_NAME_OFFSET];
    if (firstByte < 65 || firstByte > 90 || lastByte < 65 || lastByte > 90) continue;

    const first = readFixedName(bytes, start + FIRST_NAME_OFFSET, LAST_NAME_OFFSET - FIRST_NAME_OFFSET);
    const last = readFixedName(bytes, start + LAST_NAME_OFFSET, RECORD_SIZE - LAST_NAME_OFFSET);
    if (!first || !last) continue;

    const values = emptyConfigurableFields();
    values.first = first;
    values.last = last;
    values.fieldGoal = validGuess(bytes[start + 0xCB] - 50);
    values.insideScoring = validGuess(210 - bytes[start + 0xBA]);

    found.push({
      name: `${first} ${last}`,
      start,
      values,
      source: null
    });

    start += FIRST_NAME_OFFSET;
  }
  return found;
}

function mergeForCompare(playersA, playersB) {
  const byKey = new Map();
  playersA.forEach((player) => byKey.set(`${player.start}:${player.name}`, { a: player, b: null }));
  playersB.forEach((player) => {
    const key = `${player.start}:${player.name}`;
    if (byKey.has(key)) byKey.get(key).b = player;
    else byKey.set(key, { a: null, b: player });
  });

  return [...byKey.values()].map(({ a, b }) => ({
    name: (b || a).name,
    start: (b || a).start,
    values: Object.fromEntries(ALL_FIELDS.map(({ key }) => [key, { a: a?.values[key] ?? null, b: b?.values[key] ?? null }])),
    source: "COMPARE"
  }));
}

function renderHeader() {
  rosterUi.head.innerHTML = `
    <tr class="group-header"><th rowspan="2">Record</th>${FIELD_GROUPS.map((group) => `<th colspan="${group.fields.length}">${group.label}</th>`).join("")}</tr>
    <tr>${FIELD_GROUPS.flatMap((group) => group.fields.map(([, label]) => `<th>${escapeHtml(label)}</th>`)).join("")}</tr>`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function displayCompare(pair) {
  if (!pair || (pair.a === null && pair.b === null)) return "—";
  if (pair.a === pair.b) return displayValue(pair.a);
  return `<span class="changed-value">${displayValue(pair.a)} → ${displayValue(pair.b)}</span>`;
}

function renderRoster() {
  const query = rosterUi.search.value.trim().toUpperCase();
  const limit = Number(rosterUi.limit.value) || 500;
  rosterState.filtered = rosterState.players.filter((player) => !query || player.name.includes(query));
  const shown = rosterState.filtered.slice(0, limit);
  const colspan = ALL_FIELDS.length + 1;

  if (!shown.length) {
    rosterUi.rows.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${rosterState.players.length ? "No matching players." : "No roster scanned yet."}</td></tr>`;
  } else {
    rosterUi.rows.innerHTML = shown.map((player) => `
      <tr${player.name === "GRAYSON ALLEN" ? ' class="test-subject"' : ""}>
        <td class="sticky-record"><code>0x${hex(player.start, 8)}</code></td>
        ${ALL_FIELDS.map(({ key }) => `<td>${player.source === "COMPARE" ? displayCompare(player.values[key]) : displayValue(player.values[key])}</td>`).join("")}
      </tr>`).join("");
  }

  const suffix = rosterState.filtered.length > shown.length ? ` Showing first ${shown.length.toLocaleString()}.` : "";
  rosterUi.summary.innerHTML = rosterState.players.length
    ? `<strong>${rosterState.players.length.toLocaleString()} player rows built.</strong> ${rosterState.filtered.length.toLocaleString()} match the current search.${suffix} ${rosterUi.source.value === "COMPARE" ? "Changed mapped values are shown as A → B." : ""}`
    : "No player records detected with the current 268-byte record assumption.";
}

function scanSelectedRoster() {
  const source = rosterUi.source.value;
  if (source === "COMPARE" && (!state.bytes.A || !state.bytes.B)) {
    rosterUi.summary.textContent = "Load both File A and File B to compare.";
    return;
  }
  if (source !== "COMPARE" && !state.bytes[source]) {
    rosterUi.summary.textContent = `Load File ${source} first.`;
    return;
  }

  rosterUi.scan.disabled = true;
  rosterUi.summary.textContent = "Building player database preview…";
  setTimeout(() => {
    if (source === "COMPARE") {
      rosterState.players = mergeForCompare(scanPlayerRecords(state.bytes.A), scanPlayerRecords(state.bytes.B));
    } else {
      rosterState.players = scanPlayerRecords(state.bytes[source]).map((player) => ({ ...player, source }));
    }
    rosterState.players.sort((a, b) => a.name.localeCompare(b.name));
    rosterUi.export.disabled = rosterState.players.length === 0;
    rosterUi.scan.disabled = false;
    renderRoster();
  }, 20);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCell(player, key) {
  if (player.source !== "COMPARE") return player.values[key] ?? "";
  const pair = player.values[key];
  if (!pair || (pair.a === null && pair.b === null)) return "";
  return pair.a === pair.b ? (pair.a ?? "") : `${pair.a ?? ""} -> ${pair.b ?? ""}`;
}

function exportRosterCsv() {
  const header = ["Record Offset", ...ALL_FIELDS.map(({ label }) => label)];
  const rows = rosterState.filtered.map((player) => [`0x${hex(player.start, 8)}`, ...ALL_FIELDS.map(({ key }) => exportCell(player, key))]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ncaa-configurable-player-table-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function updateRosterAvailability() {
  const source = rosterUi.source.value;
  rosterUi.scan.disabled = source === "COMPARE" ? !(state.bytes.A && state.bytes.B) : !state.bytes[source];
}

function setupTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab-view").forEach((view) => view.classList.toggle("active", view.id === `tab-${button.dataset.tab}`));
    });
  });
}

rosterUi.scan.addEventListener("click", scanSelectedRoster);
rosterUi.search.addEventListener("input", renderRoster);
rosterUi.limit.addEventListener("change", renderRoster);
rosterUi.source.addEventListener("change", updateRosterAvailability);
rosterUi.export.addEventListener("click", exportRosterCsv);
renderHeader();
setupTabs();
setInterval(updateRosterAvailability, 250);