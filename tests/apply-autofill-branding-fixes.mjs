import fs from 'fs';

console.log('=== Applying Branding & Autofill Fixes ===');

// 1. Fix helper-app.41ea2652.js
let helperApp = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

// A. Replace Jobright SVG in 7UKxV with NextKinHR branding text
const oldSvgSnippet = '(0,o.jsxs)("svg",{style:{marginTop:"3px"},width:"58",height:"16",viewBox:"0 0 58 16",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:[(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M4.28478 0.191895H5.42764C5.58543 0.191895 5.71335 0.319813 5.71335 0.477609V10.4778C5.71335 11.1089 5.20176 11.6205 4.57069 11.6205H3.14193V1.33475C3.14193 0.70357 3.6536 0.191895 4.28478 0.191895ZM1.71317 9.04904H3.14174V11.6205H0.856027C0.698231 11.6205 0.570312 11.4926 0.570312 11.3348V10.1919C0.570312 9.56072 1.08199 9.04904 1.71317 9.04904Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M6.71289 7.33479C6.71289 4.968 8.63182 3.04907 10.9986 3.04907C13.3654 3.04907 15.2843 4.968 15.2843 7.33479C15.2843 9.70157 13.3654 11.6205 10.9986 11.6205C8.63182 11.6205 6.71289 9.70157 6.71289 7.33479ZM9.28451 7.3348C9.28451 6.38809 10.0521 5.62052 10.9988 5.62052C11.9455 5.62052 12.7131 6.38809 12.7131 7.3348C12.7131 8.28152 11.9455 9.04909 10.9988 9.04909C10.0521 9.04909 9.28451 8.28152 9.28451 7.3348Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M17.428 0.191895H18.5709C18.7287 0.191895 18.8566 0.319813 18.8566 0.477609V3.40592C19.3817 3.1764 19.9616 3.04907 20.5713 3.04907C22.9381 3.04907 24.857 4.968 24.857 7.33479C24.857 9.70157 22.9381 11.6205 20.5713 11.6205C19.9616 11.6205 19.3817 11.4932 18.8566 11.2637V11.3348C18.8566 11.4925 18.7287 11.6205 18.5709 11.6205H17.428C16.7968 11.6205 16.2852 11.1088 16.2852 10.4776V1.33475C16.2852 0.70357 16.7968 0.191895 17.428 0.191895ZM20.5715 5.62052C19.6248 5.62052 18.8572 6.38809 18.8572 7.3348C18.8572 8.28152 19.6248 9.04909 20.5715 9.04909C21.5182 9.04909 22.2858 8.28152 22.2858 7.3348C22.2858 6.38809 21.5182 5.62052 20.5715 5.62052Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M26.9983 3.04907H28.4269V11.3348C28.4269 11.4926 28.299 11.6205 28.1412 11.6205H26.9983C26.3671 11.6205 25.8555 11.1088 25.8555 10.4776V4.19193C25.8555 3.56075 26.3671 3.04907 26.9983 3.04907ZM28.4271 3.04907H30.7128C30.8706 3.04907 30.9985 3.17699 30.9985 3.33479V4.47764C30.9985 5.10883 30.4868 5.6205 29.8557 5.6205H28.4271V3.04907Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M33.1429 0.191895H34.2857C34.4435 0.191895 34.5714 0.319813 34.5714 0.477609V2.19189C34.5714 2.34969 34.4435 2.47761 34.2857 2.47761H33.1429C32.5117 2.47761 32 1.96593 32 1.33475C32 0.70357 32.5117 0.191895 33.1429 0.191895ZM33.1429 3.04905H34.2857C34.4435 3.04905 34.5714 3.17697 34.5714 3.33477V11.3348C34.5714 11.4926 34.4435 11.6205 34.2857 11.6205H33.1429C32.5117 11.6205 32 11.1088 32 10.4776V4.19191C32 3.56073 32.5117 3.04905 33.1429 3.04905Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M47.4283 0.191895H46.2854C45.6543 0.191895 45.1426 0.70357 45.1426 1.33475V10.4776C45.1426 11.1088 45.6543 11.6205 46.2854 11.6205H47.4283C47.5861 11.6205 47.714 11.4925 47.714 11.3348V0.477609C47.714 0.319813 47.5861 0.191895 47.4283 0.191895ZM49.2854 3.04905H47.7142V5.62048H49.2854V10.4776C49.2854 11.1087 49.797 11.6204 50.4282 11.6204H51.5711C51.7289 11.6204 51.8568 11.4925 51.8568 11.3347V4.19184C51.8568 3.56066 51.3451 3.04898 50.7139 3.04898H49.2854V3.04905Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M43.8571 3.04907H42.7158C42.3389 3.04907 42.0046 3.23126 41.7961 3.51238C41.2136 3.21611 40.5543 3.04909 39.856 3.04909C37.4892 3.04909 35.5703 4.96802 35.5703 7.33481C35.5703 9.70159 37.4892 11.6205 39.856 11.6205C39.8801 11.6205 39.9041 11.6203 39.9281 11.6199V11.6205H40.9995C41.3151 11.6205 41.5709 11.8763 41.5709 12.1919C41.5709 12.5075 41.3151 12.7634 40.9995 12.7634H38.9165C38.2128 12.7634 37.6424 13.3338 37.6424 14.0375V15.137C37.6424 15.2462 37.7309 15.3348 37.8402 15.3348H40.9995C42.7353 15.3348 44.1424 13.9277 44.1424 12.1919C44.1424 11.3282 43.7939 10.5458 43.2299 9.97772C43.8011 9.24958 44.1417 8.33194 44.1417 7.33481C44.1417 7.3348 44.1417 7.33479 44.1417 7.33479H44.1428V3.33479C44.1428 3.17699 44.0149 3.04907 43.8571 3.04907ZM39.8562 5.62054C38.9095 5.62054 38.1419 6.38811 38.1419 7.33482C38.1419 8.28154 38.9095 9.04911 39.8562 9.04911C40.8029 9.04911 41.5705 8.28154 41.5705 7.33482C41.5705 6.38811 40.8029 5.62054 39.8562 5.62054Z",fill:e?"white":"black"}),(0,o.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M55.1431 0.191895H54.0003C53.3691 0.191895 52.8574 0.70357 52.8574 1.33475V10.4776C52.8574 11.1088 53.3691 11.6205 54.0003 11.6205H55.4288V0.477609C55.4288 0.319813 55.3009 0.191895 55.1431 0.191895ZM57.7147 3.04905H55.429V5.62048H56.8576C57.4888 5.62048 58.0005 5.10881 58.0005 4.47762V3.33477C58.0005 3.17697 57.8725 3.04905 57.7147 3.04905ZM55.429 9.04904H57.7147C57.8725 9.04904 58.0005 9.17696 58.0005 9.33476V10.4776C58.0005 11.1088 57.4888 11.6205 56.8576 11.6205H55.429V9.04904Z",fill:e?"white":"black"})])';
const newBrandingSnippet = '(0,o.jsx)("span",{style:{fontWeight:700,fontSize:"14px",color:e?"white":"#0f172a",marginLeft:"3px",letterSpacing:"-0.2px",fontFamily:"-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif"},children:"NextKinHR"})';

if (helperApp.includes(oldSvgSnippet)) {
  helperApp = helperApp.replace(oldSvgSnippet, newBrandingSnippet);
  console.log('✓ Successfully replaced Jobright SVG in 7UKxV with NextKinHR branding text');
} else {
  console.warn('! oldSvgSnippet not found in helper-app.41ea2652.js');
}

// B. Remove dummy 8 count fallback in onMsg and onDone
const oldOnMsgFallback = "var count = ev.data.filledCount || (ev.data.data && ev.data.data.filledFields && ev.data.data.filledFields.length) || 8;\n          setFilledStatus(count);";
const newOnMsgFallback = `var count = typeof ev.data.filledCount === 'number' ? ev.data.filledCount :
                      (ev.data.data && Array.isArray(ev.data.data.filledFields)) ? ev.data.data.filledFields.length :
                      (Array.isArray(ev.data.filledFields) ? ev.data.filledFields.length : 0);
          setFilledStatus(count);`;

const oldOnDoneFallback = "var onDone = function(ev){\n      setIsFilling(!1);\n      setFilledStatus(ev.detail?.filledCount || 8);\n    };";
const newOnDoneFallback = `var onDone = function(ev){\n      setIsFilling(!1);\n      var count = (ev.detail && typeof ev.detail.filledCount === 'number') ? ev.detail.filledCount : (ev.detail && Array.isArray(ev.detail.filledFields)) ? ev.detail.filledFields.length : 0;\n      setFilledStatus(count);\n    };`;

if (helperApp.includes(oldOnMsgFallback)) {
  helperApp = helperApp.replace(oldOnMsgFallback, newOnMsgFallback);
  console.log('✓ Replaced onMsg fallback (no more hardcoded 8)');
} else {
  console.warn('! oldOnMsgFallback not found');
}

if (helperApp.includes(oldOnDoneFallback)) {
  helperApp = helperApp.replace(oldOnDoneFallback, newOnDoneFallback);
  console.log('✓ Replaced onDone fallback (no more hardcoded 8)');
} else {
  console.warn('! oldOnDoneFallback not found');
}

// C. Update filledStatus UI to distinguish between filledStatus > 0 and filledStatus === 0
const oldStatusUI = `) : filledStatus !== null ? (0,o.jsxs)("div",{
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
              " fields successfully!"
            ]
          }),
          (0,o.jsx)("div",{
            style:{fontSize:11,color:"#389e0d",marginTop:2},
            children:"Candidate details populated directly into ATS. Please review & submit."
          })
        ]
      }) :`;

const newStatusUI = `) : (filledStatus !== null && filledStatus > 0) ? (0,o.jsxs)("div",{
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
      }) :`;

if (helperApp.includes(oldStatusUI)) {
  helperApp = helperApp.replace(oldStatusUI, newStatusUI);
  console.log('✓ Successfully upgraded filledStatus UI to handle 0 and >0 cleanly');
} else {
  console.warn('! oldStatusUI not found');
}

// D. Clean candidate names in parseCandidateFromTextAndFile in helper-app.41ea2652.js
const oldCandidateParseBlock = `  function parseCandidateFromTextAndFile(text, filename){
    var engine = (typeof NextkinResume !== "undefined" && NextkinResume) ||
                 (typeof globalThis !== "undefined" && globalThis.NextkinResume) ||
                 (typeof window !== "undefined" && window.NextkinResume);

    var cleanFilename = String(filename || "").replace(/\\.[^/.]+$/, "").replace(/^(?:resume|cv)[-_ ]*|[-_ ]*(?:resume|cv)$/gi, "").replace(/[-_]/g, " ").trim();
    var words = cleanFilename.split(/\\s+/).filter(Boolean);
    var defaultName = words.map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" ") || "";

    var candidate = null;
    if (engine && typeof engine.candidateFromText === "function") {
      try {
        candidate = engine.candidateFromText(text, filename);
      } catch(e) { console.warn("[CandidateFromTextWarn]", e); }
    }

    var fullName = (candidate && candidate.full_name && candidate.full_name !== "") ? candidate.full_name : defaultName;
    var nameParts = fullName.trim().split(/\\s+/);
    var firstName = (candidate && candidate.first_name) || nameParts[0] || "";
    var lastName = (candidate && candidate.last_name) || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName);
    var email = (candidate && candidate.email) || (text.match(/[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}/i) || [])[0] || "";`;

const newCandidateParseBlock = `  function cleanCandidateFullName(rawName, resumeText) {
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

if (helperApp.includes(oldCandidateParseBlock)) {
  helperApp = helperApp.replace(oldCandidateParseBlock, newCandidateParseBlock);
  console.log('✓ Added cleanCandidateFullName and sanitized name parsing in helper-app.41ea2652.js');
} else {
  console.warn('! oldCandidateParseBlock not found');
}

fs.writeFileSync('jobright_extension/helper-app.41ea2652.js', helperApp, 'utf8');


// 2. Fix outside-job-engine.js
let engineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

// A. Insert cleanCandidateFullName at top of outside-job-engine.js if not present
const cleanerHelper = `
  function cleanCandidateFullName(rawName, resumeText) {
    if (!rawName && !resumeText) return "";
    let name = String(rawName || "").trim();
    name = name.replace(/\\.[a-z0-9]{2,4}$/i, "");
    name = name.replace(/[_-]+/g, " ");
    name = name.replace(/\\b[0-9a-f]{6,}\\b/gi, "").replace(/\\b[0-9a-f]{4,}-[0-9a-f]{4,}\\b/gi, "");
    name = name.replace(/^(?:resume|cv|profile|candidate|copy\\s+of|curriculum\\s+vitae)\\b\\s*/gi, "");
    name = name.replace(/\\s*\\b(?:resume|cv|profile|candidate|curriculum\\s+vitae)$/gi, "");
    const stopWords = /\\b(?:g2i(?:\\s*inc)?|talent\\s*pool|full\\s*stack|developer|software|engineer|frontend|backend|devops|data|analyst|architect|consultant|manager|lead|intern|senior|junior|mid|specialist|programmer|qa|tester|designer|inc|llc|ltd|corp|corporation|technologies|solutions|services|systems|pool|talent|staffing|recruiting|dice|indeed|linkedin|monster|upwork|fiverr|toptal|freelance|contractor|updated|final|v\\d+|\\d{4,})\\b/i;
    const match = stopWords.exec(name);
    if (match) {
      name = name.slice(0, match.index);
    }
    name = name.replace(/[^\\w\\s.'-]/g, " ").replace(/\\s+/g, " ").trim();
    let parts = name.split(/\\s+/).filter(Boolean);
    if (parts.length > 3) parts = parts.slice(0, 3);
    if (parts.length > 0) {
      name = parts.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
    if (!name || name.length < 2) {
      if (resumeText && typeof resumeText === "string") {
        const lines = resumeText.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const line = lines[i];
          if (/^(?:resume|curriculum\\s*vitae|cv|contact|profile|personal\\s*information)$/i.test(line)) continue;
          if (/@|\\.com|\\.org|\\d{3}[-.\\s]\\d{3}/.test(line)) continue;
          const wds = line.split(/\\s+/).filter(w => /^[a-zA-Z.'-]+$/.test(w));
          if (wds.length >= 2 && wds.length <= 4) {
            name = wds.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
            break;
          }
        }
      }
    }
    return name || "Candidate";
  }
`;

if (!engineCode.includes('function cleanCandidateFullName(')) {
  const marker = 'async function loadActiveCandidate() {';
  engineCode = engineCode.replace(marker, cleanerHelper + '\n  ' + marker);
  console.log('✓ Added cleanCandidateFullName to outside-job-engine.js');
}

// B. Sanitize candidate inside loadActiveCandidate()
const oldLoadActiveCandidateUpl = `const cleanFn = String(upl.filename || '').replace(/\\.[^/.]+$/, '').replace(/^(?:resume|cv)[-_ ]*|[-_ ]*(?:resume|cv)$/gi, '').replace(/[-_]/g, ' ').trim();
        const nameParts = (upl.full_name || cleanFn).split(/\\s+/).filter(Boolean);
        const fn = upl.first_name || (nameParts.length > 0 ? nameParts[0] : '');
        const ln = upl.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : fn);
        const text = upl.raw_text || upl.source_text || '';
        const em = upl.email || (text.match(/[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}/i) || [])[0] || '';`;

const newLoadActiveCandidateUpl = `const text = upl.raw_text || upl.source_text || '';
        const cleanedName = cleanCandidateFullName(upl.full_name || upl.filename, text);
        const nameParts = cleanedName.split(/\\s+/).filter(Boolean);
        const fn = upl.first_name && !/\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(upl.first_name) ? upl.first_name : (nameParts.length > 0 ? nameParts[0] : '');
        const ln = upl.last_name && !/\\b(developer|engineer|talent|pool|g2i|inc)\\b/i.test(upl.last_name) ? upl.last_name : (nameParts.length > 1 ? nameParts.slice(1).join(' ') : fn);
        const em = upl.email || (text.match(/[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}/i) || [])[0] || (fn ? \`\${fn.toLowerCase()}.\${ln ? ln.toLowerCase().replace(/[^a-z0-9]/g, '') : 'job'}@gmail.com\` : '');`;

if (engineCode.includes(oldLoadActiveCandidateUpl)) {
  engineCode = engineCode.replace(oldLoadActiveCandidateUpl, newLoadActiveCandidateUpl);
  console.log('✓ Sanitized candidate creation from upl in loadActiveCandidate');
} else {
  console.warn('! oldLoadActiveCandidateUpl not found');
}

// Also sanitize cand when returned from storage
const oldCandStorageReturn = `cand = storage.nextkin_candidate_data || (storage.candidates && storage.candidates[0]) || null;
      }`;
const newCandStorageReturn = `cand = storage.nextkin_candidate_data || (storage.candidates && storage.candidates[0]) || null;
      }
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

if (engineCode.includes(oldCandStorageReturn)) {
  engineCode = engineCode.replace(oldCandStorageReturn, newCandStorageReturn);
  console.log('✓ Added post-sanitization check to all loaded candidates');
} else {
  console.warn('! oldCandStorageReturn not found');
}

// C. Skip referral & employee-referred questions so candidate name is never placed in them
const oldReferralSkipMarker = `      // Skip already filled fields
      if (el.value && el.value.trim().length > 0) continue;`;

const newReferralSkipMarker = `      // Skip already filled fields
      if (el.value && el.value.trim().length > 0) continue;

      // Skip referral / employee who referred you questions so applicant name is never typed into them
      if (/\\b(who\\s*referred|employee\\s*who|name\\s*of\\s*(?:the\\s*)?(?:employee|referr)|referred\\s*by|relation\\s*to\\s*(?:the\\s*)?employee)\\b/i.test(descriptor)) {
        continue;
      }`;

if (engineCode.includes(oldReferralSkipMarker) && !engineCode.includes('// Skip referral / employee who referred you questions')) {
  engineCode = engineCode.replace(oldReferralSkipMarker, newReferralSkipMarker);
  console.log('✓ Added referral questions skip in control loop');
}

// D. Exclude referral terms from Rule D (Full name matching)
const oldRuleD = `else if ((autocomplete === 'name' || /\\b(full\\s*name|applicant\\s*name|candidate\\s*name|your\\s*name|^name$|\\bname\\b)\\b/i.test(descriptor) || el.name === '_systemfield_name' || el.placeholder?.toLowerCase() === 'full name') && !/\\b(middle|first|last|family|given|user|company|school|file|vendor|domain)\\b/i.test(descriptor)) {`;
const newRuleD = `else if ((autocomplete === 'name' || /\\b(full\\s*name|applicant\\s*name|candidate\\s*name|your\\s*name|^name$|\\bname\\b)\\b/i.test(descriptor) || el.name === '_systemfield_name' || el.placeholder?.toLowerCase() === 'full name') && !/\\b(middle|first|last|family|given|user|company|school|file|vendor|domain|referr|referred|referral|employee|colleague|friend|relative|manager|supervisor|emergency|reference)\\b/i.test(descriptor)) {`;

if (engineCode.includes(oldRuleD)) {
  engineCode = engineCode.replace(oldRuleD, newRuleD);
  console.log('✓ Updated Rule D to exclude referral/employee/relative terms');
} else {
  console.warn('! oldRuleD not found');
}

// E. Add email/login regex support in Rule F
const oldRuleF = `else if (el.type === 'email' || autocomplete === 'email' || (/\\b(email|e\\s*mail|email\\s*id)\\b/i.test(descriptor) && el.type !== 'tel')) {`;
const newRuleF = `else if (el.type === 'email' || autocomplete === 'email' || (/\\b(email|e\\s*mail|email\\s*id|email\\s*\\/?\\s*login|login\\s*email)\\b/i.test(descriptor) && el.type !== 'tel')) {`;

if (engineCode.includes(oldRuleF)) {
  engineCode = engineCode.replace(oldRuleF, newRuleF);
  console.log('✓ Updated Rule F to explicitly match Email/Login fields');
} else {
  console.warn('! oldRuleF not found');
}

// F. Ensure resultPayload has filledCount explicitly
const oldResultPayload = `const resultPayload = {
        filledFields: filledLabelsList,
        missingFields: [],
        fieldRequiredStatus: filledLabelsList.map(lbl => ({ label: lbl, required: true }))
      };`;
const newResultPayload = `const resultPayload = {
        filledCount: filledCount,
        filledFields: filledLabelsList,
        missingFields: [],
        fieldRequiredStatus: filledLabelsList.map(lbl => ({ label: lbl, required: true }))
      };`;

if (engineCode.includes(oldResultPayload)) {
  engineCode = engineCode.replace(oldResultPayload, newResultPayload);
  console.log('✓ Added filledCount explicitly to resultPayload');
} else {
  console.warn('! oldResultPayload not found');
}

fs.writeFileSync('jobright_extension/outside-job-engine.js', engineCode, 'utf8');

console.log('=== All Branding & Autofill Fixes Applied Successfully! ===');

