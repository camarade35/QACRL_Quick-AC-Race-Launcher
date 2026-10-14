// src/solPlanner.js
// Support des plans Sol Planner (format INI) — compatible Sol 2.x / 2.5.
//
// ⚠️ Ne JAMAIS toucher aux fichiers Pure depuis ce module.
//    Pure reste géré par main.js (writePurePlanArchive, writePurePlanActive, …).
//
// Points clés (d'après sol_planner.py) :
//   • Sol lit UNIQUEMENT apps/python/sol_planner/presets/presets.ini
//   • [general] loadwithstart = N  → autoload du slot N (0-4) au démarrage
//   • Un slot [N] contient 9 sous-slots indexés 0-8
//   • "weatherID" stocké dans les INI = INDEX dans weather_params (PAS l'ID CSP)
//       → Clear = 15, No Clouds = 33, Random Dry = 34, Random Rainy = 35,
//         Random Bad = 36, CM = 38, Empty = 37 (jamais sauvegardé)
//   • 18 clés par étape + 4 clés globales (timemultiplier / timemode / repeat / playing)
//   • Les plans archivés vivent dans apps/python/sol_planner/plans/*.ini (section [plan])

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONSTANTES
// =============================================================================

const SOL_PLANNER_SUBPATH = path.join('apps', 'python', 'sol_planner');
const PLANS_SUBDIR        = 'plans';
const PRESETS_SUBDIR      = 'presets';
const PRESETS_FILENAME    = 'presets.ini';

const QACRL_SLOT_NAME = 'QACRL';
const SOL_SLOT_COUNT  = 5;   // [0] à [4]
const SOL_STEP_COUNT  = 9;   // 0-weather à 8-weather

// Liste des météos Sol par INDEX (0-38). Copié de weather_params dans sol_planner.py.
// Index 37 = "Empty" (jamais écrit dans un plan), 38 = "CM" (idem).
const SOL_WEATHER_NAMES = {
  0:  'Light Thunderstorm',
  1:  'Thunderstorm',
  2:  'Heavy Thunderstorm',
  3:  'Light Drizzle',
  4:  'Drizzle',
  5:  'Heavy Drizzle',
  6:  'Light Rain',
  7:  'Rain',
  8:  'Heavy Rain',
  9:  'Light Snow',
  10: 'Snow',
  11: 'Heavy Snow',
  12: 'Light Sleet',
  13: 'Sleet',
  14: 'Heavy Sleet',
  15: 'Clear',
  16: 'Few Clouds',
  17: 'Scattered Clouds',
  18: 'Broken Clouds',
  19: 'Overcast Clouds',
  20: 'Fog',
  21: 'Mist',
  22: 'Smoke',
  23: 'Haze',
  24: 'Sand',
  25: 'Dust',
  26: 'Squalls',
  27: 'Tornado',
  28: 'Hurricane',
  29: 'Cold',
  30: 'Hot',
  31: 'Windy',
  32: 'Hail',
  33: 'No Clouds',
  34: 'Random Dry',
  35: 'Random Rainy',
  36: 'Random Bad',
  37: 'Empty',
  38: 'CM',
};

// Mapping : weatherId QACRL (ex. "sol_01_clear") → index Sol.
// Les IDs QACRL viennent de content/weather/sol_*/ et sont filtrés dans appData.weatherList.
const QACRL_TO_SOL_INDEX = {
  'sol_00_no_clouds':          33,
  'sol_01_clear':              15,
  'sol_02_few_clouds':         16,
  'sol_03_scattered_clouds':   17,
  'sol_04_windy':              31,
  'sol_05_broken_clouds':      18,
  'sol_06_overcast':           19,
  'sol_11_mist':               21,
  'sol_12_fog':                20,
  'sol_21_haze':               23,
  'sol_22_dust':               25,
  'sol_23_sand':               24,
  'sol_24_smoke':              22,
  'sol_31_light_drizzle':      3,
  'sol_32_drizzle':            4,
  'sol_33_heavy_drizzle':      5,
  'sol_34_light_rain':         6,
  'sol_35_rain':               7,
  'sol_36_heavy_rain':         8,
  'sol_41_light_thunderstorm': 0,
  'sol_42_thunderstorm':       1,
  'sol_43_heavy_thunderstorm': 2,
  'sol_44_squalls':            26,
  'sol_45_tornado':            27,
  'sol_46_hurricane':          28,
  'sol_51_light_snow':         9,
  'sol_52_snow':               10,
  'sol_53_heavy_snow':         11,
  'sol_54_light_sleet':        12,
  'sol_55_sleet':              13,
  'sol_56_heavy_sleet':        14,
  'sol_57_hail':               32,
};

// Valeurs par défaut par index Sol (extraites de weather_params).
// [rain, rainProbability, rainVariance, wind, humidity, fog]
const SOL_WEATHER_DEFAULTS = {
  0:  { rain: 0.10, prob: 0.50, vari: 0.70, wind: 20,  humidity: 0.50, fog: 0.00 },
  1:  { rain: 0.40, prob: 0.70, vari: 0.50, wind: 40,  humidity: 0.60, fog: 0.00 },
  2:  { rain: 0.85, prob: 0.90, vari: 0.30, wind: 70,  humidity: 0.70, fog: 0.00 },
  3:  { rain: 0.05, prob: 0.50, vari: 0.60, wind: 5,   humidity: 0.60, fog: 0.00 },
  4:  { rain: 0.10, prob: 0.60, vari: 0.50, wind: 10,  humidity: 0.70, fog: 0.00 },
  5:  { rain: 0.25, prob: 0.80, vari: 0.40, wind: 15,  humidity: 0.80, fog: 0.00 },
  6:  { rain: 0.30, prob: 0.50, vari: 0.80, wind: 10,  humidity: 0.60, fog: 0.00 },
  7:  { rain: 0.50, prob: 0.60, vari: 0.60, wind: 20,  humidity: 0.70, fog: 0.00 },
  8:  { rain: 0.80, prob: 0.90, vari: 0.40, wind: 30,  humidity: 0.80, fog: 0.00 },
  9:  { rain: 0.00, prob: 0.70, vari: 0.60, wind: 0,   humidity: 0.50, fog: 0.20 },
  10: { rain: 0.00, prob: 0.80, vari: 0.50, wind: 0,   humidity: 0.50, fog: 0.30 },
  11: { rain: 0.00, prob: 0.90, vari: 0.40, wind: 0,   humidity: 0.50, fog: 0.50 },
  12: { rain: 0.20, prob: 0.50, vari: 0.60, wind: 0,   humidity: 0.50, fog: 0.00 },
  13: { rain: 0.50, prob: 0.60, vari: 0.50, wind: 0,   humidity: 0.50, fog: 0.00 },
  14: { rain: 0.70, prob: 0.80, vari: 0.40, wind: 0,   humidity: 0.50, fog: 0.00 },
  15: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 5,   humidity: 0.50, fog: 0.00 },
  16: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 15,  humidity: 0.50, fog: 0.00 },
  17: { rain: 0.00, prob: 0.20, vari: 0.80, wind: 20,  humidity: 0.50, fog: 0.00 },
  18: { rain: 0.00, prob: 0.50, vari: 0.90, wind: 35,  humidity: 0.50, fog: 0.00 },
  19: { rain: 0.00, prob: 0.30, vari: 0.70, wind: 15,  humidity: 0.50, fog: 0.00 },
  20: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 1.00, fog: 0.80 },
  21: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.95, fog: 0.55 },
  22: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.50, fog: 0.00 },
  23: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.80, fog: 0.25 },
  24: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.40, fog: 0.00 },
  25: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.50, fog: 0.00 },
  26: { rain: 0.10, prob: 0.20, vari: 0.90, wind: 70,  humidity: 0.70, fog: 0.00 },
  27: { rain: 0.60, prob: 0.60, vari: 0.60, wind: 100, humidity: 0.80, fog: 0.00 },
  28: { rain: 0.90, prob: 0.90, vari: 0.30, wind: 120, humidity: 0.90, fog: 0.00 },
  29: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.50, fog: 0.00 },
  30: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.50, fog: 0.00 },
  31: { rain: 0.00, prob: 0.10, vari: 0.90, wind: 50,  humidity: 0.60, fog: 0.00 },
  32: { rain: 0.50, prob: 0.90, vari: 0.00, wind: 0,   humidity: 0.50, fog: 0.00 },
  33: { rain: 0.00, prob: 0.00, vari: 0.00, wind: 0,   humidity: 0.50, fog: 0.00 }, // No Clouds
};

// Ordre EXACT des clés par étape (pour reproduire le format Sol à l'identique).
const STEP_KEYS_ORDER = [
  'weather', 'weather_list',
  'rain', 'rainprobability', 'rainvariance',
  'wetness', 'wetfine', 'puddles',
  'humidity', 'fog',
  'tempambient', 'temproad',
  'wind', 'winddirection',
  'playseconds',
  'stamphour', 'stampminute',
];

// Ordre EXACT des clés globales en fin de section.
const GLOBAL_KEYS_ORDER = ['timemultiplier', 'timemode', 'repeat', 'playing'];

// =============================================================================
// HELPERS — formatage de valeurs (pour reproduire le format Sol à l'identique)
// =============================================================================

function fmtFloat2(v) {
  const n = Number(v);
  if (!isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function fmtInt(v) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return '0';
  return String(n);
}

function fmtTimemult(v) {
  const n = Number(v);
  if (!isFinite(n)) return '1.0';
  // Python str(1.0) = '1.0', str(1.5) = '1.5', str(2.0) = '2.0'
  if (Number.isInteger(n)) return n.toFixed(1);
  return String(n);
}

function fmtBool(v) {
  return v ? 'True' : 'False';
}

// =============================================================================
// PARSEUR INI SIMPLE (préserve l'ordre des sections et des clés)
// =============================================================================

/**
 * Parse un contenu INI en liste de sections.
 * Structure retournée :
 * [
 *   { name: '', entries: [ { key, value } ] },   // en-tête avant la 1ère section
 *   { name: 'SECTION', entries: [ { key, value } ] },
 *   ...
 * ]
 *
 * Les lignes vides et les commentaires (`;`, `#`, `/`, `_` en début de ligne)
 * sont ignorés — on ne les préserve PAS dans la structure, car Sol réécrit
 * toujours ses INI en entier (via configparser.write()).
 */
function parseIniSimple(text) {
  const lines = String(text || '').split(/\r?\n/);
  const sections = [{ name: '', entries: [] }];
  let current = sections[0];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[;#\/_]/.test(line)) continue;

    const secMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (secMatch) {
      current = { name: secMatch[1].trim(), entries: [] };
      sections.push(current);
      continue;
    }

    const eq = line.indexOf('=');
    if (eq < 0) continue;

    const key = line.substring(0, eq).trim();
    const value = line.substring(eq + 1).trim();
    current.entries.push({ key, value });
  }

  return sections;
}

/**
 * Sérialise une liste de sections en contenu INI.
 * Si `includeHeader` est vrai et qu'une section `''` existe, son contenu
 * est écrit en premier (mais on n'écrit jamais `[]` pour la section vide).
 */
function serializeIniSimple(sections) {
  const out = [];
  for (const sec of sections) {
    if (sec.name) {
      if (out.length > 0) out.push('');
      out.push('[' + sec.name + ']');
    }
    for (const e of sec.entries) {
      out.push(e.key + ' = ' + e.value);
    }
  }
  return out.join('\n') + '\n';
}

// =============================================================================
// CONVERSION MÉTÉO QACRL ↔ SOL
// =============================================================================

/**
 * Convertit un weatherId QACRL (ex. "sol_01_clear") en index Sol (0-38).
 * Retourne 15 ("Clear") par défaut si non reconnu.
 */
function qacrlWeatherToSolIndex(weatherId) {
  if (!weatherId) return 15;
  const lower = String(weatherId).toLowerCase().trim();

  // Match direct
  if (QACRL_TO_SOL_INDEX[lower] !== undefined) return QACRL_TO_SOL_INDEX[lower];

  // Fallback : cherche une sous-chaîne
  for (const k of Object.keys(QACRL_TO_SOL_INDEX)) {
    if (lower.includes(k) || k.includes(lower)) return QACRL_TO_SOL_INDEX[k];
  }

  console.warn('[solPlanner] weatherId non reconnu :', weatherId, '→ fallback Clear (15)');
  return 15;
}

/**
 * Retourne les valeurs par défaut Sol pour un index donné.
 */
function getSolWeatherDefaults(solIndex) {
  return SOL_WEATHER_DEFAULTS[solIndex] || SOL_WEATHER_DEFAULTS[15];
}

// =============================================================================
// PARSING D'UN PLAN SOL
// =============================================================================

/**
 * Parse un contenu INI de plan Sol (section [plan] OU [N]).
 * Retourne un objet planData :
 * {
 *   steps: [ { weather, weatherList, rain, rainprobability, rainvariance,
 *              wetness, wetfine, puddles, humidity, fog,
 *              tempambient, temproad, wind, winddirection,
 *              playseconds, stamphour, stampminute }, ... 9 items ],
 *   timemultiplier, timemode, repeat, playing
 * }
 */
function parseSolPlanContent(content, sectionName) {
  const secName = sectionName || 'plan';
  const sections = parseIniSimple(content);
  const target = sections.find(s => s.name === secName);
  if (!target) {
    throw new Error('Section [' + secName + '] introuvable dans le fichier Sol.');
  }

  const steps = [];
  for (let i = 0; i < SOL_STEP_COUNT; i++) {
    steps.push({
      weather: null,
      weatherList: null,
      rain: 0.00,
      rainprobability: 0.00,
      rainvariance: 0.00,
      wetness: -1.00,
      wetfine: 0.00,
      puddles: -1.00,
      humidity: 0.50,
      fog: 0.00,
      tempambient: 20,
      temproad: 30,
      wind: 0,
      winddirection: 0,
      playseconds: 120,
      stamphour: 16,
      stampminute: 0,
    });
  }

  let timemultiplier = 1.0;
  let timemode = 0;
  let repeat = true;
  let playing = false;

  for (const e of target.entries) {
    // Clés globales
    if (e.key === 'timemultiplier') { timemultiplier = parseFloat(e.value) || 1.0; continue; }
    if (e.key === 'timemode')       { timemode = parseInt(e.value, 10) || 0; continue; }
    if (e.key === 'repeat')         { repeat = /^(true|1|yes|on)$/i.test(e.value); continue; }
    if (e.key === 'playing')        { playing = /^(true|1|yes|on)$/i.test(e.value); continue; }
    if (e.key === 'usefullday')     { continue; } // obsolète
    if (e.key === 'name')           { continue; } // nom de preset, pas du plan

    // Clés par étape : "N-xxx"
    const m = e.key.match(/^(\d+)-(.+)$/);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    const field = m[2].toLowerCase();
    if (idx < 0 || idx >= SOL_STEP_COUNT) continue;

    const step = steps[idx];
    switch (field) {
      case 'weather': {
        const wid = parseInt(e.value, 10);
        if (!isNaN(wid) && wid >= 0 && wid <= 38) step.weather = wid;
        break;
      }
      case 'weather_list': {
        step.weatherList = e.value
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n >= 0 && n <= 38);
        break;
      }
      case 'rain':          step.rain = parseFloat(e.value) || 0; break;
      case 'rainprobability': step.rainprobability = parseFloat(e.value) || 0; break;
      case 'rainvariance':  step.rainvariance = parseFloat(e.value) || 0; break;
      case 'wetness':       step.wetness = parseFloat(e.value); break;
      case 'wetfine':       step.wetfine = parseFloat(e.value) || 0; break;
      case 'puddles':       step.puddles = parseFloat(e.value); break;
      case 'humidity':      step.humidity = parseFloat(e.value) || 0; break;
      case 'fog':           step.fog = parseFloat(e.value) || 0; break;
      case 'tempambient':   step.tempambient = parseInt(e.value, 10) || 20; break;
      case 'temproad':      step.temproad = parseInt(e.value, 10) || 30; break;
      case 'wind':          step.wind = parseInt(e.value, 10) || 0; break;
      case 'winddirection': step.winddirection = parseInt(e.value, 10) || 0; break;
      case 'playseconds':   step.playseconds = parseInt(e.value, 10) || 120; break;
      case 'stamphour':     step.stamphour = parseInt(e.value, 10) || 0; break;
      case 'stampminute':   step.stampminute = parseInt(e.value, 10) || 0; break;
    }
  }

  return { steps, timemultiplier, timemode, repeat, playing };
}

/**
 * Lit un fichier de plan Sol depuis le disque.
 */
function parseSolPlanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Fichier introuvable : ' + filePath);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return parseSolPlanContent(content, 'plan');
}

// =============================================================================
// SÉRIALISATION D'UN PLAN SOL
// =============================================================================

/**
 * Sérialise un planData en contenu INI (section [plan]).
 * Respecte l'ordre exact des clés observé dans les fichiers Sol.
 */
function serializeSolPlan(planData) {
  const steps = Array.isArray(planData.steps) ? planData.steps : [];
  const out = ['[plan]'];

  for (let i = 0; i < SOL_STEP_COUNT; i++) {
    const step = steps[i] || {};

    // Slot vide → on écrit juste playseconds (convention des INI Sol)
    if (step.weather === null || step.weather === undefined) {
      out.push(i + '-playseconds = ' + fmtInt(step.playseconds || 120));
      continue;
    }

    // Slot actif → on écrit dans l'ordre canonique
    const values = {
      weather:        fmtInt(step.weather),
      weather_list:   step.weatherList && step.weatherList.length > 0
                        ? step.weatherList.join(',')
                        : null,
      rain:           fmtFloat2(step.rain),
      rainprobability: fmtFloat2(step.rainprobability),
      rainvariance:   fmtFloat2(step.rainvariance),
      wetness:        fmtFloat2(step.wetness != null ? step.wetness : -1.00),
      wetfine:        fmtFloat2(step.wetfine || 0.00),
      puddles:        fmtFloat2(step.puddles != null ? step.puddles : -1.00),
      humidity:       fmtFloat2(step.humidity != null ? step.humidity : 0.50),
      fog:            fmtFloat2(step.fog || 0.00),
      tempambient:    fmtInt(step.tempambient != null ? step.tempambient : 20),
      temproad:       fmtInt(step.temproad != null ? step.temproad : 30),
      wind:           fmtInt(step.wind || 0),
      winddirection:  fmtInt(step.winddirection || 0),
      playseconds:    fmtInt(step.playseconds || 120),
      stamphour:      fmtInt(step.stamphour != null ? step.stamphour : 16),
      stampminute:    fmtInt(step.stampminute != null ? step.stampminute : 0),
    };

    for (const k of STEP_KEYS_ORDER) {
      if (values[k] === null || values[k] === undefined) continue;
      out.push(i + '-' + k + ' = ' + values[k]);
    }
  }

  // Clés globales
  out.push('timemultiplier = ' + fmtTimemult(planData.timemultiplier != null ? planData.timemultiplier : 1.0));
  out.push('timemode = ' + fmtInt(planData.timemode != null ? planData.timemode : 0));
  out.push('repeat = ' + fmtBool(planData.repeat));
  out.push('playing = ' + fmtBool(planData.playing));

  return out.join('\n') + '\n';
}

// =============================================================================
// SCAN DES PLANS DISPONIBLES
// =============================================================================

/**
 * Scanne apps/python/sol_planner/plans/*.ini et retourne la liste des plans.
 * Ignore les fichiers qui ne contiennent pas d'étape `N-weather`.
 */
function scanSolPlans(acPath) {
  if (!acPath || !fs.existsSync(acPath)) return [];

  const plansRoot = path.join(acPath, SOL_PLANNER_SUBPATH, PLANS_SUBDIR);
  if (!fs.existsSync(plansRoot)) return [];

  const plans = [];
  try {
    const items = fs.readdirSync(plansRoot, { withFileTypes: true });
    for (const item of items) {
      if (!item.isFile()) continue;
      if (!item.name.toLowerCase().endsWith('.ini')) continue;

      const full = path.join(plansRoot, item.name);
      try {
        const content = fs.readFileSync(full, 'utf8');
        // Validation minimale : doit contenir au moins une clé `N-weather`
        if (!/^\d+-weather\s*=/m.test(content)) continue;

        // Extraction du nom (clé `name` ou fallback sur nom de fichier)
        const nameMatch = content.match(/^name\s*=\s*(.+)$/m);
        const name = nameMatch
          ? nameMatch[1].trim()
          : item.name.replace(/\.ini$/i, '');

        plans.push({
          id: item.name,             // ex. "cloudy-rainy-nice.ini"
          name,                       // nom affiché
          file: full,                 // chemin complet
          isQacrl: /^QACRL_/i.test(item.name), // créé par QACRL ?
        });
      } catch (e) {
        console.warn('[solPlanner] plan illisible :', full, e.message);
      }
    }
  } catch (e) {
    console.warn('[solPlanner] scan plans KO :', e.message);
  }

  plans.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  return plans;
}

// =============================================================================
// CONSTRUCTION D'UN PLAN À PARTIR DES ÉTAPES UI
// =============================================================================

/**
 * Construit un planData Sol à partir de paramètres UI.
 *
 * @param {Array<{weather:string, duration:number}>} steps
 *        Étapes UI : weather = weatherId QACRL, duration = minutes.
 * @param {object} options
 *        {
 *          sessionStartTime: 'HH:MM',
 *          timeMult: number,
 *          timemode: 0|1|2,      // défaut 1 (time span)
 *          loop: boolean,
 *          playing: boolean,      // démarrage automatique
 *        }
 * @returns {object} planData compatible avec serializeSolPlan()
 */
function buildSolPlanData(steps, options) {
  const opts = options || {};
  const timeMult = Number(opts.timeMult) || 1.0;
  const timemode = (opts.timemode != null) ? opts.timemode : 1; // 1 = time span
  const loop = opts.loop !== undefined ? !!opts.loop : true;
  const playing = opts.playing !== undefined ? !!opts.playing : true;

  // Point de départ : 16:00 par défaut, remplacé par sessionStartTime si fourni
  let startHour = 16;
  let startMinute = 0;
  if (opts.sessionStartTime && /^\d{1,2}:\d{2}$/.test(opts.sessionStartTime)) {
    const parts = opts.sessionStartTime.split(':');
    startHour = parseInt(parts[0], 10);
    startMinute = parseInt(parts[1], 10);
  }

  // Construit les 9 slots
  const builtSteps = [];
  const stepsArr = Array.isArray(steps) ? steps.slice(0, SOL_STEP_COUNT) : [];

  for (let i = 0; i < SOL_STEP_COUNT; i++) {
    const src = stepsArr[i];
    if (!src || !src.weather) {
      // Slot vide
      builtSteps.push({
        weather: null,
        playseconds: 120,
        stamphour: (startHour + i) % 24,
        stampminute: 0,
      });
      continue;
    }

    const solIndex = qacrlWeatherToSolIndex(src.weather);
    const def = getSolWeatherDefaults(solIndex);
    const durationMin = parseInt(src.duration, 10) || 10;

    // Pour les Random (34/35/36), il faut fournir une weather_list
    let weatherList = null;
    if (solIndex === 34) weatherList = [15, 16, 17, 18, 19, 31, 23, 25, 26]; // Dry
    else if (solIndex === 35) weatherList = [18, 19, 26, 3, 4, 5, 6, 7, 8]; // Rainy
    else if (solIndex === 36) weatherList = [0, 1, 2, 26, 27, 28, 18, 29]; // Bad

    builtSteps.push({
      weather: solIndex,
      weatherList,
      rain: def.rain,
      rainprobability: def.prob,
      rainvariance: def.vari,
      wetness: -1.00,
      wetfine: 0.00,
      puddles: -1.00,
      humidity: def.humidity,
      fog: def.fog,
      tempambient: 20,
      temproad: 30,
      wind: def.wind,
      winddirection: 0,
      playseconds: durationMin * 60,
      stamphour: (startHour + i) % 24,
      stampminute: startMinute,
    });
  }

  return {
    steps: builtSteps,
    timemultiplier: timeMult,
    timemode,
    repeat: loop,
    playing,
  };
}

// =============================================================================
// GESTION DU presets.ini (5 slots)
// =============================================================================

/**
 * Lit le fichier apps/python/sol_planner/presets/presets.ini.
 * Retourne :
 * {
 *   exists: bool,
 *   path: string,
 *   sections: [ ... toutes les sections parsées ... ],
 *   general: { loadwithstart: N | null },
 *   slots: [ { index, name, isQacrl, isEmpty, hasWeather, rawEntries }, ... x5 ]
 * }
 */
function readSolPresets(acPath) {
  const presetsFile = path.join(acPath, SOL_PLANNER_SUBPATH, PRESETS_SUBDIR, PRESETS_FILENAME);
  const result = {
    exists: false,
    path: presetsFile,
    sections: [],
    general: { loadwithstart: null },
    slots: [],
  };

  if (!fs.existsSync(presetsFile)) return result;
  result.exists = true;

  let content = '';
  try {
    content = fs.readFileSync(presetsFile, 'utf8');
  } catch (e) {
    console.warn('[solPlanner] presets.ini illisible :', e.message);
    return result;
  }

  const sections = parseIniSimple(content);
  result.sections = sections;

  // [general]
  const generalSec = sections.find(s => s.name === 'general');
  if (generalSec) {
    // ⭐ Tolérant : accepte loadWithStart ET loadwithstart (compat anciens fichiers)
    const lws = generalSec.entries.find(e =>
      e.key === 'loadWithStart' || e.key === 'loadwithstart'
    );
    if (lws) {
      const n = parseInt(lws.value, 10);
      if (!isNaN(n) && n >= 0 && n < SOL_SLOT_COUNT) {
        result.general.loadwithstart = n;
      }
    }
  }

  // Slots [0] à [4]
  for (let i = 0; i < SOL_SLOT_COUNT; i++) {
    const sec = sections.find(s => s.name === String(i));
    const slot = {
      index: i,
      name: null,
      isQacrl: false,
      isEmpty: true,
      hasWeather: false,
      rawEntries: sec ? sec.entries.slice() : [],
    };

    if (sec) {
      const nameEntry = sec.entries.find(e => e.key === 'name');
      if (nameEntry && nameEntry.value) {
        slot.name = nameEntry.value;
        slot.isQacrl = (nameEntry.value === QACRL_SLOT_NAME);
      }
      // Un slot est "vide" s'il n'a AUCUNE clé `N-weather`
      slot.hasWeather = sec.entries.some(e => /^\d+-weather\s*$/.test(e.key));
      slot.isEmpty = !slot.hasWeather;
    }

    result.slots.push(slot);
  }

  return result;
}

/**
 * Trouve le slot à utiliser pour QACRL, selon la règle Q1=C :
 *   1. Slot avec name = "QACRL" (le nôtre, on l'écrase)
 *   2. Sinon, 1er slot complètement vide
 *   3. Sinon → null (l'appelant devra avertir l'utilisateur)
 */
function findFreeSolSlot(presetsData) {
  if (!presetsData || !Array.isArray(presetsData.slots)) return null;

  // 1) Notre slot QACRL
  for (const slot of presetsData.slots) {
    if (slot.isQacrl) return slot.index;
  }
  // 2) Premier slot vide
  for (const slot of presetsData.slots) {
    if (slot.isEmpty) return slot.index;
  }
  // 3) Aucun slot libre
  return null;
}

/**
 * Écrit un plan dans un slot du presets.ini.
 * - Préserve TOUS les autres slots intacts
 * - Écrit `name = QACRL` + les 9 steps + les 4 clés globales
 * - Met `loadwithstart = slotIndex` dans [general]
 *
 * @returns {object} { success, slotIndex, path }
 */
function activateSolPlanInPresets(acPath, slotIndex, planData) {
  const presetsFile = path.join(acPath, SOL_PLANNER_SUBPATH, PRESETS_SUBDIR, PRESETS_FILENAME);

  // Crée le dossier presets/ si absent
  const presetsDir = path.dirname(presetsFile);
  if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

  // Backup si le fichier existe
  if (fs.existsSync(presetsFile)) {
    try { fs.copyFileSync(presetsFile, presetsFile + '.bak'); } catch (e) {}
  }

  // Lit (ou crée) la structure
  let sections = [];
  if (fs.existsSync(presetsFile)) {
    const content = fs.readFileSync(presetsFile, 'utf8');
    sections = parseIniSimple(content);
  }
  if (sections.length === 0) {
    sections = [{ name: 'general', entries: [] }];
  }

  // --- [general] : maj loadWithStart (camelCase EXACT attendu par Sol) ---
  let generalSec = sections.find(s => s.name === 'general');
  if (!generalSec) {
    generalSec = { name: 'general', entries: [] };
    sections.unshift(generalSec);
  }
  // ⚠️ Nettoie TOUTES les variantes résiduelles (lowercase d'anciennes versions)
  //    puis écrit UNIQUEMENT loadWithStart en camelCase.
  generalSec.entries = generalSec.entries.filter(e =>
    e.key.toLowerCase() !== 'loadwithstart'
  );
  generalSec.entries.push({ key: 'loadWithStart', value: String(slotIndex) });

  // --- Slot [N] : on retire l'ancienne section et on la recrée ---
  const slotName = String(slotIndex);
  const existingIdx = sections.findIndex(s => s.name === slotName);
  if (existingIdx >= 0) sections.splice(existingIdx, 1);

  const slotEntries = [];
  // 9 étapes
  const steps = Array.isArray(planData.steps) ? planData.steps : [];
  for (let i = 0; i < SOL_STEP_COUNT; i++) {
    const step = steps[i] || {};

    if (step.weather === null || step.weather === undefined) {
      slotEntries.push({ key: i + '-playseconds', value: fmtInt(step.playseconds || 120) });
      continue;
    }

    // Ordre canonique
    const values = {
      weather:        fmtInt(step.weather),
      weather_list:   step.weatherList && step.weatherList.length > 0
                        ? step.weatherList.join(',')
                        : null,
      rain:           fmtFloat2(step.rain),
      rainprobability: fmtFloat2(step.rainprobability),
      rainvariance:   fmtFloat2(step.rainvariance),
      wetness:        fmtFloat2(step.wetness != null ? step.wetness : -1.00),
      wetfine:        fmtFloat2(step.wetfine || 0.00),
      puddles:        fmtFloat2(step.puddles != null ? step.puddles : -1.00),
      humidity:       fmtFloat2(step.humidity != null ? step.humidity : 0.50),
      fog:            fmtFloat2(step.fog || 0.00),
      tempambient:    fmtInt(step.tempambient != null ? step.tempambient : 20),
      temproad:       fmtInt(step.temproad != null ? step.temproad : 30),
      wind:           fmtInt(step.wind || 0),
      winddirection:  fmtInt(step.winddirection || 0),
      playseconds:    fmtInt(step.playseconds || 120),
      stamphour:      fmtInt(step.stamphour != null ? step.stamphour : 16),
      stampminute:    fmtInt(step.stampminute != null ? step.stampminute : 0),
    };

    for (const k of STEP_KEYS_ORDER) {
      if (values[k] === null || values[k] === undefined) continue;
      slotEntries.push({ key: i + '-' + k, value: values[k] });
    }
  }

  // Clés globales
  slotEntries.push({ key: 'timemultiplier', value: fmtTimemult(planData.timemultiplier != null ? planData.timemultiplier : 1.0) });
  slotEntries.push({ key: 'timemode',       value: fmtInt(planData.timemode != null ? planData.timemode : 1) });
  slotEntries.push({ key: 'repeat',         value: fmtBool(planData.repeat) });
  slotEntries.push({ key: 'playing',        value: fmtBool(planData.playing) });

  // Nom QACRL (pour identification)
  slotEntries.push({ key: 'name', value: QACRL_SLOT_NAME });

  // Insertion : à la fin, après les autres slots
  sections.push({ name: slotName, entries: slotEntries });

  // Écriture
  fs.writeFileSync(presetsFile, serializeIniSimple(sections), 'utf8');

  return { success: true, slotIndex, path: presetsFile };
}

/**
 * Désactive le plan QACRL : retire notre slot et supprime loadwithstart
 * UNIQUEMENT si c'est nous qui l'avions mis.
 */
function deactivateSolPlanInPresets(acPath) {
  const presetsFile = path.join(acPath, SOL_PLANNER_SUBPATH, PRESETS_SUBDIR, PRESETS_FILENAME);
  if (!fs.existsSync(presetsFile)) return { success: true, changed: false };

  const content = fs.readFileSync(presetsFile, 'utf8');
  const sections = parseIniSimple(content);

  let changed = false;

  // Retire notre slot
  const ourIdx = sections.findIndex(s => {
    if (!/^\d+$/.test(s.name)) return false;
    const nameEntry = s.entries.find(e => e.key === 'name');
    return nameEntry && nameEntry.value === QACRL_SLOT_NAME;
  });
  if (ourIdx >= 0) {
    sections.splice(ourIdx, 1);
    changed = true;
  }

  // Supprime loadWithStart (peu importe la casse) si on a retiré notre slot
  const generalSec = sections.find(s => s.name === 'general');
  if (generalSec && changed) {
    generalSec.entries = generalSec.entries.filter(e =>
      e.key.toLowerCase() !== 'loadwithstart'
    );
  }

  if (changed) {
    fs.copyFileSync(presetsFile, presetsFile + '.bak');
    fs.writeFileSync(presetsFile, serializeIniSimple(sections), 'utf8');
  }

  return { success: true, changed };
}

// =============================================================================
// ÉCRITURE D'UN PLAN (archive + activation)
// =============================================================================

/**
 * Écrit un fichier archive QACRL_<name>.ini dans plans/.
 * Retourne { fileName, filePath }.
 */
function writeSolPlanArchive(acPath, planName, planData) {
  const plansDir = path.join(acPath, SOL_PLANNER_SUBPATH, PLANS_SUBDIR);
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });

  const safeName = (planName || 'CustomPlan')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'CustomPlan';
  // ⚠️ Évite le double préfixe si le caller a déjà mis "QACRL_"
  const fileName = /^QACRL_/i.test(safeName)
    ? `${safeName}.ini`
    : `QACRL_${safeName}.ini`;
  const filePath = path.join(plansDir, fileName);

  const content = serializeSolPlan(planData);
  fs.writeFileSync(filePath, content, 'utf8');

  return { fileName, filePath };
}

/**
 * Écrit un plan Sol complet : archive + activation dans presets.ini.
 *
 * @returns {object} {
 *   success,
 *   fileName,
 *   filePath,
 *   slotIndex,
 *   presetsPath,
 * }
 * @throws {Error} Si aucun slot n'est disponible
 */
function writeSolPlanFiles(acPath, planName, planData) {
  // ⚠️ Nettoie le préfixe "QACRL_QACRL_" en amont si déjà présent
  const cleanName = String(planName || 'CustomPlan').replace(/^QACRL_/i, '');
  const archive = writeSolPlanArchive(acPath, cleanName, planData);

  const presets = readSolPresets(acPath);
  const slotIndex = findFreeSolSlot(presets);

  if (slotIndex === null) {
    throw new Error(
      'Aucun slot Sol libre dans presets.ini (les 5 slots sont occupés). ' +
      'Libère un slot ou renomme un preset pour en utiliser un.'
    );
  }

  const activation = activateSolPlanInPresets(acPath, slotIndex, planData);

  return {
    success: true,
    fileName: archive.fileName,
    filePath: archive.filePath,
    slotIndex,
    presetsPath: activation.path,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Scan & lecture
  scanSolPlans,
  parseSolPlanFile,
  parseSolPlanContent,
  readSolPresets,
  findFreeSolSlot,

  // Construction & écriture
  buildSolPlanData,
  serializeSolPlan,
  writeSolPlanArchive,
  writeSolPlanFiles,
  activateSolPlanInPresets,
  deactivateSolPlanInPresets,

  // Helpers publics (tests, debug)
  qacrlWeatherToSolIndex,
  getSolWeatherDefaults,

  // Constantes exposées
  SOL_WEATHER_NAMES,
  QACRL_TO_SOL_INDEX,
  SOL_WEATHER_DEFAULTS,
  QACRL_SLOT_NAME,
  SOL_SLOT_COUNT,
  SOL_STEP_COUNT,
};