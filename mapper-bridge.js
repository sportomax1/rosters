"use strict";

// File reads are asynchronous. Keep the mapper button synchronized after either
// SYS-DATA file finishes loading without coupling the core comparer to the mapper.
setInterval(() => {
  if (typeof updateMapperAvailability === "function") updateMapperAvailability();
}, 250);

// Ignore blank rating rows instead of interpreting empty inputs as zeroes.
if (typeof getVisibleStats === "function") {
  getVisibleStats = function getVisibleStatsSafe() {
    return [...mapper.statRows.querySelectorAll("tr")].map((row) => {
      const beforeInput = row.querySelector(".mapper-stat-before");
      const afterInput = row.querySelector(".mapper-stat-after");
      if (beforeInput.value.trim() === "" || afterInput.value.trim() === "") return null;
      return {
        field: row.querySelector(".mapper-stat-field").value,
        before: Number(beforeInput.value),
        after: Number(afterInput.value)
      };
    }).filter((item) => item && Number.isFinite(item.before) && Number.isFinite(item.after));
  };
}
