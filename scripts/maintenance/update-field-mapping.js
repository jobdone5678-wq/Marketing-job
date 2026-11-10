const fs = require('fs');

let fm = fs.readFileSync('jobright_extension/field-mapping.js', 'utf8');

// 1. Remove bare 'name' from full_name aliases and add e_signature
if (fm.includes("'your name', 'name']")) {
  fm = fm.replace(
    "full_name: ['full name', 'applicant name', 'candidate name', 'your name', 'name'],",
    "full_name: ['full name', 'applicant name', 'candidate name', 'your name'],\n    e_signature: ['e signature', 'signature', 'sign here', 'certify by entering your name', 'by entering your name into the field below'],"
  );
  console.log('✓ Updated full_name and added e_signature alias');
}

// 2. Add e_signature to values
if (!fm.includes('e_signature:')) {
  const target = "full_name: facts.full_name || candidate.full_name || '',";
  fm = fm.replace(
    target,
    target + "\n      e_signature: facts.full_name || candidate.full_name || '',"
  );
  console.log('✓ Added e_signature to values');
}

// 3. Exclude referral fields in planFill
if (!fm.includes('referr')) {
  const refSnippet = "if (/\\b(referr|referred|referral|who\\s*referred|employee\\s*who|relation\\s*to)\\b/i.test(nl + ' ' + nh)) {\n        return { field, status: 'manual', reason: 'Employee referral question.' };\n      }\n";
  fm = fm.replace(
    "const matches = [];",
    refSnippet + "      const matches = [];"
  );
  console.log('✓ Added referral check to field-mapping.js');
}

fs.writeFileSync('jobright_extension/field-mapping.js', fm, 'utf8');
console.log('field-mapping.js update finished');

