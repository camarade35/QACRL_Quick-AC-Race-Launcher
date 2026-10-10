// test-ini-schema.js — test v2 du schéma
const S = require('./public/src/iniSchema.js');

console.log('=== BLACKLIST ===');
['__EXT_CONTROLS', '__CM_PAUSE', '__LAUNCHER_CM', '__EXTRA_CM', 'CONTROLS', 'STEER']
  .forEach(n => console.log(n.padEnd(20), '->', S.isBlacklisted(n)));

console.log('\n=== controls.ini / STEER / LOCK ===');
console.log(JSON.stringify(S.getKeySchema('controls.ini', 'STEER', 'LOCK'), null, 2));

console.log('\n=== controls.ini / ACTION_HORN (template BUTTON) ===');
console.log(JSON.stringify(S.getKeySchema('controls.ini', 'ACTION_HORN', 'XBOXBUTTON'), null, 2));

console.log('\n=== controls.ini / section inconnue (fallback hints) ===');
console.log(JSON.stringify(S.getKeySchema('controls.ini', 'MACHIN_TRUC', 'KEY'), null, 2));

console.log('\n=== video.ini / VIDEO / FULLSCREEN ===');
console.log(JSON.stringify(S.getKeySchema('video.ini', 'VIDEO', 'FULLSCREEN'), null, 2));

console.log('\n=== video.ini / POST_PROCESS / FILTER ===');
console.log(JSON.stringify(S.getKeySchema('video.ini', 'POST_PROCESS', 'FILTER'), null, 2));

console.log('\n=== audio.ini / LEVELS / MASTER ===');
console.log(JSON.stringify(S.getKeySchema('audio.ini', 'LEVELS', 'MASTER'), null, 2));

console.log('\n=== audio.ini / SETTINGS / DRIVER_NAME ===');
console.log(JSON.stringify(S.getKeySchema('audio.ini', 'SETTINGS', 'DRIVER_NAME'), null, 2));

console.log('\n=== audio.ini / SKIDS / ENTRY_POINT ===');
console.log(JSON.stringify(S.getKeySchema('audio.ini', 'SKIDS', 'ENTRY_POINT'), null, 2));