const fs = require("fs");
const path = require("path");

function searchDir(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (!["node_modules", ".git", ".next"].includes(f)) {
          searchDir(full);
        }
      } else if (f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".html") || f.endsWith(".json")) {
        try {
          const content = fs.readFileSync(full, "utf8");
          if (content.includes("submitted! Saved") || content.includes("Saved to NextKin") || content.includes("🎉 Application") || content.includes("🎉 Application for")) {
            console.log("MATCH:", full);
          }
        } catch(e) {}
      }
    }
  } catch(e) {}
}

searchDir("C:\\Users\\bharg\\OneDrive\\Desktop");
console.log("Done searching Desktop.");
