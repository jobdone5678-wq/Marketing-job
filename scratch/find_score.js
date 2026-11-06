const fs = require("fs");
const content = fs.readFileSync("jobright_extension/helper-app.41ea2652.js", "utf8");
const lines = content.split("\n");
lines.forEach((line, idx) => {
  if (line.includes("setMatchData") || line.includes("matchData.") || line.includes("evaluateMatch")) {
    console.log(`${idx + 1}: ${line.trim().slice(0, 140)}`);
  }
});
