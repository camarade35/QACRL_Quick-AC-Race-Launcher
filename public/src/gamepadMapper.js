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
  function chromiumAxisToAcAxis(vendor, product, chromiumAxisIndex) {
    if (vendor == null || product == null) return chromiumAxisIndex;
    const key = (vendor + ':' + product).toLowerCase();
    const map = AXIS_MAP_BY_DEVICE[key];
    if (map && map[chromiumAxisIndex] !== undefined) return map[chromiumAxisIndex];
    return chromiumAxisIndex;
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

  function create(controlsIniSections) {
    const acControllers = parseAcControllers(controlsIniSections);
    return {
      getAcControllers: () => acControllers.slice(),
      getChromiumGamepads,
      match: () => matchAll(acControllers, getChromiumGamepads()),
      _parsePgToVendorProduct: parsePgToVendorProduct,
      _parseChromiumGamepadId: parseChromiumGamepadId,
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
    isAxisBlocked,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.GamepadMapper = API;
})(typeof window !== 'undefined' ? window : globalThis);