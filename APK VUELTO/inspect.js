const fs = require('fs');
const path = require('path');

// 1. Inspect bank_notif_classifier.json
const classifierPath = path.join(__dirname, 'extracted_base', 'assets', 'bank_notif_classifier.json');
if (fs.existsSync(classifierPath)) {
  const data = JSON.parse(fs.readFileSync(classifierPath, 'utf8'));
  console.log('=== BANK NOTIF CLASSIFIER ===');
  console.log('Keys:', Object.keys(data));
  console.log('Version:', data.version);
  console.log('Threshold:', data.threshold);
  console.log('Classes:', data.classes);
  console.log('Transaccion index:', data.transaccion_index);
  console.log('Feature names count:', data.feature_names ? data.feature_names.length : 0);
  console.log('Sample features:', data.feature_names ? data.feature_names.slice(0, 30) : []);
  if (data.coef_) {
    console.log('Coef length:', data.coef_.length);
  }
  if (data.intercept_) {
    console.log('Intercept:', data.intercept_);
  }
} else {
  console.log('Classifier file not found');
}

// 2. Search libapp.so for interesting regexes and strings
const libappPath = path.join(__dirname, 'extracted_arm64', 'lib', 'arm64-v8a', 'libapp.so');
if (fs.existsSync(libappPath)) {
  console.log('=== SCANNING libapp.so (size: ' + fs.statSync(libappPath).size + ' bytes) ===');
  const buffer = fs.readFileSync(libappPath);

  // Extract printable ASCII/UTF-8 strings of length >= 6
  const strings = [];
  let cur = [];
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b >= 32 && b <= 126) {
      cur.push(b);
    } else {
      if (cur.length >= 6) {
        strings.push(Buffer.from(cur).toString('ascii'));
      }
      cur = [];
    }
  }

  console.log('Total strings extracted:', strings.length);

  const keywords = ['yape', 'plin', 'interbank', 'bcp', 'bbva', 'scotiabank', 'notification', 'te envió', 'cód', 'seguridad', 'vuelto.briandev', 'briandev', 'classifier', 'regex', 'gemini', 'openai'];
  
  const matched = new Set();
  strings.forEach(s => {
    const lower = s.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.add(s);
        break;
      }
    }
  });

  console.log(`Found ${matched.size} matching strings.`);
  
  // Save matched strings to inspect
  const outPath = path.join(__dirname, 'extracted_strings.txt');
  fs.writeFileSync(outPath, Array.from(matched).join('\n'), 'utf8');
  console.log('Saved matches to:', outPath);
}
