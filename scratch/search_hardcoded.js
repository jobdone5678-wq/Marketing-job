const fs = require("fs");
const path = require("path");

function scan(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f === "node_modules" || f === ".git" || f === ".next") continue;
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) scan(full);
        else if (/\.(js|ts|tsx|json|mjs)$/.test(full)) {
          const txt = fs.readFileSync(full, "utf8");
          const matches = txt.match(/bhargav[^\s"'`,;)]*/gi);
          if (matches) {
            console.log(full, [...new Set(matches)]);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

scan(".");
