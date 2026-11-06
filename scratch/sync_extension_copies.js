const fs = require('fs');
const path = require('path');

const srcDir = 'jobright_extension';

const targets = [
  'browser-extension',
  'C:\\Users\\bharg\\OneDrive\\Desktop\\jobright_extension',
  'C:\\Users\\bharg\\OneDrive\\Desktop\\nextkinlife_extension',
  'C:\\Users\\bharg\\OneDrive\\Desktop\\nextkinlife-extension'
];

const filesToSync = [
  'manifest.json',
  'outside-job-engine.js',
  'helper-app.41ea2652.js',
  'agent-submission-sync.7f769d2a.js',
  'static/background/index.js'
];

targets.forEach(target => {
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    filesToSync.forEach(relFile => {
      const srcFile = path.join(srcDir, relFile);
      const destFile = path.join(target, relFile);
      const destDir = path.dirname(destFile);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcFile, destFile);
    });
    console.log('Successfully synced files to:', target);
  } catch (err) {
    console.error('Error syncing to', target, err.message);
  }
});
