const fs = require("fs");
const path = require("path");

function searchFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, "utf8");
    if (content.includes("Saved to NextKinHR") ||
        content.includes("Saved to NextKin") ||
        content.includes("submitted! Saved") ||
        content.includes("Application for ") ||
        content.includes("NextKinHR Portal")) {
      console.log("MATCH in", filepath);
      const lines = content.split("\n");
      lines.forEach((l, i) => {
        if (l.includes("Saved to NextKin") || l.includes("submitted!") || l.includes("NextKinHR Portal")) {
          console.log(`  Line ${i+1}: ${l.trim().slice(0, 150)}`);
        }
      });
    }
  } catch (e) {}
}

function scanDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f === "node_modules" || f === ".git" || f === ".next") continue;
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) scanDir(full);
      else if (/\.(js|ts|tsx|html|json)$/.test(f)) searchFile(full);
    }
  } catch (e) {}
}

console.log("Scanning workspace...");
scanDir(".");
console.log("Scanning Desktop/jobright_extension...");
scanDir("C:\\Users\\bharg\\OneDrive\\Desktop\\jobright_extension");
console.log("Scanning Chrome extensions dir...");
const chromeExtDir = "C:\\Users\\bharg\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions";
if (fs.existsSync(chromeExtDir)) {
  console.log("Found Chrome extensions dir:", chromeExtDir);
}
