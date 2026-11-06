const fs = require("fs");
const m = JSON.parse(fs.readFileSync("jobright_extension/manifest.json", "utf8"));
m.content_scripts.forEach((cs, i) => {
  const hasChatGpt = cs.exclude_matches ? cs.exclude_matches.some(x => x.includes("chatgpt")) : false;
  console.log(`Script ${i}: js=${JSON.stringify(cs.js)} hasChatGptExclude=${hasChatGpt}`);
});
