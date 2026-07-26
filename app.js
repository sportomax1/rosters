"use strict";

const COLUMNS = [
  "File Name",
  "First Name", "Last Name", "Home State", "Primary Position", "Secondary Position",
  "Jersey No.", "Handedness", "School", "Year", "JUCO",
  "Field Goal", "Three Point", "Free Throw", "Dunk", "Steals", "Block",
  "Offensive Rebounds", "Defensive Rebounds", "Passing", "Offense Ability",
  "Defense Ability", "Speed", "Quickness", "Vertical", "Dribble", "Strength",
  "Durability", "Shooting Range", "Stamina", "Inside Scoring",
  "Headband", "Right Bicep Tattoo", "Left Bicep Tattoo", "Right Bicep Accessory",
  "Left Bicep Accessory", "Right Forearm Band", "Left Forearm Band", "Right Elbow",
  "Left Elbow", "Right Wrist Accessory", "Left Wrist Accessory", "Right Knee"
];

const RECORD_SIZE = 268;
const FIRST_NAME_OFFSET = 0xD0;
const LAST_NAME_OFFSET = 0xFB;

const CONFIRMED_RATING_OFFSETS = {
  "Field Goal": 0xCB,
  "Three Point": 0xC9,
  "Free Throw": 0xCF,
  "Dunk": 0xC7,
  "Steals": 0xC4,
  "Block": 0xCD,
  "Offensive Rebounds": 0xCC,
  "Passing": 0xBB,
  "Offense Ability": 0xC5,
  "Defense Ability": 0xBE,
  "Speed": 0xC6,
  "Quickness": 0xC3,
  "Vertical": 0xBC,
  "Dribble": 0xB8,
  "Stamina": 0xC2
};

const state = { rows: [] };
const filesInput = document.getElementById("files");
const searchInput = document.getElementById("search");
const clearButton = document.getElementById("clear");
const status = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

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
  return ended && text.length >= 2 && text.length <= 24 && /[A-Z]/.test(text) ? text : "";
}

function ratingGuess(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99 ? value : "";
}

function blankRow(fileName, firstName, lastName) {
  return {
    ...Object.fromEntries(COLUMNS.map((column) => [column, ""])),
    "File Name": fileName,
    "First Name": firstName,
    "Last Name": lastName
  };
}

function applyConfirmedRatings(row, bytes, start) {
  Object.entries(CONFIRMED_RATING_OFFSETS).forEach(([field, relativeOffset]) => {
    row[field] = ratingGuess(bytes[start + relativeOffset] - 50);
  });
}

function scanFile(fileName, bytes) {
  const rows = [];
  const maxStart = bytes.length - RECORD_SIZE;

  for (let start = 0; start <= maxStart; start += 1) {
    const firstByte = bytes[start + FIRST_NAME_OFFSET];
    const lastByte = bytes[start + LAST_NAME_OFFSET];
    if (firstByte < 65 || firstByte > 90 || lastByte < 65 || lastByte > 90) continue;

    const firstName = readFixedName(bytes, start + FIRST_NAME_OFFSET, LAST_NAME_OFFSET - FIRST_NAME_OFFSET);
    const lastName = readFixedName(bytes, start + LAST_NAME_OFFSET, RECORD_SIZE - LAST_NAME_OFFSET);
    if (!firstName || !lastName) continue;

    const row = blankRow(fileName, firstName, lastName);
    applyConfirmedRatings(row, bytes, start);
    rows.push(row);

    start += FIRST_NAME_OFFSET;
  }

  return rows;
}

function renderHeader() {
  tableHead.innerHTML = `<tr>${COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`;
}

function filteredRows() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return state.rows;
  return state.rows.filter((row) => COLUMNS.some((column) => String(row[column] ?? "").toLowerCase().includes(query)));
}

function renderTable() {
  const rows = filteredRows();
  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="${COLUMNS.length}">${state.rows.length ? "No matching rows." : "No roster data loaded."}</td></tr>`;
  } else {
    tableBody.innerHTML = rows.map((row) => `<tr>${COLUMNS.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("");
  }
  status.textContent = `${state.rows.length.toLocaleString()} total player rows; ${rows.length.toLocaleString()} shown.`;
}

async function loadFiles(fileList) {
  state.rows = [];
  const files = [...fileList];
  if (!files.length) { renderTable(); return; }

  status.textContent = `Reading ${files.length} file${files.length === 1 ? "" : "s"}...`;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    state.rows.push(...scanFile(file.name, bytes));
  }

  state.rows.sort((a, b) =>
    a["File Name"].localeCompare(b["File Name"]) ||
    a["Last Name"].localeCompare(b["Last Name"]) ||
    a["First Name"].localeCompare(b["First Name"])
  );
  renderTable();
}

filesInput.addEventListener("change", () => loadFiles(filesInput.files));
searchInput.addEventListener("input", renderTable);
clearButton.addEventListener("click", () => {
  filesInput.value = "";
  searchInput.value = "";
  state.rows = [];
  renderTable();
});

renderHeader();
renderTable();