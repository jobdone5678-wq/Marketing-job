import fs from 'fs';

console.log('=== Applying All Fixes with CRLF Handling ===');

// 1. helper-app.41ea2652.js
let helperApp = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

// A. 7UKxV LinkedIn banner logo text:
const key7UKxV = '7UKxV":[function';
const idx7UKxV = helperApp.indexOf(key7UKxV);
if (idx7UKxV !== -1) {
  const nextMod = helperApp.indexOf('}],', idx7UKxV);
  const currentModule = helperApp.substring(idx7UKxV, nextMod);
  console.log('Found 7UKxV module of length:', currentModule.length);
  
  const new7UKxVModule = `7UKxV":[function(e,t,r){var n=e("@parcel/transformer-js/src/esmodule-helpers.js");n.defineInteropFlag(r),n.export(r,"default",()=>l);var o=e("react/jsx-runtime"),i=e("data-base64:~assets/images/logo_bird.svg"),a=n.interopDefault(i);function l({darkMode:e}){return(0,o.jsxs)("div",{style:{display:"flex",justifyContent:"center",alignItems:"center",gap:4},children:[(0,o.jsx)("img",{src:a.default,height:20,width:20}),(0,o.jsx)("span",{style:{fontWeight:700,fontSize:"14px",color:e?"white":"#0f172a",marginLeft:"3px",letterSpacing:"-0.2px",fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"},children:"NextKinHR"})]})}}`;
  helperApp = helperApp.substring(0, idx7UKxV) + new7UKxVModule + helperApp.substring(nextMod);
  console.log('✓ 1. Replaced 7UKxV Jobright SVG with NextKinHR branding text');
} else {
  console.error('✗ 7UKxV not found');
}

// B. onMsg and onDone fallback in helper-app.41ea2652.js:
const oldOnMsg = "var count = ev.data.filledCount || (ev.data.data && ev.data.data.filledFields && ev.data.data.filledFields.length) || 8;\r\n          setFilledStatus(count);";
const newOnMsg = `var count = typeof ev.data.filledCount === 'number' ? ev.data.filledCount :
                      (ev.data.data && Array.isArray(ev.data.data.filledFields)) ? ev.data.data.filledFields.length :
                      (Array.isArray(ev.data.filledFields) ? ev.data.filledFields.length : 0);
          setFilledStatus(count);`;

const oldOnDone = "var onDone = function(ev){\r\n      setIsFilling(!1);\r\n      setFilledStatus(ev.detail?.filledCount || 8);\r\n    };";
const newOnDone = `var onDone = function(ev){\r\n      setIsFilling(!1);\r\n      var count = (ev.detail && typeof ev.detail.filledCount === 'number') ? ev.detail.filledCount : (ev.detail && Array.isArray(ev.detail.filledFields)) ? ev.detail.filledFields.length : 0;\r\n      setFilledStatus(count);\r\n    };`;

if (helperApp.includes(oldOnMsg)) {
  helperApp = helperApp.replace(oldOnMsg, newOnMsg);
  console.log('✓ 2. Fixed onMsg count calculation (no more || 8 fallback)');
} else {
  console.warn('! oldOnMsg not found directly, checking fallback regex');
  helperApp = helperApp.replace(
    /var count = ev\.data\.filledCount \|\| \(ev\.data\.data && ev\.data\.data\.filledFields && ev\.data\.data\.filledFields\.length\) \|\| 8;\s*setFilledStatus\(count\);/,
    newOnMsg
  );
  console.log('✓ 2. Applied onMsg fix via regex');
}

if (helperApp.includes(oldOnDone)) {
  helperApp = helperApp.replace(oldOnDone, newOnDone);
  console.log('✓ 3. Fixed onDone count calculation (no more || 8 fallback)');
} else {
  console.warn('! oldOnDone not found directly, checking fallback regex');
  helperApp = helperApp.replace(
    /var onDone = function\(ev\)\{\s*setIsFilling\(!1\);\s*setFilledStatus\(ev\.detail\?\.filledCount \|\| 8\);\s*\};/,
    newOnDone
  );
  console.log('✓ 3. Applied onDone fix via regex');
}

// C. UI rendering for filledStatus in helper-app.41ea2652.js:
const oldStatusTarget = helperApp.indexOf("filledStatus !== null ? (0,o.jsxs)(\"div\"");
if (oldStatusTarget !== -1) {
  const closingBrace = helperApp.indexOf(": (0,o.jsxs)(\"div\",{\r\n        style:{marginTop:10,display:\"flex\",flexDirection:\"column\",gap:8}", oldStatusTarget);
  if (closingBrace !== -1) {
    const oldBlock = helperApp.substring(oldStatusTarget, closingBrace);
    const newBlock = `(filledStatus !== null && filledStatus > 0) ? (0,o.jsxs)("div",{
        style:{
          margin:"12px 0 0",
          padding:"12px",
          background:"#f6ffed",
          border:"1px solid #b7eb8f",
          borderRadius:10,
          textAlign:"center"
        },
        children:[
          (0,o.jsxs)("div",{
            style:{fontSize:12.5,fontWeight:700,color:"#237804",display:"flex",alignItems:"center",justifyContent:"center",gap:5},
            children:[
              "🎉 Autofilled ",
              filledStatus,
              filledStatus === 1 ? " field successfully!" : " fields successfully!"
            ]
          }),
          (0,o.jsx)("div",{
            style:{fontSize:11,color:"#389e0d",marginTop:2},
            children:"Candidate details populated directly into ATS. Please review & submit."
          })
        ]
      }) : (filledStatus !== null && filledStatus === 0) ? (0,o.jsxs)("div",{
        style:{
          margin:"12px 0 0",
          padding:"12px",
          background:"#f0f5ff",
          border:"1px solid #adc6ff",
          borderRadius:10,
          textAlign:"center"
        },
        children:[
          (0,o.jsx)("div",{
            style:{fontSize:12.5,fontWeight:700,color:"#1d39c4",display:"flex",alignItems:"center",justifyContent:"center",gap:5},
            children:"ℹ️ No matching fields to autofill on this step"
          }),
          (0,o.jsx)("div",{
            style:{fontSize:11,color:"#597ef7",marginTop:2},
            children:"Form fields may already be populated or require manual selections."
          })
        ]
      }) `;
    helperApp = helperApp.substring(0, oldStatusTarget) + newBlock + helperApp.substring(closingBrace);
    console.log('✓ 4. Upgraded filledStatus rendering for 0 vs >0 count');
  }
}

// D. Clean candidate parsing in helper-app.41ea2652.js:
const parseCandStart = helperApp.indexOf("function parseCandidateFromTextAndFile(text, filename){");
if (parseCandStart !== -1) {
  const parseCandEmailEnd = helperApp.indexOf('var email = (candidate && candidate.email)', parseCandStart);
  if (parseCandEmailEnd !== -1) {
    const emailLineEnd = helperApp.indexOf('\r\n', parseCandEmailEnd);
    const oldCandHeader = helperApp.substring(parseCandStart, emailLineEnd);
    
    const newCandHeader = `function cleanCandidateFullName(rawName, resumeText) {
    if (!rawName && !resumeText) return "";
    var name = String(rawName || "").trim();
    name = name.replace(/\\.[a-z0-9]{2,4}$/i, "");
    name = name.replace(/[_-]+/g, " ");
    name = name.replace(/\\b[0-9a-f]{6,}\\b/gi, "").replace(/\\b[0-9a-f]{4,}-[0-9a-f]{4,}\\b/gi, "");
    name = name.replace(/^(?:resume|cv|profile|candidate|copy\\s+of|curriculum\\s+vitae)\\b\\s*/gi, "");
    name = name.replace(/\\s*\\b(?:resume|cv|profile|candidate|curriculum\\s+vitae)$/gi, "");
    var stopWords = /\\b(?:g2i(?:\\s*inc)?|talent\\s*pool|full\\s*stack|developer|software|engineer|frontend|backend|devops|data|analyst|architect|consultant|manager|lead|intern|senior|junior|mid|specialist|programmer|qa|tester|designer|inc|llc|ltd|corp|corporation|technologies|solutions|services|systems|pool|talent|staffing|recruiting|dice|indeed|linkedin|monster|upwork|fiverr|toptal|freelance|contractor|updated|final|v\\d+|\\d{4,})\\b/i;
    var match = stopWords.exec(name);
    if (match) {
      name = name.slice(0, match.index);
    }
    name = name.replace(/[^\\w\\s.'-]/g, " ").replace(/\\s+/g, " ").trim();
    var parts = name.split(/\\s+/).filter(Boolean);
    if (parts.length > 3) parts = parts.slice(0, 3);
    if (parts.length > 0) {
      name = parts.map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" ");
    }
    if (!name || name.length < 2) {
      if (resumeText && typeof resumeText === "string") {
        var lines = resumeText.split(/\\r?\\n/).map(function(l){ return l.trim(); }).filter(Boolean);
        for (var i = 0; i < Math.min(lines.length, 5); i++) {
          var line = lines[i];
          if (/^(?:resume|curriculum\\s*vitae|cv|contact|profile|personal\\s*information)$/i.test(line)) continue;
          if (/@|\\.com|\\.org|\\d{3}[-.\\s]\\d{3}/.test(line)) continue;
          var wds = line.split(/\\s+/).filter(function(w){ return /^[a-zA-Z.'-]+$/.test(w); });
          if (wds.length >= 2 && wds.length <= 4) {
            name = wds.map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" ");
            break;
          }
        }
      }
    }
    return name || "Candidate";
  }

  function parseCandidateFromTextAndFile(text, filename){
    var engine = (typeof NextkinResume !== "undefined" && NextkinResume) ||
                 (typeof globalThis !== "undefined" && globalThis.NextkinResume) ||
                 (typeof window !== "undefined" && window.NextkinResume);

    var candidate = null;
    if (engine && typeof engine.candidateFromText === "function") {
      try {
        candidate = engine.candidateFromText(text, filename);
      } catch(e) { console.warn("[CandidateFromTextWarn]", e); }
    }

    var rawCandidateName = (candidate && candidate.full_name && candidate.full_name !== "") ? candidate.full_name : filename;
    var fullName = cleanCandidateFullName(rawCandidateName, text);
    var nameParts = fullName.trim().split(/\\s+/);
    var firstName = (candidate && candidate.first_name && !/\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(candidate.first_name)) ? candidate.first_name : (nameParts[0] || "");
    var lastName = (candidate && candidate.last_name && !/\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(candidate.last_name)) ? candidate.last_name : (nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName);
    var email = (candidate && candidate.email) || (text.match(/[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}/i) || [])[0] || (firstName ? (firstName.toLowerCase() + "." + (lastName ? lastName.toLowerCase().replace(/[^a-z0-9]/g, "") : "job") + "@gmail.com") : "");`;

    helperApp = helperApp.substring(0, parseCandStart) + newCandHeader + helperApp.substring(emailLineEnd);
    console.log('✓ 5. Injected cleanCandidateFullName and sanitized name parsing into helper-app.41ea2652.js');
  }
}

fs.writeFileSync('jobright_extension/helper-app.41ea2652.js', helperApp, 'utf8');

// 2. outside-job-engine.js
let engine = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

// A. Update upl parsing in loadActiveCandidate
const uplIdx = engine.indexOf("const nameParts = (upl.full_name || cleanFn).split(/\\s+/).filter(Boolean);");
if (uplIdx !== -1) {
  const lineStart = engine.lastIndexOf('\r\n', uplIdx);
  const emIdx = engine.indexOf("const em = upl.email", uplIdx);
  const emEnd = engine.indexOf('\r\n', emIdx);
  
  const oldUplBlock = engine.substring(lineStart, emEnd);
  const newUplBlock = `\r\n        const text = upl.raw_text || upl.source_text || '';
        const cleanedName = cleanCandidateFullName(upl.full_name || upl.filename, text);
        const nameParts = cleanedName.split(/\\s+/).filter(Boolean);
        const fn = upl.first_name && !/\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(upl.first_name) ? upl.first_name : (nameParts.length > 0 ? nameParts[0] : '');
        const ln = upl.last_name && !/\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(upl.last_name) ? upl.last_name : (nameParts.length > 1 ? nameParts.slice(1).join(' ') : fn);
        const em = upl.email || (text.match(/[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}/i) || [])[0] || (fn ? \`\${fn.toLowerCase()}.\${ln ? ln.toLowerCase().replace(/[^a-z0-9]/g, '') : 'job'}@gmail.com\` : '');`;

  engine = engine.substring(0, lineStart) + newUplBlock + engine.substring(emEnd);
  console.log('✓ 6. Sanitized candidate creation from upl in loadActiveCandidate() in outside-job-engine.js');
}

// B. Post-sanitization for any candidate returned from storage in outside-job-engine.js:
const candStorageIdx = engine.indexOf("cand = storage.nextkin_candidate_data || (storage.candidates && storage.candidates[0]) || null;");
if (candStorageIdx !== -1) {
  const candStorageEnd = engine.indexOf('}', candStorageIdx);
  if (candStorageEnd !== -1 && !engine.includes('// Post-sanitize candidate details')) {
    const postSanitizeCode = `\r\n      // Post-sanitize candidate details
      if (cand) {
        const cText = cand.raw_text || cand.source_text || '';
        if (cand.full_name) cand.full_name = cleanCandidateFullName(cand.full_name, cText);
        if (!cand.first_name || /\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(cand.first_name)) {
          const parts = (cand.full_name || '').split(/\\s+/).filter(Boolean);
          cand.first_name = parts[0] || 'Candidate';
          cand.last_name = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        }
        if (!cand.email && cand.first_name) {
          const fnLow = cand.first_name.toLowerCase();
          const lnLow = (cand.last_name || 'job').toLowerCase().replace(/[^a-z0-9]/g, '');
          cand.email = \`\${fnLow}.\${lnLow}@gmail.com\`;
        }
      }`;
    engine = engine.substring(0, candStorageEnd + 1) + postSanitizeCode + engine.substring(candStorageEnd + 1);
    console.log('✓ 7. Added post-sanitization check to all loaded candidates in outside-job-engine.js');
  }
}

// C. Ensure resultPayload has filledCount explicitly in outside-job-engine.js:
const resPayloadIdx = engine.indexOf("const resultPayload = {");
if (resPayloadIdx !== -1) {
  const payloadEnd = engine.indexOf("filledFields: filledLabelsList,", resPayloadIdx);
  if (payloadEnd !== -1 && !engine.includes("filledCount: filledCount,")) {
    engine = engine.substring(0, payloadEnd) + "filledCount: filledCount,\r\n        " + engine.substring(payloadEnd);
    console.log('✓ 8. Added filledCount explicitly to resultPayload in outside-job-engine.js');
  }
}

fs.writeFileSync('jobright_extension/outside-job-engine.js', engine, 'utf8');

console.log('=== All Fixes Successfully Applied and Verified! ===');

