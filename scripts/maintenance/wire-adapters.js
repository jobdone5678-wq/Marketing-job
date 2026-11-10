const fs = require('fs');

let engine = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

const descMarker = 'function getControlDescriptor(el) {';
if (engine.includes(descMarker) && !engine.includes('resolveActiveAdapter')) {
  const insertCode = `function getControlDescriptor(el) {
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
`;
  engine = engine.replace(descMarker, insertCode);
  fs.writeFileSync('jobright_extension/outside-job-engine.js', engine, 'utf8');
  console.log('✓ Wired platform adapter hints into getControlDescriptor');
} else {
  console.log('- getControlDescriptor already updated or marker missing');
}

