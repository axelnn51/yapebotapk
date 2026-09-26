const fs = require('fs');
const path = require('path');

const libappPath = path.join(__dirname, 'extracted_arm64', 'lib', 'arm64-v8a', 'libapp.so');
const buffer = fs.readFileSync(libappPath);

// Let's search around templates and regexes in libapp.so
// Find occurrences of "te envió", "plineado", "TRAN S/", "bank_notification"
const searchTerms = [
  'te envió',
  'te ha plineado',
  'TRAN S/',
  'bank_notification_template_parser',
  'BankNotificationTemplateDef',
  'yape_peru',
  'interbank_peru',
  'bbva_peru',
  'scotiabank_peru',
  'bcp_peru',
];

console.log('Searching in libapp.so...');

searchTerms.forEach(term => {
  let idx = -1;
  const termBuf = Buffer.from(term, 'utf8');
  let count = 0;
  while ((idx = buffer.indexOf(termBuf, idx + 1)) !== -1) {
    count++;
    // Get context of 200 bytes before and 300 bytes after
    const start = Math.max(0, idx - 150);
    const end = Math.min(buffer.length, idx + 300);
    const slice = buffer.slice(start, end);
    // Replace non-printable with .
    let str = '';
    for (let b of slice) {
      str += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '·';
    }
    console.log(`[${term} #${count} at ${idx}]:\n${str}\n`);
    if (count >= 5) break;
  }
});
