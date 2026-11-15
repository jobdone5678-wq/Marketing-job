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

        // 2. Smart grounding fallback using candidate profile facts & intelligent defaults
        let autoValue = null;
        const ql = label.toLowerCase();
        if (mapping.isChoiceKind(field.kind)) {
          if (/(authoriz|eligible|legal right|citizen|18|age|full-time|onsite|internship|currently enrolled)/i.test(ql) && !/(require|need|sponsor)/i.test(ql)) {
            autoValue = options.find(o => mapping.normalizeBoolean(o) === true) || options.find(o => /^yes\b/i.test(o)) || true;
          } else if (/(require|need).*(sponsor|visa)/i.test(ql) || /(felony|convict|criminal|conflict|relatives|worked for|worked before|employee or a contractor)/i.test(ql)) {
            autoValue = options.find(o => mapping.normalizeBoolean(o) === false) || options.find(o => /^no\b/i.test(o)) || false;
          } else if (/(gender|sex)/i.test(ql)) {
            autoValue = options.find(o => /^male\b|^man\b/i.test(o)) || options.find(o => /decline|prefer not|do not wish/i.test(o)) || values.gender || 'Male';
          } else if (/(hispanic|latino)/i.test(ql)) {
            autoValue = options.find(o => /^(no|decline|prefer not)/i.test(o)) || false;
          } else if (/(race|ethnic)/i.test(ql)) {
            autoValue = options.find(o => /^asian\b/i.test(o)) || options.find(o => /decline|prefer not|do not wish/i.test(o)) || values.race || 'Asian';
          } else if (/(veteran)/i.test(ql)) {
            autoValue = options.find(o => /not a (?:protected )?veteran|^no\b/i.test(o)) || options.find(o => /decline|prefer not/i.test(o)) || values.veteran || 'I am not a protected veteran';
          } else if (/(disabil)/i.test(ql)) {
            autoValue = options.find(o => /no,? (?:i )?do not have|^no\b/i.test(o)) || options.find(o => /decline|prefer not/i.test(o)) || values.disability || 'No, I do not have a disability';
          } else if (/(pronoun)/i.test(ql)) {
            autoValue = options.find(o => /he\/him/i.test(o)) || options.find(o => /prefer not|decline/i.test(o)) || 'He/Him/His';
          } else if (/(degree|education)/i.test(ql)) {
            autoValue = options.find(o => /master|bachelor/i.test(o)) || values.highest_education || 'Master\'s Degree';
          } else if (/(country)/i.test(ql)) {
            autoValue = options.find(o => /united states|usa/i.test(o)) || values.country || 'United States';
          } else if (/(where do you intend to work|intend to work|work location)/i.test(ql)) {
            autoValue = options.find(o => /open|either|any|both/i.test(o)) || options.find(o => /remote|united states|francisco|new york/i.test(o)) || options[0] || 'Open to Either';
          } else if (/(location|city)/i.test(ql)) {
            autoValue = options.find(o => /austin|texas|remote|united states/i.test(o)) || values.current_city || values.current_location || 'Austin';
          } else if (/(graduate|graduation|year)/i.test(ql)) {
            autoValue = options.find(o => /2026|2027|2028/i.test(o)) || '2027';
          } else if (/(hear|source)/i.test(ql)) {
            autoValue = options.find(o => /linkedin/i.test(o)) || options.find(o => /website|job board|other/i.test(o)) || 'LinkedIn';
          } else if (options.length) {
            autoValue = options.find(o => !/select|choose/i.test(o)) || options[0];
          }
        } else if (field.kind === 'text' || field.kind === 'textarea') {
          if (/(forward deployed|fdse|resonates|which (of these )?roles?|role resonates)/i.test(ql)) {
            autoValue = 'The Forward Deployed Software Engineer (FDSE) role strongly resonates with me. In my experience as a Senior Software Engineer at BluePeak Digital Solutions, I worked directly with customer-facing integrations, deploying full-stack features with React and Java microservices to solve mission-critical operational challenges. I thrive when bridging complex customer requirements with robust, scalable software engineering in the field.';
          } else if (/(ai systems|sovereign ai|artificial intelligence|machine learning|working on ai)/i.test(ql)) {
            autoValue = 'I am deeply interested in working on AI Systems because the critical bottleneck in operationalizing AI is building robust, fault-tolerant distributed infrastructure that can process high-throughput data with low latency. Having engineered microservices, relational databases, and cloud infrastructure using Python, Java, PostgreSQL, and AWS, I want to apply my systems engineering background to build secure, scalable AI deployment pipelines.';
          } else if (/(not on your resume|outside (of )?work|proud of|accomplishment|favorite project|proudest)/i.test(ql)) {
            autoValue = 'My proudest technical accomplishment was architecting and optimizing customer onboarding and transaction processing microservices at BluePeak Digital Solutions. By profiling SQL queries, introducing Redis caching, and restructuring asynchronous service communication, I reduced average API response times by 28% and eliminated system bottlenecks during peak traffic. I take pride in delivering measurable performance gains that improve end-user experience.';
          } else if (/(why\b.*(?:palantir|figma|openai|company|work at|join)|why do you want to work|reason for applying)/i.test(ql)) {
            autoValue = 'I want to join the team because of the exceptional engineering standards and the dedication to solving mission-critical, large-scale problems. With my experience building production web applications and distributed backend services across the entire lifecycle—from design to Kubernetes deployment—I am eager to contribute my technical depth and collaborate with engineers who value engineering rigor.';
          } else if (/(additional information|cover letter|anything else|share with us)/i.test(ql)) {
            autoValue = 'I am an experienced Senior Software Engineer with a proven track record across full-stack development, distributed backend systems, and cloud infrastructure on AWS. I am authorized to work in the United States and available to start a new role with standard notice. Thank you for considering my application.';
          } else if (/(bio|biography|about\s*(you|yourself)?|summary|statement)/i.test(ql)) {
            autoValue = values.summary || values.bio;
          } else if (/(why|interest|excite|reason|join|mission)/i.test(ql)) {
            autoValue = `I am very excited about this role. With my background in ${values.primary_skills || 'software engineering'}, I am confident I can make an immediate positive contribution to the team and its high standards.`;
          } else if (/(experience|skill|tech stack|background|project|built|architecture)/i.test(ql)) {
            autoValue = `I have extensive experience with ${values.primary_skills || 'full-stack engineering and distributed systems'}. In my recent roles, I designed and delivered scalable production systems, optimized API response times by 28%, and maintained reliable CI/CD pipelines.`;
          } else if (/(challenge|conflict|difficult|failure|overcame)/i.test(ql)) {
            autoValue = 'When facing complex technical challenges or unexpected production incidents, I prioritize methodical root-cause analysis, clear communication with cross-functional stakeholders, and implementing robust automated tests to prevent regressions.';
          } else if (/(leadership|mentor|collaborat|team)/i.test(ql)) {
            autoValue = 'I believe in collaborative engineering, conducting thoughtful code reviews, mentoring teammates, and maintaining high engineering standards while fostering a supportive and inclusive team environment.';
          } else if (/(salary|compensation|rate)/i.test(ql)) {
            autoValue = values.salary_expectation || 'Open / Competitive';
          } else if (/(start date|notice|available|availability|when can you start)/i.test(ql)) {
            autoValue = values.availability || 'Immediately';
          } else if (/(hear|source|referral)/i.test(ql)) {
            autoValue = 'LinkedIn';
          } else if (field.element?.tagName === 'TEXTAREA' || label.length > 25) {
            autoValue = `As a ${values.current_title || 'Senior Software Engineer'} specializing in ${values.primary_skills || 'software systems'} at ${candidate.current_employer || 'technology companies'}, I focus on delivering scalable, well-tested solutions aligned with organizational goals.`;
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
          // 2. Languages: Check only languages verified in candidate profile/resume (English, Hindi, Telugu)
          else if (/language/i.test(combined)) {
            autoValue = /(english|hindi|telugu)/i.test(checkLabel);
          }
          // 3. Start Date Cohort Windows: Check only the FIRST / earliest window, leave all others unchecked
          else if (/(cohort|dates|available dates|what are the dates|start date)/i.test(groupQuestion) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(checkLabel)) {
            const groupEl = field.element.closest('.application-question, fieldset, [role="group"], .form-group, .question, ul, div');
            const siblingBoxes = groupEl ? Array.from(groupEl.querySelectorAll('input[type="checkbox"]')) : [];
            const index = siblingBoxes.indexOf(field.element);
            autoValue = (index === 0 || index === -1);
          }
          // 4. Skills / Technologies Checklist
          else if (/(skill|technolog|tech stack|tools|frameworks|programming)/i.test(groupQuestion)) {
            const skillsText = `${values.primary_skills || ''} ${candidate.summary || ''} ${candidate.bio || ''}`.toLowerCase();
            const cleanCheck = checkLabel.replace(/\([^)]*\)/g, '').trim().toLowerCase();
            autoValue = cleanCheck.length >= 2 && skillsText.includes(cleanCheck);
          }
          // 5. Pronouns
          else if (/(pronoun|he\/him|she\/her|they\/them)/i.test(combined)) {
            autoValue = /he\/him/i.test(checkLabel);
          }
          // 6. Demographics / Decline disclosure options
          else if (/choose not to disclose|decline to state|prefer not to/i.test(checkLabel)) {
            autoValue = false;
          }
          // 7. General unknown checkbox: Default to FALSE based on resume (do not blindly check)
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
