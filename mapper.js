"use strict";

const mapperState = {
  candidates: [],
  record: null,
  savedMappings: loadSavedMappings()
};

const RATING_FIELDS = [
  "Field Goal", "Three Point", "Free Throw", "Dunk", "Steals", "Block",
  "Offensive Rebounds", "Defensive Rebounds", "Passing", "Offense Ability",
  "Defense Ability", "Speed", "Quickness", "Vertical", "Dribble", "Strength",
  "Durability", "Shooting Range", "Stamina", "Inside Scoring", "Overall",
  "Status / Role", "Unknown / Derived"
];

const mapper = {
  firstName: $("mapperFirstName"), lastName: $("mapperLastName"),
  recordSize: $("mapperRecordSize"), nameOffset: $("mapperNameOffset"),
  run: $("runMapper"), preset: $("graysonPreset"), addStat: $("addStatRow"),
  statRows: $("visibleStatRows"), summary: $("mapperSummary"), rows: $("mapperRows"),
  save: $("saveMappings"), export: $("exportMappings"), import: $("importMappings"),
  savedList: $("savedMapList")
};

function loadSavedMappings() {
  try {
    const raw = localStorage.getItem("ncaa10-field-map-v1");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSavedMappings() {
  localStorage.setItem("ncaa10-field-map-v1", JSON.stringify(mapperState.savedMappings));
}

function parseFlexibleNumber(value) {
  const text = String(value ?? "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function addVisibleStatRow(field = "Field Goal", before = "", after = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><select class="mapper-stat-field">${RATING_FIELDS.slice(0, 21).map((name) => `<option${name === field ? " selected" : ""}>${name}</option>`).join("")}</select></td>
    <td><input class="mapper-stat-before" type="number" min="0" max="255" value="${before}"></td>
    <td><input class="mapper-stat-after" type="number" min="0" max="255" value="${after}"></td>
    <td><button class="icon-button remove-stat" type="button" aria-label="Remove rating">×</button></td>`;
  tr.querySelector(".remove-stat").addEventListener("click", () => tr.remove());
  mapper.statRows.appendChild(tr);
}

function getVisibleStats() {
  return [...mapper.statRows.querySelectorAll("tr")].map((row) => ({
    field: row.querySelector(".mapper-stat-field").value,
    before: Number(row.querySelector(".mapper-stat-before").value),
    after: Number(row.querySelector(".mapper-stat-after").value)
  })).filter((item) => Number.isFinite(item.before) && Number.isFinite(item.after));
}

function findAsciiMatches(bytes, text) {
  if (!bytes || !text) return [];
  return searchBytes(bytes, new TextEncoder().encode(text.toUpperCase()), 5000);
}

function locatePlayerRecord() {
  const firstName = mapper.firstName.value.trim().toUpperCase();
  const lastName = mapper.lastName.value.trim().toUpperCase();
  const recordSize = Number(mapper.recordSize.value) || 268;
  const nameRelativeOffset = parseFlexibleNumber(mapper.nameOffset.value);
  if (!firstName || !lastName) throw new Error("Enter both the first and last name.");
  if (!state.bytes.A || !state.bytes.B) throw new Error("Load both SYS-DATA files first.");
  if (nameRelativeOffset === null || nameRelativeOffset < 0 || nameRelativeOffset >= recordSize) throw new Error("The first-name offset must be inside the player record.");

  const matchesA = findAsciiMatches(state.bytes.A, firstName);
  const matchesB = new Set(findAsciiMatches(state.bytes.B, firstName));
  const shared = matchesA.filter((offset) => matchesB.has(offset));
  if (!shared.length) throw new Error(`Could not find ${firstName} in the same location in both files.`);

  const lastNeedle = new TextEncoder().encode(lastName);
  const possible = shared.map((nameOffset) => {
    const start = nameOffset - nameRelativeOffset;
    const end = start + recordSize - 1;
    if (start < 0 || end >= state.bytes.A.length || end >= state.bytes.B.length) return null;
    const lastMatchesA = searchBytes(state.bytes.A.slice(nameOffset, Math.min(end + 1, nameOffset + 100)), lastNeedle, 20);
    const changedInside = state.differences.filter((offset) => offset >= start && offset <= end);
    return { start, end, nameOffset, changedInside, lastNameFound: lastMatchesA.length > 0 };
  }).filter(Boolean);

  const ranked = possible.sort((a, b) => {
    if (a.lastNameFound !== b.lastNameFound) return a.lastNameFound ? -1 : 1;
    return b.changedInside.length - a.changedInside.length;
  });
  if (!ranked.length) throw new Error("Player text was found, but no valid record could be inferred.");
  return { ...ranked[0], firstName, lastName, recordSize, nameRelativeOffset, matchCount: possible.length };
}

function encodingGuesses(oldByte, newByte, stat) {
  const displayedDelta = stat.after - stat.before;
  const byteDelta = newByte - oldByte;
  const guesses = [];

  if (oldByte === stat.before && newByte === stat.after) guesses.push({ label: "Direct: displayed = byte", score: 100, formula: "displayed = byte" });
  if (byteDelta === displayedDelta) {
    const constant = oldByte - stat.before;
    guesses.push({ label: constant === 0 ? "Direct value" : `Constant offset: displayed = byte ${constant >= 0 ? "−" : "+"} ${Math.abs(constant)}`, score: constant === 0 ? 100 : 96, formula: `displayed = byte - (${constant})` });
  }
  if (byteDelta === -displayedDelta) {
    const sum = oldByte + stat.before;
    guesses.push({ label: `Inverse sum: displayed = ${sum} − byte`, score: 96, formula: `displayed = ${sum} - byte` });
  }
  if (byteDelta === displayedDelta * 2) {
    const constant = oldByte - stat.before * 2;
    guesses.push({ label: `Scaled ×2: displayed = (byte − ${constant}) / 2`, score: 82, formula: `displayed = (byte - ${constant}) / 2` });
  }
  if (byteDelta * 2 === displayedDelta && Number.isInteger(displayedDelta / 2)) {
    const constant = oldByte * 2 - stat.before;
    guesses.push({ label: `Half-scale: displayed = byte × 2 − ${constant}`, score: 72, formula: `displayed = byte * 2 - ${constant}` });
  }
  return guesses;
}

function knownOffsetHint(relativeOffset) {
  const known = {
    0xBA: { field: "Inside Scoring", encoding: "Likely inverse sum; Grayson test fit displayed = 210 − byte", score: 93 },
    0xCB: { field: "Field Goal", encoding: "Likely constant offset; Grayson test fit displayed = byte − 50", score: 95 },
    0xCE: { field: "Status / Role", encoding: "Likely derived from edited ratings", score: 58 },
    0xFA: { field: "Overall", encoding: "Likely derived overall-related value", score: 62 }
  };
  return known[relativeOffset] || null;
}

function analyzePlayer() {
  try {
    if (!state.differences.length) compareFiles();
    const record = locatePlayerRecord();
    const visibleStats = getVisibleStats();
    mapperState.record = record;

    const candidates = record.changedInside.map((absoluteOffset) => {
      const oldByte = state.bytes.A[absoluteOffset];
      const newByte = state.bytes.B[absoluteOffset];
      const relativeOffset = absoluteOffset - record.start;
      const matches = [];
      visibleStats.forEach((stat) => encodingGuesses(oldByte, newByte, stat).forEach((guess) => matches.push({ ...guess, field: stat.field })));
      const hint = knownOffsetHint(relativeOffset);
      if (hint) matches.push({ label: hint.encoding, formula: hint.encoding, score: hint.score, field: hint.field, knownHint: true });
      matches.sort((a, b) => b.score - a.score);
      const best = matches[0] || { field: "Unknown / Derived", label: "No exact relationship found", formula: "unknown", score: 20 };
      return { absoluteOffset, relativeOffset, oldByte, newByte, delta: newByte - oldByte, matches, selectedField: best.field, selectedEncoding: best.label, confidence: best.score };
    });

    mapperState.candidates = candidates;
    renderMapperSummary(record, visibleStats, candidates);
    renderMapperRows();
    mapper.save.disabled = candidates.length === 0;
    mapper.export.disabled = candidates.length === 0;
  } catch (error) {
    mapper.summary.innerHTML = `<h3>Analysis error</h3><p class="danger-text">${escapeHtml(error.message)}</p>`;
    mapper.rows.innerHTML = '<tr><td colspan="8" class="empty-state">Analysis could not be completed.</td></tr>';
  }
}

function renderMapperSummary(record, visibleStats, candidates) {
  const exact = candidates.filter((item) => item.confidence >= 90).length;
  mapper.summary.innerHTML = `
    <h3>${escapeHtml(record.firstName)} ${escapeHtml(record.lastName)}</h3>
    <dl class="summary-list">
      <div><dt>Record</dt><dd>${offsetLabel(record.start)} – ${offsetLabel(record.end)}</dd></div>
      <div><dt>Record size</dt><dd>${record.recordSize} bytes</dd></div>
      <div><dt>Name offset</dt><dd>0x${hex(record.nameRelativeOffset, 2)}</dd></div>
      <div><dt>Changed inside record</dt><dd>${candidates.length}</dd></div>
      <div><dt>High-confidence matches</dt><dd>${exact}</dd></div>
      <div><dt>Visible changes entered</dt><dd>${visibleStats.length}</dd></div>
    </dl>
    <p class="mapper-note">The selected record was ranked from ${record.matchCount} possible name match${record.matchCount === 1 ? "" : "es"}.</p>`;
}

function fieldOptions(selected) {
  return RATING_FIELDS.map((field) => `<option${field === selected ? " selected" : ""}>${field}</option>`).join("");
}

function confidenceLabel(score) {
  if (score >= 90) return `<span class="confidence high">High · ${score}%</span>`;
  if (score >= 65) return `<span class="confidence medium">Medium · ${score}%</span>`;
  return `<span class="confidence low">Low · ${score}%</span>`;
}

function renderMapperRows() {
  if (!mapperState.candidates.length) {
    mapper.rows.innerHTML = '<tr><td colspan="8" class="empty-state">No changed bytes were found inside the selected player record.</td></tr>';
    return;
  }
  mapper.rows.innerHTML = mapperState.candidates.map((item, index) => `
    <tr data-candidate="${index}">
      <td><code>0x${hex(item.absoluteOffset, 8)}</code></td>
      <td><code>0x${hex(item.relativeOffset, 2)}</code></td>
      <td><code>${item.oldByte} (0x${hex(item.oldByte)}) → ${item.newByte} (0x${hex(item.newByte)})</code></td>
      <td class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</td>
      <td><select class="candidate-field">${fieldOptions(item.selectedField)}</select></td>
      <td><input class="candidate-encoding" type="text" value="${escapeHtml(item.selectedEncoding)}"></td>
      <td>${confidenceLabel(item.confidence)}</td>
      <td><button class="button secondary compact inspect-candidate" type="button">Inspect</button></td>
    </tr>`).join("");

  mapper.rows.querySelectorAll("tr[data-candidate]").forEach((row) => {
    const index = Number(row.dataset.candidate);
    row.querySelector(".candidate-field").addEventListener("change", (event) => { mapperState.candidates[index].selectedField = event.target.value; });
    row.querySelector(".candidate-encoding").addEventListener("input", (event) => { mapperState.candidates[index].selectedEncoding = event.target.value; });
    row.querySelector(".inspect-candidate").addEventListener("click", () => {
      elements.offsetInput.value = `0x${hex(Math.max(0, mapperState.candidates[index].absoluteOffset - 32), 8)}`;
      renderHex();
      elements.hexViewer.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function saveCurrentMappings() {
  if (!mapperState.record) return;
  const player = `${mapperState.record.firstName} ${mapperState.record.lastName}`;
  const entries = mapperState.candidates.map((item) => ({
    player,
    recordSize: mapperState.record.recordSize,
    absoluteOffset: item.absoluteOffset,
    relativeOffset: item.relativeOffset,
    field: item.selectedField,
    encoding: item.selectedEncoding,
    confidence: item.confidence,
    evidence: `${item.oldByte} -> ${item.newByte}`
  }));
  entries.forEach((entry) => {
    const existing = mapperState.savedMappings.findIndex((item) => item.relativeOffset === entry.relativeOffset && item.field === entry.field);
    if (existing >= 0) mapperState.savedMappings[existing] = entry;
    else mapperState.savedMappings.push(entry);
  });
  persistSavedMappings();
  renderSavedMappings();
}

function renderSavedMappings() {
  if (!mapperState.savedMappings.length) {
    mapper.savedList.innerHTML = '<p class="empty-state">No saved mappings yet.</p>';
    return;
  }
  mapper.savedList.innerHTML = mapperState.savedMappings.sort((a, b) => a.relativeOffset - b.relativeOffset).map((item, index) => `
    <article class="saved-map-item">
      <div><strong>${escapeHtml(item.field)}</strong><span>Record + 0x${hex(item.relativeOffset, 2)}</span></div>
      <p>${escapeHtml(item.encoding)}</p>
      <small>${escapeHtml(item.player || "Unknown player")} · confidence ${item.confidence}% · evidence ${escapeHtml(item.evidence || "")}</small>
      <button class="icon-button delete-map" type="button" data-map-index="${index}" aria-label="Delete mapping">×</button>
    </article>`).join("");
  mapper.savedList.querySelectorAll(".delete-map").forEach((button) => button.addEventListener("click", () => {
    mapperState.savedMappings.splice(Number(button.dataset.mapIndex), 1);
    persistSavedMappings();
    renderSavedMappings();
  }));
}

function exportMappingJson() {
  const payload = {
    format: "ncaa-basketball-10-field-map",
    version: 1,
    exportedAt: new Date().toISOString(),
    currentRecord: mapperState.record,
    currentCandidates: mapperState.candidates,
    savedMappings: mapperState.savedMappings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ncaa10-field-map-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importMappingJson(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!Array.isArray(payload.savedMappings)) throw new Error("This file does not contain a savedMappings array.");
    mapperState.savedMappings = payload.savedMappings;
    persistSavedMappings();
    renderSavedMappings();
  } catch (error) {
    mapper.summary.innerHTML = `<h3>Import error</h3><p class="danger-text">${escapeHtml(error.message)}</p>`;
  }
}

function loadGraysonPreset() {
  mapper.firstName.value = "GRAYSON";
  mapper.lastName.value = "ALLEN";
  mapper.recordSize.value = "268";
  mapper.nameOffset.value = "0xD0";
  mapper.statRows.innerHTML = "";
  addVisibleStatRow("Field Goal", 67, 80);
  addVisibleStatRow("Inside Scoring", 90, 70);
  elements.experimentNotes.value = "Grayson Allen only: Field Goal 67 to 80; Inside Scoring 90 to 70. No other manual changes.";
}

function updateMapperAvailability() {
  mapper.run.disabled = !(state.bytes.A && state.bytes.B);
}

mapper.addStat.addEventListener("click", () => addVisibleStatRow());
mapper.preset.addEventListener("click", loadGraysonPreset);
mapper.run.addEventListener("click", analyzePlayer);
mapper.save.addEventListener("click", saveCurrentMappings);
mapper.export.addEventListener("click", exportMappingJson);
mapper.import.addEventListener("change", () => { if (mapper.import.files[0]) importMappingJson(mapper.import.files[0]); });
elements.fileA.addEventListener("change", updateMapperAvailability);
elements.fileB.addEventListener("change", updateMapperAvailability);

addVisibleStatRow("Field Goal");
renderSavedMappings();
updateMapperAvailability();
