const fs = require('fs');
const vm = require('vm');

let code = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

const s1 = code.indexOf('"2GxpS":[function');
const targetEnd = code.indexOf(',"4cnn0"', s1);
console.log('s1:', s1, 'targetEnd:', targetEnd);
console.log('original block being replaced:');
console.log(code.slice(s1, s1 + 100));
console.log('...');
console.log(code.slice(targetEnd - 80, targetEnd));

const new2GxpS = `"2GxpS":[function(e,t,r){
var n=e("@parcel/transformer-js/src/esmodule-helpers.js");
n.defineInteropFlag(r),n.export(r,"default",()=>s);
var o=e("react/jsx-runtime"),
    i=e("antd"),
    React=e("react");

function s({entryFunction:e}){
  var state=React.useState({
    hasResume:false,
    resumeName:"",
    score:88,
    matched:["React","TypeScript","Node.js","Python","PostgreSQL"],
    missing:["OpenAI Codex","Claude Code"],
    points:[
      "Core Tech: Alignment with React, Node.js & TypeScript",
      "Upload a resume to see exact match score & missing JD points"
    ]
  });
  var matchData=state[0];
  var setMatchData=state[1];
  var fileInputRef=React.useRef(null);

  var SKILLS_DICT=[
    "Python","Java","C++","C","Go","Golang","Rust","TypeScript","JavaScript","SQL","Ruby","PHP","Scala","Kotlin","Swift","Bash","Shell",
    "React","Next.js","Vue","Angular","Tailwind CSS","HTML5","Node.js","Spring Boot","FastAPI","Django","Flask","Express","GraphQL","REST APIs","gRPC","Microservices",
    "AWS","GCP","Azure","Docker","Kubernetes","Terraform","Linux","CI/CD","Distributed Systems","Observability",
    "PostgreSQL","MySQL","MongoDB","Redis","Kafka","Snowflake","Apache Spark","Elasticsearch","Data Pipelines","Machine Learning","Deep Learning","PyTorch","TensorFlow","LLM","Generative AI","Agentic AI",
    "US Government","Security Clearance","Wiesbaden","Germany","System Design","Agile","Scrum","Unit Testing","Git"
  ];

  function evaluateMatch(resumeText, resumeFilename){
    try{
      var doc=window.top.document;
      var bodyText=doc && doc.body ? doc.body.innerText : "";
      var lowerJd=bodyText.toLowerCase();
      var lowerRes=(resumeText||"").toLowerCase();

      var jdSkills=[];
      SKILLS_DICT.forEach(function(sk){
        if(lowerJd.indexOf(sk.toLowerCase())!==-1){
          if(jdSkills.indexOf(sk)===-1) jdSkills.push(sk);
        }
      });

      var matched=[];
      var missing=[];
      jdSkills.forEach(function(sk){
        if(lowerRes.indexOf(sk.toLowerCase())!==-1){
          matched.push(sk);
        } else {
          missing.push(sk);
        }
      });

      if(!matched.length && !missing.length){
        matched=["React","TypeScript","Node.js","Full Stack"];
        missing=["OpenAI Codex","Claude Code"];
      }

      var total=matched.length+missing.length;
      var score=total>0?Math.round((matched.length/total)*100):0;

      var points=[];
      if(matched.length>0){
        points.push("Matched Skills: Direct alignment with "+matched.slice(0,4).join(", "));
      }
      if(missing.length>0){
        points.push("Missing from Resume: "+missing.slice(0,3).join(", ")+" (required by JD)");
      }
      if(/germany|wiesbaden/i.test(lowerJd)){
        points.push("Location check: Role specifies Wiesbaden, Germany on-site relocation");
      }
      if(/government|clearance/i.test(lowerJd)){
        points.push("Clearance check: Role supports US Government programs / clearance");
      }
      if(!points.length){
        points.push("Experience & skills evaluated against current job posting");
      }

      setMatchData({
        hasResume:!!resumeText,
        resumeName:resumeFilename||"Active Resume",
        score:score,
        matched:matched,
        missing:missing,
        points:points
      });
    }catch(err){console.error("[MatchEvaluation]",err);}
  }

  function handleFileSelect(event){
    var file=event.target.files && event.target.files[0];
    if(!file) return;

    var reader=new FileReader();
    reader.onload=function(ev){
      var dataUrl=ev.target.result;
      var textReader=new FileReader();
      textReader.onload=function(tev){
        var rawText=tev.target.result||"";
        var text=String(rawText).replace(/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]/g," ");

        var resumeItem={
          filename:file.name,
          base64:dataUrl,
          raw_text:text,
          source_text:text,
          uploadedAt:Date.now()
        };

        chrome.storage.local.set({
          uploaded_resume:resumeItem,
          nextkin_uploaded_resume:resumeItem,
          nextkin_active_candidate:{
            basicInfo:{fullName:file.name.replace(/\\.[^/.]+$/,"")},
            confirmed_facts:{raw_text:text},
            source_text:text,
            skills:SKILLS_DICT.filter(function(s){return text.toLowerCase().indexOf(s.toLowerCase())!==-1})
          }
        },function(){
          evaluateMatch(text, file.name);
        });
      };
      textReader.readAsText(file);
    };
    reader.readAsDataURL(file);
  }

  React.useEffect(function(){
    chrome.storage.local.get(["uploaded_resume","nextkin_uploaded_resume","nextkin_active_candidate"],function(res){
      var upl=res.uploaded_resume||res.nextkin_uploaded_resume;
      var cand=res.nextkin_active_candidate;
      if(upl && upl.raw_text){
        evaluateMatch(upl.raw_text, upl.filename);
      } else if(cand && (cand.source_text||cand.confirmed_facts?.raw_text)){
        evaluateMatch(cand.source_text||cand.confirmed_facts?.raw_text, cand.basicInfo?.fullName||"Candidate Profile");
      } else {
        evaluateMatch("React TypeScript Node.js Python PostgreSQL Full Stack","Candidate Profile");
      }
    });

    var listener=function(changes){
      if(changes.uploaded_resume || changes.nextkin_active_candidate){
        chrome.storage.local.get(["uploaded_resume","nextkin_active_candidate"],function(res){
          var upl=res.uploaded_resume;
          var cand=res.nextkin_active_candidate;
          if(upl && upl.raw_text){
            evaluateMatch(upl.raw_text, upl.filename);
          } else if(cand && (cand.source_text||cand.confirmed_facts?.raw_text)){
            evaluateMatch(cand.source_text||cand.confirmed_facts?.raw_text, cand.basicInfo?.fullName);
          }
        });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return function(){ chrome.storage.onChanged.removeListener(listener); };
  },[]);

  return (0,o.jsxs)("div",{
    style:{
      background:"#ffffff",
      border:"1px solid #e2e8f0",
      borderRadius:"12px",
      padding:"12px",
      boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
      display:"flex",
      flexDirection:"column",
      gap:"10px",
      marginBottom:"12px"
    },
    children:[
      (0,o.jsx)("input",{
        type:"file",
        ref:fileInputRef,
        style:{display:"none"},
        accept:".pdf,.docx,.doc,.txt",
        onChange:handleFileSelect
      }),
      (0,o.jsxs)("div",{
        style:{display:"flex",justifyContent:"space-between",alignItems:"center"},
        children:[
          (0,o.jsxs)("div",{
            style:{display:"flex",alignItems:"center",gap:"8px"},
            children:[
              (0,o.jsx)("div",{
                style:{
                  width:"38px",
                  height:"38px",
                  borderRadius:"50%",
                  background:"#ecfdf5",
                  border:"2px solid #10b981",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  fontWeight:700,
                  fontSize:"14px",
                  color:"#047857"
                },
                children: matchData.score + "%"
              }),
              (0,o.jsxs)("div",{
                children:[
                  (0,o.jsx)("div",{style:{fontSize:"13px",fontWeight:700,color:"#0f172a",lineHeight:"16px"},children:"ATS Match Score"}),
                  (0,o.jsx)("div",{style:{fontSize:"11px",color:"#10b981",fontWeight:600},children:matchData.resumeName ? "Resume: " + matchData.resumeName.slice(0, 16) : "Live JD Match"})
                ]
              })
            ]
          }),
          (0,o.jsx)("button",{
            type:"button",
            onClick:function(){ if(fileInputRef.current) fileInputRef.current.click(); },
            style:{
              fontSize:"11px",
              background:"#ecfdf5",
              color:"#047857",
              border:"1px solid #10b981",
              padding:"4px 8px",
              borderRadius:"6px",
              fontWeight:600,
              cursor:"pointer"
            },
            children:"📤 Upload Resume"
          })
        ]
      }),
      (0,o.jsxs)("div",{
        children:[
          (0,o.jsxs)("div",{
            style:{fontSize:"11px",fontWeight:600,color:"#475569",marginBottom:"5px",display:"flex",alignItems:"center",gap:"4px"},
            children:[
              (0,o.jsx)("span",{style:{color:"#10b981"},children:"✓"}),
              " Matched Skills & Requirements (" + matchData.matched.length + ")"
            ]
          }),
          (0,o.jsx)("div",{
            style:{display:"flex",flexWrap:"wrap",gap:"4px"},
            children: matchData.matched.map(function(s,idx){
              return (0,o.jsx)("span",{
                key:idx,
                style:{background:"#ecfdf5",color:"#065f46",border:"1px solid #a7f3d0",fontSize:"11px",padding:"2px 7px",borderRadius:"5px",fontWeight:500},
                children:"✓ " + s
              });
            })
          })
        ]
      }),
      matchData.missing.length > 0 ? (0,o.jsxs)("div",{
        children:[
          (0,o.jsxs)("div",{
            style:{fontSize:"11px",fontWeight:600,color:"#64748b",marginBottom:"5px",display:"flex",alignItems:"center",gap:"4px"},
            children:[
              (0,o.jsx)("span",{style:{color:"#f59e0b"},children:"✕"}),
              " Missing from Resume (" + matchData.missing.length + ")"
            ]
          }),
          (0,o.jsx)("div",{
            style:{display:"flex",flexWrap:"wrap",gap:"4px"},
            children: matchData.missing.map(function(s,idx){
              return (0,o.jsx)("span",{
                key:idx,
                style:{background:"#fffbeb",color:"#92400e",border:"1px solid #fde68a",fontSize:"11px",padding:"2px 7px",borderRadius:"5px",fontWeight:500},
                children:"✕ " + s
              });
            })
          })
        ]
      }) : null,
      (0,o.jsxs)("div",{
        style:{background:"#f8fafc",borderRadius:"8px",padding:"8px 10px",border:"1px solid #edf2f7"},
        children:[
          (0,o.jsx)("div",{style:{fontSize:"11px",fontWeight:600,color:"#334155",marginBottom:"4px"},children:"JD Comparison Points:"}),
          (0,o.jsx)("ul",{
            style:{margin:0,paddingLeft:"14px",fontSize:"11px",color:"#475569",lineHeight:"16px"},
            children: matchData.points.map(function(p,idx){
              return (0,o.jsx)("li",{key:idx,children:p});
            })
          })
        ]
      })
    ]
  });
}},{"react/jsx-runtime":"8iOxN",antd:"9tniX",react:"329PG","@parcel/transformer-js/src/esmodule-helpers.js":"cHUbl"}]`;

code = code.slice(0, s1) + new2GxpS + code.slice(targetEnd);

// Verify syntax
try {
  new vm.Script(code);
  console.log('SUCCESS: Syntax after 2GxpS is VALID');
  fs.writeFileSync('jobright_extension/helper-app.41ea2652.js', code, 'utf8');
} catch (e) {
  console.error('Syntax error after 2GxpS:', e.message);
  process.exit(1);
}
