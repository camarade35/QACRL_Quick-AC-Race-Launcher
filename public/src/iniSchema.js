// public/src/iniSchema.js — v2 (calé sur les vrais fichiers AC)
// Dictionnaire des sections/clés des fichiers INI d'Assetto Corsa.
//
// Principe :
//   - Sections connues -> schéma détaillé (libellé FR, type, min/max, unité)
//   - Sections à template -> BUTTON_SECTION, AXIS_SECTION, KEYBOARD_SECTION…
//   - Sections blacklistées -> __EXT_*, __CM_*, __LAUNCHER_CM, __EXTRA_CM
//   - Clé inconnue -> fallback { label: nom_brut, type: 'auto' }

(function (global) {
  'use strict';

  const BLACKLIST_PREFIXES = ['__EXT_', '__CM_', 'GEAR_'];
  const BLACKLIST_EXACT = ['__LAUNCHER_CM', '__EXTRA_CM'];

  // ---------------------------------------------------------------------------
  // Hints par nom de clé : utilisés quand on est dans une section "binding"
  // ---------------------------------------------------------------------------
  const KEY_HINTS = {
    'BUTTON':              { label: 'Bouton',                type: 'binding' },
    'BUTTON_MODIFICATOR':  { label: 'Bouton modificateur',   type: 'binding' },
    'JOY':                 { label: 'Périphérique',          type: 'binding' },
    'JOY_MODIFICATOR':     { label: 'Périph. modificateur',  type: 'binding' },
    'KEY':                 { label: 'Touche clavier',        type: 'binding' },
    'KEY_MODIFICATOR':     { label: 'Modificateur clavier',  type: 'binding' },
    'XBOXBUTTON':          { label: 'Bouton Xbox',           type: 'binding' },
    'AXLE':                { label: 'Axe',                   type: 'binding' },
    'HOLD_MODE':           { label: 'Mode maintien',         type: 'bool' },
    'ENABLED':             { label: 'Activé',                type: 'bool' },
  };

  // ---------------------------------------------------------------------------
  // Templates de sections réutilisables
  // ---------------------------------------------------------------------------
  const T = {
    // Un binding complet (bouton + clavier + manette)
    BUTTON_SECTION: {
      label: 'Binding',
      keys: KEY_HINTS,
    },
    // Un axe analogique (pédale, volant, frein à main…)
    AXIS_SECTION: {
      label: 'Axe analogique',
      keys: {
        'AXLE':  { label: 'Axe',                 type: 'axis' },
        'GAMMA': { label: 'Gamma',               type: 'float', min: 0.1, max: 5.0, step: 0.05 },
        'JOY':   { label: 'Périphérique',        type: 'binding' },
        'MIN':   { label: 'Valeur min',          type: 'float', min: -1, max: 1, step: 0.01 },
        'MAX':   { label: 'Valeur max',          type: 'float', min: -1, max: 1, step: 0.01 },
      },
    },
  };

  // ---------------------------------------------------------------------------
  // Sections de controls.ini qui utilisent un template
  // (toutes les autres sections "binding" seront gérées par fallback)
  // ---------------------------------------------------------------------------
  // ⭐ v1.6.0 — En mode X360, les pédales peuvent être bindées sur les
  //    gâchettes/boutons Xbox (XBOXBUTTON) au lieu d'un axe analogique.
  //    On utilise la même structure que HANDBRAKE.
  const PEDAL_SECTION = Object.assign({}, T.AXIS_SECTION, {
    keys: Object.assign({}, T.AXIS_SECTION.keys, {
      'BUTTON':      { label: 'Bouton manette', type: 'binding' },
      'KEY':         { label: 'Touche clavier', type: 'binding' },
      'XBOXBUTTON':  { label: 'Bouton Xbox',    type: 'binding' },
    })
  });

  const CONTROLS_TEMPLATE_MAP = {
    // Pédales / axes — ⭐ v1.6.0 : enrichis avec XBOXBUTTON pour mode Manette
    'BRAKES':    PEDAL_SECTION,
    'CLUTCH':    PEDAL_SECTION,
    'THROTTLE':  PEDAL_SECTION,
    'STEER':     Object.assign({}, T.AXIS_SECTION, {
      keys: Object.assign({}, T.AXIS_SECTION.keys, {
        'XBOXBUTTON':  { label: 'Bouton Xbox (D-pad)', type: 'binding' },
      })
    }),
    'HANDBRAKE': Object.assign({}, T.AXIS_SECTION, {
      keys: Object.assign({}, T.AXIS_SECTION.keys, {
        'BUTTON':      { label: 'Bouton manette', type: 'binding' },
        'KEY':         { label: 'Touche clavier', type: 'binding' },
        'XBOXBUTTON':  { label: 'Bouton Xbox',    type: 'binding' },
      })
    }),
    // Bindings simples
    'ABS': T.BUTTON_SECTION, 'ABSDN': T.BUTTON_SECTION, 'ABSUP': T.BUTTON_SECTION,
    'ACTION_CELEBRATE': T.BUTTON_SECTION, 'ACTION_CHANGE_CAMERA': T.BUTTON_SECTION,
    'ACTION_CLAIM': T.BUTTON_SECTION, 'ACTION_HEADLIGHTS': T.BUTTON_SECTION,
    'ACTION_HEADLIGHTS_FLASH': T.BUTTON_SECTION, 'ACTION_HORN': T.BUTTON_SECTION,
    'ACTIVATE_AI': T.BUTTON_SECTION, 'AUTO_SHIFTER': T.BUTTON_SECTION,
    'BALANCEDN': T.BUTTON_SECTION, 'BALANCEUP': T.BUTTON_SECTION,
    'DRIVER_NAMES': T.BUTTON_SECTION, 'DRS': T.BUTTON_SECTION,
    'ENGINE_BRAKE_DN': T.BUTTON_SECTION, 'ENGINE_BRAKE_UP': T.BUTTON_SECTION,
    'FFWD': T.BUTTON_SECTION, 'GEARDN': T.BUTTON_SECTION, 'GEARUP': T.BUTTON_SECTION,
    'GEAR_1': T.BUTTON_SECTION, 'GEAR_2': T.BUTTON_SECTION, 'GEAR_3': T.BUTTON_SECTION,
    'GEAR_4': T.BUTTON_SECTION, 'GEAR_5': T.BUTTON_SECTION, 'GEAR_6': T.BUTTON_SECTION,
    'GEAR_7': T.BUTTON_SECTION, 'GEAR_R': T.BUTTON_SECTION,
    'GLANCEBACK': T.BUTTON_SECTION, 'GLANCELEFT': T.BUTTON_SECTION, 'GLANCERIGHT': T.BUTTON_SECTION,
    'HIDE_APPS': T.BUTTON_SECTION, 'HIDE_DAMAGE': T.BUTTON_SECTION,
    'IDEAL_LINE': T.BUTTON_SECTION, 'KERS': T.BUTTON_SECTION,
    'MGUH_MODE': T.BUTTON_SECTION, 'MGUK_DELIVERY_DN': T.BUTTON_SECTION,
    'MGUK_DELIVERY_UP': T.BUTTON_SECTION, 'MGUK_RECOVERY_DN': T.BUTTON_SECTION,
    'MGUK_RECOVERY_UP': T.BUTTON_SECTION, 'MOUSE_STEERING': T.BUTTON_SECTION,
    'NEXT_CAR': T.BUTTON_SECTION, 'NEXT_LAP': T.BUTTON_SECTION,
    'PAUSE_REPLAY': T.BUTTON_SECTION, 'PLAYER_CAR': T.BUTTON_SECTION,
    'PREVIOUS_CAR': T.BUTTON_SECTION, 'PREVIOUS_LAP': T.BUTTON_SECTION,
    'RESET_RACE': T.BUTTON_SECTION, 'REV': T.BUTTON_SECTION,
    'SHOW_DAMAGE': T.BUTTON_SECTION, 'SLOWMO': T.BUTTON_SECTION,
    'STARTER': T.BUTTON_SECTION, 'START_REPLAY': T.BUTTON_SECTION,
    'TCDN': T.BUTTON_SECTION, 'TCUP': T.BUTTON_SECTION,
    'TRACTION_CONTROL': T.BUTTON_SECTION, 'TURBODN': T.BUTTON_SECTION,
    'TURBOUP': T.BUTTON_SECTION,
  };

  // ---------------------------------------------------------------------------
  // SCHEMA
  // ---------------------------------------------------------------------------
  const SCHEMA = {

    // =========================================================================
    // controls.ini
    // =========================================================================
    'controls.ini': {
      // Sections à NE PAS afficher (gérées par le fallback générique)
      templateMap: CONTROLS_TEMPLATE_MAP,
      sections: {

        'STEER': {
          label: 'Direction (volant)',
          keys: {
            'AXLE':               { label: 'Axe',                 type: 'axis' },
            'JOY':                { label: 'Périphérique',        type: 'binding' },
            'LOCK':               { label: 'Angle de blocage',    type: 'int', min: 180, max: 1080, unit: '°' },
            'SCALE':              { label: 'Échelle',             type: 'float', min: 0.1, max: 2, step: 0.01 },
            'STEER_GAMMA':        { label: 'Gamma',               type: 'float', min: 0.1, max: 3, step: 0.05 },
            'STEER_FILTER':       { label: 'Filtre (lissage)',    type: 'float', min: 0, max: 1, step: 0.01 },
            'SPEED_SENSITIVITY':  { label: 'Sensibilité à la vitesse', type: 'float', min: 0, max: 1, step: 0.01 },
            'DEBOUNCING_MS':      { label: 'Anti-rebond',         type: 'int', min: 0, max: 500, unit: 'ms' },
            'FF_GAIN':            { label: 'Gain force feedback', type: 'float', min: 0, max: 2, step: 0.01 },
            'FILTER_FF':          { label: 'Filtre FF',           type: 'float', min: 0, max: 1, step: 0.01 },
          }
        },

        'KEYBOARD': {
          label: 'Clavier',
          keys: {
            'BRAKE':                             { label: 'Frein',                    type: 'key' },
            'GAS':                               { label: 'Accélérateur',             type: 'key' },
            'LEFT':                              { label: 'Gauche',                   type: 'key' },
            'RIGHT':                             { label: 'Droite',                   type: 'key' },
            'STEER_GAIN':                        { label: 'Gain de direction',        type: 'float', min: 0, max: 1, step: 0.01 },
            'STEERING_SPEED':                    { label: 'Vitesse de braquage',      type: 'float', min: 0.1, max: 5, step: 0.05 },
            'STEERING_OPPOSITE_DIRECTION_SPEED': { label: 'Vitesse retour',           type: 'float', min: 0.1, max: 5, step: 0.05 },
            'STEER_RESET_SPEED':                 { label: 'Vitesse reset',            type: 'float', min: 0.1, max: 5, step: 0.05 },
            'MINIMUM_STEERING':                  { label: 'Braquage minimum',         type: 'float', min: 0, max: 1, step: 0.01 },
            'LOOKAHEAD_POINTS':                  { label: 'Points d\'anticipation',   type: 'int', min: 1, max: 20 },
            'MOUSE_ACCELERATOR_BRAKE':           { label: 'Souris accél./frein',      type: 'bool' },
            'MOUSE_SPEED':                       { label: 'Vitesse souris',           type: 'float', min: 0, max: 1, step: 0.01 },
            'MOUSE_STEER':                       { label: 'Direction souris',         type: 'bool' },
          }
        },

        'SHIFTER': {
          label: 'Levier de vitesses (H-shifter)',
          keys: {
            'ACTIVE':   { label: 'Actif',                   type: 'bool' },
            'JOY':      { label: 'Périphérique',            type: 'binding' },
            'GEAR_1':   { label: 'Position 1ère',           type: 'button' },
            'GEAR_2':   { label: 'Position 2ème',           type: 'button' },
            'GEAR_3':   { label: 'Position 3ème',           type: 'button' },
            'GEAR_4':   { label: 'Position 4ème',           type: 'button' },
            'GEAR_5':   { label: 'Position 5ème',           type: 'button' },
            'GEAR_6':   { label: 'Position 6ème',           type: 'button' },
            'GEAR_7':   { label: 'Position 7ème',           type: 'button' },
            'GEAR_R':   { label: 'Position marche arrière', type: 'button' },
          }
        },

        'ADVANCED': {
          label: 'Options avancées',
          keys: {
            'COMBINE_WITH_KEYBOARD_CONTROL': { label: 'Combiner avec le clavier', type: 'bool' },
          }
        },

        'X360': {
          label: 'Manette Xbox 360',
          keys: {
            'JOYPAD_INDEX':      { label: 'Index du pad',       type: 'int', min: 0, max: 7 },
            'RUMBLE_INTENSITY':  { label: 'Intensité vibrations', type: 'float', min: 0, max: 1, step: 0.01 },
            'SPEED_SENSITIVITY': { label: 'Sensibilité vitesse', type: 'float', min: 0, max: 1, step: 0.01 },
            'STEER_DEADZONE':    { label: 'Zone morte',         type: 'float', min: 0, max: 1, step: 0.01 },
            'STEER_FILTER':      { label: 'Filtre',             type: 'float', min: 0, max: 1, step: 0.01 },
            'STEER_GAMMA':       { label: 'Gamma',              type: 'float', min: 0.1, max: 5, step: 0.01 },
            'STEER_SPEED':       { label: 'Vitesse de braquage', type: 'float', min: 0, max: 1, step: 0.01 },
            'STEER_THUMB':       { label: 'Joystick',           type: 'enum', options: [
              { value: 'LEFT',  label: 'Gauche' },
              { value: 'RIGHT', label: 'Droit'  },
            ]},
          }
        },

        'FF_ENHANCEMENT': {
          label: 'Renforcement du force feedback',
          keys: {
            'ABS':   { label: 'ABS',      type: 'float', min: 0, max: 1, step: 0.01 },
            'CURBS': { label: 'Bordures', type: 'float', min: 0, max: 1, step: 0.01 },
            'ROAD':  { label: 'Route',    type: 'float', min: 0, max: 1, step: 0.01 },
            'SLIPS': { label: 'Dérapages',type: 'float', min: 0, max: 1, step: 0.01 },
          }
        },

        'FF_ENHANCEMENT_2': {
          label: 'FF — sous-virage',
          keys: {
            'UNDERSTEER': { label: 'Sous-virage', type: 'float', min: 0, max: 1, step: 0.01 },
          }
        },

        'FF_TWEAKS': {
          label: 'FF — réglages fins',
          keys: {
            'CENTER_BOOST_GAIN':  { label: 'Boost centrage',       type: 'float', min: 0, max: 2, step: 0.01 },
            'CENTER_BOOST_RANGE': { label: 'Plage boost centrage', type: 'float', min: 0, max: 1, step: 0.01 },
            'MIN_FF':             { label: 'FF minimum',           type: 'float', min: 0, max: 1, step: 0.01 },
          }
        },

        'FF_SKIP_STEPS': {
          label: 'FF — étapes ignorées',
          keys: {
            'VALUE': { label: 'Valeur', type: 'int', min: 0, max: 20 },
          }
        },

        'HEADER': {
          label: 'En-tête',
          keys: {
            'INPUT_METHOD': { label: 'Méthode d\'entrée', type: 'enum', options: [
              { value: 'WHEEL',    label: 'Volant'   },
              { value: 'GAMEPAD',  label: 'Manette'  },
              { value: 'KEYBOARD', label: 'Clavier'  },
              { value: 'MOUSE',    label: 'Souris'   },
            ]},
          }
        },

        'CONTROLLERS': {
          label: 'Périphériques détectés (lecture seule)',
          readOnly: true,
          keys: {},
        },
      }
    },

    // =========================================================================
    // video.ini
    // =========================================================================
    'video.ini': {
      sections: {

        'VIDEO': {
          label: 'Affichage',
          keys: {
            'FULLSCREEN':         { label: 'Plein écran',            type: 'bool' },
            'WIDTH':              { label: 'Résolution',             type: 'resolution' },
            'HEIGHT':             { label: 'Hauteur',                type: 'int', min: 480, max: 4320, readOnly: true },
            'VSYNC':              { label: 'V-Sync',                 type: 'bool' },
            'ANISOTROPIC':        { label: 'Filtrage anisotrope',    type: 'int', min: 0, max: 16 },
            'AASAMPLES':          { label: 'Échantillons AA',        type: 'int', min: 0, max: 8 },
            'AAQUALITY':          { label: 'Qualité AA',             type: 'int', min: 0, max: 4 },
            'SHADOW_MAP_SIZE':    { label: 'Taille ombres',          type: 'int', min: 0, max: 4096 },
            'FPS_CAP_MS':         { label: 'Limite FPS (ms)',        type: 'int', min: 0, max: 200 },
            'DISABLE_LEGACY_HDR': { label: 'Désactiver HDR legacy',  type: 'bool' },
            '_EXT_PLACEMENT':     { label: 'Position fenêtre (CM)',  type: 'string' },
          }
        },

        'ASSETTOCORSA': {
          label: 'Réglages AC',
          keys: {
            'HIDE_ARMS':          { label: 'Cacher les bras',      type: 'bool' },
            'HIDE_STEER':         { label: 'Cacher le volant',     type: 'bool' },
            'LOCK_STEER':         { label: 'Verrouiller le volant',type: 'bool' },
            'WORLD_DETAIL':       { label: 'Détail du monde',      type: 'int', min: 0, max: 5 },
            'ALLOW_FREE_CAMERA':  { label: 'Autoriser la caméra libre (F5)', type: 'bool' },
            'F5_ORBIT_MODE':      { label: 'Mode orbite pour la caméra F5',  type: 'bool' },
          }
        },

        'POST_PROCESS': {
          label: 'Post-traitement',
          keys: {
            'ENABLED':      { label: 'Activé',            type: 'bool' },
            'FILTER':       { label: 'Filtre PP',         type: 'ppfilter' },
            'QUALITY':      { label: 'Qualité',           type: 'int', min: 0, max: 5 },
            'GLARE':        { label: 'Éblouissement',     type: 'int', min: 0, max: 5 },
            'DOF':          { label: 'Profondeur de champ', type: 'int', min: 0, max: 5 },
            'FXAA':         { label: 'FXAA',              type: 'bool' },
            'HEAT_SHIMMER': { label: 'Mirage de chaleur', type: 'bool' },
            'RAYS_OF_GOD':  { label: 'Rayons divins',     type: 'bool' },
          }
        },

        'EFFECTS': {
          label: 'Effets',
          keys: {
            'FXAA':                    { label: 'FXAA',                   type: 'bool' },
            'MOTION_BLUR':             { label: 'Flou de mouvement',      type: 'bool' },
            'RENDER_SMOKE_IN_MIRROR':  { label: 'Fumée dans rétros',      type: 'bool' },
            'SMOKE':                   { label: 'Fumée',                  type: 'int', min: 0, max: 5 },
          }
        },

        'MIRROR': {
          label: 'Rétroviseurs',
          keys: {
            'HQ':   { label: 'Haute qualité', type: 'bool' },
            'SIZE': { label: 'Taille',        type: 'int', min: 0, max: 4096 },
          }
        },

        'CUBEMAP': {
          label: 'Cubemap',
          keys: {
            'SIZE':           { label: 'Taille',             type: 'int', min: 0, max: 4096 },
            'FACES_PER_FRAME':{ label: 'Faces par frame',    type: 'int', min: 0, max: 6 },
            'FARPLANE':       { label: 'Plan lointain',      type: 'int', min: 0, max: 10000 },
          }
        },

        'REFRESH': {
          label: 'Fréquence de rafraîchissement',
          keys: {
            'VALUE': { label: 'Taux (Hz)', type: 'int', min: 30, max: 360, unit: 'Hz' },
          }
        },

        'SATURATION': {
          label: 'Saturation',
          keys: {
            'LEVEL': { label: 'Saturation', type: 'int', min: 0, max: 200, unit: '%' },
          }
        },

        'CAMERA': {
          label: 'Caméra',
          keys: {
            'MODE': { label: 'Mode', type: 'enum', options: [
              { value: 'DEFAULT', label: 'Par défaut' },
              { value: 'COCKPIT', label: 'Cockpit'    },
              { value: 'BONNET',  label: 'Capot'      },
              { value: 'CHASE',   label: 'Poursuite'  },
            ]},
          }
        },
      }
    },

    // =========================================================================
    // audio.ini
    // =========================================================================
    'audio.ini': {
      sections: {

        'LEVELS': {
          label: 'Volumes principaux',
          keys: {
            'MASTER':     { label: 'Volume général',      type: 'float', min: 0, max: 1, step: 0.01 },
            'ENGINE':     { label: 'Moteur',              type: 'float', min: 0, max: 1, step: 0.01 },
            'TYRES':      { label: 'Pneus',               type: 'float', min: 0, max: 1, step: 0.01 },
            'OPPONENTS':  { label: 'Adversaires',         type: 'float', min: 0, max: 1, step: 0.01 },
            'SURFACES':   { label: 'Surfaces',            type: 'float', min: 0, max: 1, step: 0.01 },
            'WIND':       { label: 'Vent',                type: 'float', min: 0, max: 1, step: 0.01 },
            'BRAKES':     { label: 'Freins',              type: 'float', min: 0, max: 1, step: 0.01 },
            'DIRT_BOTTOM':{ label: 'Bas de caisse / sol', type: 'float', min: 0, max: 1, step: 0.01 },
            'MUSIC':      { label: 'Musique',             type: 'float', min: 0, max: 1, step: 0.01 },
            'UISOUNDS':   { label: 'Sons interface',      type: 'float', min: 0, max: 1, step: 0.01 },
          }
        },

        'LEVELS_EXT': {
          label: 'Volumes étendus',
          keys: {
            'CAR_COMPONENTS': { label: 'Composants voiture', type: 'float', min: 0, max: 1, step: 0.01 },
            'TRACK':          { label: 'Circuit',            type: 'float', min: 0, max: 1, step: 0.01 },
            'WEATHER':        { label: 'Météo',              type: 'float', min: 0, max: 1, step: 0.01 },
            'WIPERS':         { label: 'Essuie-glaces',      type: 'float', min: 0, max: 1, step: 0.01 },
          }
        },

        'SETTINGS': {
          label: 'Paramètres',
          keys: {
            'DRIVER_NAME': { label: 'Périphérique de sortie audio', type: 'audiosink' },
          }
        },

        'SKIDS': {
          label: 'Dérapages',
          keys: {
            'ENTRY_POINT': { label: 'Point d\'entrée', type: 'int', min: 0, max: 1000 },
          }
        },

        'HEADER': {
          label: 'En-tête',
          keys: {
            'VERSION': { label: 'Version', type: 'int', readOnly: true },
          }
        },
      }
    }
  };

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  function isBlacklisted(sectionName) {
    if (typeof sectionName !== 'string') return false;
    if (BLACKLIST_EXACT.indexOf(sectionName) !== -1) return true;
    // ⭐ v1.6.0 — Toute section commençant par __ est interne (CM/CSP)
    if (sectionName.startsWith('__')) return true;
    for (let i = 0; i < BLACKLIST_PREFIXES.length; i++) {
      if (sectionName.startsWith(BLACKLIST_PREFIXES[i])) return true;
    }
    return false;
  }

  function getFileSchema(filename) {
    return SCHEMA[filename] || null;
  }

  function getSectionSchema(filename, sectionName) {
    const file = SCHEMA[filename];
    if (!file) return null;

    // 1) Schéma explicite
    if (file.sections && file.sections[sectionName]) {
      return file.sections[sectionName];
    }
    // 2) Template
    if (file.templateMap && file.templateMap[sectionName]) {
      return file.templateMap[sectionName];
    }
    // 3) Fallback : si la section ressemble à un binding, on applique KEY_HINTS
    if (filename === 'controls.ini') {
      return { label: sectionName, keys: KEY_HINTS };
    }
    return null;
  }

  function getKeySchema(filename, sectionName, keyName) {
    const sec = getSectionSchema(filename, sectionName);
    if (sec && sec.keys && sec.keys[keyName]) {
      return sec.keys[keyName];
    }
    // Fallback par hint global (BUTTON, JOY, KEY, XBOXBUTTON…)
    if (KEY_HINTS[keyName]) return KEY_HINTS[keyName];
    // Fallback total
    return { label: keyName, type: 'auto' };
  }

  const API = {
    isBlacklisted,
    getFileSchema,
    getSectionSchema,
    getKeySchema,
    KEY_HINTS,
    SCHEMA,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.IniSchema = API;
})(typeof window !== 'undefined' ? window : globalThis);