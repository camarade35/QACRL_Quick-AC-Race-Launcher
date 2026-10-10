// test-gamepad-mapper.js — test du mapper Chromium ↔ AC
const GM = require('./public/src/gamepadMapper.js');

console.log('=== PARSE PGUID → vendor/product ===');
[
  '00200EB7-0000-0000-0000-504944564944',  // FANATEC
  '028E045E-0000-0000-0000-504944564944',  // Xbox 360
  '92061B4F-0000-0000-0000-504944564944',  // SparkFun Pro Micro
  '88881020-0000-0000-0000-504944564944',  // ODDOR
  'B77211FF-0000-0000-0000-504944564944',  // A7 Gear Shift
].forEach(pg => {
  const r = GM.parsePgToVendorProduct(pg);
  console.log(pg.substring(0, 8), '→', JSON.stringify(r));
});

console.log('\n=== PARSE ID CHROMIUM ===');
[
  'FANATEC Wheel (Vendor: 0eb7 Product: 0020)',
  'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  'SparkFun Pro Micro (Vendor: 1b4f Product: 9206)',
].forEach(id => {
  const r = GM.parseChromiumGamepadId(id);
  console.log(JSON.stringify(id.substring(0, 45) + '...'), '→', JSON.stringify(r));
});

console.log('\n=== MATCHING SIMULÉ ===');
const acCtrl = [
  { index: 0, name: 'FANATEC Wheel',  vendor: '0eb7', product: '0020' },
  { index: 1, name: 'Xbox 360',       vendor: '045e', product: '028e' },
  { index: 2, name: 'SparkFun',       vendor: '1b4f', product: '9206' },
];
const pads = [
  { chromiumIndex: 0, id: 'Xbox 360 (Vendor: 045e Product: 028e)',      vendor: '045e', product: '028e' },
  { chromiumIndex: 1, id: 'FANATEC Wheel (Vendor: 0eb7 Product: 0020)', vendor: '0eb7', product: '0020' },
  { chromiumIndex: 2, id: 'Unknown Pad (Vendor: aaaa Product: bbbb)',   vendor: 'aaaa', product: 'bbbb' },
];
console.log(JSON.stringify(GM.matchAll(acCtrl, pads), null, 2));