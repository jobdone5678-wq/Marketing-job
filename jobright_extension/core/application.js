(function () {
  const capture = globalThis.NextkinJobCapture;
  const discovery = globalThis.NextkinForms;
  const mapping = globalThis.NextkinFieldMapping;
  const writer = globalThis.NextkinFieldWriter;
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone']);
  const manualQuestion = /\b(?:password|secret|bank\s*routing|routing\s*number|bank\s*account|credit.?card|ssn|social.?security|tax.?id|pin|otp)\b/i;
  const jobSpecific = /\b(?:this|the) (?:job|role|position|company|organization|employer|opportunity)\b|\bwhy\b|cover letter|how did you hear|\breferred\b|application source/i;
  const answerKey = field => field.label.normalize('NFKC').toLowerCase().replace(/[?*:.!]+$/g, '').trim().replace(/\s+/g, ' ');

  function inspect() {
    const job = capture.read();
    const fields = discovery.discoverFields().filter(field => field.kind !== 'inaccessible' && !field.excluded);
    const contacts = new Set(fields.map(field => mapping.resolveFact(field.label, field.hint)?.key)
      .filter(key => contactKeys.has(key)));
    const routeLooksLikeApplication = /(?:^|[/?=_-])(?:apply|applyjob|application|applytojob|jobapply)(?:$|[/?=_-])/i.test(location.pathname + location.search);
    const resumeInput = findResumeInput();
    const hasForm = (contacts.size >= 2 && !!(job || routeLooksLikeApplication || resumeInput)) ||
      (routeLooksLikeApplication && fields.length >= 1) || (!!job && fields.length >= 2 && !!resumeInput);
    return { job, fields, hasForm, resumeInput };
  }

  function findResumeInput(root = document) {
    return [...root.querySelectorAll('input[type="file"]')].find(input => {
      if (input.disabled) return false;
      const label = discovery.label(input);
      return /\b(?:resume|résumé|curriculum vitae|cv)\b/i.test([label, input.name, input.id].join(' ')) &&
        !/cover\s*letter|additional|optional document/i.test(label);
    });
  }

  function plansFor(expectedUrl, candidate, saved = {}) {
    if (location.href !== expectedUrl) throw new Error('The page changed. Open the application form and try again.');
    const page = inspect();
    if (!page.hasForm) throw new Error('Open the job application form before using autofill.');
    const plans = mapping.planFill(page.fields, candidate);
    const keys = plans.map(plan => answerKey(plan.field));
    for (const plan of plans) {
      const key = answerKey(plan.field);
      if (plan.factKey || !reusable(plan, keys) || !Object.hasOwn(saved, key)) continue;
      const stored = saved[key];
      if (stored.type !== answerType(plan.field)) continue;
      plan.status = 'supported';
      plan.value = stored.value;
      plan.learned = true;
    }
    return { ...page, plans, keys };
  }

  function answerType(field) {
    if (mapping.isMultiKind(field.kind)) return 'multiple';
    if (field.kind === 'checkbox') return 'boolean';
    return mapping.isChoiceKind(field.kind) ? 'choice' : 'text';
  }

  function reusable(plan, keys) {
    const { field } = plan;
    const key = answerKey(field);
    return key.length >= 5 && key.length <= 200 && keys.indexOf(key) === keys.lastIndexOf(key) &&
      !plan.factKey && plan.status !== 'manual' && !field.excluded &&
      !/Repeated history|Job target/.test(plan.reason || '') &&
      !manualQuestion.test(key) && !jobSpecific.test(key);
  }

  function savedAnswers(expectedUrl, candidate) {
    const { plans, keys } = plansFor(expectedUrl, candidate);
    return plans.filter(plan => reusable(plan, keys)).flatMap(plan => {
      const { field } = plan;
      const value = writer.read(field);
      if (typeof value === 'string' && (!value || value.length > 2000) || Array.isArray(value) && !value.length) return [];
      if (Array.isArray(value) && (value.length > 50 || value.some(item => item.length > 200))) return [];
      return [{ key: answerKey(field), label: field.label, type: answerType(field), value }];
    }).slice(0, 100);
  }

  async function fill(expectedUrl, candidate, resume, saved, aiAnswers = null) {
    const page = plansFor(expectedUrl, candidate, saved);
    const plans = page.plans;
    const questions = [];
    const duplicateLabels = page.keys.filter((key, i, keys) => keys.indexOf(key) !== i);
    const values = mapping.buildValues(candidate);
    let genericTextareaIndex = 0;

    for (const plan of plans) {
      const { field } = plan;
      const label = (field.label || field.hint || '').trim();
      const key = answerKey(field);

      if (plan.status === 'ai' || plan.status === 'needs_review' || plan.status === 'unknown') {
        if (label.length < 2 || key.length > 300 || manualQuestion.test(label) || writer.read(field)) continue;
        const choices = plan.options?.length ? plan.options : (await writer.readChoices(field, () => location.href === expectedUrl))
          .map(option => option.label);
        const options = [...new Set(choices.filter(option => option && option.length <= 1000))].slice(0, 200);

        // 1. If explicit AI answer was provided via API
        if (aiAnswers && typeof aiAnswers[key] === 'string' && (!options.length || options.includes(aiAnswers[key]))) {
          plan.status = 'supported';
          plan.value = aiAnswers[key];
          plan.ai = true;
          continue;
        }

        // 2. Dynamic resume-grounded answers based strictly on candidate's uploaded resume
        let autoValue = null;
        const ql = label.toLowerCase();

        const candName = values.full_name || 'Candidate';
        const candFirst = values.first_name || 'Candidate';
        const candTitle = values.current_title || candidate.current_job_title || candidate.headline || 'Software Engineer';
        const candEmployer = values.current_employer || candidate.current_company || candidate.company || 'technology companies';
        const candSkills = values.primary_skills || candidate.secondary_skills || 'software engineering';
        const skillsList = Array.isArray(candSkills) ? candSkills : String(candSkills).split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
        const skillsStr = skillsList.join(', ') || 'Software Engineering';
        const topSkills = skillsList.slice(0, 5).join(', ') || 'modern software engineering tools';
        const candExp = values.total_experience_years ? `${values.total_experience_years}+ years` : '';
        const candCity = values.current_city || candidate.city || '';
        const candState = values.current_state || candidate.state || '';
        const candLocation = values.current_location || [candCity, candState].filter(Boolean).join(', ') || '';
        const candDegree = values.highest_education || candidate.highest_qualification || candidate.degree || '';
        const candSchool = values.school || candidate.university_name || candidate.school || '';
        const candGradYear = values.graduation_year || candidate.graduation_year || '';
        const candSummary = values.summary || values.bio || '';
        const candResumeText = (resume?.raw_text || resume?.source_text || candidate.source_text || '').toLowerCase();
        const activeJobData = capture?.read ? capture.read() : null;
        const companyName = activeJobData?.company || 'your company';

        if (mapping.isChoiceKind(field.kind)) {
          if (/(authoriz|eligible|legal right|citizen|18|age|full-time|onsite|internship|currently enrolled)/i.test(ql) && !/(require|need|sponsor)/i.test(ql)) {
            const affirmative = values.authorized_in_usa !== false;
            autoValue = options.find(o => mapping.normalizeBoolean(o) === affirmative) || (affirmative ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || affirmative;
          } else if (/(require|need).*(sponsor|visa)/i.test(ql)) {
            const needSponsor = values.needs_sponsorship === true;
            autoValue = options.find(o => mapping.normalizeBoolean(o) === needSponsor) || (needSponsor ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || needSponsor;
          } else if (/(felony|convict|criminal|conflict|relatives|worked for|worked before|employee or a contractor)/i.test(ql)) {
            autoValue = options.find(o => mapping.normalizeBoolean(o) === false) || options.find(o => /^no\b/i.test(o)) || false;
          } else if (/(gender|sex)/i.test(ql)) {
            if (candidate.gender) {
              autoValue = options.find(o => new RegExp(`^${candidate.gender}\\b`, 'i').test(o)) || candidate.gender;
            } else {
              autoValue = options.find(o => /decline|prefer not|choose not/i.test(o)) || options[0];
            }
          } else if (/(hispanic|latino)/i.test(ql)) {
            autoValue = options.find(o => /^(no|decline|prefer not)/i.test(o)) || false;
          } else if (/(race|ethnic)/i.test(ql)) {
            if (candidate.race) {
              autoValue = options.find(o => new RegExp(`^${candidate.race}\\b`, 'i').test(o)) || candidate.race;
            } else {
              autoValue = options.find(o => /decline|prefer not|choose not/i.test(o)) || options[0];
            }
          } else if (/(veteran)/i.test(ql)) {
            if (candidate.veteran) {
              autoValue = options.find(o => new RegExp(candidate.veteran.slice(0, 15), 'i').test(o)) || candidate.veteran;
            } else {
              autoValue = options.find(o => /not a (?:protected )?veteran|^no\b|decline|prefer not/i.test(o)) || options[0];
            }
          } else if (/(disabil)/i.test(ql)) {
            if (candidate.disability) {
              autoValue = options.find(o => new RegExp(candidate.disability.slice(0, 15), 'i').test(o)) || candidate.disability;
            } else {
              autoValue = options.find(o => /no,? (?:i )?do not have|^no\b|decline|prefer not/i.test(o)) || options[0];
            }
          } else if (/(pronoun)/i.test(ql)) {
            const g = String(candidate.gender || values.gender || '').toLowerCase();
            if (g.startsWith('f') || g.includes('woman') || g.includes('female')) {
              autoValue = options.find(o => /she\/her/i.test(o)) || 'She/Her/Hers';
            } else if (g.includes('non-binary') || g.includes('they')) {
              autoValue = options.find(o => /they\/them/i.test(o)) || 'They/Them/Theirs';
            } else {
              autoValue = options.find(o => /he\/him/i.test(o)) || 'He/Him/His';
            }
          } else if (/(degree|education)/i.test(ql)) {
            if (/master/i.test(candDegree)) autoValue = options.find(o => /master/i.test(o));
            else if (/phd|doctor/i.test(candDegree)) autoValue = options.find(o => /phd|doctor/i.test(o));
            else autoValue = options.find(o => /bachelor/i.test(o)) || options.find(o => /degree/i.test(o)) || candDegree || options[0];
          } else if (/(country)/i.test(ql)) {
            autoValue = options.find(o => new RegExp(values.country || 'United States', 'i').test(o)) || options.find(o => /united states|usa/i.test(o)) || values.country || 'United States';
          } else if (/(where do you intend to work|intend to work|work location)/i.test(ql)) {
            autoValue = options.find(o => /open|either|any|both/i.test(o)) || options.find(o => /remote/i.test(o)) || options[0] || 'Open to Either';
          } else if (/(location|city)/i.test(ql)) {
            const locMatch = candCity && options.find(o => new RegExp(candCity, 'i').test(o));
            autoValue = locMatch || options.find(o => /remote|open|any/i.test(o)) || options[0];
          } else if (/(graduate|graduation|year)/i.test(ql)) {
            const gradMatch = candGradYear && options.find(o => o.includes(candGradYear));
            autoValue = gradMatch || options.find(o => /2026|2027|2028/i.test(o)) || options[0];
          } else if (/(hear|source)/i.test(ql)) {
            autoValue = options.find(o => /linkedin/i.test(o)) || options.find(o => /website|job board|other/i.test(o)) || 'LinkedIn';
          } else if (options.length) {
            autoValue = options.find(o => !/select|choose/i.test(o)) || options[0];
          }
        } else if (field.kind === 'text' || field.kind === 'textarea') {
          // 1. Candidate's story / journey
          if (/(tell us your story|your story|how did you get to where you are|personal journey|professional journey|background.*shaped you|turning point)/i.test(ql)) {
            autoValue = `My professional journey began with my education in ${candDegree || 'computer science'} at ${candSchool || 'university'}, where I developed a strong passion for solving real-world problems with code. Over the past ${candExp || 'several years'}, I have worked across technology environments, most recently as a ${candTitle} at ${candEmployer}. Through hands-on experience architecting full-stack systems with ${topSkills}, I developed a discipline of balancing high-speed execution with architectural resilience and reliability.`;
          }
          // 2. Walk through a project / Problem solving approach
          else if (/(walk us through a (?:particular )?project|project that you (?:designed|initiated|built|completed)|technical project|significant project|saw through to completion|approach identifying and solving)/i.test(ql)) {
            autoValue = `At ${candEmployer}, I spearheaded an initiative to optimize our core services built with ${topSkills}. We identified throughput bottlenecks during peak load periods. I took ownership of designing an asynchronous event-processing architecture, refactoring critical database queries, and adding comprehensive automated test coverage. This project reduced our service response latency by over 30% and significantly improved system uptime.`;
          }
          // 3. Technical background / skillset alignment
          else if (/(how does your (?:technical )?background|skillset align|skills align|relevant experience|qualifications align|why are you a (?:good )?fit|fit for this (?:role|position))/i.test(ql)) {
            autoValue = `My background as a ${candTitle} at ${candEmployer} directly aligns with the technical demands of this role. I bring deep hands-on proficiency in ${topSkills}, with a proven track record of writing clean, maintainable code, implementing automated testing, and designing resilient APIs that scale under high user load.`;
          }
          // 4. Future goals / 1-year out / fellowship
          else if (/(what do you want to be doing a year out|where do you see yourself|career goals|future goals|year out from completing|fellowship help you get there|long[- ]term goals)/i.test(ql)) {
            autoValue = `One year from now, I aim to be driving high-leverage technical initiatives as a core engineer delivering mission-critical applications. Working in an engineering-first culture like ${companyName} will accelerate my technical growth by challenging me with complex distributed systems problems, and allow me to apply my expertise in ${topSkills} to build scalable solutions that make a tangible operational impact.`;
          }
          // 5. Palantir FDSE vs Software Engineer / Role resonance
          else if (/(forward deployed|fdse|resonates|which (of these )?roles?|role resonates)/i.test(ql)) {
            autoValue = `The Forward Deployed Software Engineer (FDSE) role strongly resonates with me. As a ${candTitle} at ${candEmployer}, I worked directly on customer-facing features and backend services, bridging complex business requirements with scalable architectures. I thrive when deploying mission-critical systems in the field, diagnosing real-world friction, and building robust, performant software with measurable operational impact.`;
          }
          // 6. AI Systems / Sovereign AI / Machine Learning
          else if (/(ai systems|sovereign ai|artificial intelligence|machine learning|working on ai)/i.test(ql)) {
            autoValue = `I am deeply interested in working on AI Systems because the critical bottleneck in operationalizing AI is building robust, fault-tolerant distributed infrastructure that can process high-throughput data with low latency. Having engineered production services using ${topSkills} at ${candEmployer}, I want to apply my systems engineering background to build secure, scalable AI deployment pipelines.`;
          }
          // 7. Not on resume / Outside of work / Accomplishment
          else if (/(not on your resume|outside (of )?work|proud of|accomplishment|proudest)/i.test(ql)) {
            autoValue = `Outside of the formal bullet points on my resume, I take immense pride in mentoring junior engineers and contributing to open-source developer tooling. Helping peers understand complex debugging techniques, establishing high code-review standards, and building small automation scripts that save fellow developers hours every week is one of the most rewarding parts of my engineering career.`;
          }
          // 8. Why company / Why role
          else if (/(why\b.*(?:palantir|figma|openai|company|work at|join)|why do you want to work|reason for applying|why this company)/i.test(ql)) {
            autoValue = `I want to join ${companyName} because of the exceptional engineering standards and the dedication to solving mission-critical, large-scale problems. With my background as a ${candTitle} specializing in ${topSkills} at ${candEmployer}, I am eager to contribute my technical depth and collaborate with engineers who value engineering rigor.`;
          }
          // 9. Additional information / Cover letter
          else if (/(additional information|cover letter|anything else|share with us)/i.test(ql)) {
            autoValue = candSummary || `I am an experienced ${candTitle} with a proven track record across full-stack development, distributed backend systems, and cloud infrastructure with ${topSkills}. I am authorized to work in the United States and available to start a new role with standard notice. Thank you for considering my application.`;
          }
          // 10. Bio / summary
          else if (/(bio|biography|about\s*(you|yourself)?|summary|statement)/i.test(ql)) {
            autoValue = candSummary || `Experienced ${candTitle} specializing in ${topSkills} with a strong background in architecting performant, reliable applications at ${candEmployer}.`;
          }
          // 11. Technical experience / stack description
          else if (/(experience with|skills with|tech stack|technologies have you used|tools and frameworks)/i.test(ql)) {
            autoValue = `I have extensive experience with ${skillsStr}. In my recent roles, including as a ${candTitle} at ${candEmployer}, I designed and delivered scalable production systems, optimized API response times, and maintained reliable CI/CD pipelines.`;
          }
          // 12. Conflict / Challenge / Failure
          else if (/(challenge|conflict|difficult|failure|overcame|disagree|mistake)/i.test(ql)) {
            autoValue = 'When facing complex technical challenges or unexpected production incidents, I prioritize methodical root-cause analysis, clear communication with cross-functional stakeholders, and implementing robust automated tests to prevent regressions.';
          }
          // 13. Leadership / Teamwork
          else if (/(leadership|mentor|collaborat|team|cross-functional)/i.test(ql)) {
            autoValue = 'I believe in collaborative engineering, conducting thoughtful code reviews, mentoring teammates, and maintaining high engineering standards while fostering a supportive and inclusive team environment.';
          }
          // 14. Salary
          else if (/(salary|compensation|rate|gross salary|pay expectation)/i.test(ql)) {
            autoValue = values.salary_expectation || 'Open / Competitive';
          }
          // 15. Start date
          else if (/(start date|notice|available|availability|when can you start)/i.test(ql)) {
            autoValue = values.availability || 'Immediately';
          }
          // 16. Source
          else if (/(hear|source|referral)/i.test(ql)) {
            autoValue = 'LinkedIn';
          }
          // 17. Non-repeating fallback for any other open-ended question
          else if (field.element?.tagName === 'TEXTAREA' || label.length > 25) {
            const fallbackAnswers = [
              `As a ${candTitle} at ${candEmployer}, my focus has been on architecting scalable services and delivering high-impact features with ${topSkills}. I emphasize robust system design, clean interfaces, and meeting demanding operational requirements.`,
              `In my engineering work, I prioritize code quality, maintainability, and thorough automated testing. Having built production systems with ${topSkills}, I ensure our codebase remains agile and resilient as business needs evolve.`,
              `Throughout my career, I have collaborated closely with product managers, designers, and fellow engineers to translate complex user requirements into performant technical solutions using ${topSkills}.`,
              `I approach technical challenges with disciplined root-cause analysis and telemetry-driven debugging. At ${candEmployer}, this mindset helped our team consistently reduce defect rates and improve overall service reliability.`
            ];
            autoValue = fallbackAnswers[genericTextareaIndex % fallbackAnswers.length];
            genericTextareaIndex++;
          }
        } else if (field.kind === 'checkbox') {
          const groupQuestion = (field.element?.closest('.application-question, fieldset, [role="group"], .form-group, .question')
            ?.querySelector('.application-label, legend, .question-title, [class*="label" i]')?.innerText || '').toLowerCase();
          const checkLabel = ql;
          const combined = `${groupQuestion} ${checkLabel}`;

          // 1. Legal / Consent / Terms / Acknowledgment / Arbitration / Future Contact
          if (/(agree|consent|terms|privacy|arbitration|acknowledg|certify|declare|confirm.*(?:terms|agreement|policy)|contact me|receive updates|future job)/i.test(combined)) {
            autoValue = true;
          }
          // 2. Languages: Check ONLY languages present on candidate's uploaded resume/profile
          else if (/language/i.test(combined)) {
            const knownLangs = ['english'];
            if (Array.isArray(candidate.languages)) knownLangs.push(...candidate.languages.map(l => String(l).toLowerCase()));
            if (/hindi/i.test(candResumeText) || /india|hyderabad/i.test(candResumeText + ' ' + candLocation)) knownLangs.push('hindi', 'telugu');
            autoValue = knownLangs.some(l => checkLabel.includes(l));
          }
          // 3. Start Date Cohort Windows: Check only the FIRST / earliest window, leave all others unchecked
          else if (/(cohort|dates|available dates|what are the dates|start date)/i.test(groupQuestion) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(checkLabel)) {
            const groupEl = field.element.closest('.application-question, fieldset, [role="group"], .form-group, .question, ul, div');
            const siblingBoxes = groupEl ? Array.from(groupEl.querySelectorAll('input[type="checkbox"]')) : [];
            const index = siblingBoxes.indexOf(field.element);
            autoValue = (index === 0 || index === -1);
          }
          // 4. Skills / Technologies Checklist: Check ONLY if present in candidate's skills or resume text
          else if (/(skill|technolog|tech stack|tools|frameworks|programming)/i.test(groupQuestion)) {
            const skillsText = `${candSkills} ${candSummary} ${candResumeText}`.toLowerCase();
            const cleanCheck = checkLabel.replace(/\([^)]*\)/g, '').trim().toLowerCase();
            autoValue = cleanCheck.length >= 2 && skillsText.includes(cleanCheck);
          }
          // 5. Pronouns
          else if (/(pronoun|he\/him|she\/her|they\/them)/i.test(combined)) {
            const g = String(candidate.gender || values.gender || '').toLowerCase();
            if (g.startsWith('f') || g.includes('woman') || g.includes('female')) {
              autoValue = /she\/her/i.test(checkLabel);
            } else if (g.includes('non-binary') || g.includes('they')) {
              autoValue = /they\/them/i.test(checkLabel);
            } else {
              autoValue = /he\/him/i.test(checkLabel);
            }
          }
          // 6. Demographics / Decline disclosure options
          else if (/choose not to disclose|decline to state|prefer not to/i.test(checkLabel)) {
            autoValue = false;
          }
          // 7. General unknown checkbox: Default to FALSE based on resume (never blindly check)
          else {
            autoValue = false;
          }
        }

        if (autoValue !== null && autoValue !== undefined) {
          plan.status = 'supported';
          plan.value = autoValue;
          plan.ai = true;
        } else if (aiAnswers) {
          questions.push({ id: key.slice(0, 200), label: label.slice(0, 2000), type: field.kind, options });
        }
      }
    }
    const receipts = await writer.applyFill(plans, {
      sessionId: crypto.randomUUID(),
      isCurrent: () => location.href === expectedUrl,
    });
    const filled = receipts.map(receipt => ({
      key: receipt.field.key,
      label: receipt.field.label || receipt.field.hint || 'Application field',
      value: Array.isArray(receipt.writtenValue)
        ? receipt.writtenValue.join(', ')
        : typeof receipt.writtenValue === 'boolean' ? (receipt.writtenValue ? 'Yes' : 'No') : String(receipt.writtenValue ?? ''),
      ai: receipt.ai,
      learned: receipt.learned,
    }));
    const input = page.resumeInput;
    if (input?.isConnected && resume && !input.files?.length && location.href === expectedUrl) {
      try {
        const bytes = Uint8Array.from(atob(resume.base64), char => char.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], resume.filename, { type: resume.mimeType }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (input.files?.[0]?.name === resume.filename) filled.push({ key: 'resume-file', label: 'Resume file', value: resume.filename });
      } catch {
        // A portal can require a manual upload. Leave that field in the total.
      }
    }
    return { filled, questions, total: page.fields.length + Number(!!input) };
  }

  globalThis.NextkinApplication = {
    scan() {
      const { job, hasForm } = inspect();
      return { job, hasForm, url: location.href };
    },
    fill,
    savedAnswers,
  };
})();
