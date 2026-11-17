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

    const hasCandidateDetails = Boolean(
      candidate && (
        (values.full_name && values.full_name.trim().length > 0) ||
        (values.email && values.email.trim().length > 0) ||
        (values.phone && values.phone.trim().length > 0) ||
        (values.current_employer && values.current_employer.trim().length > 0) ||
        (values.current_title && values.current_title.trim().length > 0) ||
        (values.primary_skills && String(values.primary_skills).trim().length > 0) ||
        (resume && (resume.raw_text || resume.source_text || resume.base64)) ||
        (candidate.confirmed_facts && Object.keys(candidate.confirmed_facts).length > 0)
      )
    );

    if (!hasCandidateDetails) {
      const unfilled = plans.map(p => ({
        key: p.field.key,
        label: p.field.label || p.field.hint || 'Application question',
        kind: p.field.kind,
        reason: 'No candidate details submitted'
      }));
      return {
        filled: [],
        unfilled,
        skipped: plans.map(p => p.field),
        total: plans.length,
        questions: [],
        error: 'No candidate details available. Upload a resume and submit candidate details first.'
      };
    }

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
        let fromFact = false;
        const ql = label.toLowerCase();

        const candName = values.full_name || '';
        const candFirst = values.first_name || '';
        const candTitle = values.current_title || candidate.current_job_title || candidate.headline || '';
        const candEmployer = values.current_employer || candidate.current_company || candidate.company || '';
        const candSkills = values.primary_skills || candidate.secondary_skills || '';
        const skillsList = Array.isArray(candSkills) ? candSkills : String(candSkills).split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
        const skillsStr = skillsList.join(', ');
        const topSkills = skillsList.slice(0, 5).join(', ');
        const candExp = values.total_experience_years ? `${values.total_experience_years}+ years` : '';
        const candCity = values.current_city || candidate.city || '';
        const candState = values.current_state || candidate.state || '';
        const candLocation = values.current_location || [candCity, candState].filter(Boolean).join(', ');
        const candDegree = values.highest_education || candidate.highest_qualification || candidate.degree || '';
        const candSchool = values.school || candidate.university_name || candidate.school || '';
        const candGradYear = values.graduation_year || candidate.graduation_year || '';
        const candSummary = values.summary || values.bio || '';
        const candResumeText = (resume?.raw_text || resume?.source_text || candidate.source_text || '').toLowerCase();
        const activeJobData = capture?.read ? capture.read() : null;
        const companyName = activeJobData?.company || '';

        if (mapping.isChoiceKind(field.kind)) {
          const targetVisa = values.visa_status || candidate.visa_status || values.work_authorization || candidate.work_authorization || '';
          if (/(visa status|immigration status|work authorization status|work authorization type|type of visa)/i.test(ql) || (/(authoriz|visa)/i.test(ql) && options.some(o => /citizen|green card|permanent|h-?1b|opt|stem|f-?1|ead|sponsor/i.test(o)))) {
            if (targetVisa) {
              const tvNorm = targetVisa.toLowerCase();
              autoValue = options.find(o => {
                const ot = String(o).toLowerCase();
                if (tvNorm.includes('citizen') && ot.includes('citizen')) return true;
                if ((tvNorm.includes('green card') || tvNorm.includes('permanent')) && (ot.includes('green card') || ot.includes('permanent'))) return true;
                if ((tvNorm.includes('h-1b') || tvNorm.includes('h1b')) && (ot.includes('h-1b') || ot.includes('h1b'))) return true;
                if ((tvNorm.includes('opt') || tvNorm.includes('stem') || tvNorm.includes('f-1')) && (ot.includes('opt') || ot.includes('stem') || ot.includes('f-1') || ot.includes('ead'))) return true;
                if (tvNorm.includes('tn') && ot.includes('tn')) return true;
                if (tvNorm.includes('sponsor') && ot.includes('sponsor')) return true;
                return ot.includes(tvNorm) || tvNorm.includes(ot);
              }) || options.find(o => new RegExp(`^${targetVisa}\\b`, 'i').test(o)) || targetVisa;
              fromFact = true;
            }
          } else if (/(authoriz|eligible|legal right|citizen)/i.test(ql) && !/(require|need|sponsor)/i.test(ql)) {
            if (values.authorized_in_usa !== undefined && values.authorized_in_usa !== null && values.authorized_in_usa !== '') {
              const affirmative = values.authorized_in_usa === true || values.authorized_in_usa === 'true';
              autoValue = options.find(o => mapping.normalizeBoolean(o) === affirmative) || (affirmative ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || affirmative;
              fromFact = true;
            }
          } else if (/(full-time|onsite|internship|summer internship|start date.*internship)/i.test(ql)) {
            if (values.availability || candidate.availability || values.authorized_in_usa !== undefined) {
              autoValue = options.find(o => mapping.normalizeBoolean(o) === true) || options.find(o => /^yes\b/i.test(o)) || true;
              fromFact = true;
            }
          } else if (/(currently enrolled|phd program|degree program)/i.test(ql)) {
            if (candDegree || candResumeText) {
              const hasProgram = /phd|doctor|master|bachelor|student|enrolled/i.test(candDegree) || /phd|doctor|master|bachelor|enrolled/i.test(candResumeText);
              if (hasProgram) {
                autoValue = options.find(o => mapping.normalizeBoolean(o) === true) || options.find(o => /^yes\b/i.test(o)) || true;
                fromFact = true;
              }
            }
          } else if (/(require|need).*(sponsor|visa)/i.test(ql)) {
            if (values.needs_sponsorship !== undefined && values.needs_sponsorship !== null && values.needs_sponsorship !== '') {
              const needSponsor = values.needs_sponsorship === true || values.needs_sponsorship === 'true';
              autoValue = options.find(o => mapping.normalizeBoolean(o) === needSponsor) || (needSponsor ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || needSponsor;
              fromFact = true;
            }
          } else if (/(worked for|worked before|employee or a contractor)/i.test(ql)) {
            if (candEmployer || (Array.isArray(candidate.employment_history) && candidate.employment_history.length > 0)) {
              const workedThere = Boolean(
                companyName && (
                  (candEmployer && candEmployer.toLowerCase().includes(companyName.toLowerCase())) ||
                  (Array.isArray(candidate.employment_history) && candidate.employment_history.some(e => (e.company || '').toLowerCase().includes(companyName.toLowerCase())))
                )
              );
              autoValue = options.find(o => mapping.normalizeBoolean(o) === workedThere) || (workedThere ? options.find(o => /^yes\b/i.test(o)) : options.find(o => /^no\b/i.test(o))) || workedThere;
              fromFact = true;
            }
          } else if (/(gender|sex)/i.test(ql)) {
            const candGender = candidate.gender || candidate.confirmed_facts?.gender || values.gender;
            if (candGender) {
              autoValue = options.find(o => new RegExp(`^${candGender}\\b`, 'i').test(o)) || options.find(o => new RegExp(candGender, 'i').test(o)) || candGender;
              fromFact = true;
            }
          } else if (/(hispanic|latino)/i.test(ql) && !/(race|ethnic)/i.test(ql)) {
            const candRace = candidate.race || candidate.race_ethnicity || candidate.confirmed_facts?.race || candidate.confirmed_facts?.race_ethnicity || values.race;
            if (candRace) {
              const crNorm = String(candRace || '').toLowerCase();
              if (crNorm.includes('hispanic') && !crNorm.includes('not hispanic') && !crNorm.includes('not latino')) {
                autoValue = options.find(o => /^(yes|true)/i.test(o)) || 'Yes';
              } else if (crNorm.includes('decline') || crNorm.includes('prefer not') || crNorm.includes('choose not')) {
                autoValue = options.find(o => /decline|prefer not|choose not|do not wish/i.test(o)) || options.find(o => /^no\b/i.test(o)) || 'Decline';
              } else {
                autoValue = options.find(o => /^(no|false)/i.test(o)) || 'No';
              }
              fromFact = true;
            }
          } else if (/(race|ethnic)/i.test(ql)) {
            const candRace = candidate.race || candidate.race_ethnicity || candidate.confirmed_facts?.race || candidate.confirmed_facts?.race_ethnicity || values.race;
            if (candRace) {
              const crNorm = String(candRace).trim().toLowerCase();
              const crClean = crNorm.replace(/\(not hispanic or latino\)/gi, '').trim();
              let matched = null;

              // 1. Direct match
              matched = options.find(o => o.trim().toLowerCase() === crNorm);

              // 2. Semantic EEOC category matching
              if (!matched) {
                if ((crNorm.includes('hispanic') || crNorm.includes('latino')) && !crNorm.includes('not hispanic') && !crNorm.includes('not latino')) {
                  matched = options.find(o => {
                    const ot = o.toLowerCase();
                    return (ot.includes('hispanic') || ot.includes('latino')) && !ot.includes('not hispanic') && !ot.includes('not latino');
                  });
                } else if (crClean.includes('white') || crClean.includes('caucasian')) {
                  matched = options.find(o => /white|caucasian/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('black') || crClean.includes('african')) {
                  matched = options.find(o => /black|african[ -]?american/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('hawaiian') || crClean.includes('pacific islander')) {
                  matched = options.find(o => /hawaiian|pacific\s*islander/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('asian')) {
                  matched = options.find(o => {
                    const otClean = o.replace(/\(not hispanic or latino\)/gi, '').toLowerCase();
                    return /asian/i.test(otClean) && !/pacific/i.test(otClean);
                  });
                } else if (crClean.includes('american indian') || crClean.includes('alaska') || crClean.includes('indigenous') || crClean.includes('native american')) {
                  matched = options.find(o => /american\s*indian|alaska|native\s*american|indigenous/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('two or more') || crClean.includes('multiracial')) {
                  matched = options.find(o => /two\s*or\s*more|multiracial/i.test(o.replace(/\(not hispanic or latino\)/gi, '')));
                } else if (crClean.includes('decline') || crClean.includes('prefer not') || crClean.includes('choose not') || crClean.includes('not self-identify') || crClean.includes('do not wish')) {
                  matched = options.find(o => /decline|prefer not|choose not|do not wish/i.test(o));
                }
              }

              // 3. Prefix or fuzzy fallback
              if (!matched) {
                matched = options.find(o => {
                  const otClean = o.replace(/\(not hispanic or latino\)/gi, '').trim().toLowerCase();
                  return otClean && (otClean.startsWith(crClean) || crClean.startsWith(otClean));
                });
              }

              autoValue = matched || candRace;
              fromFact = true;
            }
          } else if (/(veteran)/i.test(ql)) {
            const candVet = candidate.veteran || candidate.veteran_status || candidate.confirmed_facts?.veteran || candidate.confirmed_facts?.veteran_status || values.veteran;
            if (candVet) {
              const cvNorm = candVet.toLowerCase();
              if (cvNorm.includes('not a protected veteran') || cvNorm.includes('not a veteran')) {
                autoValue = options.find(o => /not a (?:protected )?veteran|^no\b|neither|do not identify|not a veteran/i.test(o)) || candVet;
              } else if (cvNorm.includes('identify as one or more') || cvNorm.includes('protected veteran')) {
                autoValue = options.find(o => /i identify as one or more|protected veteran|active duty|veteran\b/i.test(o) && !/not a/i.test(o)) || candVet;
              } else if (cvNorm.includes('do not wish') || cvNorm.includes('prefer not')) {
                autoValue = options.find(o => /prefer not|choose not|decline|do not wish/i.test(o)) || candVet;
              } else {
                autoValue = options.find(o => new RegExp(candVet.slice(0, 15), 'i').test(o)) || candVet;
              }
              fromFact = true;
            }
          } else if (/(disabil)/i.test(ql)) {
            const candDis = candidate.disability || candidate.disability_status || candidate.confirmed_facts?.disability || candidate.confirmed_facts?.disability_status || values.disability;
            if (candDis) {
              const cdNorm = candDis.toLowerCase();
              if (cdNorm.includes('not have a disability') || cdNorm.includes('no disability')) {
                autoValue = options.find(o => /no,? (?:i )?do not have|no disability|^no\b/i.test(o)) || candDis;
              } else if (cdNorm.includes('have a disability') && !cdNorm.includes('not')) {
                autoValue = options.find(o => /yes,? (?:i )?(?:have|do have)|have a disability|^yes\b/i.test(o)) || candDis;
              } else if (cdNorm.includes('do not wish') || cdNorm.includes('prefer not')) {
                autoValue = options.find(o => /prefer not|choose not|decline|do not wish/i.test(o)) || candDis;
              } else {
                autoValue = options.find(o => new RegExp(candDis.slice(0, 15), 'i').test(o)) || candDis;
              }
              fromFact = true;
            }
          } else if (/(pronoun)/i.test(ql)) {
            const explicit = candidate.pronouns || values.pronouns || '';
            if (explicit) {
              autoValue = options.find(o => new RegExp(explicit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o)) || explicit;
              fromFact = true;
            } else if (candidate.gender || values.gender) {
              const g = String(candidate.gender || values.gender || '').toLowerCase();
              if (g.startsWith('f') || g.includes('woman') || g.includes('female')) {
                autoValue = options.find(o => /she\/her/i.test(o));
              } else if (g.includes('non-binary') || g.includes('they')) {
                autoValue = options.find(o => /they\/them/i.test(o));
              } else if (g.startsWith('m') || g.includes('man') || g.includes('male')) {
                autoValue = options.find(o => /he\/him/i.test(o));
              }
              if (autoValue) fromFact = true;
            }
          } else if (/(degree|education|bachelor|master|phd|doctor|college|university|qualification)/i.test(ql)) {
            const isYesNo = options.some(o => /^(yes|true)$/i.test(o)) && options.some(o => /^(no|false)$/i.test(o));
            if (isYesNo) {
              const candidateHasBachelor = /bachelor|b\.?tech|b\.?s|b\.?a|undergraduate/i.test(candDegree) || /bachelor/i.test(candResumeText);
              const candidateHasMaster = /master|m\.?s|m\.?tech|mba/i.test(candDegree) || /master/i.test(candResumeText);
              const candidateHasDoctorate = /phd|doctor/i.test(candDegree);

              let satisfies = false;
              if (/(master|graduate degree)/i.test(ql)) {
                satisfies = candidateHasMaster || candidateHasDoctorate;
              } else if (/(phd|doctorate)/i.test(ql)) {
                satisfies = candidateHasDoctorate;
              } else if (/(bachelor|undergraduate|degree|education|college|university|completed.*degree)/i.test(ql)) {
                satisfies = candidateHasBachelor || candidateHasMaster || candidateHasDoctorate;
              }

              if (satisfies) {
                autoValue = options.find(o => /^(yes|true)$/i.test(o)) || true;
              } else {
                autoValue = options.find(o => /^(no|false)$/i.test(o)) || false;
              }
            } else {
              if (/master/i.test(candDegree)) {
                autoValue = options.find(o => /master/i.test(o));
              } else if (/phd|doctor/i.test(candDegree)) {
                autoValue = options.find(o => /phd|doctor/i.test(o));
              } else if (/bachelor|b\.?tech|b\.?s|b\.?a/i.test(candDegree) || /bachelor/i.test(candResumeText)) {
                autoValue = options.find(o => /bachelor|undergraduate|b\.?s|b\.?a|b\.?tech/i.test(o)) || options.find(o => /college|degree/i.test(o));
              } else if (candDegree) {
                autoValue = options.find(o => new RegExp(candDegree.slice(0, 15), 'i').test(o));
              }
            }
          } else if (/(country)/i.test(ql)) {
            const targetCountry = values.country || candidate.country || '';
            if (targetCountry) {
              autoValue = options.find(o => new RegExp(`^${targetCountry}$`, 'i').test(o)) || options.find(o => new RegExp(targetCountry, 'i').test(o)) || targetCountry;
            }
          } else if (/(where do you intend to work|intend to work|work location)/i.test(ql)) {
            const pref = candidate.preferred_work_type || candidate.work_location_preference || '';
            if (pref) {
              autoValue = options.find(o => new RegExp(pref, 'i').test(o));
              fromFact = true;
            }
          } else if (/(location|city)/i.test(ql)) {
            if (candCity) {
              autoValue = options.find(o => new RegExp(`\\b${candCity}\\b`, 'i').test(o));
            }
          } else if (/(graduate|graduation|year)/i.test(ql)) {
            if (candGradYear) {
              autoValue = options.find(o => o.includes(candGradYear));
            }
          } else if (/(hear|source|how did you)/i.test(ql)) {
            const src = values.how_heard || candidate.how_heard || '';
            if (src) {
              autoValue = options.find(o => new RegExp(src, 'i').test(o)) || src;
            }
          }
        } else if (field.kind === 'text' || field.kind === 'textarea') {
          // Bio / summary / statement / cover letter
          if (/(additional information|cover letter|anything else|share with us|bio|biography|about\s*(you|yourself)?|summary|statement)/i.test(ql)) {
            if (candSummary) {
              autoValue = candSummary;
            }
          }
          // Salary / compensation
          else if (/(salary|compensation|rate|gross salary|pay expectation)/i.test(ql)) {
            if (values.salary_expectation || candidate.salary_expectation) {
              autoValue = values.salary_expectation || candidate.salary_expectation;
            }
          }
          // Start date / availability
          else if (/(start date|notice|available|availability|when can you start)/i.test(ql)) {
            if (values.availability || candidate.availability) {
              autoValue = values.availability || candidate.availability;
            }
          }
          // Source / How did you hear
          else if (/(hear|source|referral)/i.test(ql)) {
            if (values.how_heard || candidate.how_heard) {
              autoValue = values.how_heard || candidate.how_heard;
            }
          }
          // Skills / Tech stack overview
          else if (/(experience with|skills with|tech stack|technologies have you used|tools and frameworks)/i.test(ql)) {
            if (skillsStr) {
              autoValue = skillsStr;
            }
          }
          // LinkedIn profile
          else if (/(linkedin|linked\s*in)/i.test(ql)) {
            if (values.linkedin_url || candidate.linkedin_url) {
              autoValue = values.linkedin_url || candidate.linkedin_url;
            }
          }
          // Location / City
          else if (/(current location|city|where are you located|present location)/i.test(ql) && !/(relocat|work location)/i.test(ql)) {
            if (values.current_location || values.location || candCity) {
              autoValue = values.current_location || values.location || candCity;
            }
          }
          // Work authorization & Visa text
          else if (/(work authorization|visa status|immigration status|work permit)/i.test(ql)) {
            if (values.work_authorization || values.visa_status || candidate.work_authorization || candidate.visa_status) {
              autoValue = values.work_authorization || values.visa_status || candidate.work_authorization || candidate.visa_status;
            }
          }
          // NO synthetic fallback essays or made-up narratives. If not in candidate profile, leave as null.
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
            const candLangs = Array.isArray(candidate.languages) ? candidate.languages.map(l => String(l).toLowerCase()) : [];
            if (candLangs.length > 0) {
              autoValue = candLangs.some(l => checkLabel.includes(l));
            }
          }
          // 3. Start Date Cohort Windows: Check only if candidate declared an availability date
          else if (/(cohort|dates|available dates|what are the dates|start date)/i.test(groupQuestion) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(checkLabel)) {
            if (values.availability || candidate.availability || candidate.available_to_join) {
              const targetAvail = String(values.availability || candidate.availability || candidate.available_to_join).toLowerCase();
              autoValue = targetAvail.includes(checkLabel) || checkLabel.includes(targetAvail);
            }
          }
          // 4. Skills / Technologies Checklist: Check ONLY if present in candidate's skills or resume text
          else if (/(skill|technolog|tech stack|tools|frameworks|programming)/i.test(groupQuestion)) {
            const skillsText = `${candSkills} ${candSummary} ${candResumeText}`.toLowerCase();
            const cleanCheck = checkLabel.replace(/\([^)]*\)/g, '').trim().toLowerCase();
            autoValue = cleanCheck.length >= 2 && skillsText.includes(cleanCheck);
          }
          // 5. Pronouns
          else if (/(pronoun|he\/him|she\/her|they\/them)/i.test(combined)) {
            const explicit = candidate.pronouns || values.pronouns || '';
            const g = String(candidate.gender || values.gender || '').toLowerCase();
            if (explicit) {
              autoValue = new RegExp(explicit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(checkLabel);
            } else if (g.startsWith('f') || g.includes('woman') || g.includes('female')) {
              autoValue = /she\/her/i.test(checkLabel);
            } else if (g.includes('non-binary') || g.includes('they')) {
              autoValue = /they\/them/i.test(checkLabel);
            } else if (g.startsWith('m') || g.includes('man') || g.includes('male')) {
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
          plan.ai = !fromFact;
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
    const filledKeys = new Set(filled.map(f => f.key));
    const unfilled = [];
    for (const plan of plans) {
      if (!filledKeys.has(plan.field.key)) {
        unfilled.push({
          key: plan.field.key,
          label: plan.field.label || plan.field.hint || 'Application question',
          kind: plan.field.kind,
          reason: 'Missing from uploaded details'
        });
      }
    }
    if (input?.isConnected && resume && (!input.files || !input.files.length)) {
      unfilled.unshift({
        key: 'resume-file',
        label: 'Resume file',
        kind: 'file',
        reason: 'Portal requires manual file attachment'
      });
    }
    return { filled, unfilled, questions, total: page.fields.length + Number(!!input) };
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
