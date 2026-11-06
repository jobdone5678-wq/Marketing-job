const fs = require('fs');

const path = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(path, 'utf8');

// Update candidate bio & profile fields setup in executeOutsideAutofill
const bioTarget = `    // Tailored professional Bio synthesis
    const candSkills = (Array.isArray(candidate.skills) && candidate.skills.length) ? candidate.skills.slice(0, 5).join(', ') : '';
    const candTitle = candidate.current_job_title || candidate.target_job_titles || candidate.headline || currentRole || '';
    const defaultBio = candidate.summary || candidate.bio || candidate.confirmed_facts?.summary || candidate.confirmed_facts?.bio || '';`;

const bioReplacement = `    // Tailored professional Bio synthesis & candidate education/experience extraction
    const candSkills = (Array.isArray(candidate.skills) && candidate.skills.length) ? candidate.skills.slice(0, 5).join(', ') : '';
    const candTitle = candidate.current_job_title || candidate.target_job_titles || candidate.headline || currentRole || '';
    const candidateSummary = candidate.summary || candidate.confirmed_facts?.summary || candidate.bio || '';
    const defaultBio = candidateSummary || (
      candSkills
        ? \`Experienced professional with strong technical expertise in \${candSkills}. Proven track record in solving complex problems, building robust systems, and driving high-impact results for \${targetCompany}.\`
        : \`Dedicated professional with extensive experience in software development and engineering best practices, eager to contribute to the mission at \${targetCompany}.\`
    );

    const candEdu = (Array.isArray(candidate.education) && candidate.education.length) ? candidate.education[0] : (candidate.education_history && candidate.education_history[0]) || {};
    const candSchool = candEdu.school || candEdu.institution || candEdu.college || candidate.university_name || 'University';
    const candDegree = candEdu.degree || candidate.highest_qualification || 'Bachelor of Science';
    const candMajor = candEdu.fieldOfStudy || candEdu.major || candEdu.discipline || 'Computer Science';

    const candExp = (Array.isArray(candidate.workExperience) && candidate.workExperience.length) ? candidate.workExperience[0] : (candidate.employment_history && candidate.employment_history[0]) || {};
    const candCompany = candExp.company || candExp.employer || '';
    const candRole = candExp.title || candExp.role || candTitle || '';`;

if (content.includes(bioTarget)) {
  content = content.replace(bioTarget, bioReplacement);
  console.log('Updated bio and education/experience setup in executeOutsideAutofill');
} else {
  console.log('bioTarget not found');
}

// Update field matchers in executeOutsideAutofill
const matchersTarget = `      } else if (/portfolio|website|personal\\s*site/i.test(descriptor)) {
        targetVal = candidate.website || candidate.portfolio_url || '';
      } else if (/\\b(city|location|address|start\\s*typing)\\b/i.test(descriptor)) {
        targetVal = location;
      } else if (/\\b(authorized|eligible|legally\\s*authorized|right\\s*to\\s*work)\\b/i.test(descriptor)) {
        targetVal = 'Yes';
      } else if (/\\b(sponsorship|require\\s*sponsorship|visa\\s*sponsorship|sponsor)\\b/i.test(descriptor)) {
        targetVal = 'No';
      } else if (/\\b(salary|compensation|desired\\s*pay|rate)\\b/i.test(descriptor)) {
        targetVal = candidate.desired_salary || candidate.expected_salary || '';
      } else if (/\\b(notice|start\\s*date|availability|available)\\b/i.test(descriptor)) {
        targetVal = candidate.notice_period || candidate.availability || '';
      } else if (/\\b(bio|about\\s*(me|you|yourself)?|summary|professional\\s*summary|cover\\s*letter|introduction|why\\s*(should\\s*we\\s*hire\\s*you|are\\s*you\\s*interested|apply)|statement|tell\\s*us\\s*about\\s*yourself|background|pitch)\\b/i.test(descriptor) || el.tagName === 'TEXTAREA') {
        targetVal = defaultBio;
        isAiField = true;
      }`;

const matchersReplacement = `      } else if (/portfolio|website|personal\\s*site/i.test(descriptor)) {
        targetVal = candidate.website || candidate.portfolio_url || '';
      } else if (/\\b(school|university|college|institution|attended)\\b/i.test(descriptor)) {
        targetVal = candSchool;
      } else if (/\\b(degree|qualification|education\\s*level)\\b/i.test(descriptor)) {
        targetVal = candDegree;
      } else if (/\\b(discipline|major|field\\s*of\\s*study|study)\\b/i.test(descriptor)) {
        targetVal = candMajor;
      } else if (/\\b(current\\s*company|most\\s*recent\\s*company|employer|current\\s*employer)\\b/i.test(descriptor)) {
        targetVal = candCompany;
      } else if (/\\b(current\\s*title|current\\s*role|most\\s*recent\\s*title|job\\s*title)\\b/i.test(descriptor)) {
        targetVal = candRole;
      } else if (/\\b(country)\\b/i.test(descriptor)) {
        targetVal = 'United States';
      } else if (/\\b(state|province|region)\\b/i.test(descriptor)) {
        targetVal = candidate.current_state || 'California';
      } else if (/\\b(zip|postal|zipcode|postal\\s*code)\\b/i.test(descriptor)) {
        targetVal = candidate.zip_code || candidate.addressInfo?.zipCode || '94105';
      } else if (/\\b(how\\s*did\\s*you\\s*hear|source|referral\\s*source)\\b/i.test(descriptor)) {
        targetVal = 'LinkedIn';
      } else if (/\\b(gender|sex)\\b/i.test(descriptor)) {
        targetVal = 'Decline to Self Identify';
      } else if (/\\b(race|ethnicity)\\b/i.test(descriptor)) {
        targetVal = 'Decline to Self Identify';
      } else if (/\\b(veteran)\\b/i.test(descriptor)) {
        targetVal = 'I am not a protected veteran';
      } else if (/\\b(disability)\\b/i.test(descriptor)) {
        targetVal = 'I do not have a disability';
      } else if (/\\b(city|location|address|start\\s*typing)\\b/i.test(descriptor)) {
        targetVal = location;
      } else if (/\\b(authorized|eligible|legally\\s*authorized|right\\s*to\\s*work)\\b/i.test(descriptor)) {
        targetVal = 'Yes';
      } else if (/\\b(sponsorship|require\\s*sponsorship|visa\\s*sponsorship|sponsor)\\b/i.test(descriptor)) {
        targetVal = 'No';
      } else if (/\\b(salary|compensation|desired\\s*pay|rate)\\b/i.test(descriptor)) {
        targetVal = candidate.desired_salary || candidate.expected_salary || '';
      } else if (/\\b(notice|start\\s*date|availability|available)\\b/i.test(descriptor)) {
        targetVal = candidate.notice_period || candidate.availability || '';
      } else if (/\\b(bio|about\\s*(me|you|yourself)?|summary|professional\\s*summary|cover\\s*letter|introduction|why\\s*(should\\s*we\\s*hire\\s*you|are\\s*you\\s*interested|apply)|statement|tell\\s*us\\s*about\\s*yourself|background|pitch)\\b/i.test(descriptor) || el.tagName === 'TEXTAREA') {
        targetVal = defaultBio;
        isAiField = true;
      }`;

if (content.includes(matchersTarget)) {
  content = content.replace(matchersTarget, matchersReplacement);
  console.log('Updated field matchers in executeOutsideAutofill');
} else {
  console.log('matchersTarget not found');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Saved updates to outside-job-engine.js');
