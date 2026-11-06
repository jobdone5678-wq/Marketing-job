const fs = require('fs');

const file = 'jobright_extension/helper-app.41ea2652.js';
let content = fs.readFileSync(file, 'utf8');

// -------------------------------------------------------------
// 1. Initial State in s({entryFunction:e})
// -------------------------------------------------------------
const oldInitialState = `function s({entryFunction:e}){
  var state=React.useState({
    hasResume:false,
    resumeName:"",
    score:75,
    matched:["Python","TypeScript","React"],
    missing:["OpenAI Codex & Coding Agents","Claude Code","AI Model Evaluation"],
    points:[
      "Matched Skills: Direct alignment with Python, TypeScript, React",
      "Role Nature Gap: Role specifically evaluates AI coding agents (OpenAI Codex, Claude Code) rather than traditional production development",
      "Missing Core Requirements: OpenAI Codex & Coding Agents, Claude Code, AI Model Evaluation (explicitly required by JD)",
      "Evaluation Focus: Requires assessing LLM reasoning, edge cases, and prompt debugging instead of writing production code",
      "Employment Model: Part-time contract (10-20 hrs/week, hourly) rather than standard full-time employment"
    ]
  });`;

const newInitialState = `function s({entryFunction:e}){
  var state=React.useState({
    hasResume:false,
    resumeName:"",
    score:0,
    matched:[],
    missing:[],
    points:[
      "Upload a resume to analyze ATS match against this job.",
      "The extension compares candidate skills against the live job requirements dynamically."
    ]
  });`;

if (content.includes(oldInitialState)) {
  content = content.replace(oldInitialState, newInitialState);
  console.log('1. Replaced initial state successfully');
} else {
  console.warn('1. Old initial state not found, checking with regex');
  content = content.replace(
    /function s\(\{entryFunction:e\}\)\{\s*var state=React\.useState\(\{\s*hasResume:false,[\s\S]*?points:\[[\s\S]*?\]\s*\}\);/,
    newInitialState
  );
  console.log('1. Replaced initial state via regex');
}

// -------------------------------------------------------------
// 2. getCleanJdText()
// -------------------------------------------------------------
const oldJdStart = content.indexOf('function getCleanJdText(){');
const oldJdEnd = content.indexOf('async function extractResumeText(file){', oldJdStart);

if (oldJdStart !== -1 && oldJdEnd !== -1) {
  const newJdFunction = `function getCleanJdText(){
    try {
      if(extJobStore && extJobStore.useExternalJobStore){
        var fv = extJobStore.useExternalJobStore.getState().formValues;
        if(fv && fv.jobDescription && fv.jobDescription.trim().length > 40){
          return (fv.jobTitle ? fv.jobTitle + " " : "") + fv.jobDescription;
        }
      }
    } catch(e) {}

    try {
      var doc = (typeof window !== "undefined" && window.top) ? window.top.document : (typeof document !== "undefined" ? document : null);
      if(doc){
        // 1. LinkedIn specific Job Description container
        var liContainer = doc.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description-content__text, .jobs-details__main-content');
        if(liContainer && liContainer.innerText && liContainer.innerText.trim().length > 30){
          var liTitle = doc.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobs-details__main-content h1, h1.t-24');
          var titleStr = (liTitle ? liTitle.innerText.trim() : (doc.title || "")) + " ";
          return titleStr + liContainer.innerText;
        }

        // 2. Generic ATS container
        var container = doc.querySelector("#overview, .ashby-job-posting-description, [class*=\\"descriptionText\\"], #content, .job__description, [data-qa=\\"job-description\\"], [data-automation-id=\\"jobPostingDescription\\"], [class*=\\"job-description\\"], [class*=\\"Job description\\"], [class*=\\"job-post-content\\"], article");
        if(container && container.innerText && container.innerText.trim().length > 40){
          return (doc.title ? doc.title + " " : "") + container.innerText;
        }

        // 3. Fallback to clean body, filtering navigation, modals, and search list
        if(doc.body){
          var clone = doc.body.cloneNode(true);
          var unwanted = clone.querySelectorAll("footer, nav, [role=\\"dialog\\"], [aria-modal=\\"true\\"], #jobright-helper-container, [id*=\\"jobright\\"], .jobs-search-results-list, .scaffold-layout__list");
          unwanted.forEach(function(el){ el.remove(); });
          var cleanText = clone.innerText || "";
          if(cleanText.trim().length > 60){
            return (doc.title ? doc.title + " " : "") + cleanText;
          }
        }
      }
    } catch(e) {}

    return "";
  }

  `;

  content = content.substring(0, oldJdStart) + newJdFunction + content.substring(oldJdEnd);
  console.log('2. Replaced getCleanJdText successfully');
} else {
  console.error('2. getCleanJdText boundaries not found');
}

// -------------------------------------------------------------
// 3. evaluateMatch()
// -------------------------------------------------------------
const oldMatchStart = content.indexOf('function evaluateMatch(');
const oldMatchEnd = content.indexOf('async function handleFileSelect(', oldMatchStart);

if (oldMatchStart !== -1 && oldMatchEnd !== -1) {
  const newMatchFunction = `function evaluateMatch(resumeText, resumeFilename, candidateObj){
    try{
      var rawJd = getCleanJdText();
      var lowerJd = String(rawJd || "");

      activeResumeTextRef.current = String(resumeText || activeResumeTextRef.current || "");
      if(resumeFilename) activeResumeNameRef.current = resumeFilename;
      if(candidateObj) activeCandidateRef.current = candidateObj;
      lastJdRef.current = lowerJd;

      var engine = (typeof NextkinResume !== "undefined" && NextkinResume) ||
                   (typeof globalThis !== "undefined" && globalThis.NextkinResume) ||
                   (typeof window !== "undefined" && window.NextkinResume);
      if(!engine) return;

      var candidate = candidateObj || activeCandidateRef.current;
      var sourceStr = activeResumeTextRef.current;

      if(!candidate){
        if(sourceStr && sourceStr.length > 20){
          candidate = parseCandidateFromTextAndFile(sourceStr, activeResumeNameRef.current);
        } else {
          setMatchData({
            hasResume: false,
            resumeName: "",
            score: 0,
            matched: [],
            missing: [],
            points: ["Upload a candidate resume to evaluate ATS match against this job."]
          });
          return;
        }
      }

      var jobTitle = "";
      var companyName = "";
      try {
        var topDoc = (typeof window !== "undefined" && window.top) ? window.top.document : (typeof document !== "undefined" ? document : null);
        var isLi = (window.top?.location?.hostname || window.location.hostname || "").includes("linkedin.com");
        if(isLi && topDoc){
          var liTitle = topDoc.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobs-details__main-content h1, h1.t-24, .job-view-layout h1');
          if(liTitle){
            var t = liTitle.textContent?.trim() || "";
            if(!/add this job|match score/i.test(t)) jobTitle = t;
          }
          var liComp = topDoc.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a, .jobs-unified-top-card__subtitle-primary-grouping a, .jobs-details__main-content a[href*="/company/"]');
          if(liComp) companyName = liComp.textContent?.trim() || "";
        }
        if(!jobTitle && topDoc){
          var h1 = topDoc.querySelector('h1[data-cy="jobTitle"], h1.job-title, [data-testid="job-title"], h1.app-title, .jobs-search__job-details--container h1, h1');
          if(h1) jobTitle = h1.textContent?.trim() || "";
        }
        if(!companyName && topDoc){
          var cEl = topDoc.querySelector('[class*="company-name" i], [class*="companyName" i], .company, [data-cy="companyName"], .jobs-details__main-content a[href*="/company/"]');
          if(cEl) companyName = cEl.textContent?.trim() || "";
        }
      } catch(e){}

      var job = {
        jobTitle: jobTitle || "",
        companyName: companyName || "",
        jobDescription: lowerJd
      };

      var report = engine.analyze(candidate, job, sourceStr);

      var cleanMatched = [];
      (report && Array.isArray(report.matched) ? report.matched : []).forEach(function(m){
        var label = typeof m === "string" ? m : (m && m.label) || "";
        if(label){
          var clean = label.length > 40 ? label.slice(0, 37) + "..." : label;
          if(cleanMatched.indexOf(clean) === -1) cleanMatched.push(clean);
        }
      });

      var cleanMissing = [];
      (report && Array.isArray(report.missing) ? report.missing : []).forEach(function(m){
        var label = typeof m === "string" ? m : (m && m.label) || "";
        if(label){
          var clean = label.length > 40 ? label.slice(0, 37) + "..." : label;
          if(cleanMissing.indexOf(clean) === -1) cleanMissing.push(clean);
        }
      });

      var totalReqs = cleanMatched.length + cleanMissing.length;
      var calculatedScore = 0;
      if (report && typeof report.score === "number" && !isNaN(report.score) && report.score >= 0) {
        calculatedScore = Math.round(report.score);
      } else if (totalReqs > 0) {
        calculatedScore = Math.round((cleanMatched.length / totalReqs) * 100);
      } else if (candidate && Array.isArray(candidate.skills) && candidate.skills.length > 0 && lowerJd.length > 40) {
        var matchedCount = 0;
        candidate.skills.forEach(function(sk){
          if(typeof sk === "string" && sk.length > 1){
            var re = new RegExp('\\\\b' + sk.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b', 'i');
            if(re.test(lowerJd)){
              matchedCount++;
              if(cleanMatched.indexOf(sk) === -1) cleanMatched.push(sk);
            }
          }
        });
        calculatedScore = Math.round((matchedCount / Math.max(1, candidate.skills.length)) * 100);
      }
      calculatedScore = Math.min(100, Math.max(0, calculatedScore));

      var points = [];
      if(cleanMatched.length > 0){
        points.push("Matched Skills: Direct alignment with " + cleanMatched.slice(0, 4).join(", "));
      } else {
        points.push("Skill Gap: No direct match found between uploaded resume skills and identified job posting requirements.");
      }

      if(cleanMissing.length > 0){
        points.push("Missing Core Requirements: " + cleanMissing.slice(0, 4).join(", ") + " (explicitly required by JD)");
      } else if(cleanMatched.length > 0){
        points.push("Requirement Coverage: Candidate meets all primary technical requirements extracted from this job.");
      }

      if(totalReqs > 0){
        var fitLabel = calculatedScore >= 70 ? "Strong technical match based on extracted job requirements." : (calculatedScore >= 40 ? "Moderate fit. Some key qualifications may need candidate clarification." : "Substantial qualification gap between resume skills and job requirements.");
        points.push("Analysis Summary: " + fitLabel);
      }

      setMatchData({
        hasResume: true,
        resumeName: activeResumeNameRef.current || candidate.full_name || (candidate.basicInfo && candidate.basicInfo.fullName) || "Candidate Profile",
        score: calculatedScore,
        matched: cleanMatched,
        missing: cleanMissing,
        points: points
      });
    }catch(err){console.error("[NextkinMatchEvaluation]",err);}
  }

  `;

  content = content.substring(0, oldMatchStart) + newMatchFunction + content.substring(oldMatchEnd);
  console.log('3. Replaced evaluateMatch successfully');
} else {
  console.error('3. evaluateMatch boundaries not found');
}

// -------------------------------------------------------------
// 4. Candidate storage checks & listener in useEffect
// -------------------------------------------------------------
const oldEffectStart = content.indexOf('React.useEffect(function(){', oldMatchStart);
const oldEffectEnd = content.indexOf('},[]);', oldEffectStart);

if (oldEffectStart !== -1 && oldEffectEnd !== -1) {
  const newEffect = `React.useEffect(function(){
    function runCheck(){
      chrome.storage.local.get(["uploaded_resume","nextkin_uploaded_resume","uploadedCandidate","nextkin_active_candidate","token","nextkin_auth_token","origin"],function(res){
        var upl=res.uploaded_resume||res.nextkin_uploaded_resume;
        var cand=(upl && upl.parsed_candidate)||res.uploadedCandidate||res.nextkin_active_candidate;
        var tok=res.token||res.nextkin_auth_token;
        var orig=res.origin||"https://nextkinhr.com";

        if(upl && (upl.raw_text || upl.source_text)){
          evaluateMatch(upl.raw_text || upl.source_text, upl.filename, cand);
        } else if(cand && (cand.source_text||cand.confirmed_facts?.raw_text)){
          evaluateMatch(cand.source_text||cand.confirmed_facts?.raw_text, cand.basicInfo?.fullName||cand.full_name||"", cand);
        } else if(tok){
          fetch(orig + "/api/jobseeker/resume", {
            headers: { "Authorization": "Bearer " + tok }
          }).then(function(r){ return r.json(); }).then(function(d){
            if(d && d.candidate && d.candidate.confirmed_facts && d.candidate.confirmed_facts.raw_text){
              evaluateMatch(d.candidate.confirmed_facts.raw_text, d.candidate.confirmed_facts.filename||d.candidate.full_name, d.candidate);
            } else {
              setMatchData({
                hasResume: false,
                resumeName: "",
                score: 0,
                matched: [],
                missing: [],
                points: ["Upload a resume to analyze ATS match against this job."]
              });
            }
          }).catch(function(){
            setMatchData({
              hasResume: false,
              resumeName: "",
              score: 0,
              matched: [],
              missing: [],
              points: ["Upload a resume to analyze ATS match against this job."]
            });
          });
        } else {
          setMatchData({
            hasResume: false,
            resumeName: "",
            score: 0,
            matched: [],
            missing: [],
            points: ["Upload a resume to analyze ATS match against this job."]
          });
        }
      });
    }

    runCheck();
    var t1=setTimeout(runCheck, 500);
    var t2=setTimeout(runCheck, 1500);
    var t3=setTimeout(runCheck, 3000);

    var interval=setInterval(function(){
      var currentJd = getCleanJdText();
      if(currentJd && currentJd !== lastJdRef.current && currentJd.trim().length > 20){
        runCheck();
      }
    }, 1500);

    var listener=function(changes){
      if(changes.uploaded_resume || changes.nextkin_uploaded_resume || changes.uploadedCandidate || changes.nextkin_active_candidate){
        runCheck();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return function(){
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(interval);
      chrome.storage.onChanged.removeListener(listener);
    };
  }`;

  content = content.substring(0, oldEffectStart) + newEffect + content.substring(oldEffectEnd);
  console.log('4. Replaced storage check useEffect successfully');
} else {
  console.error('4. useEffect boundaries not found');
}

// -------------------------------------------------------------
// 5. Module hfEAA Header Component
// -------------------------------------------------------------
const hfEAAIdx = content.indexOf('hfEAA:');
if (hfEAAIdx !== -1) {
  const funcStart = content.indexOf('function k({currentTabJob:e,setOpenSetting:t}){', hfEAAIdx);
  const returnStart = content.indexOf('return (0,o.jsxs)(i.Flex,{', funcStart);

  if (funcStart !== -1 && returnStart !== -1) {
    const newKBody = `function k({currentTabJob:e,setOpenSetting:t}){
  let[r]=(0,f.useStorage)("plugin-actived",!0),
      n=(0,C.useExternalJobStore)(e=>e.isAddingAnotherJob),
      a=(0,C.useExternalJobStore)(e=>e.setIsAddingAnotherJob),
      s=(0,x.useHideStore)(e=>e.setOpenCard),
      c=(0,x.useHideStore)(e=>e.setClickOpenInAgent),
      h="myworkday"===(0,E.getTargetName)(),
      [b,v]=(0,f.useStorage)(S.STORAGE_KEY.WORKDAY_TOAST_CLOSED,!1),
      [A,setA]=(0,p.useState)(!1),
      I=h&&!b,F=!I&&!A,_=()=>{v(!0),setA(!0)};

  // Live Scraped State for active job card & site
  let [liveInfo, setLiveInfo] = (0,p.useState)(function(){
    return {
      title: e?.title || e?.jobTitle || e?.jobResult?.jobTitle || "",
      company: e?.company || e?.companyName || e?.jobResult?.companyName || "",
      hasJd: true,
      hasForm: true
    };
  });

  (0,p.useEffect)(function(){
    function scrapePage(){
      try {
        var topDoc = (typeof window !== "undefined" && window.top) ? window.top.document : (typeof document !== "undefined" ? document : null);
        if (!topDoc) return;

        var host = "";
        try { host = (window.top?.location?.hostname || window.location.hostname || "").toLowerCase(); } catch(err){}
        var isLi = host.includes("linkedin.com");

        var foundTitle = "";
        var foundCompany = "";
        var foundJd = false;
        var foundForm = false;

        if (isLi) {
          // 1. LinkedIn Top Card Title
          var liTitle = topDoc.querySelector(
            ".job-details-jobs-unified-top-card__job-title, " +
            ".jobs-unified-top-card__job-title, " +
            ".jobs-details__main-content h1, " +
            "h1.t-24, " +
            ".job-view-layout h1, " +
            ".jobs-search__job-details--container h1"
          );
          if (liTitle) {
            var rawT = (liTitle.textContent || "").trim();
            if (rawT && !/add this job|match score/i.test(rawT)) {
              foundTitle = rawT;
            }
          }

          // 2. LinkedIn Top Card Company
          var liComp = topDoc.querySelector(
            ".job-details-jobs-unified-top-card__company-name, " +
            ".jobs-unified-top-card__company-name, " +
            ".job-details-jobs-unified-top-card__primary-description a, " +
            ".jobs-unified-top-card__subtitle-primary-grouping a, " +
            ".jobs-details__main-content a[href*='/company/']"
          );
          if (liComp) {
            foundCompany = (liComp.textContent || "").trim();
          }

          // 3. LinkedIn JD
          var liJd = topDoc.querySelector("#job-details, .jobs-description__content, .jobs-box__html-content, .jobs-description-content__text");
          foundJd = !!(liJd && liJd.innerText && liJd.innerText.trim().length > 30);

          // 4. LinkedIn Form / Apply Button
          var liApply = topDoc.querySelector(".jobs-easy-apply-button, [aria-label*='Easy Apply' i], [data-easy-apply-button], form");
          foundForm = !!liApply;
        }

        // Generic fallback if not LinkedIn or not found
        if (!foundTitle) {
          var h1 = topDoc.querySelector("h1[data-cy='jobTitle'], h1.job-title, [data-testid='job-title'], h1.app-title, .job-details h1, main h1, h1");
          if (h1) foundTitle = (h1.textContent || "").trim();
        }
        if (!foundTitle && topDoc.title) {
          var cleanedTitle = topDoc.title.replace(/\\s*[-|–·].*$/, "").replace(/Jobs\\s*\\|\\s*LinkedIn/i, "").trim();
          if (cleanedTitle && !/log\\s*in|sign\\s*in|portal/i.test(cleanedTitle)) {
            foundTitle = cleanedTitle;
          }
        }

        if (!foundCompany) {
          var compEl = topDoc.querySelector("[class*='company-name' i], [class*='companyName' i], .company, [data-cy='companyName']");
          if (compEl) foundCompany = (compEl.textContent || "").trim();
        }

        if (!foundJd) {
          var genericJd = topDoc.querySelector("#overview, .ashby-job-posting-description, [class*='descriptionText'], #content, .job__description, [data-automation-id='jobPostingDescription']");
          foundJd = !!(genericJd && genericJd.innerText && genericJd.innerText.trim().length > 30);
        }

        if (!foundForm) {
          var genericForm = topDoc.querySelector("form, [data-testid='application-form'], [class*='application-form']");
          foundForm = !!genericForm;
        }

        setLiveInfo(function(prev){
          var newTitle = foundTitle || prev.title;
          var newCompany = foundCompany || prev.company;
          if (prev.title === newTitle && prev.company === newCompany && prev.hasJd === foundJd && prev.hasForm === foundForm) {
            return prev;
          }
          return {
            title: newTitle,
            company: newCompany,
            hasJd: foundJd,
            hasForm: foundForm
          };
        });
      } catch(err){}
    }

    scrapePage();
    var interval = setInterval(scrapePage, 500);

    try {
      var topDoc = (typeof window !== "undefined" && window.top) ? window.top.document : null;
      if (topDoc) {
        var obsTarget = topDoc.querySelector(".jobs-search__job-details--container, .job-view-layout, .jobs-details__main-content, main, body") || topDoc.body;
        if (obsTarget && typeof MutationObserver !== "undefined") {
          var observer = new MutationObserver(scrapePage);
          observer.observe(obsTarget, { childList: true, subtree: true });
          return function(){
            clearInterval(interval);
            observer.disconnect();
          };
        }
      }
    } catch(e){}

    return function(){ clearInterval(interval); };
  }, [e]);

  // Host & Site Name calculation
  let host = "";
  try { host = (window.top?.location?.hostname || window.location.hostname || "").toLowerCase(); } catch(err){}
  let pth = "";
  try { pth = (window.top?.location?.pathname || window.location.pathname || "").toLowerCase(); } catch(err){}

  let siteName = "Outside Careers";
  if (host.includes("foxsense") || host.includes("keka")) siteName = "Foxsense Careers";
  else if (host.includes("greenhouse")) siteName = "Greenhouse";
  else if (host.includes("ashby")) siteName = "Ashby";
  else if (host.includes("lever")) siteName = "Lever";
  else if (host.includes("workday")) siteName = "Workday";
  else if (host.includes("linkedin")) siteName = "LinkedIn";
  else if (host.includes("dice")) siteName = "Dice";
  else if (host.includes("bamboohr")) siteName = "BambooHR";
  else if (host) {
    let clean = host.replace(/^www\\./, "").replace(/^(careers?\\.|jobs?\\.)/, "").split(".")[0];
    siteName = (clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Company") + " Careers";
  }

  let isPortalPage = (host.includes("nextkinhr.com") || host.includes("nexckinhr.com") || host.includes("nexckin") || host.includes("nextkin") || host.includes("localhost") || host.includes("127.0.0.1")) &&
                     !pth.startsWith("/jobs/") && !pth.startsWith("/public-jobs/");

  let jobTitle = liveInfo.title || e?.title || e?.jobTitle || e?.jobResult?.jobTitle || "";
  let companyName = liveInfo.company || e?.company || e?.companyName || e?.jobResult?.companyName || "";
  let hasJd = liveInfo.hasJd;
  let hasForm = liveInfo.hasForm;

  if (isPortalPage) {
    siteName = "NextKinHR Workspace";
    jobTitle = "Recruiter & Candidate Hub";
    companyName = "Ready to assist on any outside career portal";
    hasJd = false;
    hasForm = false;
  } else {
    if (!jobTitle) jobTitle = "Active Job Application";
    if (!companyName) companyName = siteName;
  }

  `;

    content = content.substring(0, funcStart) + newKBody + content.substring(returnStart);
    console.log('5. Replaced hfEAA header component successfully');
  } else {
    console.error('5. funcStart or returnStart in hfEAA not found');
  }
} else {
  console.error('5. hfEAA module not found');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Updated helper-app.41ea2652.js successfully!');
