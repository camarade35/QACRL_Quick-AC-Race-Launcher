// public/src/keyboardMapper.js
// Convertit les codes clavier entre :
//   - le format AC (Windows Virtual Key Code, hex : "0x48")
//   - un nom lisible en français (ex : "H")
//
// Rappel : AC utilise les Virtual Key Codes Windows :
//   0x41 = A, 0x48 = H, 0x20 = Espace, 0x28 = Flèche bas...

(function (global) {
  'use strict';

  // Correspondance VK code → nom lisible
  const VK_NAMES = {
    0x08: 'Retour arrière',
    0x09: 'Tab',
    0x0D: 'Entrée',
    0x13: 'Pause',
    0x14: 'Verr. Maj',
    0x1B: 'Échap',
    0x20: 'Espace',
    0x21: 'Page ↑',
    0x22: 'Page ↓',
    0x23: 'Fin',
    0x24: 'Début',
    0x25: '←',
    0x26: '↑',
    0x27: '→',
    0x28: '↓',
    0x2D: 'Inser',
    0x2E: 'Suppr',
    0x5B: 'Win',
    0x5C: 'Win droite',
    0x5D: 'Menu',
    0x6A: 'Pavé ×',
    0x6B: 'Pavé +',
    0x6C: 'Pavé ,',
    0x6D: 'Pavé -',
    0x6E: 'Pavé .',
    0x6F: 'Pavé /',
    0x90: 'Verr. Num',
    0x91: 'Arrêt défil',
    0xA0: 'Maj gauche',
    0xA1: 'Maj droite',
    0xA2: 'Ctrl gauche',
    0xA3: 'Ctrl droit',
    0xA4: 'Alt gauche',
    0xA5: 'Alt droit',
    0xBA: ';',
    0xBB: '=',
    0xBC: ',',
    0xBD: '-',
    0xBE: '.',
    0xBF: '/',
    0xC0: '~',
    0xDB: '[',
    0xDC: '\\',
    0xDD: ']',
    0xDE: "'",
  };

  // Lettres A-Z (0x41-0x5A)
  for (let i = 0x41; i <= 0x5A; i++) VK_NAMES[i] = String.fromCharCode(i);

  // Chiffres 0-9 (0x30-0x39) — rangée du haut
  for (let i = 0x30; i <= 0x39; i++) VK_NAMES[i] = String.fromCharCode(i);

  // Pavé numérique 0-9 (0x60-0x69)
  for (let i = 0; i < 10; i++) VK_NAMES[0x60 + i] = 'Pavé ' + i;

  // F1-F24 (0x70-0x87)
  for (let i = 0x70; i <= 0x87; i++) VK_NAMES[i] = 'F' + (i - 0x70 + 1);

  // ---------------------------------------------------------------------------
  // Format : convertit "0x48" en "H"
  // ---------------------------------------------------------------------------
  function formatKey(rawValue) {
    if (rawValue == null) return '';
    const s = String(rawValue).trim();
    if (!s || s === '-1' || s === '0') return '—';

    let code = null;
    if (/^0x[0-9a-f]+$/i.test(s)) code = parseInt(s.substring(2), 16);
    else if (/^\d+$/.test(s))     code = parseInt(s, 10);
    if (code == null || isNaN(code)) return s;

    return VK_NAMES[code] || ('Code 0x' + code.toString(16).toUpperCase().padStart(2, '0'));
  }

  // ---------------------------------------------------------------------------
  // Parse : convertit "0x48" ou "72" en code numérique (72)
  // ---------------------------------------------------------------------------
  function parseKey(rawValue) {
    if (rawValue == null) return null;
    const s = String(rawValue).trim();
    if (!s) return null;
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.substring(2), 16);
    if (/^\d+$/.test(s))          return parseInt(s, 10);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Convertit un code numérique en hex AC ("0x48" ou "-1")
  // ---------------------------------------------------------------------------
  function toAcFormat(code) {
    if (code == null || code < 0) return '-1';
    return '0x' + code.toString(16).toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Capture depuis un KeyboardEvent
  // ---------------------------------------------------------------------------
  function captureFromEvent(event) {
    if (!event) return null;
    if (typeof event.keyCode === 'number' && event.keyCode > 0) return event.keyCode;
    if (typeof event.which === 'number' && event.which > 0)     return event.which;
    return null;
  }

  const API = { formatKey, parseKey, toAcFormat, captureFromEvent, VK_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.KeyboardMapper = API;
})(typeof window !== 'undefined' ? window : globalThis);