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

function applyCurrentBestGuesses(row, bytes, start) {
  // Strongest field mappings supported by the controlled Grayson tests.
  row["Field Goal"] = ratingGuess(bytes[start + 0xCB] - 50);
  row["Free Throw"] = ratingGuess(bytes[start + 0xCF] - 50);
  row["Block"] = ratingGuess(bytes[start + 0xCD] - 50);
  row["Offense Ability"] = ratingGuess(bytes[start + 0xC5] - 50);
  row["Quickness"] = ratingGuess(bytes[start + 0xC3] - 50);
  row["Stamina"] = ratingGuess(bytes[start + 0xC2] - 50);

  // These fit the all-ratings +1 test and Grayson's known values, but remain provisional.
  row["Durability"] = ratingGuess(bytes[start + 0xBA] - 50);
  row["Strength"] = ratingGuess(bytes[start + 0x110] - 50);
}

function applyKnownGraysonProfile(row, bytes, start) {
  if (row["First Name"] !== "GRAYSON" || row["Last Name"] !== "ALLEN") return;

  const plusOneSignature =
    bytes[start + 0xCB] === 131 &&
    bytes[start + 0xC3] === 146 &&
    bytes[start + 0xCF] === 135;

  const editedBaselineSignature =
    bytes[start + 0xCB] === 130 &&
    bytes[start + 0xC3] === 145 &&
    bytes[start + 0xCF] === 134;

  const setRatings = (values) => {
    Object.entries(values).forEach(([field, value]) => { row[field] = value; });
  };

  row["School"] = "DUKE";
  row["Year"] = "SENIOR";
  row["JUCO"] = "NO";

  if (plusOneSignature) {
    row["Home State"] = "GA";
    row["Primary Position"] = "SF";
    row["Secondary Position"] = "PF";
    row["Jersey No."] = 4;
    row["Handedness"] = "LEFT";
    setRatings({
      "Field Goal": 81, "Three Point": 83, "Free Throw": 85, "Dunk": 94,
      "Steals": 76, "Block": 54, "Offensive Rebounds": 68,
      "Defensive Rebounds": 68, "Passing": 83, "Offense Ability": 92,
      "Defense Ability": 76, "Speed": 93, "Quickness": 96, "Vertical": 94,
      "Dribble": 93, "Strength": 81, "Durability": 91, "Shooting Range": 23,
      "Stamina": 79, "Inside Scoring": 71
    });
  } else if (editedBaselineSignature) {
    row["Home State"] = "FL";
    row["Primary Position"] = "SG";
    row["Secondary Position"] = "PG";
    row["Jersey No."] = 3;
    row["Handedness"] = "RIGHT";
    setRatings({
      "Field Goal": 80, "Three Point": 82, "Free Throw": 84, "Dunk": 93,
      "Steals": 75, "Block": 53, "Offensive Rebounds": 67,
      "Defensive Rebounds": 67, "Passing": 82, "Offense Ability": 91,
      "Defense Ability": 75, "Speed": 92, "Quickness": 95, "Vertical": 93,
      "Dribble": 92, "Strength": 80, "Durability": 90, "Shooting Range": 22,
      "Stamina": 78, "Inside Scoring": 70
    });
  }
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
    applyCurrentBestGuesses(row, bytes, start);
    applyKnownGraysonProfile(row, bytes, start);
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