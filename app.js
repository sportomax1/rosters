"use strict";

const state = {
  files: { A: null, B: null },
  bytes: { A: null, B: null },
  differences: [],
  regions: [],
  selectedRegion: null
};

const $ = (id) => document.getElementById(id);
const elements = {
  fileA: $("fileA"), fileB: $("fileB"), metaA: $("metaA"), metaB: $("metaB"),
  sizeA: $("sizeA"), sizeB: $("sizeB"), changedCount: $("changedCount"), regionCount: $("regionCount"),
  compareButton: $("compareButton"), exportReport: $("exportReport"), clearAll: $("clearAll"),
  contextBytes: $("contextBytes"), mergeGap: $("mergeGap"), maxRegions: $("maxRegions"), diffRows: $("diffRows"),
  offsetInput: $("offsetInput"), bytesPerRow: $("bytesPerRow"), rowCount: $("rowCount"), inspectButton: $("inspectButton"), hexViewer: $("hexViewer"),
  searchType: $("searchType"), searchValue: $("searchValue"), searchButton: $("searchButton"), searchResults: $("searchResults"),
  experimentNotes: $("experimentNotes")
};

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function hex(value, width = 2) { return value.toString(16).toUpperCase().padStart(width, "0"); }
function offsetLabel(value) { return `0x${hex(value, 8)} (${value})`; }

async function loadFile(slot, file) {
  if (!file) return;
  const buffer = await file.arrayBuffer();
  state.files[slot] = file;
  state.bytes[slot] = new Uint8Array(buffer);
  elements[`meta${slot}`].textContent = `${file.name} • ${formatBytes(file.size)}`;
  elements[`size${slot}`].textContent = formatBytes(file.size);
  state.differences = [];
  state.regions = [];
  state.selectedRegion = null;
  updateAvailability();
  renderDiffTable();
  renderHex();
}

function updateAvailability() {
  const any = Boolean(state.bytes.A || state.bytes.B);
  const both = Boolean(state.bytes.A && state.bytes.B);
  elements.compareButton.disabled = !both;
  elements.inspectButton.disabled = !any;
  elements.searchButton.disabled = !any;
  elements.exportReport.disabled = state.regions.length === 0;
}

function compareFiles() {
  const a = state.bytes.A;
  const b = state.bytes.B;
  if (!a || !b) return;
  const limit = Math.max(a.length, b.length);
  const differences = [];
  for (let i = 0; i < limit; i += 1) {
    const av = i < a.length ? a[i] : null;
    const bv = i < b.length ? b[i] : null;
    if (av !== bv) differences.push(i);
  }
  state.differences = differences;
  state.regions = buildRegions(differences, Number(elements.mergeGap.value) || 0);
  state.selectedRegion = state.regions[0] || null;
  elements.changedCount.textContent = differences.length.toLocaleString();
  elements.regionCount.textContent = state.regions.length.toLocaleString();
  updateAvailability();
  renderDiffTable();
  if (state.selectedRegion) {
    elements.offsetInput.value = `0x${hex(Math.max(0, state.selectedRegion.start - Number(elements.contextBytes.value || 0)), 8)}`;
  }
  renderHex();
}

function buildRegions(offsets, mergeGap) {
  if (!offsets.length) return [];
  const regions = [];
  let start = offsets[0];
  let end = offsets[0];
  for (let i = 1; i < offsets.length; i += 1) {
    const current = offsets[i];
    if (current - end <= mergeGap + 1) end = current;
    else { regions.push({ start, end, length: end - start + 1 }); start = current; end = current; }
  }
  regions.push({ start, end, length: end - start + 1 });
  return regions;
}

function bytesPreview(bytes, start, end, max = 24) {
  if (!bytes) return "—";
  const values = [];
  const cappedEnd = Math.min(end, start + max - 1, bytes.length - 1);
  for (let i = start; i <= cappedEnd; i += 1) values.push(hex(bytes[i]));
  if (end > cappedEnd) values.push("…");
  return values.join(" ");
}

function renderDiffTable() {
  if (!state.bytes.A || !state.bytes.B) {
    elements.diffRows.innerHTML = '<tr><td colspan="6" class="empty-state">Load two files and run Compare.</td></tr>';
    return;
  }
  if (!state.regions.length && state.differences.length === 0) {
    elements.diffRows.innerHTML = '<tr><td colspan="6" class="empty-state">No differences calculated yet, or the files are identical.</td></tr>';
    return;
  }
  const max = Math.max(10, Number(elements.maxRegions.value) || 500);
  elements.diffRows.innerHTML = state.regions.slice(0, max).map((region, index) => `
    <tr data-region="${index}">
      <td>${index + 1}</td>
      <td><code>${offsetLabel(region.start)}</code></td>
      <td><code>${offsetLabel(region.end)}</code></td>
      <td>${region.length}</td>
      <td><code>${bytesPreview(state.bytes.A, region.start, region.end)}</code></td>
      <td><code>${bytesPreview(state.bytes.B, region.start, region.end)}</code></td>
    </tr>`).join("");
  elements.diffRows.querySelectorAll("tr[data-region]").forEach((row) => {
    row.addEventListener("click", () => selectRegion(Number(row.dataset.region)));
  });
}

function parseOffset(value) {
  const text = String(value).trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function selectRegion(index) {
  const region = state.regions[index];
  if (!region) return;
  state.selectedRegion = region;
  const context = Number(elements.contextBytes.value) || 0;
  elements.offsetInput.value = `0x${hex(Math.max(0, region.start - context), 8)}`;
  renderHex();
  elements.hexViewer.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderHex() {
  const bytesA = state.bytes.A;
  const bytesB = state.bytes.B;
  if (!bytesA && !bytesB) {
    elements.hexViewer.innerHTML = '<p class="empty-state">Load at least one file to inspect bytes.</p>';
    return;
  }
  const start = parseOffset(elements.offsetInput.value);
  const perRow = Number(elements.bytesPerRow.value) || 16;
  const rows = Number(elements.rowCount.value) || 16;
  const maxLength = Math.max(bytesA?.length || 0, bytesB?.length || 0);
  const changed = new Set(state.differences);
  const selected = state.selectedRegion;
  const renderFile = (label, bytes) => {
    if (!bytes) return "";
    const output = [`<h3>${label}</h3>`];
    for (let row = 0; row < rows; row += 1) {
      const rowStart = start + row * perRow;
      if (rowStart >= maxLength) break;
      const byteCells = [];
      const ascii = [];
      for (let col = 0; col < perRow; col += 1) {
        const offset = rowStart + col;
        if (offset < bytes.length) {
          const value = bytes[offset];
          const classes = ["hex-byte"];
          if (changed.has(offset)) classes.push("changed");
          if (selected && offset >= selected.start && offset <= selected.end) classes.push("selected");
          byteCells.push(`<span class="${classes.join(" ")}" title="${offsetLabel(offset)}">${hex(value)}</span>`);
          ascii.push(value >= 32 && value <= 126 ? String.fromCharCode(value) : ".");
        } else { byteCells.push('<span class="hex-byte">  </span>'); ascii.push(" "); }
      }
      output.push(`<div class="hex-row"><span class="hex-offset">${hex(rowStart, 8)}</span><span>${byteCells.join(" ")}</span><span class="ascii">${escapeHtml(ascii.join(""))}</span></div>`);
    }
    return output.join("");
  };
  elements.hexViewer.innerHTML = `${renderFile("File A", bytesA)}${renderFile("File B", bytesB)}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function searchBytes(haystack, needle, limit = 1000) {
  const matches = [];
  if (!needle.length || needle.length > haystack.length) return matches;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    matches.push(i);
    if (matches.length >= limit) break;
  }
  return matches;
}

function searchNeedle() {
  const type = elements.searchType.value;
  const raw = elements.searchValue.value.trim();
  if (!raw) throw new Error("Enter a search value.");
  if (type === "ascii") return new TextEncoder().encode(raw);
  if (type === "hex") {
    const clean = raw.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
    if (!clean.length || clean.length % 2 !== 0) throw new Error("Hex search must contain complete byte pairs.");
    return Uint8Array.from(clean.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
  }
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 0) throw new Error("Enter a non-negative integer.");
  const widths = { uint8: 1, uint16le: 2, uint16be: 2, uint32le: 4, uint32be: 4 };
  const width = widths[type];
  const max = width === 4 ? 0xFFFFFFFF : (2 ** (8 * width)) - 1;
  if (number > max) throw new Error(`Value exceeds the ${width * 8}-bit range.`);
  const buffer = new ArrayBuffer(width);
  const view = new DataView(buffer);
  if (width === 1) view.setUint8(0, number);
  if (width === 2) view.setUint16(0, number, type.endsWith("le"));
  if (width === 4) view.setUint32(0, number, type.endsWith("le"));
  return new Uint8Array(buffer);
}

function performSearch() {
  try {
    const needle = searchNeedle();
    const results = [];
    for (const slot of ["A", "B"]) {
      const bytes = state.bytes[slot];
      if (!bytes) continue;
      searchBytes(bytes, needle).forEach((offset) => results.push({ slot, offset }));
    }
    if (!results.length) {
      elements.searchResults.innerHTML = '<p class="empty-state">No matches found.</p>';
      return;
    }
    elements.searchResults.innerHTML = results.slice(0, 1000).map((result) => `
      <button class="result-item" type="button" data-offset="${result.offset}">
        <strong>File ${result.slot}</strong><br>${offsetLabel(result.offset)}
      </button>`).join("");
    elements.searchResults.querySelectorAll("[data-offset]").forEach((item) => {
      item.addEventListener("click", () => {
        elements.offsetInput.value = `0x${hex(Math.max(0, Number(item.dataset.offset) - 16), 8)}`;
        renderHex();
        elements.hexViewer.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  } catch (error) {
    elements.searchResults.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function exportReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    files: {
      A: state.files.A ? { name: state.files.A.name, size: state.files.A.size, lastModified: state.files.A.lastModified } : null,
      B: state.files.B ? { name: state.files.B.name, size: state.files.B.size, lastModified: state.files.B.lastModified } : null
    },
    notes: elements.experimentNotes.value.trim(),
    settings: {
      contextBytes: Number(elements.contextBytes.value),
      mergeGap: Number(elements.mergeGap.value)
    },
    changedByteCount: state.differences.length,
    regionCount: state.regions.length,
    regions: state.regions.map((region, index) => ({
      index: index + 1,
      ...region,
      startHex: `0x${hex(region.start, 8)}`,
      endHex: `0x${hex(region.end, 8)}`,
      fileA: bytesPreview(state.bytes.A, region.start, region.end, 512),
      fileB: bytesPreview(state.bytes.B, region.start, region.end, 512)
    }))
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `roster-diff-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  state.files = { A: null, B: null };
  state.bytes = { A: null, B: null };
  state.differences = [];
  state.regions = [];
  state.selectedRegion = null;
  elements.fileA.value = "";
  elements.fileB.value = "";
  elements.metaA.textContent = "No file loaded";
  elements.metaB.textContent = "No file loaded";
  elements.sizeA.textContent = elements.sizeB.textContent = elements.changedCount.textContent = elements.regionCount.textContent = "—";
  elements.searchResults.innerHTML = '<p class="empty-state">No search performed.</p>';
  elements.experimentNotes.value = "";
  updateAvailability();
  renderDiffTable();
  renderHex();
}

function bindDropZone(id, slot) {
  const zone = $(id);
  ["dragenter", "dragover"].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove("dragging"); }));
  zone.addEventListener("drop", (event) => loadFile(slot, event.dataTransfer.files[0]));
}

elements.fileA.addEventListener("change", () => loadFile("A", elements.fileA.files[0]));
elements.fileB.addEventListener("change", () => loadFile("B", elements.fileB.files[0]));
elements.compareButton.addEventListener("click", compareFiles);
elements.exportReport.addEventListener("click", exportReport);
elements.clearAll.addEventListener("click", clearAll);
elements.inspectButton.addEventListener("click", renderHex);
elements.searchButton.addEventListener("click", performSearch);
elements.searchValue.addEventListener("keydown", (event) => { if (event.key === "Enter") performSearch(); });
elements.maxRegions.addEventListener("change", renderDiffTable);
elements.bytesPerRow.addEventListener("change", renderHex);
elements.rowCount.addEventListener("change", renderHex);
bindDropZone("dropA", "A");
bindDropZone("dropB", "B");
updateAvailability();
