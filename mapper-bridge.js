"use strict";

// File reads are asynchronous. Keep the mapper button synchronized after either
// SYS-DATA file finishes loading without coupling the core comparer to the mapper.
setInterval(() => {
  if (typeof updateMapperAvailability === "function") updateMapperAvailability();
}, 250);
