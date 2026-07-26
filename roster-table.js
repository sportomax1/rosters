"use strict";

const rosterUi = {
  source: document.getElementById("rosterSource"),
  scan: document.getElementById("scanRoster"),
  search: document.getElementById("rosterSearch"),
  limit: document.getElementById("rosterLimit"),
  export: document.getElementById("exportRosterCsv"),
  summary: document.getElementById("rosterSummary"),
  rows: document.getElementById("rosterRows")
};

const rosterState = { players: [], filtered: [] };
const RECORD_SIZE = 268;
const FIRST_NAME_OFFSET = 0xD0;
const LAST_NAME_OFFSET = 0xFB;

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
  if (!ended || text.length < 2 || text.length > 24) return "";
  if (!/[A-Z]/.test(text)) return "";
  return text;
}

function validGuess(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99 ? value : null;
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

    const rawBA = bytes[start + 0xBA];
    const rawCB = bytes[start + 0xCB];
    const rawCE = bytes[start + 0xCE];
    const rawFA = bytes[start + 0xFA];
    const fieldGoal = validGuess(rawCB - 50);
    const insideScoring = validGuess(210 - rawBA);

    found.push({
      first, last, name: `${first} ${last}`, start,
      fieldGoal, insideScoring,
      overallRaw: rawFA, statusRaw: rawCE,
      rawBA, rawCB, rawCE, rawFA
    });

    start += FIRST_NAME_OFFSET;
  }
  return found;
}

function formatMaybe(value) {
  return value === null ? "—" : String(value);
}

function renderRoster() {
  const query = rosterUi.search.value.trim().toUpperCase();
  const limit = Number(rosterUi.limit.value) || 500;
  rosterState.filtered = rosterState.players.filter((player) => !query || player.name.includes(query));
  const shown = rosterState.filtered.slice(0, limit);

  if (!shown.length) {
    rosterUi.rows.innerHTML = `<tr><td colspan="10" class="empty-state">${rosterState.players.length ? "No matching players." : "No roster scanned yet."}</td></tr>`;
  } else {
    rosterUi.rows.innerHTML = shown.map((player) => `
      <tr${player.name === "GRAYSON ALLEN" ? ' class="test-subject"' : ""}>
        <td><strong>${escapeHtml(player.name)}</strong>${player.name === "GRAYSON ALLEN" ? '<span class="test-chip">test subject</span>' : ""}</td>
        <td><code>0x${hex(player.start, 8)}</code></td>
        <td class="guess-cell">${formatMaybe(player.fieldGoal)}</td>
        <td class="guess-cell">${formatMaybe(player.insideScoring)}</td>
        <td>${player.overallRaw}</td>
        <td>${player.statusRaw}</td>
        <td>${player.rawBA}</td>
        <td>${player.rawCB}</td>
        <td>${player.rawCE}</td>
        <td>${player.rawFA}</td>
      </tr>`).join("");
  }

  const suffix = rosterState.filtered.length > shown.length ? ` Showing first ${shown.length.toLocaleString()}.` : "";
  rosterUi.summary.innerHTML = rosterState.players.length
    ? `<strong>${rosterState.players.length.toLocaleString()} player-like records detected.</strong> ${rosterState.filtered.length.toLocaleString()} match the current search.${suffix}`
    : "No player records detected with the current 268-byte record assumption.";
}

function scanSelectedRoster() {
  const slot = rosterUi.source.value;
  const bytes = state.bytes[slot];
  if (!bytes) {
    rosterUi.summary.textContent = `Load File ${slot} first.`;
    return;
  }
  rosterUi.scan.disabled = true;
  rosterUi.summary.textContent = "Scanning player records…";
  setTimeout(() => {
    rosterState.players = scanPlayerRecords(bytes).sort((a, b) => a.name.localeCompare(b.name));
    rosterUi.export.disabled = rosterState.players.length === 0;
    rosterUi.scan.disabled = false;
    renderRoster();
  }, 20);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRosterCsv() {
  const header = ["Player", "Record Offset", "Field Goal Guess", "Inside Scoring Guess", "Overall Raw", "Status Raw", "Raw +BA", "Raw +CB", "Raw +CE", "Raw +FA"];
  const rows = rosterState.filtered.map((p) => [p.name, `0x${hex(p.start, 8)}`, p.fieldGoal ?? "", p.insideScoring ?? "", p.overallRaw, p.statusRaw, p.rawBA, p.rawCB, p.rawCE, p.rawFA]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ncaa-roster-best-guesses-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function updateRosterAvailability() {
  rosterUi.scan.disabled = !state.bytes[rosterUi.source.value];
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
setupTabs();
setInterval(updateRosterAvailability, 250);
