// test-keyboard-mapper.js
const KM = require('./public/src/keyboardMapper.js');

console.log('=== FORMAT (code AC → nom lisible) ===');
[
  '0x41', '0x48', '0x4C', '0x20', '0x28', '0x0D', '0x1B', '0x70',
  '0x31', '0x60', '0xA2', '0xC0', '0x2E', '0x91', '0x99',
  '-1', '', 'inconnu'
].forEach(v => {
  console.log(JSON.stringify(v).padEnd(12), '→', KM.formatKey(v));
});

console.log('\n=== PARSE (string → code) ===');
['0x48', '72', '0x00', '0x1B', '-1', 'inconnu'].forEach(v => {
  console.log(JSON.stringify(v).padEnd(12), '→', KM.parseKey(v));
});

console.log('\n=== TO AC FORMAT (code → hex AC) ===');
[72, 65, 32, 13, 27, 0, -1, 192].forEach(c => {
  console.log(String(c).padEnd(5), '→', KM.toAcFormat(c));
});