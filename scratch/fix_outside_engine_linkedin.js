const fs = require('fs');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Update isJobOrCareerPage for LinkedIn
const oldLiCareer = `if (host.includes('linkedin.com')) {
          if (/\\/(in|feed|messaging|mynetwork|notifications|groups|pulse)\\b/i.test(path)) return false;
          return path.includes('/jobs/view') || path.includes('/jobs/collections') || window.location.search.includes('currentJobId=');
        }`;

const newLiCareer = `if (host.includes('linkedin.com')) {
          if (/\\/(in|feed|messaging|mynetwork|notifications|groups|pulse)\\b/i.test(path)) return false;
          return path.includes('/jobs/view') || path.includes('/jobs/collections') || path.includes('/jobs/search') || window.location.search.includes('currentJobId=') || !!document.querySelector('#job-details, .jobs-description__content, .jobs-details__main-content');
        }`;

if (content.includes(oldLiCareer)) {
  content = content.replace(oldLiCareer, newLiCareer);
  console.log('1. Updated isJobOrCareerPage for LinkedIn');
} else {
  console.warn('1. Old LinkedIn career logic not found directly, checking regex');
  content = content.replace(
    /if\s*\(host\.includes\(['"]linkedin\.com['"]\)\)\s*\{[\s\S]*?return\s+path\.includes\('\/jobs\/view'\)[\s\S]*?;\s*\}/,
    newLiCareer
  );
  console.log('1. Updated isJobOrCareerPage via regex');
}

// 2. Update detectPageMode for LinkedIn
const oldDetectLi = `if (loc.hostname.includes('linkedin.com')) {
      if (/\\/(in|feed|messaging|mynetwork|notifications|groups|pulse|company\\/[^\\/]+\\/?$)\\b/i.test(loc.pathname) ||
          (loc.pathname.includes('/jobs/search') && !loc.search.includes('currentJobId='))) {
        return 'other';
      }
    }`;

const newDetectLi = `if (loc.hostname.includes('linkedin.com')) {
      if (/\\/(in|feed|messaging|mynetwork|notifications|groups|pulse|company\\/[^\\/]+\\/?$)\\b/i.test(loc.pathname)) {
        return 'other';
      }
      if (loc.pathname.includes('/jobs/search')) {
        const hasDetails = !!document.querySelector('#job-details, .jobs-description__content, .jobs-details__main-content, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title');
        if (!hasDetails && !loc.search.includes('currentJobId=')) {
          return 'other';
        }
      }
    }`;

if (content.includes(oldDetectLi)) {
  content = content.replace(oldDetectLi, newDetectLi);
  console.log('2. Updated detectPageMode for LinkedIn');
} else {
  console.warn('2. Old detectPageMode not found directly, checking regex');
  content = content.replace(
    /if\s*\(loc\.hostname\.includes\(['"]linkedin\.com['"]\)\)\s*\{[\s\S]*?return\s+'other';\s*\}\s*\}/,
    newDetectLi
  );
  console.log('2. Updated detectPageMode via regex');
}

// 3. Update scrapeJobFromDOM LinkedIn selectors to include all top cards
const oldLiSelectors = `const liTitleEl = document.querySelector('.jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, h1.t-24, .jobs-details__main-content h1');`;
const newLiSelectors = `const liTitleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobs-details__main-content h1, h1.t-24, .job-view-layout h1, .jobs-search__job-details--container h1');`;

if (content.includes(oldLiSelectors)) {
  content = content.replace(oldLiSelectors, newLiSelectors);
  console.log('3. Updated scrapeJobFromDOM title selector');
}

const oldLiCompSelectors = `const liCompEl = document.querySelector('.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a, a[href*="/company/"]');`;
const newLiCompSelectors = `const liCompEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a, .jobs-unified-top-card__subtitle-primary-grouping a, .jobs-details__main-content a[href*="/company/"]');`;

if (content.includes(oldLiCompSelectors)) {
  content = content.replace(oldLiCompSelectors, newLiCompSelectors);
  console.log('4. Updated scrapeJobFromDOM company selector');
}

// 4. Scrape company from Keka dynamically instead of hardcoding
const oldFoxsense = `if (isFoxsense) {
      company = 'Foxsense Innovations';`;
const newFoxsense = `if (isFoxsense) {
      const kComp = document.querySelector('.company-name, .brand-logo, [class*="company" i], header h1');
      company = (kComp ? (kComp.textContent || '').trim() : '') || (window.location.hostname.includes('foxsense') ? 'Foxsense Innovations' : company);`;

if (content.includes(oldFoxsense)) {
  content = content.replace(oldFoxsense, newFoxsense);
  console.log('5. Updated Keka company dynamic scraper');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Updated outside-job-engine.js successfully!');
