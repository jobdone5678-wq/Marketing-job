const fs = require('fs');

let engine = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

const duplicateBlock = `function getControlDescriptor(el) {
    let parts = [];
    const rootNode = el.getRootNode();
    const doc = el.ownerDocument || document;

    // Platform Adapter Hint Resolver (Ashby, Greenhouse, Lever, Workday, iCIMS, SmartRecruiters, Taleo, etc.)
    try {
      const resolver = (root && root.resolveActiveAdapter) || (globalThis && globalThis.resolveActiveAdapter);
      if (resolver) {
        const adapter = resolver(window.location.hostname);
        if (adapter && typeof adapter.hint === 'function') {
          const h = adapter.hint(el);
          if (h && typeof h === 'string') parts.push(h);
        }
      }
    } catch {}

    let parts = [];
    const rootNode = el.getRootNode();`;

const cleanedBlock = `function getControlDescriptor(el) {
    let parts = [];
    const rootNode = el.getRootNode();
    const doc = el.ownerDocument || document;

    // Platform Adapter Hint Resolver (Ashby, Greenhouse, Lever, Workday, iCIMS, SmartRecruiters, Taleo, etc.)
    try {
      const resolver = (root && root.resolveActiveAdapter) || (globalThis && globalThis.resolveActiveAdapter);
      if (resolver) {
        const adapter = resolver(window.location.hostname);
        if (adapter && typeof adapter.hint === 'function') {
          const h = adapter.hint(el);
          if (h && typeof h === 'string') parts.push(h);
        }
      }
    } catch {}`;

if (engine.includes(duplicateBlock)) {
  engine = engine.replace(duplicateBlock, cleanedBlock);
  fs.writeFileSync('jobright_extension/outside-job-engine.js', engine, 'utf8');
  console.log('✓ Fixed duplicate let parts / rootNode declaration in getControlDescriptor');
} else {
  // Try CRLF / LF normalization
  const normalizedEngine = engine.replace(/\r\n/g, '\n');
  const normalizedDup = duplicateBlock.replace(/\r\n/g, '\n');
  const normalizedClean = cleanedBlock.replace(/\r\n/g, '\n');
  if (normalizedEngine.includes(normalizedDup)) {
    const fixed = normalizedEngine.replace(normalizedDup, normalizedClean);
    fs.writeFileSync('jobright_extension/outside-job-engine.js', fixed, 'utf8');
    console.log('✓ Fixed duplicate declaration with normalized line breaks');
  } else {
    console.log('- duplicateBlock not found');
  }
}

