const { chromium } = require('@playwright/test');
const fs = require('fs');

async function simulate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to Ashby page...');
  await page.goto('https://jobs.ashbyhq.com/notion/30a5c739-185f-4a55-8a63-85974d687444/application', { timeout: 30000 });
  await page.waitForTimeout(4000);

  // Read outside-job-engine.js
  const engineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

  // Inject the candidate and run engine
  const result = await page.evaluate(async (engineSrc) => {
    // evaluate engine in page context
    window.__mockCandidate = {
      full_name: 'PACHAVA ANUNYA',
      first_name: 'ANUNYA',
      last_name: 'PACHAVA',
      email: 'anunyapachava7603@gmail.com',
      phone: '+1 (214) 555-0147',
      current_city: 'Dallas',
      current_state: 'TX',
      full_address: 'Dallas, TX',
      linkedin_url: 'https://linkedin.com/in/anunyapachava-demo',
      current_job_title: 'Associate Data Engineer',
      skills: ['Python', 'SQL', 'Spark', 'AWS'],
      summary: 'Associate Data Engineer specializing in Python, SQL, and Spark.'
    };

    // run engineSrc
    eval(engineSrc);

    // Trigger autofill
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL', candidate: window.__mockCandidate }, '*');
    
    // Wait 2 seconds
    await new Promise(r => setTimeout(r, 2000));

    // Read back all inputs
    return Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(el => ({
      tag: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      value: el.value,
      checked: el.checked
    }));
  }, engineCode);

  console.log('--- Inputs After Autofill ---');
  result.forEach((inp, i) => {
    console.log(i, inp.type, inp.name || inp.id || inp.placeholder, 'VALUE="' + inp.value + '"', 'CHECKED=' + inp.checked);
  });

  await browser.close();
}

simulate().catch(console.error);
