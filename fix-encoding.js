const fs = require('fs');

const files = [
  'src/components/AuthModal.tsx',
  'src/components/LoginView.tsx',
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  // Fix corrupted sequences by replacing byte-by-byte using Buffer
  // âœ• is corrupted ✕ (U+2715)
  // ðŸ"¬ is corrupted 📬 (U+1F4EC)
  // These were double-encoded: original UTF-8 bytes read as CP1252, then re-encoded as UTF-8
  // Fix by encoding current UTF-8 string as latin1 to recover original bytes
  const buf = Buffer.from(c, 'latin1');
  const fixed = buf.toString('utf8');
  // Only write if the result is valid and different
  if (fixed !== c) {
    fs.writeFileSync(f, fixed, 'utf8');
    console.log('Fixed:', f);
  } else {
    console.log('No change:', f);
  }
});
