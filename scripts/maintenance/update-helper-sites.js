const fs = require('fs');

let helper = fs.readFileSync('jobright_extension/helper-app.41ea2652.js', 'utf8');

const startMarker = 'siteName = "Outside Careers";';
const endMarker = 'else if (host) {';

const sIdx = helper.indexOf(startMarker);
if (sIdx !== -1) {
  const eIdx = helper.indexOf(endMarker, sIdx);
  if (eIdx !== -1) {
    const newSiteLogic = `siteName = "Outside Careers";
  if (host.includes("foxsense") || host.includes("keka")) siteName = "Foxsense Careers";
  else if (host.includes("greenhouse")) siteName = "Greenhouse";
  else if (host.includes("ashby")) siteName = "Ashby";
  else if (host.includes("lever")) siteName = "Lever";
  else if (host.includes("workday")) siteName = "Workday";
  else if (host.includes("icims")) siteName = "iCIMS";
  else if (host.includes("smartrecruiters")) siteName = "SmartRecruiters";
  else if (host.includes("taleo")) siteName = "Taleo";
  else if (host.includes("successfactors") || host.includes("sapsf")) siteName = "SuccessFactors";
  else if (host.includes("bamboohr")) siteName = "BambooHR";
  else if (host.includes("workable")) siteName = "Workable";
  else if (host.includes("jobvite")) siteName = "Jobvite";
  else if (host.includes("jazzhr") || host.includes("applytojob")) siteName = "JazzHR";
  else if (host.includes("breezy")) siteName = "BreezyHR";
  else if (host.includes("personio")) siteName = "Personio";
  else if (host.includes("rippling")) siteName = "Rippling";
  else if (host.includes("paylocity")) siteName = "Paylocity";
  else if (host.includes("paycom")) siteName = "Paycom";
  else if (host.includes("adp")) siteName = "ADP";
  else if (host.includes("oraclecloud")) siteName = "Oracle Cloud";
  else if (host.includes("brassring")) siteName = "BrassRing";
  else if (host.includes("dayforce")) siteName = "Dayforce";
  else if (host.includes("ultipro") || host.includes("ukg")) siteName = "UKG Pro";
  else if (host.includes("eightfold")) siteName = "Eightfold";
  else if (host.includes("phenom")) siteName = "Phenom";
  else if (host.includes("zoho")) siteName = "Zoho Recruit";
  else if (host.includes("teamtailor")) siteName = "Teamtailor";
  else if (host.includes("recruitee")) siteName = "Recruitee";
  else if (host.includes("pinpoint")) siteName = "Pinpoint";
  else if (host.includes("avature")) siteName = "Avature";
  else if (host.includes("freshteam")) siteName = "Freshteam";
  else if (host.includes("linkedin")) siteName = "LinkedIn";
  else if (host.includes("dice")) siteName = "Dice";
  `;
    helper = helper.slice(0, sIdx) + newSiteLogic + helper.slice(eIdx);
    fs.writeFileSync('jobright_extension/helper-app.41ea2652.js', helper, 'utf8');
    console.log('✓ Successfully updated helper-app with all 30+ ATS site badges');
  }
}
