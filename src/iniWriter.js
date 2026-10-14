const fs = require('fs');
const path = require('path');

function getRandomizedValue(base, variation) {
  if (!variation || variation <= 0) return base;
  const delta = (Math.random() * 2 - 1) * variation;
  const val = Math.round(base + delta);
  return Math.max(0, Math.min(100, val));
}

function filterCandidateCars(playerCarObj, gridType, availableCars) {
  if (!playerCarObj || gridType === 'RANDOM') return availableCars;
  
  if (gridType === 'SAME_CAR') {
    return [playerCarObj];
  }

  if (gridType === 'KUNOS_ONLY') {
    return availableCars.filter(c => c.isKunos);
  }

  if (gridType === 'SAME_BRAND') {
    const playerBrand = (playerCarObj.brand || '').toLowerCase();
    return availableCars.filter(c => (c.brand || '').toLowerCase() === playerBrand && playerBrand !== '');
  }

  if (gridType === 'SAME_CLASS') {
    const playerTags = playerCarObj.tags || [];
    return availableCars.filter(c => {
      const tags = c.tags || [];
      return tags.some(t => playerTags.includes(t));
    });
  }

  return availableCars;
}

function parseTimeToDecimalHours(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 12.0;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 12.0;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mn = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return h + mn / 60;
}

/**
 * AZIMUT du soleil (0 → 360°) — utilisé dans [RACE].SUN_ANGLE
 */
function hourToAzimuth(hour) {
  const raw = (hour - 6) * 15;
  return ((raw % 360) + 360) % 360;
}

/**
 * HAUTEUR du soleil (−80 → +80) — utilisé dans [LIGHTING].SUN_ANGLE
 * Formule validée en jeu (04/10/2026) :
 *   SUN_ANGLE = 16 × (secondes − 46800) / 3600
 * Références : −80 = lever, 0 = midi (13h), +80 = coucher
 */
function hourToSunAngleNew(hour) {
  const totalSeconds = hour * 3600;
  const result = 16 * (totalSeconds - 46800) / 3600;
  return result;
}

/**
 * Mapping météo → code CSP (0..32) utilisé dans __CM_WEATHER_TYPE (race.ini)
 * et CM_WEATHER (pureCtrl/settings.ini).
 * Source : base-schedule/settings.ini de CSP.
 */
const CSP_WEATHER_INDEX = {
  'clear': 15, 'no_clouds': 15, 'noclouds': 15,
  'few_clouds': 16, 'fewclouds': 16,
  'scattered_clouds': 17, 'scatteredclouds': 17,
  'broken_clouds': 18, 'brokenclouds': 18,
  'overcast': 19, 'overcast_clouds': 19, 'overcastclouds': 19,
  'fog': 20,
  'mist': 21,
  'light_drizzle': 3, 'lightdrizzle': 3,
  'drizzle': 4,
  'heavy_drizzle': 5, 'heavydrizzle': 5,
  'light_rain': 6, 'lightrain': 6,
  'rain': 7,
  'heavy_rain': 8, 'heavyrain': 8,
  'light_thunderstorm': 0, 'lightthunderstorm': 0,
  'thunderstorm': 1,
  'heavy_thunderstorm': 2, 'heavythunderstorm': 2,
  'light_snow': 9, 'lightsnow': 9,
  'snow': 10,
  'heavy_snow': 11, 'heavysnow': 11,
  'light_sleet': 12, 'lightsleet': 12,
  'sleet': 13,
  'heavy_sleet': 14, 'heavysleet': 14,
  'smoke': 22, 'haze': 23, 'sand': 24, 'dust': 25,
  'squalls': 26, 'tornado': 27, 'hurricane': 28,
  'cold': 29, 'hot': 30, 'windy': 31, 'hail': 32
};

/**
 * Retourne le code CSP (0..32) pour un weatherId donné.
 * Ex: "sol_52_snow" → 10 / "3_clear" → 15 / "sol_36_heavy_rain" → 8
 */
function getWeatherIndex(weatherId) {
  if (!weatherId) return 15;
  let s = weatherId.toLowerCase()
    .replace(/^(sol|pure|sfx)[_-]/i, '')
    .replace(/^\d+[_-]/, '')
    .replace(/[-_]\d+$/, '')
    .replace(/\s+/g, '_');
  if (s === 'overcast') s = 'overcast_clouds';
  if (CSP_WEATHER_INDEX[s] !== undefined) return CSP_WEATHER_INDEX[s];
  for (const k of Object.keys(CSP_WEATHER_INDEX)) {
    if (s.includes(k) || k.includes(s)) return CSP_WEATHER_INDEX[k];
  }
  console.warn('[iniWriter/getWeatherIndex] aucune correspondance pour', weatherId, '(clé:', s + ')');
  return 15;
}

function flagFileToCountryName(flagFile) {
  if (!flagFile) return '';
  return flagFile
    .replace(/\.png$/i, '')
    .replace(/23$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function flagFileToNationCode(flagFile) {
  const name = flagFileToCountryName(flagFile);
  return name.substring(0, 3).toUpperCase();
}

function writeRaceConfig(acPath, sessionData, settings, availableCars = [], options = {}) {
  const noCsp = !!options.noCsp;
  const documentsRoot = settings.documentsPath;

  if (!documentsRoot) {
    throw new Error("Dossier Documents non résolu (settings.documentsPath manquant).");
  }

  const cfgDir = path.join(documentsRoot, 'Assetto Corsa', 'cfg');

  if (!fs.existsSync(cfgDir)) {
    fs.mkdirSync(cfgDir, { recursive: true });
  }

  const raceIniPath = path.join(cfgDir, 'race.ini');
  console.log('[iniWriter] Écriture race.ini :', raceIniPath);

  const assists = sessionData.assists || {};

  let trackLayout = sessionData.layout || '';
  if (trackLayout.toLowerCase() === 'default' || trackLayout.toLowerCase() === 'standard') {
    trackLayout = '';
  }

  const sessionType = (sessionData.sessionType || 'RACE').toUpperCase();
  const isRace = sessionType === 'RACE';
  const isHotlap = sessionType === 'HOTLAP';

  let opponentsCount = isRace ? (parseInt(sessionData.opponentsCount) || 0) : 0;
  const totalCars = opponentsCount + 1;

  const raceLaps = parseInt(sessionData.laps) || 5;
  const timeMult = parseInt(sessionData.timeMult) || 1;

  const sessionTimeDecimal = parseTimeToDecimalHours(sessionData.sessionStartTime || '12:00');
  // Deux SUN_ANGLE distincts (conventions différentes) :
  //   [RACE]     = azimut   (0..360)   → position "compass" du soleil
  //   [LIGHTING] = élévation (−80..+80) → hauteur dans le ciel (lue par CSP)
  const sunAzimuth = hourToAzimuth(sessionTimeDecimal);
  const sunAngleNew = hourToSunAngleNew(sessionTimeDecimal);

  console.log('[iniWriter] Heure début :', sessionData.sessionStartTime,
              '→ SUN_ANGLE [RACE] =', sunAzimuth.toFixed(2),
              '/ SUN_ANGLE [LIGHTING] =', sunAngleNew.toFixed(2),
              '/ TIME_MULT =', timeMult);

  const isPlanMode =
    sessionData.weatherMode === 'existing_plan' ||
    sessionData.weatherMode === 'custom_plan';

  let baseWeather = sessionData.weather || 'sol_01_clear';

  if (isPlanMode && Array.isArray(sessionData.customPlanSteps) && sessionData.customPlanSteps.length > 0) {
    baseWeather = sessionData.customPlanSteps[0].weather || baseWeather;
  }

  // ⚠️ __CM_WEATHER_TYPE attend le code CSP (0..32), pas l'index du presets JSON.
  const weatherIndex = getWeatherIndex(baseWeather);
  console.log('[iniWriter] Météo de base :', baseWeather, '→ __CM_WEATHER_TYPE =', weatherIndex);

  const sessions = [];

  if (isRace) {
    const practiceMinutes = parseInt(sessionData.practiceMinutes) || 0;
    const qualifyMinutes = parseInt(sessionData.qualifyMinutes) || 0;

    if (practiceMinutes > 0) {
      sessions.push({
        name: 'Practice', type: 1, laps: 0, duration: practiceMinutes, spawn: 'PIT'
      });
    }
    if (qualifyMinutes > 0) {
      sessions.push({
        name: 'Qualifying', type: 2, laps: 0, duration: qualifyMinutes, spawn: 'PIT'
      });
    }
    sessions.push({
      name: 'Race', type: 3, laps: raceLaps, duration: 0, spawn: 'START'
    });
  } else {
    let typeCode = 1;
    let spawn = 'PIT';
    let name = sessionType;

    if (sessionType === 'QUALIFY') { typeCode = 2; }
    if (sessionType === 'HOTLAP') { typeCode = 4; spawn = 'HOTLAP_START'; name = 'Hotlap'; }
    if (sessionType === 'PRACTICE') { name = 'Practice'; }

    const minutes = parseInt(sessionData.sessionMinutes) || 30;

    sessions.push({
      name, type: typeCode, laps: 0, duration: minutes, spawn
    });
  }

  let playerStartPos = totalCars;
  switch (sessionData.startingPositionMode) {
    case 'FIRST':  playerStartPos = 1; break;
    case 'SECOND': playerStartPos = 2; break;
    case 'THIRD':  playerStartPos = 3; break;
    case 'RANDOM': playerStartPos = Math.floor(Math.random() * totalCars) + 1; break;
    case 'CUSTOM': playerStartPos = Math.min(totalCars, Math.max(1, parseInt(sessionData.customStartPos) || 1)); break;
    case 'LAST':
    default:       playerStartPos = totalCars; break;
  }
  playerStartPos = Math.max(1, Math.min(playerStartPos, totalCars));

  const playerNationality = sessionData.nationality || settings.nationality || 'France';
  const playerNationCode = sessionData.nationCode || settings.nationCode || 'FRA';

  const aiFlagsPool = Array.isArray(sessionData.aiFlagsPool) ? sessionData.aiFlagsPool : [];
  const randomAiFlags = !!sessionData.randomAiFlags && aiFlagsPool.length > 0;

  console.log('[iniWriter] Joueur :', playerNationality, '/', playerNationCode,
              '| IA aléatoires :', randomAiFlags, '(' + aiFlagsPool.length + ' drapeaux)');

  let ini = '';

  // ---- [HEADER] ----
  ini += `[HEADER]\n`;
  ini += `VERSION=2\n`;
  ini += `__CM_FEATURE_SET=2\n\n`;

  // ---- [RACE] ----
  ini += `[RACE]\n`;
  ini += `MODEL=${sessionData.car}\n`;
  ini += `MODEL_GHOST=\n`;
  ini += `MODEL_CONFIG=\n`;
  ini += `SKIN=${sessionData.skin}\n`;
  ini += `TRACK=${sessionData.track}\n`;
  ini += `CONFIG_TRACK=${trackLayout}\n`;
  ini += `CARS=${totalCars}\n`;
  ini += `DRIFT_MODE=0\n`;
  ini += `RACE_LAPS=${isRace ? raceLaps : 0}\n`;
  ini += `FIXED_SETUP=0\n`;
  ini += `PENALTIES=1\n`;
  ini += `JUMP_START_PENALTY=${sessionData.jumpStartPenalty || 0}\n`;
  ini += `SKIDMARKS=1\n`;
  ini += `AI_LEVEL=${sessionData.aiLevel || 90}\n`;
  ini += `AI_AGGRESSION=${sessionData.aiAggression || 50}\n`;
  ini += `SUN_ANGLE=${sunAzimuth.toFixed(2)}\n\n`;

  // ---- [TEMPERATURE] ----
  ini += `[TEMPERATURE]\n`;
  ini += `AMBIENT=26\n`;
  ini += `ROAD=32\n\n`;

  // ---- [WEATHER] ----
  ini += `[WEATHER]\n`;
  ini += `NAME=${baseWeather}\n\n`;

  // ---- [CAR_0] ----
  ini += `[CAR_0]\n`;
  ini += `SETUP=\n`;
  ini += `SKIN=${sessionData.skin}\n`;
  ini += `MODEL=${sessionData.car}\n`;
  ini += `MODEL_CONFIG=\n`;
  ini += `BALLAST=0\n`;
  ini += `RESTRICTOR=0\n`;
  ini += `DRIVER_NAME=${settings.playerName || sessionData.driverName || 'Driver'}\n`;
  ini += `NATIONALITY=${playerNationality}\n`;
  ini += `NATION_CODE=${playerNationCode}\n\n`;

  // ---- [CAR_N] (IA) ----
  if (isRace && opponentsCount > 0) {
    const playerCarObj = availableCars.find(c => c.id === sessionData.car);
    const candidateCars = filterCandidateCars(playerCarObj, sessionData.gridType, availableCars);
    const validCandidates = candidateCars.length > 0 ? candidateCars : (availableCars.length > 0 ? availableCars : [playerCarObj]);

    for (let i = 0; i < opponentsCount; i++) {
      const selectedCar = validCandidates[Math.floor(Math.random() * validCandidates.length)] || playerCarObj;
      let opponentCarModel = selectedCar.id || sessionData.car;
      let opponentSkin = sessionData.skin;

      if (selectedCar.skins && selectedCar.skins.length > 0) {
        opponentSkin = selectedCar.skins[Math.floor(Math.random() * selectedCar.skins.length)].id;
      }

      const carLevel = getRandomizedValue(sessionData.aiLevel, sessionData.aiLevelVar);
      const carAggression = getRandomizedValue(sessionData.aiAggression, sessionData.aiAggressionVar);

      let aiNationality = playerNationality;
      let aiNationCode = playerNationCode;

      if (randomAiFlags) {
        const picked = aiFlagsPool[Math.floor(Math.random() * aiFlagsPool.length)];
        aiNationality = flagFileToCountryName(picked) || playerNationality;
        aiNationCode = flagFileToNationCode(picked) || playerNationCode;
      }

      ini += `[CAR_${i + 1}]\n`;
      ini += `SETUP=\n`;
      ini += `SKIN=${opponentSkin}\n`;
      ini += `MODEL=${opponentCarModel}\n`;
      ini += `MODEL_CONFIG=\n`;
      ini += `BALLAST=0\n`;
      ini += `RESTRICTOR=0\n`;
      ini += `DRIVER_NAME=AI Driver ${i + 1}\n`;
      ini += `NATIONALITY=${aiNationality}\n`;
      ini += `NATION_CODE=${aiNationCode}\n`;
      ini += `AI_LEVEL=${carLevel}\n`;
      ini += `AI_AGGRESSION=${carAggression}\n\n`;
    }
  }

  // ---- [ASSISTS] ----
  ini += `[ASSISTS]\n`;
  ini += `AUTO_GEAR=${assists.autoGearbox ? 1 : 0}\n`;
  ini += `AUTO_CLUTCH=${assists.autoclutch ? 1 : 0}\n`;
  ini += `AUTO_BLIP=${assists.autoblip ? 1 : 0}\n`;
  ini += `IDEAL_LINE=${assists.idealLine ? 1 : 0}\n`;
  ini += `TC=${assists.tc !== undefined ? assists.tc : 1}\n`;
  ini += `ABS=${assists.abs !== undefined ? assists.abs : 1}\n`;
  ini += `STABILITY_CONTROL=${assists.stability !== undefined ? assists.stability : 0}\n`;
  ini += `FUEL_RATE=${assists.fuelRate !== undefined ? assists.fuelRate : 1}\n`;
  ini += `DAMAGE_MULTIPLIER=${assists.mechanicalDamage !== undefined ? assists.mechanicalDamage : 100}\n`;
  ini += `TYRE_WEAR=${assists.tyreWear !== undefined ? assists.tyreWear : 1}\n`;
  ini += `TYRE_BLANKETS=${assists.tyreBlankets ? 1 : 0}\n`;
  ini += `SLIPSTREAM=${assists.slipstream !== undefined ? assists.slipstream : 1}\n\n`;

  // ---- [BENCHMARK] ----
  ini += `[BENCHMARK]\nACTIVE=0\n\n`;

  // ---- [REPLAY] ----
  ini += `[REPLAY]\nACTIVE=0\n\n`;

  // ---- [REMOTE] ----
  ini += `[REMOTE]\nACTIVE=0\n\n`;

  // ---- [RESTART] ----
  ini += `[RESTART]\nACTIVE=0\n\n`;

  // ---- [__PREVIEW_GENERATION] ----
  ini += `[__PREVIEW_GENERATION]\nACTIVE=0\n\n`;

  // ---- [LIGHTING] ----
  // ⭐ Sans CSP, les directives __CM_* sont ignorées (et peuvent planter AC).
  //    On omet complètement la section si pas de CSP.
  if (!noCsp) {
    ini += `[LIGHTING]\n`;
    ini += `SUN_ANGLE=${sunAngleNew.toFixed(2)}\n`;
    ini += `TIME_MULT=${timeMult}.0\n`;
    ini += `__CM_TIME_MULTIPLIER=${timeMult}\n`;
    ini += `CLOUD_SPEED=0.200\n`;
    ini += `__CM_WEATHER_TYPE=${weatherIndex}\n`;
    // ⭐ Controller dynamique (sol2 / pureCtrl / …) — pas hardcodé
    if (sessionData.weatherController) {
      ini += `__CM_WEATHER_CONTROLLER=${sessionData.weatherController}\n`;
    }
    ini += `\n`;
  }

  // ---- [OPTIONS] ----
  ini += `[OPTIONS]\nUSE_MPH=0\n\n`;

  // ---- [LAP_INVALIDATOR] ----
  ini += `[LAP_INVALIDATOR]\nALLOWED_TYRES_OUT=-1\n\n`;

  // ---- [GHOST_CAR] ----
  ini += `[GHOST_CAR]\n`;
  ini += `RECORDING=1\n`;
  ini += `PLAYING=1\n`;
  ini += `SECONDS_ADVANTAGE=0\n`;
  ini += `LOAD=1\n`;
  ini += `FILE=\n`;
  ini += `ENABLED=0\n\n`;

  // ---- [GROOVE] ----
  ini += `[GROOVE]\n`;
  ini += `VIRTUAL_LAPS=10\n`;
  ini += `MAX_LAPS=1\n`;
  ini += `STARTING_LAPS=1\n\n`;

  // ---- [SESSIONS] ----
  sessions.forEach((s, idx) => {
    ini += `[SESSION_${idx}]\n`;
    ini += `NAME=${s.name}\n`;
    ini += `TYPE=${s.type}\n`;
    ini += `DURATION_MINUTES=${s.duration}\n`;
    ini += `SPAWN_SET=${s.spawn}\n`;
    if (s.type === 3) {
      ini += `STARTING_POSITION=${playerStartPos}\n`;
    }
    ini += `\n`;
  });

  // ---- [WIND] ----
  ini += `[WIND]\n`;
  ini += `SPEED_KMH_MIN=10\n`;
  ini += `SPEED_KMH_MAX=10\n`;
  ini += `DIRECTION_DEG=0\n\n`;

  // ---- [DYNAMIC_TRACK] ----
  ini += `[DYNAMIC_TRACK]\n`;
  ini += `SESSION_START=200\n`;
  ini += `RANDOMNESS=200\n`;
  ini += `LAP_GAIN=132\n`;
  ini += `SESSION_TRANSFER=200\n`;

  fs.writeFileSync(raceIniPath, ini, 'utf8');
  console.log('[iniWriter] race.ini écrit avec succès');
  return raceIniPath;
}

module.exports = { writeRaceConfig, filterCandidateCars, getWeatherIndex };