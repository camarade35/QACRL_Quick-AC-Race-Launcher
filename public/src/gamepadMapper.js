// public/src/gamepadMapper.js
// Fait le pont entre :
//   - les périphériques AC (contrôleurs dans [CONTROLLERS] de controls.ini)
//   - les gamepads exposés par Chromium (navigator.getGamepads())
//
// Utilisation :
//   const mapper = GamepadMapper.create(controlsIniSections);
//   const gamepads = mapper.getChromiumGamepads();
//   const match = mapper.match();

(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // Parse la section [CONTROLLERS] pour extraire les périphériques AC
  // Retourne : [{ index, name, pg, vendor, product }, ...]
  // -------------------------------------------------------------------------
  function parseAcControllers(sections) {
    const controllers = [];
    if (!Array.isArray(sections)) return controllers;

    const ctrlSec = sections.find(s => s.name === 'CONTROLLERS');
    if (!ctrlSec) return controllers;

    const map = {};
    for (const entry of ctrlSec.entries) {
      if (entry.kind !== 'kv') continue;
      const conM  = entry.key.match(/^CON(\d+)$/);
      const guidM = entry.key.match(/^PGUID(\d+)$/);
      if (conM) {
        const idx = parseInt(conM[1], 10);
        if (!map[idx]) map[idx] = { index: idx };
        map[idx].name = entry.value;
      } else if (guidM) {
        const idx = parseInt(guidM[1], 10);
        if (!map[idx]) map[idx] = { index: idx };
        map[idx].pg = entry.value;
      }
    }

    for (const idx of Object.keys(map)) {
      const c = map[idx];
      const vp = parsePgToVendorProduct(c.pg);
      if (vp) {
        c.vendor  = vp.vendor;
        c.product = vp.product;
      }
      controllers.push(c);
    }
    controllers.sort((a, b) => a.index - b.index);
    return controllers;
  }

  // -------------------------------------------------------------------------
  // Parse un PGUID AC au format "00200EB7-0000-0000-0000-504944564944"
  // → { vendor: '0eb7', product: '0020' } (minuscules, big-endian lisible)
  // -------------------------------------------------------------------------
  function parsePgToVendorProduct(pg) {
    if (!pg || typeof pg !== 'string') return null;
    const parts = pg.split('-');
    if (parts.length < 1 || parts[0].length < 8) return null;
    const hex = parts[0].toUpperCase();
    // Format PGUID AC : "PPPPVVVV-..." avec Product puis Vendor, directement lisibles.
    return {
      product: hex.substring(0, 4).toLowerCase(),
      vendor:  hex.substring(4, 8).toLowerCase(),
    };
  }

  // -------------------------------------------------------------------------
  // Parse l'id Chromium d'un gamepad
  // Ex : "FANATEC Wheel (Vendor: 0eb7 Product: 0020)"
  //
  // ⭐ v1.6.0-W4D — Fallback XInput :
  //    Chromium sur Windows n'expose PAS Vendor/Product pour les manettes
  //    utilisant le mapping standard XInput ("Xbox 360 Controller
  //    (XInput STANDARD GAMEPAD)"). On les identifie comme Microsoft
  //    Xbox 360 (045e:028e) par convention, ce qui permet de matcher le
  //    PGUID "028E045E" côté Assetto Corsa.
  // -------------------------------------------------------------------------
  function parseChromiumGamepadId(id) {
    if (!id || typeof id !== 'string') return null;
    const vendorM  = id.match(/Vendor:\s*([0-9a-fA-F]{4})/i);
    const productM = id.match(/Product:\s*([0-9a-fA-F]{4})/i);
    if (vendorM && productM) {
      return {
        vendor:  vendorM[1].toLowerCase(),
        product: productM[1].toLowerCase(),
      };
    }
    if (/XInput\s+STANDARD\s+GAMEPAD/i.test(id)) {
      return { vendor: '045e', product: '028e' };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Récupère les gamepads Chromium "propres"
  // -------------------------------------------------------------------------
  function getChromiumGamepads() {
    const result = [];
    if (!navigator.getGamepads) return result;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const vp = parseChromiumGamepadId(pad.id);
      result.push({
        chromiumIndex: i,
        id: pad.id,
        vendor:  vp ? vp.vendor  : null,
        product: vp ? vp.product : null,
        connected: pad.connected,
        mapping: pad.mapping,
        buttons: pad.buttons.length,
        axes: pad.axes.length,
      });
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Matching final : AC controllers ↔ Chromium gamepads
  // -------------------------------------------------------------------------
  function matchAll(acControllers, chromiumPads) {
    const usedChromium = new Set();
    const result = [];

    for (const ac of acControllers) {
      let match = null;
      if (ac.vendor && ac.product) {
        match = chromiumPads.find(p =>
          !usedChromium.has(p.chromiumIndex) &&
          p.vendor === ac.vendor &&
          p.product === ac.product
        );
      }
      if (match) usedChromium.add(match.chromiumIndex);

      result.push({
        acIndex:       ac.index,
        acName:        ac.name || ('Périphérique ' + ac.index),
        acVendor:      ac.vendor || null,
        acProduct:     ac.product || null,
        chromiumIndex: match ? match.chromiumIndex : null,
        chromiumId:    match ? match.id : null,
        matched:       !!match,
      });
    }

    for (const p of chromiumPads) {
      if (usedChromium.has(p.chromiumIndex)) continue;
      result.push({
        acIndex:       null,
        acName:        null,
        acVendor:      null,
        acProduct:     null,
        chromiumIndex: p.chromiumIndex,
        chromiumId:    p.id,
        matched:       false,
        unmatched:     true,
      });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // TABLE DE CONVERSION Chromium → AC (axes analogiques)
  //
  // AC utilise DirectInput, Chromium utilise l'API Gamepad W3C.
  // Les deux n'énumèrent PAS les axes dans le même ordre.
  // Cette table corrige le décalage pour les périphériques connus.
  //
  // Clé : "vendor:product" (minuscules, séparés par :)
  // Valeur : { indexChromium: indexAC, ... }
  // -------------------------------------------------------------------------
  const AXIS_MAP_BY_DEVICE = {
    // Fanatec CSL / ClubSport (Vendor 0eb7, Product 0020)
    // - 0 = Volant        → AC 0
    // - 1 = Embrayage     → AC 6
    // - 2 = Accélérateur  → AC 1
    // - 5 = Frein         → AC 5
    // - 9 = D-pad (hat)   → ⛔ blacklisté
    '0eb7:0020': {
      0: 0,
      1: 6,
      2: 1,
      5: 5,
    },
  };

  // Axes à ignorer complètement pour un device (D-pad, hat switch…)
  const BLOCKED_AXES_BY_DEVICE = {
    '0eb7:0020': [9],  // D-pad du Fanatec (hat switch, valeurs hors [-1,1])
  };

  // ⭐ v1.6.0-W4D-fix3 — Manette Xbox 360 (045e:028e) sur Windows :
  //    Chromium expose LT/RT comme BOUTONS ANALOGIQUES (buttons[6]/[7],
  //    valeur 0→1). DirectInput/AC les expose comme AXES :
  //      AXLE 5 = accélérateur (RT)
  //      AXLE 1 = frein (LT)
  //    (observé dans xbox1.ini fonctionnel : THROTTLE AXLE=5, BRAKES AXLE=1)
  //
  //    Le mapping identité pour 0/1/2/3 permet de couvrir LX/LY/RX/RY.
  AXIS_MAP_BY_DEVICE['045e:028e'] = {
    0: 0,   // LX → AC 0 (direction)
    1: 1,   // LY → AC 1 (fallback si trigger absent)
    2: 2,   // RX → AC 2
    3: 3,   // RY → AC 3
  };

  // Mapping bouton analogique → axe AC pour les triggers XInput
  const XINPUT_TRIGGER_AXIS_MAP = {
    '045e:028e': {
      5: { button: 7, invert: false },   // AC 5 (accél) ← RT (button 7)
      1: { button: 6, invert: false },   // AC 1 (frein) ← LT (button 6)
    },
  };

  // ⭐ v1.6.0 — Mapping Chromium buttonIndex → valeur AC XBOXBUTTON
  //    Standard XInput (identique Xbox 360/One/Series, DualShock/DualSense en mode XInput)
  const CHROMIUM_TO_XBOX_BUTTON = {
    0:  'A',
    1:  'B',
    2:  'X',
    3:  'Y',
    4:  'LSHOULDER',
    5:  'RSHOULDER',
    // 6 (LT) et 7 (RT) sont des AXES, pas des XBOXBUTTON → null
    6:  null,
    7:  null,
    8:  'BACK',
    9:  'START',
    10: 'LTHUMB',
    11: 'RTHUMB',
    12: 'DPAD_UP',
    13: 'DPAD_DOWN',
    14: 'DPAD_LEFT',
    15: 'DPAD_RIGHT',
  };

  /**
   * Convertit un index de bouton Chromium en valeur AC XBOXBUTTON.
   * Retourne null si le bouton n'est pas convertible (gâchettes analogiques).
   */
  function chromiumButtonToXboxButton(buttonIndex) {
    return CHROMIUM_TO_XBOX_BUTTON[buttonIndex] || null;
  }

  /**
   * Convertit un index d'axe Chromium en index AC pour un périphérique donné.
   * Si le périphérique n'est pas connu → renvoie l'index inchangé.
   */
  // Cache des profils appris (chargés depuis le main process)
  let _learnedProfiles = null;

  /**
   * Charge tous les profils appris depuis le disque (via IPC).
   * À appeler une fois au démarrage, ou après un apprentissage.
   */
  async function loadLearnedProfiles() {
    if (!global.api || !global.api.getAllWheelProfiles) return;
    try {
      _learnedProfiles = await global.api.getAllWheelProfiles();
    } catch (e) {
      console.warn('[GamepadMapper] loadLearnedProfiles KO:', e.message);
      _learnedProfiles = {};
    }
  }

  /**
   * Force le rechargement (à appeler après un apprentissage).
   */
  async function refreshLearnedProfiles() {
    _learnedProfiles = null;
    await loadLearnedProfiles();
  }

  /**
   * Convertit un index d'axe Chromium en index AC pour un périphérique donné.
   *
   * Ordre de priorité :
   *   1. Profil appris (utilisateur) — learn
   *   2. Table hardcodée (AXIS_MAP_BY_DEVICE) — dev
   *   3. Fallback : index inchangé
   */
  function chromiumAxisToAcAxis(vendor, product, chromiumAxisIndex) {
    if (vendor == null || product == null) return chromiumAxisIndex;
    const key = (vendor + ':' + product).toLowerCase();

    // 1) Profil appris en priorité
    if (_learnedProfiles && _learnedProfiles[key] && _learnedProfiles[key].axes) {
      const learned = _learnedProfiles[key].axes[String(chromiumAxisIndex)];
      if (learned !== undefined) return learned;
    }

    // 2) Table hardcodée
    const map = AXIS_MAP_BY_DEVICE[key];
    if (map && map[chromiumAxisIndex] !== undefined) return map[chromiumAxisIndex];

    // 3) Fallback
    return chromiumAxisIndex;
  }

  /**
   * Ajoute un mapping appris en mémoire (et le persiste via IPC).
   * Utilisé par le wizard et l'apprentissage passif.
   */
  async function learnAxisMapping(vendor, product, chromiumAxisIndex, acAxisIndex, source) {
    if (!vendor || !product) return { success: false };
    const key = (vendor + ':' + product).toLowerCase();
    if (!_learnedProfiles) _learnedProfiles = {};
    if (!_learnedProfiles[key]) _learnedProfiles[key] = { axes: {} };
    if (!_learnedProfiles[key].axes) _learnedProfiles[key].axes = {};
    _learnedProfiles[key].axes[String(chromiumAxisIndex)] = acAxisIndex;

    // Persiste côté main process
    if (global.api && global.api.mergeWheelProfile) {
      try {
        await global.api.mergeWheelProfile(vendor, product, { [String(chromiumAxisIndex)]: acAxisIndex }, source || 'learn');
      } catch (e) {
        console.warn('[GamepadMapper] mergeWheelProfile KO:', e.message);
      }
    }
    return { success: true, key };
  }

  /**
   * Renvoie true si l'axe Chromium est blacklisté pour ce device
   * (typiquement le D-pad / hat switch).
   */
  function isAxisBlocked(vendor, product, chromiumAxisIndex) {
    if (vendor == null || product == null) return false;
    const key = (vendor + ':' + product).toLowerCase();
    const list = BLOCKED_AXES_BY_DEVICE[key];
    return Array.isArray(list) && list.indexOf(chromiumAxisIndex) !== -1;
  }
  
    /**
   * Inverse : à partir d'un index AC, retrouve l'index Chromium correspondant.
   * Priorité : profil appris > table hardcodée > -1 (inconnu)
   */
  function acAxisToChromiumAxis(vendor, product, acAxisIndex) {
    if (vendor == null || product == null) return -1;
    const key = (vendor + ':' + product).toLowerCase();

    // 1) Profil appris
    if (_learnedProfiles && _learnedProfiles[key] && _learnedProfiles[key].axes) {
      for (const cIdx of Object.keys(_learnedProfiles[key].axes)) {
        if (_learnedProfiles[key].axes[cIdx] === acAxisIndex) {
          return parseInt(cIdx, 10);
        }
      }
    }
    // 2) Table hardcodée
    const map = AXIS_MAP_BY_DEVICE[key];
    if (map) {
      for (const cIdx of Object.keys(map)) {
        if (map[cIdx] === acAxisIndex) {
          return parseInt(cIdx, 10);
        }
      }
    }
    return -1;
  }

  /**
   * ⭐ v1.6.0-W4D-fix3 — Lit la valeur brute d'un axe AC sur un pad Chromium.
   *
   * Ordre de recherche :
   *   1. Trigger XInput (bouton analogique) — Xbox 360 : LT/RT sont
   *      exposés par Chromium comme buttons[6]/[7] avec value 0→1.
   *      On les convertit en axe -1..+1 (0 → -1, 1 → +1) pour rester
   *      cohérent avec le repère AC.
   *   2. Axe Chromium classique (via acAxisToChromiumAxis).
   *
   * Retourne :
   *   - un nombre entre -1 et 1 (repère AC)
   *   - null si l'axe n'est pas mappable pour ce device
   */
  function readAxisFromPad(pad, vendor, product, acAxisIndex) {
    if (!pad) return null;
    const key = (vendor + ':' + product).toLowerCase();

    // 1) Trigger analogique (bouton)
    const triggerMap = XINPUT_TRIGGER_AXIS_MAP[key];
    if (triggerMap && triggerMap[acAxisIndex]) {
      const m = triggerMap[acAxisIndex];
      const btn = pad.buttons && pad.buttons[m.button];
      if (btn) {
        const raw = (typeof btn === 'object' && btn.value != null)
          ? btn.value
          : (btn === true ? 1 : 0);
        let v = raw * 2 - 1;          // 0..1  →  -1..+1
        if (m.invert) v = -v;
        return v;
      }
    }

    // 2) Axe Chromium classique
    const cAxis = acAxisToChromiumAxis(vendor, product, acAxisIndex);
    if (cAxis >= 0 && pad.axes && pad.axes[cAxis] != null) {
      return pad.axes[cAxis];
    }

    return null;
  }

  /**
   * ⭐ Retourne le mapping AC pour un axe Chromium donné,
   *    ou null si le device/axe n'est pas connu.
   *    Différent de chromiumAxisToAcAxis qui retourne l'index inchangé en fallback.
   *
   *    ORDRE DE PRIORITÉ (v1.4.1) :
   *      1. Table hardcodée (fiable, testée manuellement par des users)
   *      2. Profil appris (uniquement pour devices/axes NON répertoriés)
   *      3. null (l'appelant décidera du fallback)
   *
   *    ⚠️ Avant v1.4.1, l'ordre était : learned > table.
   *    Conséquence : un vieux profil appris corrompu pouvait écraser la table
   *    à jamais. Maintenant la table est prioritaire.
   *
   *    Options :
   *      - ignoreTable  : ignore la table (utile pour tests/diagnostics)
   *      - ignoreLearned: ignore le profil appris (utile pour wizard)
   */
  function getAxisMapping(vendor, product, chromiumAxisIndex, options) {
    if (vendor == null || product == null) return null;
    const opts = options || {};
    const key = (vendor + ':' + product).toLowerCase();
    const map = AXIS_MAP_BY_DEVICE[key];

    // ⭐ PRIORITÉ 1 : table hardcodée (source de vérité pour devices connus)
    if (!opts.ignoreTable && map && map[chromiumAxisIndex] !== undefined) {
      return map[chromiumAxisIndex];
    }

    // ⭐ PRIORITÉ 2 : profil appris (uniquement axes non répertoriés par la table)
    if (!opts.ignoreLearned) {
      if (_learnedProfiles && _learnedProfiles[key] && _learnedProfiles[key].axes) {
        const learned = _learnedProfiles[key].axes[String(chromiumAxisIndex)];
        if (learned !== undefined) return learned;
      }
    }

    // ⭐ PRIORITÉ 3 : non connu
    return null;
  }

  function create(controlsIniSections) {
    const acControllers = parseAcControllers(controlsIniSections);
    return {
      getAcControllers: () => acControllers.slice(),
      getChromiumGamepads,
      match: () => matchAll(acControllers, getChromiumGamepads()),
      parseChromiumGamepadId: parseChromiumGamepadId,
      acAxisToChromiumAxis: acAxisToChromiumAxis,
      chromiumAxisToAcAxis: chromiumAxisToAcAxis,
      isAxisBlocked: isAxisBlocked,
      readAxisFromPad: readAxisFromPad,               // ⭐ v1.6.0-W4D-fix3
      XINPUT_TRIGGER_AXIS_MAP: XINPUT_TRIGGER_AXIS_MAP, // ⭐ (optionnel, debug)
    };
  }

  const API = {
    create,
    parseAcControllers,
    parsePgToVendorProduct,
    parseChromiumGamepadId,
    getChromiumGamepads,
    matchAll,
    chromiumAxisToAcAxis,
    acAxisToChromiumAxis,
    getAxisMapping,
    isAxisBlocked,
    loadLearnedProfiles,
    refreshLearnedProfiles,
    learnAxisMapping,
    chromiumButtonToXboxButton,   // ⭐ v1.6.0
    readAxisFromPad,              // ⭐ v1.6.0-W4D-fix3
    XINPUT_TRIGGER_AXIS_MAP,      // ⭐ v1.6.0-W4D-fix3
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.GamepadMapper = API;
})(typeof window !== 'undefined' ? window : globalThis);