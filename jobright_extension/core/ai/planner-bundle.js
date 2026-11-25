// src/lib/ai/grounded.ts
function normalize(str) {
  return String(str ?? "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeKey(str) {
  return String(str ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function parseClaimedYears(text) {
  const norm = String(text || "").trim();
  if (!norm) return null;
  const rangeMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const high = parseFloat(rangeMatch[2]);
    if (!isNaN(high)) return high;
  }
  const match = norm.match(/\b(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)?\b/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return val;
  }
  const plainNum = parseFloat(norm);
  return isNaN(plainNum) ? null : plainNum;
}
function getDegreeTier(text) {
  const str = normalize(text);
  if (!str) return 0;
  if (/\b(ph\s*d|doctorate|doctoral|doctor of)\b/i.test(str)) return 5;
  if (/\b(master|masters|graduate|postgraduate|ms|ma|mba|msc|m\.tech|m\.s\.|m\.a\.)\b/i.test(str)) return 4;
  if (/\b(bachelor|bachelors|undergraduate|bs|ba|btech|b\.e\.|b\.tech|b\.s\.|b\.a\.|college degree|university degree)\b/i.test(str)) return 3;
  if (/\b(associate|associates|aa|as|a\.a\.|a\.s\.)\b/i.test(str)) return 2;
  if (/\b(high school|ged|secondary)\b/i.test(str)) return 1;
  return 0;
}
function isNegativeStance(text) {
  const norm = normalize(text);
  if (/^(no|false|none|n\s*a|never|not applicable)$/i.test(norm)) return true;
  if (/\b(not authorized|unauthorized|no right to work|ineligible)\b/i.test(norm)) return true;
  if (/\b(do not|does not|will not|don t|won t|no longer|without|cannot|not require|do not require|does not require|will not require)\b/i.test(norm)) return true;
  return false;
}
function isPositiveStance(text) {
  if (isNegativeStance(text)) return false;
  const norm = normalize(text);
  if (/^(yes|true|i do|i will|definitely|correct)$/i.test(norm)) return true;
  if (/\b(authorized|legally authorized|eligible|permitted|i am authorized|right to work)\b/i.test(norm)) return true;
  if (/\b(yes\b|require|need|will require|sponsorship required|require sponsorship|need sponsorship)\b/i.test(norm)) return true;
  return false;
}
function resolveQuestionMeta(q) {
  if (typeof q === "string") {
    return {
      text: q,
      canonical: normalizeKey(q),
      category: ""
    };
  }
  const text = [q.label, q.name, q.hint].filter(Boolean).join(" ");
  const canonical = normalizeKey(q.canonical_name || q.field_key || "");
  const category = normalizeKey(q.category || "");
  const skill = q.skill ? String(q.skill).trim() : void 0;
  return { text, canonical, category, skill };
}
function validateGroundedAnswer(answer, facts, question) {
  const unresolvedResult = (reason, evidenceIds = []) => ({
    valid: false,
    evidenceIds,
    source: "unresolved",
    action: "skip",
    requiresReview: true,
    reason
  });
  const validResult = (evidenceIds, source = "verified", requiresReview = false) => ({
    valid: true,
    evidenceIds,
    source,
    action: "fill",
    requiresReview
  });
  if (!answer || typeof answer !== "string" || !answer.trim()) {
    return unresolvedResult("Empty or invalid answer provided");
  }
  if (!facts || !(facts instanceof Map) || facts.size === 0) {
    return unresolvedResult("No verified facts available to ground answer");
  }
  const { text: qText, canonical, category, skill: explicitSkill } = resolveQuestionMeta(question);
  const normQ = normalize(qText);
  const normAns = normalize(answer);
  for (const [factId, fact] of facts.entries()) {
    if (factId.startsWith("answer_bank.")) {
      const topic = factId.replace("answer_bank.", "");
      const factValNorm = normalize(fact.value);
      const topicInQ = category === topic || canonical === topic || normQ.includes(topic.replace(/_/g, " "));
      const exactAnswerMatch = factValNorm === normAns;
      if (exactAnswerMatch || topicInQ && (factValNorm.includes(normAns) || normAns.includes(factValNorm))) {
        return validResult([factId], "answer_bank");
      }
    }
  }
  const isSponsorshipQuestion = canonical === "needs_sponsorship" || canonical === "need_sponsorship_future" || canonical === "need_sponsorship_now" || category === "sponsorship" || /\b(sponsor(?:ship)?|visa\s+sponsor)\b/i.test(normQ);
  const isAuthQuestion = canonical === "authorized_in_usa" || category === "work_auth" || /\b(authorized\s+to\s+work|legally\s+authorized|legal\s+right\s+to\s+work|work\s+authoriz)\b/i.test(normQ);
  if (isSponsorshipQuestion) {
    const isSpecificFuture = /\b(future|now\s+or\s+in\s+the\s+future|in\s+the\s+future)\b/i.test(normQ) || canonical === "need_sponsorship_future";
    const isSpecificNow = /\b(currently|now)\b/i.test(normQ) && !isSpecificFuture;
    const futureFact = facts.get("profile.work_auth.need_sponsorship_future");
    const nowFact = facts.get("profile.work_auth.need_sponsorship_now");
    if (!futureFact && !nowFact) {
      return unresolvedResult("Missing verified work authorization / sponsorship facts");
    }
    let candidateRequiresSponsorship;
    const evidenceIds = [];
    if (isSpecificNow && nowFact) {
      candidateRequiresSponsorship = Boolean(nowFact.value);
      evidenceIds.push(nowFact.id);
    } else if (futureFact) {
      candidateRequiresSponsorship = Boolean(futureFact.value);
      evidenceIds.push(futureFact.id);
      if (nowFact) evidenceIds.push(nowFact.id);
    } else {
      candidateRequiresSponsorship = Boolean(nowFact?.value);
      if (nowFact) evidenceIds.push(nowFact.id);
    }
    const answerClaimsSponsorship = isPositiveStance(answer);
    const answerDeniesSponsorship = isNegativeStance(answer);
    if (candidateRequiresSponsorship) {
      if (answerDeniesSponsorship) {
        return unresolvedResult("Negation reversal: Candidate requires visa sponsorship, but answer states No", evidenceIds);
      }
      if (answerClaimsSponsorship) {
        return validResult(evidenceIds, "verified", true);
      }
    } else {
      if (answerClaimsSponsorship) {
        return unresolvedResult("Negation reversal: Candidate does not require sponsorship, but answer claims Yes/sponsorship", evidenceIds);
      }
      if (answerDeniesSponsorship) {
        return validResult(evidenceIds, "verified");
      }
    }
    return unresolvedResult("Ambiguous sponsorship answer lacking clear stance", evidenceIds);
  }
  if (isAuthQuestion) {
    const authFact = facts.get("profile.work_auth.authorized_in_usa");
    if (!authFact) {
      return unresolvedResult("Missing profile.work_auth.authorized_in_usa fact");
    }
    const candidateAuthorized = Boolean(authFact.value);
    const answerClaimsAuthorized = isPositiveStance(answer);
    const answerDeniesAuthorized = isNegativeStance(answer);
    if (candidateAuthorized) {
      if (answerDeniesAuthorized) {
        return unresolvedResult("Negation reversal: Candidate is authorized in USA, but answer claims No", [authFact.id]);
      }
      if (answerClaimsAuthorized) {
        return validResult([authFact.id], "verified");
      }
    } else {
      if (answerClaimsAuthorized) {
        return unresolvedResult("Negation reversal: Candidate is not authorized in USA, but answer claims Yes", [authFact.id]);
      }
      if (answerDeniesAuthorized) {
        return validResult([authFact.id], "verified");
      }
    }
    return unresolvedResult("Ambiguous authorization answer", [authFact.id]);
  }
  const isExpQuestion = canonical === "total_experience_years" || canonical === "relevant_experience_years" || category === "experience" || /\b(years?\s+of\s+experience|total\s+experience|how\s+many\s+years|experience\s+with)\b/i.test(normQ);
  if (isExpQuestion) {
    const claimedYears = parseClaimedYears(answer);
    let targetSkillKey = explicitSkill ? normalizeKey(explicitSkill) : null;
    if (!targetSkillKey) {
      for (const factId of facts.keys()) {
        if (factId.startsWith("profile.skills.")) {
          const sKey = factId.replace("profile.skills.", "");
          if (sKey !== "list" && normQ.includes(sKey.replace(/_/g, " "))) {
            targetSkillKey = sKey;
            break;
          }
        }
      }
    }
    if (targetSkillKey) {
      const skillFact = facts.get(`profile.skills.${targetSkillKey}`);
      const totalExpFact2 = facts.get("profile.experience.total_years");
      if (!skillFact) {
        if (claimedYears !== null && claimedYears > 0) {
          return unresolvedResult(`Unconfirmed skill experience: Candidate has no verified experience for skill '${targetSkillKey}'`);
        }
        if (isNegativeStance(answer) || claimedYears === 0) {
          return validResult([], "verified");
        }
        return unresolvedResult(`No evidence for skill '${targetSkillKey}'`);
      }
      let verifiedYears;
      if (skillFact.type === "number" && typeof skillFact.value === "number") {
        verifiedYears = skillFact.value;
      } else if (totalExpFact2 && typeof totalExpFact2.value === "number") {
        verifiedYears = totalExpFact2.value;
      } else {
        verifiedYears = 0;
      }
      if (claimedYears !== null) {
        if (claimedYears > verifiedYears) {
          return unresolvedResult(
            `Experience inflation: Claimed ${claimedYears} years for skill '${targetSkillKey}' exceeds verified ceiling of ${verifiedYears} years`,
            [skillFact.id]
          );
        }
        return validResult([skillFact.id], "verified");
      }
      if (isPositiveStance(answer)) {
        return validResult([skillFact.id], "verified");
      }
      return unresolvedResult(`Could not validate answer '${answer}' against skill '${targetSkillKey}'`, [skillFact.id]);
    }
    const totalExpFact = facts.get("profile.experience.total_years") || facts.get("profile.experience.relevant_years");
    if (!totalExpFact || typeof totalExpFact.value !== "number") {
      return unresolvedResult("Missing profile.experience.total_years fact");
    }
    const verifiedTotalYears = totalExpFact.value;
    if (claimedYears !== null) {
      if (claimedYears > verifiedTotalYears) {
        return unresolvedResult(
          `Experience inflation: Claimed ${claimedYears} years exceeds verified ceiling of ${verifiedTotalYears} years`,
          [totalExpFact.id]
        );
      }
      return validResult([totalExpFact.id], "verified");
    }
    return unresolvedResult("Could not parse numeric years from answer", [totalExpFact.id]);
  }
  const isEducationQuestion = canonical === "highest_education" || canonical === "highest_qualification" || category === "education" || /\b(highest\s+level\s+of\s+education|highest\s+degree|degree\s+level|level\s+of\s+completed\s+education|bachelor|master|doctorate|phd)\b/i.test(normQ);
  if (isEducationQuestion) {
    const degreeFact = facts.get("profile.education.degree") || facts.get("profile.education.highest_qualification");
    if (!degreeFact) {
      return unresolvedResult("Missing profile.education.degree fact");
    }
    const candidateTier = getDegreeTier(degreeFact.value);
    const questionTargetTier = getDegreeTier(qText);
    if (questionTargetTier > 0) {
      if (candidateTier < questionTargetTier) {
        if (isPositiveStance(answer) || getDegreeTier(answer) >= questionTargetTier) {
          return unresolvedResult(
            `Degree elevation: Candidate holds tier ${candidateTier} but answer claims tier ${questionTargetTier}`,
            [degreeFact.id]
          );
        }
        if (isNegativeStance(answer)) {
          return validResult([degreeFact.id], "verified");
        }
      } else {
        if (isNegativeStance(answer)) {
          return unresolvedResult("Negation error: Candidate qualifies for requested degree tier but answered No", [degreeFact.id]);
        }
        if (isPositiveStance(answer) || getDegreeTier(answer) >= questionTargetTier) {
          return validResult([degreeFact.id], "verified");
        }
      }
    }
    const claimedTier = getDegreeTier(answer);
    if (claimedTier > 0) {
      if (claimedTier > candidateTier) {
        return unresolvedResult(
          `Degree elevation: Claimed tier ${claimedTier} exceeds verified qualification tier ${candidateTier}`,
          [degreeFact.id]
        );
      }
      return validResult([degreeFact.id], "verified");
    }
    if (normAns && normalize(degreeFact.value).includes(normAns)) {
      return validResult([degreeFact.id], "verified");
    }
    return unresolvedResult("Could not validate education claim against verified qualification", [degreeFact.id]);
  }
  const isCertQuestion = canonical === "certifications" || category === "certification" || /\b(certifi(?:cation|ed|cate)s?)\b/i.test(normQ);
  if (isCertQuestion) {
    const certsFact = facts.get("profile.certifications");
    const verifiedCerts = certsFact && Array.isArray(certsFact.value) ? certsFact.value : [];
    let matchedCert = null;
    for (const cert of verifiedCerts) {
      const normCert = normalize(cert);
      if (normQ.includes(normCert) || normCert.includes(normQ) || normAns.includes(normCert) || normCert.includes(normAns)) {
        matchedCert = cert;
        break;
      }
    }
    if (matchedCert) {
      if (isNegativeStance(answer)) {
        return unresolvedResult("Negation error: Candidate holds certification but answered No", ["profile.certifications"]);
      }
      if (isPositiveStance(answer) || normalize(answer).includes(normalize(matchedCert))) {
        const specificCertFactId = `profile.certifications.${normalizeKey(matchedCert)}`;
        const evidenceId = facts.has(specificCertFactId) ? specificCertFactId : "profile.certifications";
        return validResult([evidenceId], "verified");
      }
    } else {
      if (isNegativeStance(answer)) {
        return validResult([], "verified");
      }
      return unresolvedResult(`Unconfirmed certification: Candidate does not hold certification in '${answer}'`);
    }
  }
  const fieldMapping = {
    current_city: "profile.location.city",
    city: "profile.location.city",
    current_state: "profile.location.state",
    state: "profile.location.state",
    country: "profile.location.country",
    zip_code: "profile.location.zip_code",
    postal_code: "profile.location.zip_code",
    full_address: "profile.location.full_address",
    full_name: "profile.name",
    name: "profile.name",
    email: "profile.contact.email",
    phone: "profile.contact.phone",
    linkedin_url: "profile.contact.linkedin",
    github_url: "profile.contact.github",
    website: "profile.contact.website",
    current_employer: "profile.experience.current_employer",
    current_job_title: "profile.experience.current_title"
  };
  const matchedFactId = fieldMapping[canonical] || fieldMapping[category];
  if (matchedFactId) {
    const fact = facts.get(matchedFactId);
    if (!fact) {
      return unresolvedResult(`Missing verified fact for ${matchedFactId}`);
    }
    const factNorm = normalize(fact.value);
    if (factNorm === normAns || factNorm.includes(normAns) || normAns.includes(factNorm)) {
      return validResult([fact.id], "verified");
    }
    return unresolvedResult(`Answer '${answer}' does not match verified fact '${fact.value}'`, [fact.id]);
  }
  if (/\b(city|where do you live)\b/i.test(normQ)) {
    const cityFact = facts.get("profile.location.city");
    if (cityFact && (normalize(cityFact.value) === normAns || normAns.includes(normalize(cityFact.value)))) {
      return validResult([cityFact.id], "verified");
    }
  }
  const isRelocQuestion = canonical === "open_to_relocation" || canonical === "willing_to_relocate" || category === "relocation" || /\b(relocat(?:e|ion)|willing\s+to\s+move)\b/i.test(normQ);
  if (isRelocQuestion) {
    const relocFact = facts.get("profile.preferences.open_to_relocation") || facts.get("profile.open_to_relocation");
    if (relocFact) {
      const openToReloc = Boolean(relocFact.value);
      if (openToReloc) {
        if (isPositiveStance(answer)) return validResult([relocFact.id], "verified");
        if (isNegativeStance(answer)) return unresolvedResult("Negation error: Candidate is willing to relocate but answered No", [relocFact.id]);
      } else {
        if (isNegativeStance(answer)) return validResult([relocFact.id], "verified");
        if (isPositiveStance(answer)) return unresolvedResult("Negation error: Candidate is not willing to relocate but answered Yes", [relocFact.id]);
      }
    }
  }
  if (/\b(preferred\s+location|list\s+preferred\s+locations?)\b/i.test(normQ)) {
    const prefLocFact = facts.get("profile.preferences.preferred_locations") || facts.get("profile.preferred_locations");
    if (prefLocFact && typeof prefLocFact.value === "string") {
      return validResult([prefLocFact.id], "verified");
    }
  }
  return unresolvedResult("Answer is not grounded in candidate verified facts");
}

// src/lib/ai/planner.ts
var SYSTEM_PROMPT = `You map a candidate's profile onto a job-application form.

You are given the form's fields (each with its label, type, and whether it is a
custom-widget combobox) and the candidate's profile. Return the values to write.

Rules:
- Only use values present in the profile. If a field has no basis in the profile,
  leave it out. Never invent, guess, or write a placeholder.
- Where "combo" is true the field is a custom dropdown whose options are not
  visible yet. Include it, with an empty value, only if you expect the profile to
  answer it; the real options will be read from the page and you will be asked to
  pick one. Leave it out entirely if the profile plainly cannot answer it.
- For a native select, the value must be one of its listed options exactly.
- For a checkbox, the value is "true" or "false". A field carrying "options" is a
  group of checkboxes: the value is one of those options, or several separated by
  commas.
- A field may take part of a profile value (e.g. the city out of a location).
- Address each field by its label, copied exactly as given.

Respond with JSON: {"fills":[{"label":"...","value":"..."}]}`;
function factsToProfileObject(facts) {
  const profile = {};
  for (const [id, fact] of facts.entries()) {
    profile[id] = fact.value;
  }
  return profile;
}
function inferQuestionDescriptor(field) {
  const label = field.label || "";
  const norm = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let canonical = "";
  let category = "";
  if (/\b(first\s*name|last\s*name|full\s*name|legal\s*name|candidate\s*name|your\s*name)\b/.test(norm)) {
    canonical = "name";
    category = "personal";
  } else if (/\b(email|email\s*address)\b/.test(norm)) {
    canonical = "email";
    category = "contact";
  } else if (/\b(phone|mobile|cell|telephone)\b/.test(norm)) {
    canonical = "phone";
    category = "contact";
  } else if (/\b(city|current\s*city)\b/.test(norm)) {
    canonical = "city";
    category = "location";
  } else if (/\b(state|province|region)\b/.test(norm)) {
    canonical = "state";
    category = "location";
  } else if (/\b(country|residence|nation)\b/.test(norm)) {
    canonical = "country";
    category = "location";
  } else if (/\b(zip|postal|postcode|zipcode)\b/.test(norm)) {
    canonical = "postal_code";
    category = "location";
  } else if (/\b(address|street)\b/.test(norm)) {
    canonical = "full_address";
    category = "location";
  } else if (/\b(linkedin)\b/.test(norm)) {
    canonical = "linkedin_url";
    category = "contact";
  } else if (/\b(github)\b/.test(norm)) {
    canonical = "github_url";
    category = "contact";
  } else if (/\b(website|portfolio)\b/.test(norm)) {
    canonical = "website";
    category = "contact";
  } else if (/\b(sponsor|visa)\b/.test(norm)) {
    canonical = "needs_sponsorship";
    category = "work_auth";
  } else if (/\b(authoriz|authorized|legal\s*right\s*to\s*work)\b/.test(norm)) {
    canonical = "authorized_in_usa";
    category = "work_auth";
  } else if (/\b(years?\s*of\s*experience|total\s*experience|experience\s*years)\b/.test(norm)) {
    canonical = "total_experience_years";
    category = "experience";
  } else if (/\b(degree|education|highest\s*qualification|highest\s*education)\b/.test(norm)) {
    canonical = "highest_qualification";
    category = "education";
  } else if (/\b(certifi|license)\b/.test(norm)) {
    canonical = "certifications";
    category = "certification";
  } else {
    canonical = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    options: field.options,
    required: field.required,
    canonical_name: canonical,
    category
  };
}
function normalizeFieldLabel(label) {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
async function planFormBatch(fields, facts, client, context) {
  if (!fields || fields.length === 0) {
    return { fills: [], executableFills: [], unmapped: [], deferred: [], batchCount: 0 };
  }
  const batchSize = Math.max(4, Math.min(6, context?.batchSize ?? 5));
  const batchCount = Math.ceil(fields.length / batchSize);
  const profile = factsToProfileObject(facts);
  const previouslyResolved = {
    ...context?.previouslyResolved || {}
  };
  const allFills = [];
  const filledFields = /* @__PURE__ */ new Set();
  const deferredFields = /* @__PURE__ */ new Set();
  const deferredSet = /* @__PURE__ */ new Set();
  const usageFields = [
    "inputTokens",
    "outputTokens",
    "promptTokens",
    "completionTokens",
    "totalTokens"
  ];
  const aggregatedUsage = {};
  let hasUsage = false;
  let totalDurationMs = void 0;
  for (let i = 0; i < batchCount; i++) {
    const start = i * batchSize;
    const end = Math.min(fields.length, start + batchSize);
    const targetFields = fields.slice(start, end);
    const neighborFields = fields.filter((_, idx) => idx < start || idx >= end).map((f) => ({
      label: f.label,
      type: f.type || "text",
      required: !!f.required,
      combo: !!f.combo
    }));
    const serializedTargetFields = targetFields.map((f) => ({
      ...f.id !== void 0 ? { fieldId: f.id } : {},
      label: f.label,
      type: f.type || "text",
      required: !!f.required,
      combo: !!f.combo,
      options: f.options
    }));
    const userPayload = {
      fields: serializedTargetFields,
      fieldsToFill: serializedTargetFields,
      neighborFields,
      neighbors: neighborFields,
      previouslyResolved: { ...previouslyResolved },
      context: {
        jobTitle: context?.jobTitle,
        company: context?.company,
        url: context?.url,
        previouslyResolved: { ...previouslyResolved }
      },
      profile
    };
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload, null, 2) }
    ];
    const completion = await client.generateChatCompletion(messages, {
      responseFormat: "json_object",
      schemaName: "plan"
    });
    if (completion.usage) {
      for (const key of usageFields) {
        const val = completion.usage[key];
        if (typeof val === "number" && Number.isFinite(val)) {
          aggregatedUsage[key] = (aggregatedUsage[key] ?? 0) + val;
          hasUsage = true;
        }
      }
    }
    if (typeof completion.durationMs === "number" && Number.isFinite(completion.durationMs)) {
      totalDurationMs = (totalDurationMs ?? 0) + completion.durationMs;
    }
    const parsed = completion.rawJson || {};
    const fillsRaw = Array.isArray(parsed.fills) ? parsed.fills : [];
    const handledFields = /* @__PURE__ */ new Set();
    for (const rawFill of fillsRaw) {
      if (!rawFill || typeof rawFill !== "object") continue;
      const rawFieldId = typeof rawFill.fieldId === "string" ? rawFill.fieldId.trim() : "";
      let targetField;
      if (rawFieldId !== "") {
        targetField = targetFields.find(
          (f) => !handledFields.has(f) && (f.id === rawFill.fieldId || f.name === rawFill.fieldId || f.id === rawFieldId || f.name === rawFieldId)
        );
        if (!targetField) continue;
      } else {
        if (typeof rawFill.label !== "string") continue;
        const normalizedRawLabel = normalizeFieldLabel(rawFill.label);
        targetField = targetFields.find(
          (f) => !handledFields.has(f) && normalizeFieldLabel(f.label) === normalizedRawLabel
        );
        if (!targetField) continue;
      }
      handledFields.add(targetField);
      if (rawFill.action === "skip") {
        continue;
      }
      const fillValue = typeof rawFill.value === "string" ? rawFill.value : String(rawFill.value ?? "");
      if (rawFill.action === "defer_combobox") {
        if (targetField.combo) {
          deferredFields.add(targetField);
          deferredSet.add(targetField.label);
          previouslyResolved[targetField.label] = "[deferred combobox]";
        }
        continue;
      }
      if (targetField.combo && fillValue.trim() === "") {
        deferredFields.add(targetField);
        deferredSet.add(targetField.label);
        previouslyResolved[targetField.label] = "[deferred combobox]";
        continue;
      }
      if (fillValue.trim() !== "") {
        const descriptor = inferQuestionDescriptor(targetField);
        const grounding = validateGroundedAnswer(fillValue, facts, descriptor);
        if (grounding.valid && grounding.action !== "skip") {
          filledFields.add(targetField);
          allFills.push({
            label: targetField.label,
            value: fillValue,
            frame: targetField.frame,
            form: targetField.form,
            fieldId: targetField.id,
            evidenceIds: grounding.evidenceIds,
            grounded: true
          });
          previouslyResolved[targetField.label] = fillValue;
        }
      }
    }
  }
  const deferred = Array.from(deferredSet);
  const unmapped = fields.filter((f) => !filledFields.has(f) && !deferredFields.has(f)).map((f) => f.label);
  const executableFills = allFills.filter(
    (f) => typeof f.fieldId === "string" && f.fieldId.trim().length > 0
  );
  const telemetry = hasUsage || totalDurationMs !== void 0 ? {
    ...hasUsage ? { usage: aggregatedUsage } : {},
    ...totalDurationMs !== void 0 ? { durationMs: totalDurationMs } : {}
  } : void 0;
  return {
    fills: allFills,
    executableFills,
    unmapped,
    deferred,
    batchCount,
    ...telemetry !== void 0 ? { telemetry } : {}
  };
}

// src/lib/ai/chooser.ts
var CHOOSE_PROMPT = `You are answering ONE question on a job-application form by
picking from the options it offers.

You are given the question, the exact options available, and the candidate's
profile. Pick the single option the profile supports.

Rules:
- Return an option copied exactly from the list. Never return anything else.
- If the profile does not answer the question, return an empty choice \u2014
  declining is the correct answer whenever nothing in the profile supports any
  of the options.
- A location option is supported by the candidate's location (a profile of
  "Berlin, Germany" supports the option "Germany"). A visa-sponsorship,
  notice-period, salary or relocation option is supported when the profile
  states the matching field (visa_sponsorship_needed, notice_period,
  desired_salary, willing_to_relocate) and that value is consistent with the
  option.
- Never infer a claim the profile does not state.

Respond with JSON: {"choice":"..."}`;
function factsToProfileObject2(facts) {
  const profile = {};
  for (const [id, fact] of facts.entries()) {
    profile[id] = fact.value;
  }
  return profile;
}
async function chooseComboboxOption(question, options, facts, client) {
  if (!options || options.length === 0) {
    return { choice: null, reason: "No options provided" };
  }
  const profile = factsToProfileObject2(facts);
  const userPayload = {
    question: question.label,
    required: !!question.required,
    options,
    profile
  };
  const messages = [
    { role: "system", content: CHOOSE_PROMPT },
    { role: "user", content: JSON.stringify(userPayload, null, 2) }
  ];
  const completion = await client.generateChatCompletion(messages, {
    responseFormat: "json_object",
    schemaName: "choose"
  });
  const telemetry = completion.usage !== void 0 || completion.durationMs !== void 0 ? {
    ...completion.usage !== void 0 ? { usage: completion.usage } : {},
    ...completion.durationMs !== void 0 ? { durationMs: completion.durationMs } : {}
  } : void 0;
  const telemetryField = telemetry !== void 0 ? { telemetry } : {};
  const parsed = completion.rawJson || {};
  const rawChoice = typeof parsed.choice === "string" ? parsed.choice.trim() : "";
  if (!rawChoice) {
    return {
      choice: null,
      reason: "Model declined to answer or profile lacks support",
      ...telemetryField
    };
  }
  const matchedOption = options.find(
    (opt) => opt === rawChoice || opt.trim().toLowerCase() === rawChoice.toLowerCase()
  );
  if (!matchedOption) {
    return {
      choice: null,
      reason: `Model choice "${rawChoice}" was not offered in options`,
      ...telemetryField
    };
  }
  const descriptor = inferQuestionDescriptor(question);
  const grounding = validateGroundedAnswer(matchedOption, facts, descriptor);
  if (!grounding.valid || grounding.action === "skip") {
    return {
      choice: null,
      reason: grounding.reason || `Choice "${matchedOption}" is not grounded in verified facts`,
      ...telemetryField
    };
  }
  return {
    choice: matchedOption,
    evidenceIds: grounding.evidenceIds,
    ...telemetryField
  };
}

// src/lib/ai/verified-facts.ts
function normalizeKey2(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function parseNumber(val) {
  if (val === null || val === void 0) return null;
  if (typeof val === "number") {
    return isNaN(val) ? null : val;
  }
  const s = String(val).trim();
  if (!s) return null;
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}
function parseBoolean(val) {
  if (val === true || val === false) return val;
  if (val === null || val === void 0) return null;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "1") return true;
    if (s === "false" || s === "no" || s === "0") return false;
  }
  return null;
}
function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}
function findSnippet(evidence, fieldName) {
  if (!Array.isArray(evidence) || evidence.length === 0) return void 0;
  const match = evidence.find(
    (e) => e && (e.field === fieldName || normalizeKey2(e.field) === normalizeKey2(fieldName))
  );
  return match?.snippet?.trim() || void 0;
}
function parseSkillString(skillStr) {
  if (!skillStr || typeof skillStr !== "string") return [];
  const items = skillStr.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const result = [];
  for (const item of items) {
    const yearMatch = item.match(/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|\+)?\s*\)$/i);
    if (yearMatch) {
      result.push({
        name: yearMatch[1].trim(),
        years: parseFloat(yearMatch[2])
      });
    } else {
      result.push({ name: item });
    }
  }
  return result;
}
function buildVerifiedFacts(candidate, answerBank) {
  const facts = /* @__PURE__ */ new Map();
  if (!candidate || typeof candidate !== "object") {
    return facts;
  }
  const evidence = candidate.evidence;
  const addFact = (id, type, value, category, source = "profile", evidenceField) => {
    const rawSnippet = evidenceField ? findSnippet(evidence, evidenceField) : findSnippet(evidence, id);
    facts.set(id, {
      id,
      type,
      value,
      source,
      category,
      ...rawSnippet ? { rawSnippet } : {}
    });
  };
  if (isNonEmptyString(candidate.full_name)) {
    addFact("profile.name", "string", candidate.full_name.trim(), "personal", "profile", "full_name");
  }
  if (isNonEmptyString(candidate.email)) {
    addFact("profile.contact.email", "string", candidate.email.trim(), "contact", "profile", "email");
  }
  if (isNonEmptyString(candidate.phone)) {
    addFact("profile.contact.phone", "string", candidate.phone.trim(), "contact", "profile", "phone");
  }
  if (isNonEmptyString(candidate.linkedin_url)) {
    addFact("profile.contact.linkedin", "string", candidate.linkedin_url.trim(), "contact", "profile", "linkedin_url");
  }
  if (isNonEmptyString(candidate.github_url)) {
    addFact("profile.contact.github", "string", candidate.github_url.trim(), "contact", "profile", "github_url");
  }
  if (isNonEmptyString(candidate.website)) {
    addFact("profile.contact.website", "string", candidate.website.trim(), "contact", "profile", "website");
  }
  if (isNonEmptyString(candidate.current_city)) {
    addFact("profile.location.city", "string", candidate.current_city.trim(), "location", "profile", "current_city");
  }
  if (isNonEmptyString(candidate.current_state)) {
    addFact("profile.location.state", "string", candidate.current_state.trim(), "location", "profile", "current_state");
  }
  const countryVal = candidate.country || candidate.current_country;
  if (isNonEmptyString(countryVal)) {
    addFact("profile.location.country", "string", countryVal.trim(), "location", "profile", "country");
  }
  if (isNonEmptyString(candidate.zip_code)) {
    addFact("profile.location.zip_code", "string", candidate.zip_code.trim(), "location", "profile", "zip_code");
  }
  if (isNonEmptyString(candidate.full_address)) {
    addFact("profile.location.full_address", "string", candidate.full_address.trim(), "location", "profile", "full_address");
  }
  const visaStatus = candidate.visa_status || candidate.work_authorization;
  if (isNonEmptyString(visaStatus)) {
    addFact("profile.work_auth.visa_status", "string", visaStatus.trim(), "work_auth", "profile", "visa_status");
  }
  const authUsa = parseBoolean(candidate.authorized_in_usa);
  if (authUsa !== null) {
    addFact("profile.work_auth.authorized_in_usa", "boolean", authUsa, "work_auth", "profile", "authorized_in_usa");
  }
  const sponNow = parseBoolean(candidate.need_sponsorship_now);
  if (sponNow !== null) {
    addFact("profile.work_auth.need_sponsorship_now", "boolean", sponNow, "work_auth", "profile", "need_sponsorship_now");
  }
  const sponFuture = parseBoolean(candidate.need_sponsorship_future);
  if (sponFuture !== null) {
    addFact("profile.work_auth.need_sponsorship_future", "boolean", sponFuture, "work_auth", "profile", "need_sponsorship_future");
  }
  const openToReloc = parseBoolean(candidate.open_to_relocation);
  if (openToReloc !== null) {
    addFact("profile.preferences.open_to_relocation", "boolean", openToReloc, "personal", "profile", "open_to_relocation");
    addFact("profile.open_to_relocation", "boolean", openToReloc, "personal", "profile", "open_to_relocation");
  }
  if (isNonEmptyString(candidate.preferred_locations)) {
    addFact("profile.preferences.preferred_locations", "string", candidate.preferred_locations.trim(), "location", "profile", "preferred_locations");
    addFact("profile.preferred_locations", "string", candidate.preferred_locations.trim(), "location", "profile", "preferred_locations");
  }
  const totalExp = parseNumber(candidate.total_experience_years);
  if (totalExp !== null) {
    addFact("profile.experience.total_years", "number", totalExp, "experience", "profile", "total_experience_years");
  }
  const relExp = parseNumber(candidate.relevant_experience_years);
  if (relExp !== null) {
    addFact("profile.experience.relevant_years", "number", relExp, "experience", "profile", "relevant_experience_years");
  }
  if (isNonEmptyString(candidate.current_employer)) {
    addFact("profile.experience.current_employer", "string", candidate.current_employer.trim(), "experience", "profile", "current_employer");
  }
  if (isNonEmptyString(candidate.current_job_title)) {
    addFact("profile.experience.current_title", "string", candidate.current_job_title.trim(), "experience", "profile", "current_job_title");
  }
  const skillsList = [];
  const registerSkill = (name, years, source = "profile") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!skillsList.includes(trimmed)) skillsList.push(trimmed);
    const key = normalizeKey2(trimmed);
    if (!key) return;
    const id = `profile.skills.${key}`;
    if (years !== void 0 && years !== null && !isNaN(years)) {
      addFact(id, "number", years, "skill", source, `skill.${key}`);
    } else {
      addFact(id, "boolean", true, "skill", source, `skill.${key}`);
    }
  };
  if (typeof candidate.primary_skills === "string") {
    for (const item of parseSkillString(candidate.primary_skills)) {
      registerSkill(item.name, item.years);
    }
  } else if (Array.isArray(candidate.primary_skills)) {
    for (const item of candidate.primary_skills) {
      if (typeof item === "string") registerSkill(item);
    }
  }
  if (typeof candidate.secondary_skills === "string") {
    for (const item of parseSkillString(candidate.secondary_skills)) {
      registerSkill(item.name, item.years);
    }
  } else if (Array.isArray(candidate.secondary_skills)) {
    for (const item of candidate.secondary_skills) {
      if (typeof item === "string") registerSkill(item);
    }
  }
  if (Array.isArray(candidate.skills)) {
    for (const item of candidate.skills) {
      if (typeof item === "string") {
        registerSkill(item);
      } else if (item && typeof item === "object" && "name" in item) {
        registerSkill(item.name, item.years);
      }
    }
  } else if (candidate.skills && typeof candidate.skills === "object") {
    for (const [sName, sYears] of Object.entries(candidate.skills)) {
      const parsedY = parseNumber(sYears);
      registerSkill(sName, parsedY !== null ? parsedY : void 0);
    }
  }
  if (candidate.confirmed_facts?.skills && typeof candidate.confirmed_facts.skills === "object") {
    for (const [sName, sVal] of Object.entries(candidate.confirmed_facts.skills)) {
      const parsedY = parseNumber(sVal);
      registerSkill(sName, parsedY !== null ? parsedY : void 0, "confirmed_facts");
    }
  }
  if (skillsList.length > 0) {
    addFact("profile.skills.list", "string[]", skillsList, "skill", "profile", "primary_skills");
  }
  if (isNonEmptyString(candidate.highest_qualification)) {
    const qual = candidate.highest_qualification.trim();
    addFact("profile.education.degree", "string", qual, "education", "profile", "highest_qualification");
    addFact("profile.education.highest_qualification", "string", qual, "education", "profile", "highest_qualification");
  }
  if (isNonEmptyString(candidate.university_name)) {
    const uni = candidate.university_name.trim();
    addFact("profile.education.university", "string", uni, "education", "profile", "university_name");
    addFact("profile.education.university_name", "string", uni, "education", "profile", "university_name");
  }
  const gradYear = parseNumber(candidate.graduation_year);
  if (gradYear !== null) {
    addFact("profile.education.graduation_year", "number", gradYear, "education", "profile", "graduation_year");
  }
  const certList = [];
  if (isNonEmptyString(candidate.certifications)) {
    const rawCerts = candidate.certifications.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean);
    certList.push(...rawCerts);
  } else if (Array.isArray(candidate.certifications)) {
    for (const c of candidate.certifications) {
      if (typeof c === "string" && c.trim()) {
        certList.push(c.trim());
      }
    }
  }
  if (certList.length > 0) {
    addFact("profile.certifications", "string[]", certList, "certification", "profile", "certifications");
    for (const cert of certList) {
      const certKey = normalizeKey2(cert);
      if (certKey) {
        addFact(`profile.certifications.${certKey}`, "boolean", true, "certification", "profile", "certifications");
      }
    }
  }
  if (answerBank) {
    const registerAnswerBankFact = (topic, answerText) => {
      const cleanTopic = normalizeKey2(topic);
      const cleanAnswer = String(answerText || "").trim();
      if (cleanTopic && cleanAnswer) {
        addFact(`answer_bank.${cleanTopic}`, "string", cleanAnswer, "answer_bank", "answer_bank");
      }
    };
    if (answerBank instanceof Map) {
      for (const [topic, entry] of answerBank.entries()) {
        if (typeof entry === "string") {
          registerAnswerBankFact(topic, entry);
        } else if (entry && typeof entry === "object") {
          const ans = entry.answer || entry.answer_text || "";
          registerAnswerBankFact(topic, ans);
        }
      }
    } else if (Array.isArray(answerBank)) {
      for (const entry of answerBank) {
        if (Array.isArray(entry) && entry.length >= 2) {
          registerAnswerBankFact(String(entry[0]), String(entry[1]));
        } else if (entry && typeof entry === "object") {
          const e = entry;
          const topic = e.topic || e.question || "";
          const ans = e.answer || e.answer_text || "";
          if (topic && ans) {
            registerAnswerBankFact(topic, ans);
          }
        }
      }
    } else if (typeof answerBank === "object") {
      for (const [topic, entry] of Object.entries(answerBank)) {
        if (typeof entry === "string") {
          registerAnswerBankFact(topic, entry);
        } else if (entry && typeof entry === "object") {
          const ans = entry.answer || entry.answer_text || "";
          registerAnswerBankFact(topic, ans);
        }
      }
    }
  }
  return facts;
}

// src/lib/ai/provider-client.ts
var ProviderError = class extends Error {
  constructor(message, status = 500, code, responseBody) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.code = code;
    this.responseBody = responseBody;
  }
};
function stripMarkdownFences(text) {
  if (!text) return "";
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let startIdx = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    const lastBrace = trimmed.lastIndexOf("}");
    if (lastBrace > startIdx) {
      return trimmed.slice(startIdx, lastBrace + 1).trim();
    }
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    const lastBracket = trimmed.lastIndexOf("]");
    if (lastBracket > startIdx) {
      return trimmed.slice(startIdx, lastBracket + 1).trim();
    }
  }
  return trimmed;
}
function resolveCompletionsUrl(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}
function isHtml(text, contentType) {
  if (contentType && contentType.toLowerCase().includes("text/html")) {
    return true;
  }
  const clean = text.trim().toLowerCase();
  return clean.startsWith("<!doctype html") || /<html[\s>]/i.test(clean);
}
function isUnsupportedParamError(status, bodyText) {
  if (status !== 400) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes("response_format") || lower.includes("unsupported parameter") || lower.includes("unrecognized request argument") || lower.includes("extra_forbidden") || lower.includes("json_object");
}
var ProviderClient = class {
  constructor(configOrBaseUrl, apiKey, model, options) {
    // Capability cache: true until proven unsupported by HTTP 400
    this._supportsJsonMode = true;
    if (typeof configOrBaseUrl === "string") {
      this.baseUrl = configOrBaseUrl;
      this.apiKey = apiKey;
      this.model = model || "gpt-4o-mini";
      this.agent = options?.agent;
      this.defaultTimeoutMs = options?.timeoutMs ?? 2e4;
      this.customFetch = options?.fetchFn;
      this.customHeaders = options?.headers;
    } else {
      this.baseUrl = configOrBaseUrl.baseUrl;
      this.apiKey = configOrBaseUrl.apiKey;
      this.model = configOrBaseUrl.model;
      this.agent = configOrBaseUrl.agent;
      this.defaultTimeoutMs = configOrBaseUrl.timeoutMs ?? 2e4;
      this.customFetch = configOrBaseUrl.fetchFn;
      this.customHeaders = configOrBaseUrl.headers;
    }
    if (!this.baseUrl) {
      throw new Error("ProviderClient requires a non-empty baseUrl");
    }
  }
  get supportsJsonMode() {
    return this._supportsJsonMode;
  }
  set supportsJsonMode(value) {
    this._supportsJsonMode = value;
  }
  /**
   * Generates chat completion with capability detection, timeout, and markdown stripping.
   */
  async generateChatCompletion(messages, options) {
    const wantsJson = options?.responseFormat !== "text";
    const sendJsonMode = wantsJson && this.supportsJsonMode;
    try {
      return await this._executeRequest(messages, options, sendJsonMode);
    } catch (err) {
      if (sendJsonMode && err instanceof ProviderError && err.status === 400 && err.responseBody && isUnsupportedParamError(err.status, err.responseBody)) {
        this.supportsJsonMode = false;
        return await this._executeRequest(messages, options, false);
      }
      throw err;
    }
  }
  async _executeRequest(messages, options, sendJsonMode = false) {
    const url = resolveCompletionsUrl(this.baseUrl);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    let effectiveMessages = [...messages];
    if (options?.responseFormat !== "text" && !sendJsonMode) {
      const jsonConstraint = "\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown fences, preamble, or commentary.";
      const lastMsg = effectiveMessages[effectiveMessages.length - 1];
      if (lastMsg) {
        effectiveMessages[effectiveMessages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + jsonConstraint
        };
      }
    }
    const payload = {
      model: this.model,
      messages: effectiveMessages,
      temperature: options?.temperature ?? 0
    };
    if (options?.maxTokens !== void 0) {
      payload.max_tokens = options.maxTokens;
    }
    if (sendJsonMode) {
      payload.response_format = { type: "json_object" };
    }
    const headers = {
      "Content-Type": "application/json",
      ...this.customHeaders
    };
    if (this.apiKey && this.apiKey.trim().length > 0) {
      headers["Authorization"] = `Bearer ${this.apiKey.trim()}`;
    }
    const fetchFn = this.customFetch || globalThis.fetch;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw new ProviderError("Request was aborted", 499, "ABORTED");
      }
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const requestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "error"
    };
    if (this.agent) {
      requestInit.agent = this.agent;
      requestInit.dispatcher = this.agent;
    }
    let response;
    try {
      response = await fetchFn(url, requestInit);
    } catch (fetchErr) {
      clearTimeout(timer);
      if (timedOut || fetchErr.name === "AbortError" || fetchErr.message?.includes("aborted")) {
        throw new ProviderError(`Request timed out after ${timeoutMs}ms`, 504, "TIMEOUT");
      }
      if (fetchErr.message && /redirect/i.test(fetchErr.message)) {
        throw new ProviderError("Redirects are not permitted", 308, "REDIRECT_BLOCKED");
      }
      throw new ProviderError(`Network fetch error: ${fetchErr.message}`, 500, "FETCH_ERROR");
    } finally {
      clearTimeout(timer);
    }
    const contentType = response.headers.get("content-type");
    const rawBody = await response.text();
    if (isHtml(rawBody, contentType)) {
      throw new ProviderError("Endpoint returned HTML error page instead of JSON", 502, "HTML_RESPONSE", rawBody);
    }
    if (!response.ok) {
      throw new ProviderError(
        `Provider returned HTTP ${response.status}: ${rawBody}`,
        response.status,
        "HTTP_ERROR",
        rawBody
      );
    }
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawBody);
    } catch {
      throw new ProviderError("Provider returned malformed JSON response", 502, "MALFORMED_JSON", rawBody);
    }
    const choice = parsedResponse.choices?.[0];
    const messageContent = choice?.message?.content ?? choice?.text ?? "";
    const cleanedText = stripMarkdownFences(messageContent);
    let rawJson = void 0;
    try {
      rawJson = JSON.parse(cleanedText);
    } catch {
    }
    return {
      text: cleanedText,
      rawJson
    };
  }
};
export {
  ProviderClient,
  ProviderError,
  buildVerifiedFacts,
  chooseComboboxOption,
  inferQuestionDescriptor,
  planFormBatch,
  validateGroundedAnswer
};
