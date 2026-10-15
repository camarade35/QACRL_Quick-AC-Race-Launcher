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
    getAxisMapping,          // ⭐ nouveau
    isAxisBlocked,
    loadLearnedProfiles,
    refreshLearnedProfiles,
    learnAxisMapping,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.GamepadMapper = API;
})(typeof window !== 'undefined' ? window : globalThis);