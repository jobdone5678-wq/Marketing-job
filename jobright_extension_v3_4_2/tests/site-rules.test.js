// Run: node tests/site-rules.test.js
const path = require('path');
globalThis.chrome = undefined;
const SR = (() => { require(path.resolve(__dirname, '../jobright_extension/core/site-rules.js')); return globalThis.NextkinSiteRules; })();
let fail = 0; const check = (n, ok, d = '') => { if (!ok) { fail++; console.log('FAIL', n, d); } };
const now = Date.now();
const rules = { siteRulesKillSwitch: false, globalMode: 'active', sites: { workday: { mode: 'off' } }, revision: 1 };
const live = SR.evaluateSitePolicy('workday', '3.4.2', { rules, expiresAt: now + 600000, policyExpiresAt: now + 600000 });
check('live policy blocks site', live.blocked === true && live.mode === 'off', JSON.stringify(live));
const expired = SR.evaluateSitePolicy('workday', '3.4.2', { rules, expiresAt: now + 600000, policyExpiresAt: now - 1000 });
check('expired off policy stays blocked until fresh config', expired.mode === 'off' && expired.blocked === true, JSON.stringify(expired));

// Sticky blocks: every explicit disable signal must survive policy expiry.
const disabledList = SR.evaluateSitePolicy('workday', '3.4.2', {
  rules: { globalMode: 'active', disabledSites: ['workday'], sites: {} },
  expiresAt: now + 600000, policyExpiresAt: now - 1000
});
check('expired disabledSites entry stays blocked', disabledList.blocked === true && disabledList.mode === 'off', JSON.stringify(disabledList));
const globalOff = SR.evaluateSitePolicy('greenhouse', '3.4.2', {
  rules: { globalMode: 'off', sites: {} }, expiresAt: now + 600000, policyExpiresAt: now - 1000
});
check('expired global off stays blocked', globalOff.blocked === true && globalOff.mode === 'off', JSON.stringify(globalOff));
const killSwitch = SR.evaluateSitePolicy('greenhouse', '3.4.2', {
  rules: { siteRulesKillSwitch: true, sites: {} }, expiresAt: now + 600000, policyExpiresAt: now - 1000
});
check('expired global kill switch stays blocked', killSwitch.blocked === true && killSwitch.mode === 'off', JSON.stringify(killSwitch));
const siteKill = SR.evaluateSitePolicy('workday', '3.4.2', {
  rules: { globalMode: 'active', sites: { workday: { killSwitch: true } } },
  expiresAt: now + 600000, policyExpiresAt: now - 1000
});
check('expired site kill switch stays blocked', siteKill.blocked === true && siteKill.mode === 'off', JSON.stringify(siteKill));
check('blocked expired policy keeps no selector overlays or exclusions',
  !Object.keys(siteKill.selectorTables).length && !siteKill.confirmationSelectors.length && siteKill.excludePathPatterns.length === 0,
  JSON.stringify(siteKill));
const active = SR.evaluateSitePolicy('greenhouse', '3.4.2', { rules: { globalMode: 'active', sites: {} }, expiresAt: now + 600000, policyExpiresAt: now + 600000 });
check('live active policy stays active', active.mode === 'active', JSON.stringify(active));
const activeExpired = SR.evaluateSitePolicy('greenhouse', '3.4.2', { rules: { globalMode: 'active', sites: {} }, expiresAt: now + 600000, policyExpiresAt: now - 1 });
check('expired active policy is legacy', activeExpired.mode === 'legacy', JSON.stringify(activeExpired));
console.log(fail ? `${fail} failed` : 'site-rules: all passed');
process.exit(fail ? 1 : 0);
