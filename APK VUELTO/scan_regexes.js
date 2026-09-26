const fs = require('fs');
const path = require('path');

const libappPath = path.join(__dirname, 'extracted_arm64', 'lib', 'arm64-v8a', 'libapp.so');
const buffer = fs.readFileSync(libappPath);

// Look for strings containing regex characters or typical notification patterns
const regexes = [];
let cur = [];
for (let i = 0; i < buffer.length; i++) {
  const b = buffer[i];
  if (b >= 32 && b <= 126) {
    cur.push(b);
  } else {
    if (cur.length >= 6) {
      const s = Buffer.from(cur).toString('ascii');
      // If it looks like a regex or template pattern
      if (s.includes('S/') || s.includes('\\s') || s.includes('(?:') || s.includes('te envi') || s.includes('TRAN') || s.includes('plin') || s.includes('yape')) {
        regexes.push(s);
      }
    }
    cur = [];
  }
}

console.log('Found patterns:', regexes.length);
regexes.forEach((r, i) => {
  console.log(`${i}: ${r}`);
});
