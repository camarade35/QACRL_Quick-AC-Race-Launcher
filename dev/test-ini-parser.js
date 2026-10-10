// test-ini-parser.js — test manuel du parseur INI
const p = require('./public/src/iniParser.js');

// =========================================================================
// TEST 1 — Round-trip de base
// =========================================================================
const sample =
  '; En-tête de fichier\n' +
  '[CONTROLS]\n' +
  'STEER=axis_x\n' +
  'THROTTLE=axis_y\n' +
  '\n' +
  '[__EXT_CONTROLS]\n' +
  '; blacklist AC\n' +
  'UP=1\n' +
  '\n' +
  '[CONTROLLERS]\n' +
  'PGUID0=PRODUCTVENDOR-0eb7-0020\n';

const sections = p.parseIni(sample);
console.log('=== STRUCTURE ===');
console.log(JSON.stringify(sections, null, 2));

console.log('\n=== ROUND-TRIP ===');
const out = p.serializeIni(sections);
console.log(out);

console.log('\n=== ROUND-TRIP IDENTIQUE ? ===', out === sample);

console.log('\n=== TYPES ===');
['0', '1', '42', '-7', '3.14', '0.5', 'hello', 'axis_x', ''].forEach(v => {
  console.log(JSON.stringify(v), '→', p.detectValueType(v));
});

console.log('\n=== GROUPE ===');
console.log(JSON.stringify(p.groupBySection(sections), null, 2));

// =========================================================================
// TEST 2 — Commentaires inline
// =========================================================================
console.log('\n\n=== COMMENTAIRES INLINE ===');
const sample2 =
  '[ABS]\n' +
  'BUTTON=-1\n' +
  'KEY=0x41 ; A\n' +
  '\n' +
  '[ACTION_HORN]\n' +
  'KEY=0x48 ; H\n' +
  'XBOXBUTTON=Y\n';

const sections2 = p.parseIni(sample2);
console.log(JSON.stringify(sections2, null, 2));

const out2 = p.serializeIni(sections2);
console.log('\n=== ROUND-TRIP 2 IDENTIQUE ? ===', out2 === sample2);

// =========================================================================
// TEST 3 — getPureValue
// =========================================================================
console.log('\n\n=== getPureValue ===');
const absSec = sections2.find(s => s.name === 'ABS');
const keyEntry = absSec.entries.find(e => e.kind === 'kv' && e.key === 'KEY');
console.log('Entry KEY complet :', JSON.stringify(keyEntry));
console.log('getPureValue(KEY) :', JSON.stringify(p.getPureValue(keyEntry)));