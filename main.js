const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const { exec, execSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { writeRaceConfig } = require('./src/iniWriter');
const { installArchive, previewArchive } = require('./src/cspArchiveInstaller');
const solPlanner = require('./src/solPlanner');
const AdmZip = require('adm-zip');

const stateFilePath = path.join(app.getPath('userData'), 'user-state.json');
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
const presetsFilePath = path.join(app.getPath('userData'), 'presets.json');
const modsHistoryFilePath = path.join(app.getPath('userData'), 'mods-history.json');
const sessionHistoryFilePath = path.join(app.getPath('userData'), 'session-history.json');

function formatFallbackName(rawName) {
  if (!rawName) return '';
  return rawName.replace(/^ks_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function sanitizeJsonText(text) {
  if (!text) return '{}';
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
}

// Compteurs pour regrouper les warnings JSON (évite de polluer la console)
let _jsonRepairedCount = 0;
let _jsonErrorCount = 0;

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }

  const cleaned = sanitizeJsonText(raw);

  // Tentative 1 : parse direct
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Tentative 2 : réparation tolérante (virgules traînantes + clés non quotées)
    const repaired = cleaned
      // Virgule avant } ou ]
      .replace(/,\s*([}\]])/g, '$1')
      // Clé sans guillemets : { key: ...  →  { "key": ...
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      // Nombre avec zéro en tête : 01  →  1
      .replace(/:\s*0+(\d)/g, ': $1');

    try {
      const parsed = JSON.parse(repaired);
      _jsonRepairedCount++;
      return parsed;
    } catch (secondErr) {
      // Échec définitif — on compte et on renvoie null (fallback plus loin)
      _jsonErrorCount++;
      return null;
    }
  }
}

// Fonction utilitaire pour afficher un résumé après un scan
function flushJsonWarnings() {
  if (_jsonRepairedCount > 0) {
    console.log(`[readJsonSafe] ${_jsonRepairedCount} fichier(s) JSON réparé(s) automatiquement (virgules/quotage)`);
    _jsonRepairedCount = 0;
  }
  if (_jsonErrorCount > 0) {
    console.warn(`[readJsonSafe] ${_jsonErrorCount} fichier(s) JSON invalides ignorés (fallback sur le nom du dossier)`);
    _jsonErrorCount = 0;
  }
}

function findImageUrl(folderPath, fileNames) {
  if (!folderPath || !fs.existsSync(folderPath)) return '';
  const extensions = ['', '.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG'];
  for (const name of fileNames) {
    for (const ext of extensions) {
      const fullPath = path.join(folderPath, name + ext);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return pathToFileURL(fullPath).href;
      }
    }
  }
  return '';
}

/**
 * Nettoie un nom de circuit renvoyé par le serveur.
 * Gère le préfixe CSP "csp/XXXX/../".
 */
function cleanTrackPath(rawTrack) {
  if (!rawTrack) return { track: '', trackConfig: '', trackFull: '' };
  let s = String(rawTrack).trim();
  s = s.replace(/^csp\/[^/]*\/\.\.\//i, '');
  s = s.replace(/^csp\//i, '');
  let track = s;
  let layout = '';
  const dashIdx = s.indexOf('-');
  if (dashIdx > 0) {
    track = s.substring(0, dashIdx);
    layout = s.substring(dashIdx + 1);
  }
  return { track, trackConfig: layout, trackFull: s };
}

const OFFICIAL_KUNOS_CARS = new Set([
  'abarth500','abarth500_s1','alfa_romeo_giulietta_qv','alfa_romeo_giulietta_qv_le',
  'ktm_x_bow_r','lotus_exige_s','bmw_1m','bmw_1m_s3','bmw_m3_e30','bmw_m3_e30_drift',
  'bmw_m3_e30_dtm','bmw_m3_e30_gra','bmw_m3_e30_s1','bmw_m3_e92','bmw_m3_e92_drift',
  'bmw_m3_e92_s1','bmw_m3_gt2','bmw_z4','bmw_z4_drift','bmw_z4_gt3','bmw_z4_s1',
  'ferrari_458','ferrari_458_s3','ferrari_f40','ferrari_f40_s3','lotus_2_eleven',
  'lotus_2_eleven_gt4','lotus_elise_sc','lotus_elise_sc_s1','lotus_evora_gte',
  'lotus_evora_gte_carbon','lotus_evora_s','lotus_exige_240r','lotus_exige_s_v6',
  'lotus_exos_125','lotus_exos_125_s1','mclaren_mp412c','mclaren_mp412c_gt3',
  'p4-5_2011','pagani_huayra','pagani_zonda_r','ruf_yellowbird'
]);

const OFFICIAL_KUNOS_TRACKS = new Set([
  'imola','magione','monza','monza66','mugello','nurburgring','silverstone',
  'silverstone66','spa','trento-bondone','vallelunga','drag'
]);

const PURE_TYPE_TO_FOLDER = {
  1: 'Daycycle',
  2: 'Timed',
  3: 'Stamp',
  4: 'Live'
};

const RACEINI_WEATHER = {
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

const PURECTRL_CM_WEATHER = {
  'no_clouds': 1, 'noclouds': 1,
  'clear': 2,
  'few_clouds': 3, 'fewclouds': 3,
  'scattered_clouds': 4, 'scatteredclouds': 4,
  'windy': 5,
  'broken_clouds': 6, 'brokenclouds': 6,
  'overcast': 7, 'overcast_clouds': 7, 'overcastclouds': 7,
  'haze': 8,
  'mist': 9,
  'fog': 10,
  'dust': 11,
  'sand': 12,
  'smoke': 13,
  'light_drizzle': 14, 'lightdrizzle': 14,
  'drizzle': 15,
  'heavy_drizzle': 16, 'heavydrizzle': 16,
  'light_rain': 17, 'lightrain': 17,
  'rain': 18,
  'heavy_rain': 19, 'heavyrain': 19,
  'light_thunderstorm': 20, 'lightthunderstorm': 20,
  'thunderstorm': 21,
  'heavy_thunderstorm': 22, 'heavythunderstorm': 22,
  'squalls': 23,
  'tornado': 24,
  'hurricane': 25,
  'light_snow': 26, 'lightsnow': 26,
  'snow': 27,
  'heavy_snow': 28, 'heavysnow': 28,
  'light_sleet': 29, 'lightsleet': 29,
  'sleet': 30,
  'heavy_sleet': 31, 'heavysleet': 31,
  'random_dry': 32,
  'random_rainy': 33,
  'random_bad': 34,
  'random': 35,
  'predefined': 36
};

let mainWindow = null;

// ⭐ Fichier de sauvegarde des dimensions de la fenêtre
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(windowStatePath)) {
      const raw = fs.readFileSync(windowStatePath, 'utf8');
      const s = JSON.parse(raw);
      // Vérifie que les valeurs sont valides
      if (s && typeof s.width === 'number' && typeof s.height === 'number') {
        return s;
      }
    }
  } catch (e) {
    console.warn('[window-state] lecture KO:', e.message);
  }
  return null;
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? (mainWindow._lastNormalBounds || mainWindow.getBounds()) : mainWindow.getBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: isMaximized,
    };
    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.warn('[window-state] écriture KO:', e.message);
  }
}

function createWindow() {
  const { screen } = require('electron');
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  // ⭐ Taille par défaut = 90% de l'écran, plafonnée à 1600×1000
  const defaultWidth  = Math.min(1600, Math.floor(screenW * 0.9));
  const defaultHeight = Math.min(1000, Math.floor(screenH * 0.9));

  // ⭐ Récupère la dernière position/taille connue
  const saved = loadWindowState();
  const opts = {
    width:  saved ? saved.width  : defaultWidth,
    height: saved ? saved.height : defaultHeight,
    x:      saved ? saved.x      : undefined,
    y:      saved ? saved.y      : undefined,
    frame: false,
    backgroundColor: '#0a0c12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  };

  mainWindow = new BrowserWindow(opts);

  // ⭐ Si la dernière fois on était maximisé → on remaximise
  if (saved && saved.maximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  // ⭐ Mémorise la taille "normale" (hors maximisé) pour pouvoir la restaurer
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      mainWindow._lastNormalBounds = mainWindow.getBounds();
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));

  // ⭐ Sauvegarde la position/taille à la fermeture
  mainWindow.on('close', () => {
    saveWindowState();
  });
}

app.whenReady().then(() => {
  // ⭐ Autorise l'accès aux périphériques audio (pour lister les sorties)
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'media') return callback(true);
    callback(false);
  });
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ============================================================
   IPC — CONTRÔLES DE FENÊTRE (custom titlebar)
   ============================================================ */
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ⭐ v1.4.2 — Relance complète de QACRL (reboot app)
ipcMain.handle('relaunch-app', () => {
  try {
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — ÉTAT & SETTINGS
   ============================================================ */
ipcMain.handle('get-app-state', () => {
  try {
    if (fs.existsSync(stateFilePath)) {
      const raw = fs.readFileSync(stateFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[get-app-state] ERREUR:', err.message);
    try { fs.copyFileSync(stateFilePath, stateFilePath + '.broken-' + Date.now()); } catch (e) {}
  }
  return {};
});

ipcMain.handle('save-app-state', (event, state) => {
  try {
    const tempPath = stateFilePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempPath, stateFilePath);
    return true;
  } catch (err) {
    console.error('[save-app-state] ERREUR:', err.message);
    return false;
  }
});

ipcMain.handle('get-settings', () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const raw = fs.readFileSync(settingsFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[get-settings] ERREUR:', err.message);
    try { fs.copyFileSync(settingsFilePath, settingsFilePath + '.broken-' + Date.now()); } catch (e) {}
  }
  return {};
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const tempPath = settingsFilePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tempPath, settingsFilePath);
    return true;
  } catch (err) {
    console.error('[save-settings] ERREUR:', err.message);
    return false;
  }
});

/* ============================================================
   IPC — PRESETS DE SESSION
   ============================================================ */
ipcMain.handle('get-presets', () => {
  try {
    if (fs.existsSync(presetsFilePath)) {
      const data = JSON.parse(fs.readFileSync(presetsFilePath, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) { console.error('[Presets] Lecture :', err); }
  return [];
});

ipcMain.handle('save-preset', (event, preset) => {
  try {
    let list = [];
    if (fs.existsSync(presetsFilePath)) {
      const data = JSON.parse(fs.readFileSync(presetsFilePath, 'utf8'));
      if (Array.isArray(data)) list = data;
    }
    if (!preset.id) preset.id = 'preset_' + Date.now();
    preset.createdAt = preset.createdAt || Date.now();
    preset.updatedAt = Date.now();

    const idx = list.findIndex(p => p.id === preset.id);
    if (idx >= 0) list[idx] = preset;
    else list.push(preset);

    fs.writeFileSync(presetsFilePath, JSON.stringify(list, null, 2), 'utf8');
    return { success: true, preset };
  } catch (err) {
    console.error('[Presets] Écriture :', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-preset', (event, id) => {
  try {
    if (!fs.existsSync(presetsFilePath)) return { success: true };
    let list = JSON.parse(fs.readFileSync(presetsFilePath, 'utf8'));
    if (!Array.isArray(list)) list = [];
    list = list.filter(p => p.id !== id);
    fs.writeFileSync(presetsFilePath, JSON.stringify(list, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* ============================================================
   IPC — HISTORIQUE DES MODS
   ============================================================ */
function getModsHistory() {
  try {
    if (fs.existsSync(modsHistoryFilePath)) {
      const data = JSON.parse(fs.readFileSync(modsHistoryFilePath, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch (e) { console.error('[ModsHistory] lecture:', e); }
  return [];
}

function saveModsHistory(list) {
  try {
    fs.writeFileSync(modsHistoryFilePath, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('[ModsHistory] écriture:', e); return false; }
}

function getPreviewForItem(destPath, kind) {
  const uiDir = path.join(destPath, 'ui');
  let p = findImageUrl(uiDir, ['preview']);
  if (p) return p;
  p = findImageUrl(uiDir, ['badge']);
  if (p) return p;

  if (kind === 'car') {
    const skinsDir = path.join(destPath, 'skins');
    if (fs.existsSync(skinsDir)) {
      try {
        const skins = fs.readdirSync(skinsDir, { withFileTypes: true })
          .filter(e => e.isDirectory()).map(e => e.name);
        for (const s of skins) {
          p = findImageUrl(path.join(skinsDir, s), ['preview']);
          if (p) return p;
        }
      } catch (e) {}
    }
  }

  if (kind === 'track') {
    if (fs.existsSync(uiDir)) {
      try {
        const subDirs = fs.readdirSync(uiDir, { withFileTypes: true })
          .filter(e => e.isDirectory()).map(e => e.name);
        for (const sub of subDirs) {
          p = findImageUrl(path.join(uiDir, sub), ['preview']);
          if (p) return p;
        }
      } catch (e) {}
    }
  }

  return null;
}

function getItemName(destPath, kind) {
  let jsonFile = null;
  if (kind === 'car') jsonFile = path.join(destPath, 'ui', 'ui_car.json');
  else if (kind === 'track') jsonFile = path.join(destPath, 'ui', 'ui_track.json');

  const data = jsonFile ? readJsonSafe(jsonFile) : null;
  if (data && data.name) return data.name;
  return formatFallbackName(path.basename(destPath));
}

ipcMain.handle('get-mods-history', () => getModsHistory());

ipcMain.handle('delete-mod-from-history', async (event, historyId, itemId) => {
  const list = getModsHistory();
  const entryIdx = list.findIndex(e => e.id === historyId);
  if (entryIdx < 0) throw new Error("Entrée d'historique introuvable.");

  const entry = list[entryIdx];
  const itemIdx = (entry.items || []).findIndex(i => i.id === itemId);
  if (itemIdx < 0) throw new Error("Mod introuvable dans l'historique.");

  const item = entry.items[itemIdx];
  const fullPath = item.dest;

  const normalized = path.normalize(fullPath);
  const sep = path.sep;
  const isSafe = normalized.includes('content' + sep + 'cars') ||
                 normalized.includes('content' + sep + 'tracks') ||
                 normalized.includes(sep + 'apps' + sep) ||
                 normalized.includes(sep + 'extension' + sep) ||
                 normalized.includes(sep + 'system' + sep);
  if (!isSafe) throw new Error("Chemin non autorisé pour suppression : " + normalized);

  let missing = false;
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch (e) {
      throw new Error("Impossible de supprimer : " + e.message);
    }
  } else {
    missing = true;
  }

  entry.items.splice(itemIdx, 1);
  if (entry.items.length === 0) list.splice(entryIdx, 1);
  saveModsHistory(list);
  return { success: true, missing };
});

/* ============================================================
   IPC — HISTORIQUE DES SESSIONS
   ============================================================ */
function getSessionHistory() {
  try {
    if (fs.existsSync(sessionHistoryFilePath)) {
      const data = JSON.parse(fs.readFileSync(sessionHistoryFilePath, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch (e) { console.error('[SessionHistory] lecture:', e); }
  return [];
}

function saveSessionHistory(list) {
  try {
    fs.writeFileSync(sessionHistoryFilePath, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('[SessionHistory] écriture:', e); return false; }
}

ipcMain.handle('get-session-history', () => getSessionHistory());

ipcMain.handle('delete-session-history-entry', (event, id) => {
  try {
    let list = getSessionHistory();
    list = list.filter(e => e.id !== id);
    saveSessionHistory(list);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('clear-session-history', () => {
  try {
    saveSessionHistory([]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* ============================================================
   IPC — DOSSIERS & OS
   ============================================================ */
ipcMain.handle('select-ac-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths.length > 0) {
    const acPath = result.filePaths[0];
    const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
    settings.acPath = acPath;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
    return acPath;
  }
  return null;
});

ipcMain.handle('select-documents-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionnez votre dossier Documents',
    properties: ['openDirectory'],
    buttonLabel: 'Choisir ce dossier'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const documentsPath = result.filePaths[0];
    const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
    settings.documentsPath = documentsPath;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
    return documentsPath;
  }
  return null;
});

ipcMain.handle('get-documents-path', async () => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  if (settings.documentsPath && fs.existsSync(settings.documentsPath)) return settings.documentsPath + '  (choix manuel)';
  try {
    const electronDocs = app.getPath('documents');
    if (electronDocs && fs.existsSync(electronDocs)) return electronDocs + '  (Windows)';
  } catch (e) {}
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'OneDrive - Personal', 'Documents'), path.join(home, 'OneDrive - Business', 'Documents')
  ];
  for (const c of candidates) if (fs.existsSync(path.join(c, 'Assetto Corsa'))) return c + '  (auto)';
  for (const c of candidates) if (fs.existsSync(c)) return c + '  (auto)';
  return 'Non détecté';
});

ipcMain.handle('open-folder', async (event, type, id) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  if (!id) throw new Error("Identifiant manquant.");
  const subDir = type === 'track' ? 'tracks' : 'cars';
  const folderPath = path.join(acPath, 'content', subDir, id);
  if (!fs.existsSync(folderPath)) throw new Error(`Dossier introuvable : ${folderPath}`);
  const err = await shell.openPath(folderPath);
  if (err) throw new Error(err);
  return true;
});

// Ouvre un lien externe dans le navigateur par défaut
ipcMain.handle('open-external', async (event, url) => {
  if (!url || typeof url !== 'string') throw new Error('URL invalide.');
  if (!/^https?:\/\//i.test(url)) throw new Error('URL non autorisée (http/https uniquement).');
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('select-mod-file', async () => {
  const result = await dialog.showOpenDialog({
    title: "Sélectionner une archive",
    properties: ['openFile'],
    filters: [
      { name: 'Archives', extensions: ['zip','rar','7z','tar','gz','tgz'] },
      { name: 'Toutes', extensions: ['*'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
  return null;
});

ipcMain.handle('scan-assets', async () => {
  const assetsDir = path.join(__dirname, 'public', 'assets');
  const manufacturersDir = path.join(assetsDir, 'manufacturers');
  const flagsDir = path.join(assetsDir, 'flags');
  const result = { manufacturers: [], flags: [] };
  try { if (fs.existsSync(manufacturersDir))
    result.manufacturers = fs.readdirSync(manufacturersDir).filter(f => f.toLowerCase().endsWith('.png'));
  } catch (e) {}
  try { if (fs.existsSync(flagsDir))
    result.flags = fs.readdirSync(flagsDir).filter(f => f.toLowerCase().endsWith('.png'));
  } catch (e) {}
  return result;
});

/* ============================================================
   SCAN DU CONTENU AC
   ============================================================ */
function scanCars(acPath) {
  const carsDir = path.join(acPath, 'content', 'cars');
  if (!fs.existsSync(carsDir)) return [];
  const cars = [];
  try {
    const folders = fs.readdirSync(carsDir);
    for (const folder of folders) {
      const carPath = path.join(carsDir, folder);
      if (!fs.statSync(carPath).isDirectory()) continue;
      const uiJsonPath = path.join(carPath, 'ui', 'ui_car.json');
      let name = '', author = '', tags = [], brand = '';

      const ui = readJsonSafe(uiJsonPath);
      if (ui) {
        if (ui.name && ui.name.trim()) name = ui.name.trim();
        author = ui.author || '';
        if (ui.brand) brand = ui.brand;
        if (Array.isArray(ui.tags)) tags = ui.tags;
      }

      if (!name) name = formatFallbackName(folder);
      const folderLower = folder.toLowerCase();
      const authorLower = author.toLowerCase();
      const isKunos = folderLower.startsWith('ks_') || OFFICIAL_KUNOS_CARS.has(folderLower) || authorLower.includes('kunos');

      const skinsDir = path.join(carPath, 'skins');
      const skins = [];
      if (fs.existsSync(skinsDir)) {
        try {
          const skinFolders = fs.readdirSync(skinsDir);
          for (const sf of skinFolders) {
            const skinPath = path.join(skinsDir, sf);
            if (fs.statSync(skinPath).isDirectory()) {
              let skinName = '';
              const skinUiPath = path.join(skinPath, 'ui_skin.json');
              const sui = readJsonSafe(skinUiPath);
              if (sui && sui.skinname && sui.skinname.trim()) skinName = sui.skinname.trim();
              if (!skinName) skinName = formatFallbackName(sf);
              skins.push({ id: sf, name: skinName, preview: findImageUrl(skinPath, ['preview']) });
            }
          }
        } catch (e) {}
      }
      const mainPreview = (skins.length > 0 && skins[0].preview) ? skins[0].preview
        : findImageUrl(path.join(carPath, 'ui'), ['badge', 'preview']);
      cars.push({ id: folder, name, author: author || 'Inconnu', brand, isKunos, tags, skins, preview: mainPreview });
    }
  } catch (err) { console.error("Erreur scan cars :", err); }
  cars.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
  return cars;
}

function scanTracks(acPath) {
  const tracksDir = path.join(acPath, 'content', 'tracks');
  if (!fs.existsSync(tracksDir)) return [];
  const tracks = [];
  try {
    const folders = fs.readdirSync(tracksDir);
    for (const folder of folders) {
      const trackPath = path.join(tracksDir, folder);
      if (!fs.statSync(trackPath).isDirectory()) continue;

      const uiDir = path.join(trackPath, 'ui');
      const rootUiJsonPath = path.join(uiDir, 'ui_track.json');

      let name = '', author = '', tags = [], country = '';

      const ui = readJsonSafe(rootUiJsonPath);
      if (ui) {
        if (ui.name && ui.name.trim()) name = ui.name.trim();
        author = ui.author || '';
        if (ui.country) country = ui.country;
        if (Array.isArray(ui.tags)) tags = ui.tags;
      }

      const variants = [];
      let firstVariantUi = null;
      if (fs.existsSync(uiDir)) {
        try {
          const uiSub = fs.readdirSync(uiDir);
          for (const item of uiSub) {
            const subPath = path.join(uiDir, item);
            if (!fs.statSync(subPath).isDirectory()) continue;
            const varUiPath = path.join(subPath, 'ui_track.json');
            let varName = '', varData = null;
            varData = readJsonSafe(varUiPath);
            if (varData && varData.name && varData.name.trim()) varName = varData.name.trim();
            if (!varName) varName = formatFallbackName(item);
            if (!firstVariantUi && varData) firstVariantUi = varData;
            variants.push({
              id: item, name: varName,
              preview: findImageUrl(subPath, ['preview']),
              outline: findImageUrl(subPath, ['outline'])
            });
          }
        } catch (e) {}
      }

      if (firstVariantUi) {
        if (!country && firstVariantUi.country) country = firstVariantUi.country;
        if (!author  && firstVariantUi.author)  author  = firstVariantUi.author;
        if (tags.length === 0 && Array.isArray(firstVariantUi.tags)) tags = firstVariantUi.tags;
      }

      if (!name) name = formatFallbackName(folder);

      if (variants.length === 0) {
        variants.push({
          id: '', name: 'Default',
          preview: findImageUrl(uiDir, ['preview']),
          outline: findImageUrl(uiDir, ['outline'])
        });
      }

      const folderLower = folder.toLowerCase();
      const authorLower = author.toLowerCase();
      const isKunos = folderLower.startsWith('ks_') || OFFICIAL_KUNOS_TRACKS.has(folderLower) || authorLower.includes('kunos');

      tracks.push({ id: folder, name, author: author || 'Inconnu', country, isKunos, tags, variants });
    }
  } catch (err) { console.error("Erreur scan tracks :", err); }
  tracks.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
  return tracks;
}

function scanWeather(acPath) {
  const weatherDir = path.join(acPath, 'content', 'weather');
  if (!fs.existsSync(weatherDir)) return [];
  const weatherList = [];
  try {
    const items = fs.readdirSync(weatherDir);
    for (const item of items) {
      const fullPath = path.join(weatherDir, item);
      if (fs.statSync(fullPath).isDirectory()) weatherList.push(item);
    }
  } catch (err) { console.error(err); }
  return weatherList.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function scanPurePlans(acPath) {
  if (!acPath || !fs.existsSync(acPath)) return [];
  const plansRoot = path.join(acPath, 'extension', 'config-ext', 'PurePlanner', 'Plans');
  if (!fs.existsSync(plansRoot)) return [];
  const plans = [];
  function walk(dir, prefix) {
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full, prefix ? `${prefix}/${item.name}` : item.name);
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.json') && !item.name.startsWith('last_used')) {
        const rel = prefix ? `${prefix}/${item.name}` : item.name;
        plans.push({ id: rel, name: path.basename(item.name, '.json'), folder: prefix || '' });
      }
    }
  }
  walk(plansRoot, '');
  plans.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  return plans;
}

/* ============================================================
   PURE PLANNER — génération
   ============================================================ */
function parseWeatherPresets(presetsFilePath) {
  if (!fs.existsSync(presetsFilePath)) return {};
  try {
    const arr = JSON.parse(fs.readFileSync(presetsFilePath, 'utf8'));
    const map = {};
    for (const item of arr) {
      if (!Array.isArray(item) || item.length < 13) continue;
      const [name, index, rain_probability, rain_wetness, rain_amount, rain_variance, rain_water,
             wind_strength, humidity, mist, _unused, temp_air_offset, temp_road_offset] = item;
      map[name] = {
        index, rain_probability, rain_wetness, rain_amount, rain_variance, rain_water,
        wind_strength, humidity, mist,
        temp_air: 26 + (temp_air_offset || 0),
        temp_road: 32 + (temp_road_offset || 0)
      };
    }
    return map;
  } catch (e) { return {}; }
}

const WEATHER_NAME_ALIASES = { 'overcast': 'overcast_clouds' };

function normalizeWeatherName(weatherId) {
  if (!weatherId) return '';
  let s = weatherId.toLowerCase().replace(/^(sol|pure|sfx)[_-]/i, '').replace(/^\d+[_-]/, '');
  if (WEATHER_NAME_ALIASES[s]) s = WEATHER_NAME_ALIASES[s];
  return s;
}

function getWeatherIndexForJson(weatherId) {
  if (!weatherId) return 15;
  let s = weatherId.toLowerCase()
    .replace(/^(sol|pure|sfx)[_-]/i, '')
    .replace(/^\d+[_-]/, '')
    .replace(/[-_]\d+$/, '')
    .replace(/\s+/g, '_');
  if (s === 'overcast') s = 'overcast_clouds';
  if (RACEINI_WEATHER[s] !== undefined) return RACEINI_WEATHER[s];
  for (const k of Object.keys(RACEINI_WEATHER)) {
    if (s.includes(k) || k.includes(s)) return RACEINI_WEATHER[k];
  }
  console.warn('[getWeatherIndexForJson] aucune correspondance pour', weatherId, '(clé:', s + ')');
  return 15;
}

function getPureCtrlCmWeather(weatherId) {
  if (!weatherId) return 2;
  let s = weatherId.toLowerCase()
    .replace(/^(sol|pure|sfx)[_-]/i, '')
    .replace(/^\d+[_-]/, '')
    .replace(/[-_]\d+$/, '')
    .replace(/\s+/g, '_');
  if (s === 'overcast') s = 'overcast_clouds';
  if (PURECTRL_CM_WEATHER[s] !== undefined) return PURECTRL_CM_WEATHER[s];
  for (const k of Object.keys(PURECTRL_CM_WEATHER)) {
    if (s.includes(k) || k.includes(s)) return PURECTRL_CM_WEATHER[k];
  }
  console.warn('[getPureCtrlCmWeather] aucune correspondance pour', weatherId, '(clé:', s + ')');
  return 2;
}

function buildWeatherObject(preset) {
  return {
    wind_strength: preset.wind_strength || 0,
    rain_probability: preset.rain_probability || 0,
    temp_road_dyn: true, temp_air_dyn: true, mist_dyn: true, humidity_dyn: true,
    rain_water_dyn: true, rain_wetness_dyn: true, rain_amount_dyn: true,
    temp_air_range: 0, wind_direction: 0, humidity_range: 0,
    rain_wetness: preset.rain_wetness || 0, rain_wetness_range: 0,
    rain_variance_range: 0, rain_probability_range: 0, rain_amount_range: 0,
    wind_strength_range: 0, wind_direction_range: 0, temp_road_range: 0,
    mist: preset.mist || 0,
    temp_air: preset.temp_air !== undefined ? preset.temp_air : 26,
    index: preset.index !== undefined ? preset.index : 50,
    humidity: preset.humidity !== undefined ? preset.humidity : 0.5,
    rain_water: preset.rain_water || 0,
    trans_data_A: 0.5, trans_data_B: 1, trans_look_B: 1, trans_look_A: 0.5,
    trans_auto: true,
    rain_variance: preset.rain_variance || 0,
    rain_water_range: 0, mist_range: 0,
    temp_road: preset.temp_road !== undefined ? preset.temp_road : 32,
    rain_amount: preset.rain_amount || 0
  };
}

function getTimestampForTimeToday(timeStr) {
  let h = 12, mn = 0;
  if (timeStr && typeof timeStr === 'string') {
    const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
      mn = Math.max(0, Math.min(59, parseInt(m[2], 10)));
    }
  }
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), h, mn, 0) / 1000);
}

function buildPlanData(steps, presets, sessionStartTime, timeMult, planType, loop) {
  const baseTimestamp = getTimestampForTimeToday(sessionStartTime || '12:00');
  const tm = parseInt(timeMult, 10) || 1;
  const pt = planType || 3;
  const lp = (pt === 1) ? true : !!loop;

  const container = [];
  let cumulative = 0;
  for (const step of steps) {
    const key = normalizeWeatherName(step.weather);
    const preset = presets[key] || presets['empty'] || { index: 50, temp_air: 26, temp_road: 32, humidity: 0.5 };
    const weatherObj = buildWeatherObject(preset);
    weatherObj.index = getWeatherIndexForJson(step.weather);
    const durationSec = (parseInt(step.duration, 10) || 10) * 60;
    container.push({ data: { weather: weatherObj, duration: durationSec, timestamp: baseTimestamp + cumulative } });
    cumulative += durationSec;
  }
  return { container, control: { type: pt, timemulti: tm, loop: lp } };
}

function writePurePlanArchive(acPath, planName, planData, subFolder) {
  const purePlannerDir = path.join(acPath, 'extension', 'config-ext', 'PurePlanner');
  if (!fs.existsSync(purePlannerDir)) throw new Error("Dossier PurePlanner introuvable.");

  const safeName = (planName || 'CustomPlan')
    .replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').trim() || 'CustomPlan';
  const fileName = `${safeName}.json`;

  const folder = subFolder || 'Stamp';
  const targetDir = path.join(purePlannerDir, 'Plans', folder);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, fileName), JSON.stringify(planData, null, 2), 'utf8');
  return { fileName, folder };
}

function writePurePlanActive(acPath, planData) {
  const purePlannerDir = path.join(acPath, 'extension', 'config-ext', 'PurePlanner');
  const lastUsedInPlans = path.join(purePlannerDir, 'Plans', 'last_used.json');
  const lastUsedRoot = path.join(purePlannerDir, 'last_used.json');
  try {
    if (fs.existsSync(lastUsedInPlans)) fs.copyFileSync(lastUsedInPlans, lastUsedInPlans + '.bak');
    if (fs.existsSync(lastUsedRoot)) fs.copyFileSync(lastUsedRoot, lastUsedRoot + '.bak');
  } catch (e) {}
  const content = JSON.stringify(planData, null, 2);
  fs.writeFileSync(lastUsedInPlans, content, 'utf8');
  fs.writeFileSync(lastUsedRoot, content, 'utf8');
}

function writePurePlanFiles(acPath, planName, planData, subFolder) {
  const { fileName, folder } = writePurePlanArchive(acPath, planName, planData, subFolder);
  writePurePlanActive(acPath, planData);
  return { fileName, folder };
}

function writeStaticPurePlan(acPath, weatherId, sessionStartTime, timeMult) {
  const presetsFile = path.join(acPath, 'extension', 'config-ext', 'PurePlanner', 'WeatherPresets', 'Default_WeatherPresets.json');
  const presets = parseWeatherPresets(presetsFile);
  if (Object.keys(presets).length === 0) throw new Error("Impossible de lire Default_WeatherPresets.json");
  const steps = [{ weather: weatherId, duration: 1440 }];
  const planData = buildPlanData(steps, presets, sessionStartTime, timeMult, 1, true);
  const safeWeather = (weatherId || 'clear').replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 40);
  console.log('[writeStaticPurePlan]', weatherId, '→ index =', planData.container[0].data.weather.index);
  return writePurePlanFiles(acPath, `Custom_Static_${safeWeather}`, planData, PURE_TYPE_TO_FOLDER[1]);
}

function writeCustomPurePlan(acPath, planName, steps, sessionStartTime, timeMult, loop) {
  const presetsFile = path.join(acPath, 'extension', 'config-ext', 'PurePlanner', 'WeatherPresets', 'Default_WeatherPresets.json');
  const presets = parseWeatherPresets(presetsFile);
  if (Object.keys(presets).length === 0) throw new Error("Impossible de lire Default_WeatherPresets.json");
  const planData = buildPlanData(steps, presets, sessionStartTime, timeMult, 3, loop);
  return writePurePlanFiles(acPath, `Custom_${planName}`, planData, PURE_TYPE_TO_FOLDER[3]);
}

function activateExistingPurePlan(acPath, planFileName, timeMult, loop) {
  const purePlannerDir = path.join(acPath, 'extension', 'config-ext', 'PurePlanner');
  let planPath;
  if (planFileName.includes('/')) {
    planPath = path.join(purePlannerDir, 'Plans', planFileName);
  } else {
    planPath = path.join(purePlannerDir, 'Plans', 'Stamp', planFileName);
    if (!fs.existsSync(planPath)) {
      planPath = path.join(purePlannerDir, 'Plans', planFileName);
    }
  }
  if (!fs.existsSync(planPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    if (!parsed.control) parsed.control = {};
    parsed.control.timemulti = parseInt(timeMult, 10) || parsed.control.timemulti || 1;
    parsed.control.loop = (loop !== undefined) ? !!loop : (parsed.control.loop || false);
    const contentToWrite = JSON.stringify(parsed, null, 2);
    fs.writeFileSync(path.join(purePlannerDir, 'Plans', 'last_used.json'), contentToWrite, 'utf8');
    fs.writeFileSync(path.join(purePlannerDir, 'last_used.json'), contentToWrite, 'utf8');
    return true;
  } catch (e) { return false; }
}

/* ============================================================
   PURE CTRL — lecture / écriture du fichier d'état
   ============================================================ */
function getPureCtrlIniPath(documentsPath) {
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension', 'state', 'lua', 'wfx_controller', 'pureCtrl__settings.ini');
}

function readPureCtrlIni(documentsPath) {
  const result = {
    cmWeather: null,
    autostart: true,
    lastUsed: true,
    live: false,
    startWetness: 1,
    startPuddles: 1,
    plan: null,
    exists: false
  };
  const file = getPureCtrlIniPath(documentsPath);
  if (!fs.existsSync(file)) return result;
  result.exists = true;

  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const present = new Set();

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('[') || line.startsWith(';') || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.substring(0, eq).trim().toUpperCase();
      const value = line.substring(eq + 1).trim();
      present.add(key);

      switch (key) {
        case 'CM_WEATHER': {
          const n = parseInt(value, 10);
          if (!isNaN(n)) result.cmWeather = n;
          break;
        }
        case 'AUTOSTART': result.autostart = (value === '1'); break;
        case 'LAST_USED': result.lastUsed = (value === '1'); break;
        case 'LIVE': result.live = (value === '1'); break;
        case 'START_WETNESS': {
          const n = parseInt(value, 10);
          if (!isNaN(n)) result.startWetness = n;
          break;
        }
        case 'START_PUDDLES': {
          const n = parseInt(value, 10);
          if (!isNaN(n)) result.startPuddles = n;
          break;
        }
        case 'PLAN': result.plan = value || null; break;
      }
    }

    if (!present.has('AUTOSTART')) result.autostart = true;
    if (!present.has('LAST_USED')) result.lastUsed = true;
    if (!present.has('LIVE')) result.live = false;

  } catch (e) {
    console.error('[readPureCtrlIni]', e);
  }

  return result;
}

function writePureCtrlIni(documentsPath, pureCtrl, planValue, cmWeatherIndex) {
  const file = getPureCtrlIniPath(documentsPath);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { console.warn('[writePureCtrlIni] impossible de créer le dossier:', dir, e); return false; }
  }

  const opts = pureCtrl || {};
  const lines = ['[SETTINGS]'];

  const cmw = (cmWeatherIndex !== undefined && cmWeatherIndex !== null)
    ? cmWeatherIndex
    : (opts.cmWeather !== undefined && opts.cmWeather !== null ? opts.cmWeather : 2);
  lines.push(`CM_WEATHER=${cmw}`);

  if (opts.autostart === false) lines.push('AUTOSTART=0');
  if (opts.lastUsed === false) lines.push('LAST_USED=0');
  if (opts.live === true) lines.push('LIVE=1');

  const sw = parseInt(opts.startWetness, 10);
  if (!isNaN(sw) && sw > 1) lines.push(`START_WETNESS=${sw}`);

  const sp = parseInt(opts.startPuddles, 10);
  if (!isNaN(sp) && sp > 1) lines.push(`START_PUDDLES=${sp}`);

  if (planValue && String(planValue).trim()) lines.push(`PLAN=${planValue}`);

  const content = lines.join('\n') + '\n';
  try {
    fs.writeFileSync(file, content, 'utf8');
    console.log('[writePureCtrlIni] écrit →', file);
    return true;
  } catch (e) {
    console.error('[writePureCtrlIni]', e);
    return false;
  }
}

ipcMain.handle('read-purectrl-settings', async () => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  return readPureCtrlIni(documentsPath);
});

/* ============================================================
   IPC — DÉTECTION DU STEAM ID
   ============================================================ */

/**
 * Détecte le SteamID64 en lisant les fichiers locaux de Steam.
 * Fonctionne uniquement sur Windows.
 *
 * Deux stratégies :
 *   1. Lire loginusers.vdf et trouver le compte avec "MostRecent" = "1"
 *   2. Fallback : premier SteamID64 trouvé dans le fichier
 */
async function detectSteamIdFromSteam() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Détection Steam disponible uniquement sur Windows.' };
  }

  try {
    // 1. Récupère le chemin d'installation de Steam via la base de registre
    let steamPath = null;

    // Essaie la clé 64-bit (WOW6432Node)
    try {
      const out = execSync(
        'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const match = out.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (match) steamPath = match[1].trim();
    } catch (e) {}

    // Fallback : clé 32-bit
    if (!steamPath) {
      try {
        const out = execSync(
          'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        );
        const match = out.match(/InstallPath\s+REG_SZ\s+(.+)/);
        if (match) steamPath = match[1].trim();
      } catch (e) {}
    }

    if (!steamPath) {
      return { success: false, error: 'Steam introuvable dans la base de registre.' };
    }

    // 2. Lit loginusers.vdf
    const loginUsersPath = path.join(steamPath, 'config', 'loginusers.vdf');
    if (!fs.existsSync(loginUsersPath)) {
      return { success: false, error: 'loginusers.vdf introuvable à ' + loginUsersPath };
    }

    const content = fs.readFileSync(loginUsersPath, 'utf8');

    // 3. Cherche le compte avec MostRecent "1"
    // Structure du fichier :
    // "users"
    // {
    //   "76561198000000000"
    //   {
    //     "AccountName"     "xxx"
    //     "PersonaName"     "xxx"
    //     ...
    //     "MostRecent"      "1"
    //     ...
    //   }
    // }

    // Découpe par blocs de SteamID (17 chiffres entre guillemets en début de ligne)
    const blockRegex = /"(7656119\d{10})"\s*\n\s*\{([^}]+)\}/g;
    let match;
    let firstEntry = null;

    while ((match = blockRegex.exec(content)) !== null) {
      const steamId64 = match[1];
      const body = match[2];

      const isMostRecent = /"MostRecent"\s+"1"/.test(body);
      const personaMatch = body.match(/"PersonaName"\s+"([^"]*)"/);
      const accountMatch = body.match(/"AccountName"\s+"([^"]*)"/);

      const entry = {
        steamId: steamId64,
        personaName: personaMatch ? personaMatch[1] : '',
        accountName: accountMatch ? accountMatch[1] : '',
        mostRecent: isMostRecent
      };

      if (isMostRecent) {
        return {
          success: true,
          steamId: steamId64,
          personaName: entry.personaName,
          accountName: entry.accountName,
          steamPath,
          source: 'loginusers.vdf (MostRecent)'
        };
      }

      if (!firstEntry) firstEntry = entry;
    }

    // Fallback : aucune entrée MostRecent, on prend la première
    if (firstEntry) {
      return {
        success: true,
        steamId: firstEntry.steamId,
        personaName: firstEntry.personaName,
        accountName: firstEntry.accountName,
        steamPath,
        source: 'loginusers.vdf (fallback)'
      };
    }

    return { success: false, error: 'Aucun SteamID64 trouvé dans loginusers.vdf.' };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Détection de secours : lit le GUID depuis race.ini (section [REMOTE]).
 */
function detectSteamIdFromRaceIni() {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const raceIniPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'race.ini');
  if (!fs.existsSync(raceIniPath)) {
    return { success: false, error: "race.ini introuvable" };
  }
  try {
    const content = fs.readFileSync(raceIniPath, 'utf8');
    const remoteSection = content.match(/\[REMOTE\]([\s\S]*?)(?=\n\[|$)/);
    if (!remoteSection) return { success: false, error: "Section [REMOTE] introuvable" };
    const guidMatch = remoteSection[1].match(/^GUID=(.*)$/m);
    if (guidMatch && guidMatch[1].trim()) {
      return { success: true, steamId: guidMatch[1].trim(), source: 'race.ini' };
    }
    return { success: false, error: "Champ GUID vide dans [REMOTE]" };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Handler IPC unifié : essaie d'abord Steam, puis race.ini.
 */
ipcMain.handle('detect-steam-id', async () => {
  // 1. Tentative via Steam
  const fromSteam = await detectSteamIdFromSteam();
  if (fromSteam.success) return fromSteam;

  // 2. Fallback : race.ini
  const fromRaceIni = detectSteamIdFromRaceIni();
  if (fromRaceIni.success) {
    return {
      ...fromRaceIni,
      warning: fromSteam.error ? `Steam : ${fromSteam.error}` : null
    };
  }

  // 3. Échec complet
  return {
    success: false,
    error: `Steam : ${fromSteam.error || 'inconnue'} | race.ini : ${fromRaceIni.error || 'inconnue'}`
  };
});

/* ============================================================
   IPC — DÉTECTION POUR L'ASSISTANT D'INSTALLATION
   ============================================================ */
function detectAcPathFromRegistry() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const match = out.match(/InstallPath\s+REG_SZ\s+(.+)/);
    if (match) {
      const acPath = path.join(match[1].trim(), 'steamapps', 'common', 'assettocorsa');
      if (fs.existsSync(acPath)) return acPath;
    }
  } catch (e) {}
  return null;
}

function detectAcPathFromDefaults() {
  const defaults = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa',
    'D:\\SteamLibrary\\steamapps\\common\\assettocorsa',
    'E:\\SteamLibrary\\steamapps\\common\\assettocorsa',
    'F:\\SteamLibrary\\steamapps\\common\\assettocorsa',
    'C:\\SteamLibrary\\steamapps\\common\\assettocorsa',
  ];
  for (const p of defaults) if (fs.existsSync(p)) return p;
  return null;
}

function countDirectories(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.isDirectory()).length;
  } catch (e) { return 0; }
}

function detectSevenZip() {
  const candidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', '7-Zip', '7z.exe'));
  if (process.env.ProgramW6432) candidates.push(path.join(process.env.ProgramW6432, '7-Zip', '7z.exe'));
  for (const exe of candidates) if (fs.existsSync(exe)) return exe;
  return null;
}

ipcMain.handle('detect-setup-status', async () => {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};

  // 1) Chemin AC
  let acPath = settings.acPath;
  let acPathSource = acPath && fs.existsSync(acPath) ? 'manual' : null;
  if (!acPathSource) {
    acPath = detectAcPathFromRegistry();
    acPathSource = acPath ? 'registry' : null;
    if (!acPath) {
      acPath = detectAcPathFromDefaults();
      acPathSource = acPath ? 'default' : null;
    }
  }

  // 2) Documents
  const docs = resolveDocumentsPath(settings);

  // 3) SteamID (Steam puis race.ini)
  let steamResult = { success: false };
  try {
    steamResult = await detectSteamIdFromSteam();
    if (!steamResult.success) steamResult = detectSteamIdFromRaceIni();
  } catch (e) { console.warn('[setup] SteamID KO', e.message); }

  // 4) CSP / Pure / Sol / 7-Zip / contenu
  const csp = { installed: false };
  const pure = { installed: false };
  const sol = { installed: false, version: null, plannerInstalled: false };
  const sevenZip = { installed: false };
  const content = { cars: 0, tracks: 0 };

  if (acPath && fs.existsSync(acPath)) {
    const cspConfigDir = path.join(acPath, 'extension', 'config');
    if (fs.existsSync(cspConfigDir)) {
      csp.installed = true;
      try {
        const vf = path.join(cspConfigDir, 'version.ini');
        if (fs.existsSync(vf)) {
          const m = fs.readFileSync(vf, 'utf8').match(/VERSION=(.+)/i);
          if (m) csp.version = m[1].trim();
        }
      } catch (e) {}
    }
    const pureDir = path.join(acPath, 'extension', 'config-ext', 'PurePlanner');
    if (fs.existsSync(pureDir)) pure.installed = true;

    // ⭐ Détection Sol (manifest.ini dans extension/weather/sol/)
    const solManifest = path.join(acPath, 'extension', 'weather', 'sol', 'manifest.ini');
    if (fs.existsSync(solManifest)) {
      sol.installed = true;
      try {
        const m = fs.readFileSync(solManifest, 'utf8').match(/^VERSION\s*=\s*(.+)$/mi);
        if (m) sol.version = m[1].trim();
      } catch (e) {}
    }

    // ⭐ Détection Sol Planner (app Python)
    sol.plannerInstalled = fs.existsSync(
      path.join(acPath, 'apps', 'python', 'sol_planner', 'presets', 'presets.ini')
    );

    content.cars = countDirectories(path.join(acPath, 'content', 'cars'));
    content.tracks = countDirectories(path.join(acPath, 'content', 'tracks'));
  }

  const sz = detectSevenZip();
  if (sz) { sevenZip.installed = true; sevenZip.path = sz; }

  return {
    acPath: acPath || null,
    acPathSource,
    documentsPath: docs.path,
    documentsSource: docs.source,
    steamId: steamResult.success ? steamResult.steamId : null,
    steamIdSource: steamResult.source || null,
    personaName: steamResult.personaName || null,
    csp, pure, sol, sevenZip, content,
  };
});

/* ============================================================
   IPC — VÉRIFICATION DES MISES À JOUR (GitHub Releases)
   ============================================================ */
function compareSemver(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/camarade35/QACRL_Quick-AC-Race-Launcher/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'QACRL-Launcher',
        'Accept': 'application/vnd.github+json',
      },
      timeout: 8000,
    };
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('GitHub HTTP ' + res.statusCode));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON invalide')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

/* ============================================================
   IPC — INSTALLATION ARCHIVES CSP / SOL / PURE
   ============================================================ */

ipcMain.handle('preview-csp-archive', async (event, filePath) => {
  try {
    const res = previewArchive(filePath);
    return { success: true, ...res };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('install-csp-archive', async (event, filePath) => {
  try {
    const settings = fs.existsSync(settingsFilePath)
      ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
      : {};
    const acPath = settings.acPath;
    if (!acPath || !fs.existsSync(acPath)) {
      return { success: false, error: 'Dossier AC non configuré.' };
    }

    const { path: documentsPath } = resolveDocumentsPath(settings);

    const result = await installArchive(filePath, acPath, documentsPath, (progress) => {
      event.sender.send('csp-install-progress', progress);
    });

    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-app-version', () => {
  try {
    return { success: true, version: app.getVersion() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const localVersion = app.getVersion();
    const release = await fetchLatestRelease();

    const tagName = (release && release.tag_name) || '';
    const remoteVersion = tagName.replace(/^v/i, '');
    if (!remoteVersion) {
      return { success: false, error: 'Tag de version introuvable.' };
    }

    const hasUpdate = compareSemver(remoteVersion, localVersion) > 0;

    return {
      success: true,
      hasUpdate,
      localVersion,
      remoteVersion,
      releaseUrl: release.html_url || '',
      releaseName: release.name || tagName,
      releaseNotes: release.body || '',
      publishedAt: release.published_at || '',
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — CAPACITÉS DE L'INSTALLATION (CSP / Pure présents ?)
   ============================================================ */
ipcMain.handle('check-csp-pure', async () => {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const acPath = settings.acPath;
  const { path: documentsPath } = resolveDocumentsPath(settings);

  const result = {
    hasCSP: false,
    hasPure: false,
    hasPurePlanner: false,
    hasSol: false,
    solVersion: null,
    solController: null,
    hasSolPlanner: false,
    hasWeatherFx: false,
  };

  if (acPath && fs.existsSync(acPath)) {
    result.hasCSP = fs.existsSync(path.join(acPath, 'extension', 'config'));
    result.hasPure = fs.existsSync(path.join(acPath, 'extension', 'config-ext', 'PurePlanner'));
    result.hasPurePlanner = fs.existsSync(path.join(acPath, 'extension', 'config-ext', 'PurePlanner', 'Plans'));

    // ⭐ Détection Sol
    const solManifest = path.join(acPath, 'extension', 'weather', 'sol', 'manifest.ini');
    if (fs.existsSync(solManifest)) {
      result.hasSol = true;
      try {
        const content = fs.readFileSync(solManifest, 'utf8');
        const m = content.match(/^VERSION\s*=\s*(.+)$/mi);
        if (m) result.solVersion = m[1].trim();
      } catch (e) { /* ignore */ }
    }

    // ⭐ Détection Sol Planner (app Python installée via CSP)
    result.hasSolPlanner = fs.existsSync(
      path.join(acPath, 'apps', 'python', 'sol_planner', 'presets', 'presets.ini')
    );

    // ⭐ Contrôleur Sol 2.5 actif (si présent)
    const sol2Manifest = path.join(acPath, 'extension', 'weather-controllers', 'sol2', 'manifest.ini');
    if (fs.existsSync(sol2Manifest)) {
      try {
        const content = fs.readFileSync(sol2Manifest, 'utf8');
        const m = content.match(/^VERSION\s*=\s*(.+)$/mi);
        if (m) result.solController = m[1].trim();
      } catch (e) { /* ignore */ }
    }
  }

  if (documentsPath) {
    result.hasWeatherFx = fs.existsSync(
      path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension', 'weather_fx.ini')
    );
  }

  return result;
});

/* ============================================================
   Assistances & launcher.ini
   ============================================================ */
function forceCustomAssistsProfile(documentsPath) {
  const launcherIniPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'launcher.ini');
  if (!fs.existsSync(launcherIniPath)) return false;
  try {
    let content = fs.readFileSync(launcherIniPath, 'utf8');
    if (/^ASSISTS=/m.test(content)) content = content.replace(/^ASSISTS=.*$/m, 'ASSISTS=custom');
    else if (/\[SAVED\]/m.test(content)) content = content.replace(/\[SAVED\](\r?\n)/, '[SAVED]$1ASSISTS=custom\n');
    else content += '\n[SAVED]\nASSISTS=custom\n';
    fs.writeFileSync(launcherIniPath, content, 'utf8');
    return true;
  } catch (e) { return false; }
}

function writeAssistsIni(documentsPath, assists) {
  const cfgDir = path.join(documentsPath, 'Assetto Corsa', 'cfg');
  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
  const path_ = path.join(cfgDir, 'assists.ini');
  const content =
`[ASSISTS]
IDEAL_LINE=${assists.idealLine ? 1 : 0}
AUTO_BLIP=${assists.autoblip ? 1 : 0}
STABILITY_CONTROL=${assists.stability !== undefined ? assists.stability : 0}
AUTO_BRAKE=0
AUTO_SHIFTER=${assists.autoGearbox ? 1 : 0}
ABS=${assists.abs !== undefined ? assists.abs : 1}
TRACTION_CONTROL=${assists.tc !== undefined ? assists.tc : 1}
AUTO_CLUTCH=${assists.autoclutch ? 1 : 0}
VISUALDAMAGE=1
DAMAGE=${assists.mechanicalDamage !== undefined ? assists.mechanicalDamage : 100}
FUEL_RATE=${assists.fuelRate !== undefined ? assists.fuelRate : 1}
TYRE_WEAR=${assists.tyreWear !== undefined ? assists.tyreWear : 1}
TYRE_BLANKETS=${assists.tyreBlankets ? 1 : 0}
SLIPSTREAM=${assists.slipstream !== undefined ? assists.slipstream : 1}
`;
  try { fs.writeFileSync(path_, content, 'utf8'); return true; }
  catch (e) { return false; }
}

/* ============================================================
   CONTENU & LANCEMENT
   ============================================================ */
function loadContentInternal() {
  let settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  let acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) {
    const defaultPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa',
      'D:\\SteamLibrary\\steamapps\\common\\assettocorsa',
      'E:\\SteamLibrary\\steamapps\\common\\assettocorsa',
      'F:\\SteamLibrary\\steamapps\\common\\assettocorsa',
      'C:\\SteamLibrary\\steamapps\\common\\assettocorsa'
    ];
    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        acPath = p; settings.acPath = acPath;
        try { fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8'); } catch (e) {}
        break;
      }
    }
  }
  let cars = [], tracks = [], weatherList = [], purePlans = [], solPlans = [];
  if (acPath && fs.existsSync(acPath)) {
    cars = scanCars(acPath);
    tracks = scanTracks(acPath);
    weatherList = scanWeather(acPath);
    purePlans = scanPurePlans(acPath);
    // ⭐ Plans Sol Planner (uniquement si l'app est installée) — scan défensif
    try { solPlans = solPlanner.scanSolPlans(acPath); } catch (e) { solPlans = []; }
  }
  flushJsonWarnings();  // ⭐ résumé compact au lieu d'une ligne par fichier
  return { cars, tracks, weatherList, purePlans, solPlans, acPath: acPath || '' };
}

ipcMain.handle('load-content', async () => loadContentInternal());

ipcMain.handle('save-custom-plan', async (event, planName, steps, sessionStartTime, timeMult, loop) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  if (!planName || !planName.trim()) throw new Error("Nom du plan manquant.");
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Aucune étape dans le plan.");
  const presetsFile = path.join(acPath, 'extension', 'config-ext', 'PurePlanner', 'WeatherPresets', 'Default_WeatherPresets.json');
  const presets = parseWeatherPresets(presetsFile);
  const planData = buildPlanData(steps, presets, sessionStartTime || '12:00', parseInt(timeMult, 10) || 1, 3, !!loop);
  const { fileName, folder } = writePurePlanArchive(acPath, `Custom_${planName}`, planData, PURE_TYPE_TO_FOLDER[3]);
  return { success: true, fileName: `${folder}/${fileName}`, planName: fileName.replace(/\.json$/i, '') };
});

/* ============================================================
   IPC — GESTION DES PLANS PURE EXISTANTS
   ============================================================ */
function resolvePlanFilePath(acPath, planId) {
  if (!acPath || !planId) return null;
  const purePlannerDir = path.join(acPath, 'extension', 'config-ext', 'PurePlanner');
  const plansDir = path.join(purePlannerDir, 'Plans');
  const normalized = String(planId).replace(/\\/g, '/');
  if (normalized.includes('..')) return null;
  const full = path.join(plansDir, normalized);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(plansDir))) return null;
  return resolved;
}

ipcMain.handle('load-pure-plan', async (event, planId) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  const planPath = resolvePlanFilePath(acPath, planId);
  if (!planPath || !fs.existsSync(planPath)) throw new Error("Plan introuvable : " + planId);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(planPath, 'utf8')); }
  catch (e) { throw new Error("Fichier de plan illisible : " + e.message); }
  return {
    success: true,
    planId: planId,
    planName: path.basename(planPath, '.json'),
    folder: path.basename(path.dirname(planPath)),
    data: raw
  };
});

ipcMain.handle('delete-pure-plan', async (event, planId) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  const planPath = resolvePlanFilePath(acPath, planId);
  if (!planPath || !fs.existsSync(planPath)) throw new Error("Plan introuvable : " + planId);
  try { fs.unlinkSync(planPath); }
  catch (e) { throw new Error("Impossible de supprimer le plan : " + e.message); }
  return { success: true };
});

/* ============================================================
   IPC — GESTION DES PLANS SOL PLANNER (INI)
   ⚠️ Ne touche JAMAIS aux fichiers Pure (PurePlanner, pureCtrl).
   ============================================================ */
function resolveSolPlanPath(acPath, planId) {
  if (!acPath || !planId) return null;
  const plansDir = path.join(acPath, 'apps', 'python', 'sol_planner', 'plans');
  const normalized = String(planId).replace(/\\/g, '/');
  if (normalized.includes('..')) return null;
  const full = path.join(plansDir, normalized);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(plansDir))) return null;
  return resolved;
}

ipcMain.handle('scan-sol-plans', async () => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) return { success: false, plans: [] };
  try {
    const plans = solPlanner.scanSolPlans(acPath);
    return { success: true, plans };
  } catch (e) {
    return { success: false, error: e.message, plans: [] };
  }
});

ipcMain.handle('load-sol-plan', async (event, planId) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  const planPath = resolveSolPlanPath(acPath, planId);
  if (!planPath || !fs.existsSync(planPath)) throw new Error("Plan Sol introuvable : " + planId);
  let parsed;
  try { parsed = solPlanner.parseSolPlanFile(planPath); }
  catch (e) { throw new Error("Fichier de plan Sol illisible : " + e.message); }
  return {
    success: true,
    planId: planId,
    planName: path.basename(planPath, '.ini'),
    data: parsed,
  };
});

ipcMain.handle('delete-sol-plan', async (event, planId) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  const planPath = resolveSolPlanPath(acPath, planId);
  if (!planPath || !fs.existsSync(planPath)) throw new Error("Plan Sol introuvable : " + planId);
  try { fs.unlinkSync(planPath); }
  catch (e) { throw new Error("Impossible de supprimer le plan Sol : " + e.message); }
  return { success: true };
});

ipcMain.handle('save-custom-sol-plan', async (event, planName, steps, sessionStartTime, timeMult, loop) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  if (!planName || !planName.trim()) throw new Error("Nom du plan manquant.");
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Aucune étape dans le plan.");
  const planData = solPlanner.buildSolPlanData(steps, {
    sessionStartTime: sessionStartTime || '12:00',
    timeMult: parseInt(timeMult, 10) || 1,
    timemode: 1,
    loop: !!loop,
    playing: true,
  });
  // Archive seule — l'activation dans presets.ini se fera au lancement
  const archive = solPlanner.writeSolPlanArchive(acPath, planName, planData);
  return {
    success: true,
    fileName: archive.fileName,
    planName: archive.fileName.replace(/\.ini$/i, ''),
  };
});

// ⭐ One-shot : nettoie les loadwithstart (lowercase) résiduels dans presets.ini
ipcMain.handle('cleanup-sol-presets', async () => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) {
    return { success: false, error: 'Dossier AC non configuré.' };
  }
  const presetsFile = path.join(acPath, 'apps', 'python', 'sol_planner', 'presets', 'presets.ini');
  if (!fs.existsSync(presetsFile)) {
    return { success: true, changed: false, reason: 'presets.ini absent' };
  }
  try {
    const content = fs.readFileSync(presetsFile, 'utf8');
    const lines = content.split(/\r?\n/);
    const out = [];
    let inGeneral = false;
    let removed = 0;
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (/^\[general\]/i.test(trimmed)) { inGeneral = true; out.push(raw); continue; }
      if (/^\[/.test(trimmed)) { inGeneral = false; out.push(raw); continue; }
      // Supprime les loadwithstart (lowercase uniquement) dans [general]
      if (inGeneral && /^loadwithstart\s*=/i.test(trimmed) && !/^loadWithStart\s*=/.test(trimmed)) {
        removed++;
        continue;
      }
      out.push(raw);
    }
    if (removed > 0) {
      fs.copyFileSync(presetsFile, presetsFile + '.bak-cleanup');
      fs.writeFileSync(presetsFile, out.join('\n'), 'utf8');
    }
    return { success: true, changed: removed > 0, removed };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

function resolveDocumentsPath(settings) {
  if (settings && settings.documentsPath && fs.existsSync(settings.documentsPath))
    return { path: settings.documentsPath, source: 'manuel' };
  try { const p = app.getPath('documents'); if (p && fs.existsSync(p)) return { path: p, source: 'electron' }; } catch (e) {}
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'OneDrive - Personal', 'Documents'), path.join(home, 'OneDrive - Business', 'Documents')
  ];
  for (const c of candidates) if (fs.existsSync(path.join(c, 'Assetto Corsa'))) return { path: c, source: 'auto-AC' };
  for (const c of candidates) if (fs.existsSync(c)) return { path: c, source: 'auto' };
  return { path: path.join(home, 'Documents'), source: 'fallback' };
}

/* ============================================================
   ⭐ v1.4.2 — RÉCONCILIATION controls.ini AVANT LANCEMENT
   Réécrit [CONTROLLERS] et les JOY=n selon les gamepads réellement
   branchés. Résout le problème : l'index Chromium change si on
   allume/éteint un device → JOY=n pointe dans le vide.
   ============================================================ */
function makeIguidForDevice(vendor, product, index) {
  // ⚠️ On préserve l'ancien __IGUID si présent, sinon on génère
  // le format observé dans controls.ini : XXXX-NNNN-NNNN-800X-444553540000
  const a = ((0x5251B780 + index * 0x1A2B3C) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const b = '7DD1';
  const c = '11F1';
  const d = (0x8001 + index).toString(16).toUpperCase().padStart(4, '0');
  return a + '-' + b + '-' + c + '-' + d + '-444553540000';
}

function makePguidFromDevice(vendor, product) {
  // PGUID AC = "PPPPVVVV-0000-0000-0000-504944564944" (Product puis Vendor)
  return (product || '').toUpperCase() + (vendor || '').toUpperCase() + '-0000-0000-0000-504944564944';
}

function reconcileControlsIni(documentsPath, gamepads) {
  if (!documentsPath || !Array.isArray(gamepads)) return;

  const controlsPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'controls.ini');
  if (!fs.existsSync(controlsPath)) {
    console.log('[reconcileControlsIni] controls.ini absent, skip');
    return;
  }

  try {
    let content = fs.readFileSync(controlsPath, 'utf8');

    // 1) Construire map { PGUID → newIndex } depuis les gamepads présents
    const pguidToNewIndex = {};
    const orderedGamepads = gamepads.slice().sort((a, b) => a.chromiumIndex - b.chromiumIndex);
    for (const pad of orderedGamepads) {
      const pg = makePguidFromDevice(pad.vendor, pad.product);
      pguidToNewIndex[pg] = pad.chromiumIndex;
    }

    // 2) Extraire l'ancien [CONTROLLERS] : map { oldIndex → PGUID }
    const ctrlMatch = content.match(/\[CONTROLLERS\]([\s\S]*?)(?=\r?\n\[|$)/);
    const oldIndexToPg = {};
    if (ctrlMatch) {
      const lines = ctrlMatch[1].split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^PGUID(\d+)\s*=\s*(.+)$/);
        if (m) oldIndexToPg[parseInt(m[1], 10)] = m[2].trim().toUpperCase();
      }
    }

    // 3) Map de traduction { oldIndex → newIndex }
    const oldToNew = {};
    for (const oldIdxStr of Object.keys(oldIndexToPg)) {
      const oldIdx = parseInt(oldIdxStr, 10);
      const pg = oldIndexToPg[oldIdx];
      if (pguidToNewIndex[pg] !== undefined) {
        oldToNew[oldIdx] = pguidToNewIndex[pg];
      }
    }
    console.log('[reconcileControlsIni] traduction index :',
      Object.entries(oldToNew).map(([o, n]) => o + '→' + n).join(', ') || '(aucune)');

    // 4) Réécrire [CONTROLLERS] avec les devices présents dans leur ordre actuel
    const newCtrlLines = ['[CONTROLLERS]'];
    for (const pad of orderedGamepads) {
      const pg = makePguidFromDevice(pad.vendor, pad.product);
      const iguid = makeIguidForDevice(pad.vendor, pad.product, pad.chromiumIndex);
      newCtrlLines.push('CON' + pad.chromiumIndex + '=' + pad.name);
      newCtrlLines.push('__IGUID' + pad.chromiumIndex + '=' + iguid);
      newCtrlLines.push('PGUID' + pad.chromiumIndex + '=' + pg);
    }
    const newCtrlBlock = newCtrlLines.join('\n');
    content = content.replace(/\[CONTROLLERS\][\s\S]*?(?=\r?\n\[|$)/, newCtrlBlock);

    // 5) Réécrire tous les JOY=n (sauf dans [CONTROLLERS])
    //    On utilise la traduction oldToNew. Si un JOY=n ne peut pas être
    //    traduit (device absent), on met -1.
    const sections = content.split(/(?=\r?\n\[)/);
    const output = sections.map(sec => {
      if (/^\s*\[CONTROLLERS\]/.test(sec)) return sec; // déjà réécrit
      return sec.replace(/^JOY\s*=\s*(-?\d+)\s*$/gm, (match, oldVal) => {
        const oldIdx = parseInt(oldVal, 10);
        if (oldIdx < 0) return match; // -1 reste -1
        if (oldToNew[oldIdx] !== undefined) {
          return 'JOY=' + oldToNew[oldIdx];
        }
        // Device absent → on met -1 pour éviter de pointer dans le vide
        console.warn('[reconcileControlsIni] JOY=' + oldIdx + ' → -1 (device absent)');
        return 'JOY=-1';
      });
    });
    content = output.join('');

    // Backup + écriture
    fs.copyFileSync(controlsPath, controlsPath + '.bak-reconcile');
    fs.writeFileSync(controlsPath, content, 'utf8');
    console.log('[reconcileControlsIni] controls.ini réconcilié (' +
      orderedGamepads.length + ' device(s) présents)');
  } catch (e) {
    console.warn('[reconcileControlsIni] KO :', e.message);
  }
}

ipcMain.handle('launch-game', async (event, sessionData) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const content = loadContentInternal();
  if (!settings.acPath || !fs.existsSync(settings.acPath)) throw new Error("Chemin AC invalide.");

  const { path: documentsPath } = resolveDocumentsPath(settings);
  settings.documentsPath = documentsPath;

  const weatherMode = sessionData.weatherMode || 'static';
  const sessionStartTime = sessionData.sessionStartTime || '12:00';
  const timeMult = parseInt(sessionData.timeMult, 10) || 1;
  const planLoop = !!sessionData.planLoop;

  forceCustomAssistsProfile(documentsPath);
  writeAssistsIni(documentsPath, sessionData.assists || {});

  // ⭐ Détection des capacités (CSP / Pure / Sol / Sol Planner)
  const caps = { hasCSP: false, hasPure: false, hasSol: false, hasSolPlanner: false };
  if (settings.acPath && fs.existsSync(settings.acPath)) {
    caps.hasCSP = fs.existsSync(path.join(settings.acPath, 'extension', 'config'));
    caps.hasPure = fs.existsSync(path.join(settings.acPath, 'extension', 'config-ext', 'PurePlanner'));
    caps.hasSol = fs.existsSync(path.join(settings.acPath, 'extension', 'weather', 'sol', 'manifest.ini'));
    caps.hasSolPlanner = fs.existsSync(path.join(settings.acPath, 'apps', 'python', 'sol_planner', 'presets', 'presets.ini'));
  }

  // ⭐ PRIORITÉ PURE : si Pure est installé, on garde le flux Pure intact.
  //    Sol (avec ou sans Sol Planner) n'est utilisé QUE si Pure est absent.
  //
  //   Cas 1 : Pure installé             → logique Pure complète (inchangée)
  //   Cas 2 : Sol + Sol Planner         → logique Sol (plans INI + presets.ini)
  //   Cas 3 : Sol seul (sans Planner)   → météo Sol directe via race.ini
  //   Cas 4 : Ni Pure ni Sol            → mode dégradé Kunos (force 3_clear)
  // ⚠️ v1.4.2 DÉSACTIVÉ — l'approche "réécrire [CONTROLLERS] au lancement" est cassée :
  //    - si un device est éteint, il disparaît de la liste
  //    - les JOY=n pointent alors vers des index qui n'existent plus
  //    On désactive en attendant une meilleure architecture (profils par device actif).
  // if (Array.isArray(sessionData.connectedGamepads) && sessionData.connectedGamepads.length > 0) {
  //   reconcileControlsIni(documentsPath, sessionData.connectedGamepads);
  // }

  const usePureLogic     = caps.hasPure;
  const useSolPlanner    = !caps.hasPure && caps.hasSol && caps.hasSolPlanner;
  const useSolWeather    = !caps.hasPure && caps.hasSol && !caps.hasSolPlanner;
  const useKunosFallback = !caps.hasPure && !caps.hasSol;

  // --- Cas 2 : Sol + Sol Planner → plans INI dans presets.ini
  if (useSolPlanner) {
    console.log('[launch-game] Sol Planner détecté → gestion des plans Sol (INI)');
    try {
      let planName = 'QACRL_Plan';
      let planData = null;

      if (weatherMode === 'custom_plan') {
        if (Array.isArray(sessionData.customPlanSteps) && sessionData.customPlanSteps.length > 0) {
          planName = sessionData.customPlanName || 'MonPlan';
          planData = solPlanner.buildSolPlanData(sessionData.customPlanSteps, {
            sessionStartTime: sessionStartTime,
            timeMult: timeMult,
            timemode: 1,               // 1 = time span (mode "custom" Sol)
            loop: planLoop,
            playing: true,             // démarrage auto
          });
        }
      } else if (weatherMode === 'existing_plan') {
        if (sessionData.solPlan) {
          const plansRoot = path.join(settings.acPath, 'apps', 'python', 'sol_planner', 'plans');
          const filePath = path.join(plansRoot, sessionData.solPlan);
          if (fs.existsSync(filePath)) {
            planData = solPlanner.parseSolPlanFile(filePath);
            planName = path.basename(sessionData.solPlan, '.ini');
            // Surcharge des paramètres UI
            planData.timemultiplier = timeMult;
            if (planLoop !== undefined) planData.repeat = !!planLoop;
            planData.playing = true;
          } else {
            console.warn('[launch-game] Plan Sol introuvable :', filePath);
          }
        }
      } else {
        // weatherMode === 'static' → mini-plan 1 étape sur 24h
        const staticWeather = sessionData.weather || 'sol_01_clear';
        planData = solPlanner.buildSolPlanData(
          [{ weather: staticWeather, duration: 1440 }],
          {
            sessionStartTime: sessionStartTime,
            timeMult: timeMult,
            timemode: 0,               // 0 = day cycle
            loop: true,
            playing: true,
          }
        );
        planName = 'Static_' + staticWeather.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 30);
      }

      if (planData) {
        const res = solPlanner.writeSolPlanFiles(settings.acPath, planName, planData);
        console.log('[launch-game] Plan Sol écrit :', res.fileName, '→ slot', res.slotIndex);
        sessionData.solPlanSlot = res.slotIndex;
      } else {
        console.warn('[launch-game] Aucun planData Sol généré — fallback race.ini');
      }
    } catch (err) {
      console.error('[launch-game] Erreur plan Sol :', err);
      // ⚠️ On ne bloque PAS le lancement : race.ini continuera de fonctionner
      //    avec la météo Sol choisie (comportement du Cas 3).
    }
  }

  // --- Cas 3 : Sol seul (sans Planner) → météo Sol directe via race.ini
  if (useSolWeather) {
    console.log('[launch-game] Sol installé (sans Sol Planner) → météo Sol directe, skip PurePlanner');
    sessionData.weatherMode = 'static';
    if (!sessionData.weather || !/^sol_/i.test(sessionData.weather)) {
      console.warn('[launch-game] Météo non-Sol détectée, fallback sol_01_clear');
      sessionData.weather = 'sol_01_clear';
    }
    console.log('[launch-game] Météo Sol conservée :', sessionData.weather);
  }

  if (useKunosFallback) {
    console.log('[launch-game] Ni Pure ni Sol → mode dégradé (météo Kunos classique)');
    const isKunosWeather = typeof sessionData.weather === 'string' && /^\d/.test(sessionData.weather);
    sessionData.weather = isKunosWeather ? sessionData.weather : '3_clear';
    sessionData.weatherMode = 'static';
  }

  if (usePureLogic) {
    try {
      let planValue = null;
      let cmWeatherIndex = 2;

      if (weatherMode === 'custom_plan') {
        if (Array.isArray(sessionData.customPlanSteps) && sessionData.customPlanSteps.length > 0) {
          const { fileName, folder } = writeCustomPurePlan(settings.acPath,
            sessionData.customPlanName || 'MonPlan',
            sessionData.customPlanSteps, sessionStartTime, timeMult, planLoop);
          planValue = `${folder}/${fileName.replace(/\.json$/i, '')}`;
          cmWeatherIndex = 2;
          sessionData.purePlan = planValue;
        }

      } else if (weatherMode === 'existing_plan') {
        if (sessionData.purePlan) {
          const fn = sessionData.purePlan.endsWith('.json') ? sessionData.purePlan : sessionData.purePlan + '.json';
          const folderGuess = sessionData.purePlan.includes('/')
            ? sessionData.purePlan.substring(0, sessionData.purePlan.lastIndexOf('/'))
            : 'Stamp';
          if (activateExistingPurePlan(settings.acPath, fn, timeMult, planLoop)) {
            const baseName = path.basename(fn, '.json');
            planValue = `${folderGuess}/${baseName}`;
            cmWeatherIndex = 2;
            sessionData.purePlan = planValue;
          }
        }

      } else {
        const staticWeather = sessionData.weather || 'sol_01_clear';
        const { fileName, folder } = writeStaticPurePlan(settings.acPath, staticWeather, sessionStartTime, timeMult);
        planValue = `${folder}/${fileName.replace(/\.json$/i, '')}`;
        cmWeatherIndex = getPureCtrlCmWeather(staticWeather);
        sessionData.purePlan = staticWeather;
        console.log('[launch-game] Météo fixe :', staticWeather,
                    '→ PLAN =', planValue, '/ CM_WEATHER =', cmWeatherIndex);
      }

      writePureCtrlIni(documentsPath, sessionData.pureCtrl || {}, planValue, cmWeatherIndex);
    } catch (err) {
      console.error("Erreur plan Pure :", err);
      throw new Error("Échec écriture plan Pure : " + err.message);
    }
  }

  // ⭐ Lit le CONTROLLER depuis weather_fx.ini (source de vérité pour Sol/Pure)
  let weatherController = null;
  try {
    const wfxPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension', 'weather_fx.ini');
    if (fs.existsSync(wfxPath)) {
      const wfxContent = fs.readFileSync(wfxPath, 'utf8');
      const m = wfxContent.match(/^\s*CONTROLLER\s*=\s*(.*)$/m);
      if (m && m[1].trim()) weatherController = m[1].trim();
    }
  } catch (e) { /* ignore */ }

  // Fallback : si Sol installé et rien dans weather_fx.ini → sol2
  const solInstalled = fs.existsSync(path.join(settings.acPath, 'extension', 'weather', 'sol', 'manifest.ini'));
  if (!weatherController && solInstalled) weatherController = 'sol2';

  sessionData.weatherController = weatherController;
  console.log('[launch-game] __CM_WEATHER_CONTROLLER =', weatherController || '(aucun)');

  settings.nationality = sessionData.nationality || 'France';
  settings.nationCode = sessionData.nationCode || 'FRA';

  try {
    writeRaceConfig(settings.acPath, sessionData, settings, content.cars || [], { noCsp: !caps.hasCSP });
  } catch (err) {
    console.error("Erreur race.ini :", err);
    throw new Error("Échec race.ini : " + err.message);
  }

  try {
    const carObj = (content.cars || []).find(c => c.id === sessionData.car);
    const trackObj = (content.tracks || []).find(t => t.id === sessionData.track);
    const skinObj = carObj?.skins?.find(s => s.id === sessionData.skin);
    const variantObj = trackObj?.variants?.find(v => v.id === sessionData.layout);

    const preview = skinObj?.preview || carObj?.preview || '';

    let weatherDisplay = '';
    if (weatherMode === 'custom_plan') {
      weatherDisplay = `Plan perso (${(sessionData.customPlanSteps || []).length} étapes)`;
    } else if (weatherMode === 'existing_plan') {
      weatherDisplay = `Plan : ${sessionData.purePlan || '—'}`;
    } else {
      weatherDisplay = sessionData.weather || '—';
    }

    const entry = {
      id: 'sess_' + Date.now(),
      date: Date.now(),
      car: sessionData.car,
      carName: carObj?.name || sessionData.car,
      skin: sessionData.skin || '',
      skinName: skinObj?.name || sessionData.skin || '',
      preview: preview,
      track: sessionData.track,
      trackName: trackObj?.name || sessionData.track,
      variant: sessionData.layout || '',
      variantName: variantObj?.name || '',
      sessionType: sessionData.sessionType || 'RACE',
      laps: sessionData.laps || 0,
      opponentsCount: sessionData.opponentsCount || 0,
      weatherMode: weatherMode,
      weatherDisplay: weatherDisplay,
      sessionStartTime: sessionStartTime,
      timeMult: timeMult,
      sessionData: { ...sessionData }
    };

    let list = getSessionHistory();
    list.unshift(entry);
    if (list.length > 100) list.length = 100;
    saveSessionHistory(list);

    event.sender.send('session-history-updated');
  } catch (e) {
    console.error('[SessionHistory] Erreur enregistrement:', e);
  }

  // ⚠️ INDISPENSABLE : variables Steam pour qu'AC honore le race.ini
  // (même fix que join-server, sinon AC démarre sur le menu principal)
  const steamEnv = {
    ...process.env,
    SteamAppId: '244210',
    SteamGameId: '244210'
  };

  const acExePath = path.join(settings.acPath, 'acs.exe');
  if (fs.existsSync(acExePath)) {
    try {
      const child = spawn(acExePath, [], {
        cwd: settings.acPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: steamEnv
      });
      child.unref();
      return { success: true };
    } catch (e) {
      throw new Error("Impossible de lancer acs.exe : " + e.message);
    }
  } else {
    try {
      spawn('cmd', ['/c', 'start', 'steam://rungameid/244210'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      return { success: true };
    } catch (e) {
      throw new Error("Impossible de lancer AC via Steam : " + e.message);
    }
  }
});

/* ============================================================
   IPC — SERVEURS EN LIGNE (GS4u scraping)
   ============================================================ */
const GS4U_URL_BASE = 'https://www.gs4u.net/en/assettocorsa/page-';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QACRL/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} sur ${url}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(15000, function() { this.destroy(new Error('Timeout')); });
  });
}

function httpGetJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON invalide : ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Timeout')); });
  });
}

function httpGetRaw(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Timeout')); });
  });
}

function parseGS4uPage(html) {
  const servers = [];
  const rowRegex = /<tr[^>]*data-server-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const serverId = m[1];
    const row = m[2];

    const ratingMatch = row.match(/<td class="rating">[\s\S]*?<span[^>]*title="Rating (\d+)"[\s\S]*?<\/td>/);
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;

    const servernameMatch = row.match(/<td class="servername">[\s\S]*?<a[^>]*title="([^"]+)"[^>]*>([^<]+)<\/a>/);
    let serverName = '';
    if (servernameMatch) {
      serverName = servernameMatch[2].trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    }

    const playersMatch = row.match(/<td class="players">(\d+)&nbsp;\/&nbsp;(\d+)<\/td>/);
    const playersCurrent = playersMatch ? parseInt(playersMatch[1], 10) : 0;
    const playersMax = playersMatch ? parseInt(playersMatch[2], 10) : 0;

    const countryMatch = row.match(/<td class="contryname">[\s\S]*?<span class="flagicon16 ([a-z]{2})[^"]*" title="([^"]+)"/);
    const countryCode = countryMatch ? countryMatch[1] : '';
    const countryName = countryMatch ? countryMatch[2] : '';

    const ipPortMatch = row.match(/<td class="ipport">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    let ipPort = ipPortMatch ? ipPortMatch[1].trim() : '';
    let ip = '', port = 0;
    if (ipPort) {
      const parts = ipPort.split(':');
      ip = parts[0] || '';
      port = parseInt(parts[1], 10) || 0;
    }

    const mapMatch = row.match(/<td class="mapname">[\s\S]*?<a[^>]*title="[^"]*?:\s*([^"]+)"/);
    const mapRaw = mapMatch ? mapMatch[1].trim() : '';

    if (ip && port) {
      servers.push({
        id: serverId,
        name: serverName || `Serveur #${serverId}`,
        rating,
        playersCurrent,
        playersMax,
        countryCode,
        countryName,
        ip,
        port,
        httpPort: port + 1,
        map: mapRaw,
        source: 'gs4u'
      });
    }
  }
  return servers;
}

ipcMain.handle('fetch-online-servers', async (event, page) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const url = GS4U_URL_BASE + pageNum;
  try {
    const html = await httpsGet(url);
    const servers = parseGS4uPage(html);

    let hasNext = false;
    const lastPageMatch = html.match(/page-(\d+)"[^>]*class="page-link"/g);
    if (lastPageMatch) {
      const pages = lastPageMatch.map(s => parseInt(s.match(/page-(\d+)/)[1], 10));
      hasNext = Math.max(...pages) > pageNum;
    }
    return { success: true, page: pageNum, servers, hasNext };
  } catch (err) {
    console.error('[fetch-online-servers]', err);
    return { success: false, error: err.message, servers: [] };
  }
});

/* ============================================================
   IPC — DÉTAILS SERVEUR via /INFO
   ============================================================ */
ipcMain.handle('fetch-server-info', async (event, ip, port) => {
  if (!ip || !port) return { success: false, error: "IP ou port manquant." };

  const candidatePorts = [port, port + 1];
  let lastError = null;

  for (const p of candidatePorts) {
    try {
      const url = `http://${ip}:${p}/INFO`;
      const data = await httpGetJson(url, 5000);

      const cleaned = cleanTrackPath(data.track);

      return {
        success: true,
        queriedPort: p,
        gamePort: parseInt(data.tport, 10) || parseInt(data.port, 10) || 0,
        httpPort: parseInt(data.cport, 10) || p,
        name: data.name || '',
        track: cleaned.track,
        trackConfig: cleaned.trackConfig,
        trackFull: cleaned.trackFull,
        cars: Array.isArray(data.cars) ? data.cars : [],
        clients: parseInt(data.clients, 10) || 0,
        maxClients: parseInt(data.maxclients, 10) || 0,
        passwordRequired: !!data.pass,
        session: data.session,
        sessionTypes: data.sessiontypes || [],
        timeLeft: data.timeleft || 0
      };
    } catch (e) {
      lastError = e;
    }
  }

  return { success: false, error: lastError ? lastError.message : "Serveur injoignable." };
});

/* ============================================================
   IPC — DÉTAILS ÉTENDUS via /api/details (AssettoServer)
   ============================================================ */
function computeSlotsFromCarsArray(carsArr) {
  const slotsByCar = {};
  if (!Array.isArray(carsArr)) return slotsByCar;

  for (const entry of carsArr) {
    const model = entry && entry.Model ? String(entry.Model) : '';
    if (!model) continue;
    // ⚠️ On ne compte QUE les entrées d'EntryList (les autres ne sont pas jouables)
    if (entry.IsEntryList === false) continue;
    if (!slotsByCar[model]) slotsByCar[model] = { max: 0, used: 0, free: 0 };
    slotsByCar[model].max += 1;
    if (entry.IsConnected === true) slotsByCar[model].used += 1;
  }

  for (const car of Object.keys(slotsByCar)) {
    slotsByCar[car].free = Math.max(0, slotsByCar[car].max - slotsByCar[car].used);
  }
  return slotsByCar;
}

ipcMain.handle('fetch-server-details', async (event, ip, basePort, gamePort) => {
  if (!ip) return { success: false, error: 'IP manquante.' };

  const candidates = [];
  const push = (p) => {
    const n = parseInt(p, 10);
    if (n && n > 0 && n < 65536 && !candidates.includes(n)) candidates.push(n);
  };
  push(basePort);
  if (gamePort) push(parseInt(gamePort, 10) + 1);
  push(gamePort);
  if (basePort) { push(parseInt(basePort, 10) + 1); push(parseInt(basePort, 10) - 1); }

  let lastError = null;
  for (const p of candidates) {
    try {
      const url = `http://${ip}:${p}/api/details`;
      const data = await httpGetJson(url, 4000);

      if (!data || typeof data !== 'object') {
        lastError = new Error(`Port ${p} : réponse vide`);
        continue;
      }

      const cleanedTrack = cleanTrackPath(data.track || data.trackBase || '');
      const carsList = Array.isArray(data.cars) ? data.cars : [];

      const slotsByCar = computeSlotsFromCarsArray(
        data.players && Array.isArray(data.players.Cars) ? data.players.Cars : []
      );

      const driversConnected = [];
      if (data.players && Array.isArray(data.players.Cars)) {
        for (const c of data.players.Cars) {
          if (c && c.IsConnected === true && c.DriverName) {
            driversConnected.push(String(c.DriverName));
          }
        }
      }

      return {
		success: true,
		usedPort: p,
		details: {
		  name: data.name || '',
		  description: data.description || '',
		  track: cleanedTrack.track,
		  trackConfig: cleanedTrack.trackConfig,
		  trackFull: cleanedTrack.trackFull,
		  cars: carsList,
		  slotsByCar: slotsByCar,
		  drivers: driversConnected,
		  gamePort: parseInt(data.tport, 10) || parseInt(data.port, 10) || 0,
		  httpPort: parseInt(data.cport, 10) || p,
		  clients: parseInt(data.clients, 10) || 0,
		  maxClients: parseInt(data.maxclients, 10) || 0,
		  passwordRequired: !!data.pass,
		  currentWeatherId: data.currentWeatherId || '',
		  ambientTemperature: data.ambientTemperature,
		  roadTemperature: data.roadTemperature,
		  windSpeed: data.windSpeed,
		  windDirection: data.windDirection,
		  grip: data.grip,
		  poweredBy: data.poweredBy || '',
		  country: Array.isArray(data.country) ? data.country : [],
		  features: Array.isArray(data.features) ? data.features : [],
		  city: data.city || '',
		  frequency: data.frequency,
		  until: data.until
		}
	  };
    } catch (e) {
      lastError = e;
    }
  }

  console.warn('[fetch-server-details] échec sur tous les ports :', candidates, '/ dernière erreur :', lastError?.message);
  return { success: false, error: lastError ? lastError.message : 'Aucun port ne répond.' };
});

/* ============================================================
   IPC — PING serveur (test rapide /INFO avec timeout 2s)
   ============================================================ */
ipcMain.handle('ping-server', async (event, ip, port) => {
  if (!ip || !port) return { success: false, error: 'IP ou port manquant' };
  const candidatePorts = [port, port + 1];
  const startedAt = Date.now();
  for (const p of candidatePorts) {
    try {
      const url = `http://${ip}:${p}/INFO`;
      await httpGetJson(url, 2000);
      const ms = Date.now() - startedAt;
      return { success: true, ms };
    } catch (e) {}
  }
  return { success: false, error: 'Injoignable', ms: null };
});

/* ============================================================
   IPC — OCCUPATION SERVEUR via /ENTRY (fallback pour vieux serveurs)
   ============================================================ */
function parseEntryFile(text) {
  const slotsByCar = {};
  const firstTableMatch = text.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!firstTableMatch) return slotsByCar;
  const tableHtml = firstTableMatch[1];

  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const allDrivers = [];

  for (const rowHtml of rows) {
    const cells = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = tdRegex.exec(rowHtml)) !== null) {
      const val = m[1].replace(/<[^>]+>/g, '').trim();
      cells.push(val);
    }

    if (cells.length < 4) continue;
    const id = parseInt(cells[0], 10);
    if (isNaN(id)) continue;

    const driver = cells[1] || '';
    const car = cells[2] || '';
    const team = cells[3] || '';
    const ping = cells[4] || '';
    if (!car) continue;

    if (!slotsByCar[car]) slotsByCar[car] = { max: 0, used: 0, free: 0 };
    slotsByCar[car].max += 1;

    const isDisconnected = /^DC$/i.test(team) || /^DC$/i.test(ping);
    if (driver && !isDisconnected) slotsByCar[car].used += 1;

    if (driver) allDrivers.push(driver);
  }

  for (const car of Object.keys(slotsByCar)) {
    slotsByCar[car].free = Math.max(0, slotsByCar[car].max - slotsByCar[car].used);
  }

  return { slotsByCar, drivers: allDrivers };
}

ipcMain.handle('fetch-server-occupancy', async (event, ip, basePort, gamePort) => {
  if (!ip) return { success: false, error: "IP manquante.", slotsByCar: {}, drivers: [] };

  const candidates = [];
  const push = (p) => {
    const n = parseInt(p, 10);
    if (n && n > 0 && n < 65536 && !candidates.includes(n)) candidates.push(n);
  };
  push(basePort);
  if (gamePort) push(parseInt(gamePort, 10) + 1);
  push(gamePort);
  if (gamePort) push(parseInt(gamePort, 10) - 1);
  if (basePort) { push(parseInt(basePort, 10) + 1); push(parseInt(basePort, 10) - 1); }

  let lastError = null;
  for (const p of candidates) {
    try {
      const url = `http://${ip}:${p}/ENTRY`;
      const text = await httpGetRaw(url, 4000);
      if (!text || !/Entry List/i.test(text)) {
        lastError = new Error(`Port ${p} : pas de Entry List`);
        continue;
      }
      const result = parseEntryFile(text);
      return { success: true, usedPort: p, slotsByCar: result.slotsByCar, drivers: result.drivers };
    } catch (e) {
      lastError = e;
    }
  }

  return { success: false, error: lastError?.message || 'Aucun port ne répond.', slotsByCar: {}, drivers: [] };
});

/* ============================================================
   IPC — CONNEXION SERVEUR (écriture race.ini [REMOTE])
   ============================================================ */
function writeRemoteServerInRaceIni(documentsPath, serverData, sessionData) {
  const raceIniPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'race.ini');
  if (!fs.existsSync(raceIniPath)) {
    throw new Error("race.ini introuvable : " + raceIniPath);
  }

  let content = fs.readFileSync(raceIniPath, 'utf8');

  const onlineNameRaw = (sessionData.onlineName || '').trim() || sessionData.driverName || 'Player';
  const onlineName = onlineNameRaw.replace(/[\r\n=]/g, '');
  const guid = (sessionData.steamId || '').trim() || '';
  const carId = sessionData.car || '';
  const skinId = sessionData.skin || '';
  const password = (sessionData.password || '').trim();

  const DEFAULT_CSP_FEATURES = [
    'WEATHERFX_V1',
    'SPECTATING_AWARE',
    'LOWER_CLIENTS_SENDING_RATE',
    'EMOJI',
    'CLIENT_MESSAGES',
    'CUSTOM_UPDATE'
  ];

  const serverFeatures = Array.isArray(serverData.features) && serverData.features.length > 0
    ? serverData.features
    : DEFAULT_CSP_FEATURES;

  // ⚠️ Aucune tabulation : on construit les lignes avec un tableau
  const remoteLines = [
    '[REMOTE]',
    'ACTIVE=1',
    'SERVER_IP=' + serverData.ip,
    'SERVER_PORT=' + serverData.port,
    'SERVER_NAME=' + (serverData.name || '').replace(/[\r\n=]/g, ' '),
    'SERVER_HTTP_PORT=' + (serverData.httpPort || (serverData.port + 1)),
    'REQUESTED_CAR=' + carId,
    'REQUESTED_SKIN=' + skinId,
    'GUID=' + guid,
    'NAME=' + onlineName,
    '__CM_EXTENDED=1',
    '__FEATURES=' + serverFeatures.join(',')
  ];
  if (password) remoteLines.push('PASSWORD=' + password);
  const remoteSection = remoteLines.join('\n') + '\n';

  if (/\[REMOTE\]/.test(content)) {
    content = content.replace(/\[REMOTE\][\s\S]*?(?=\n\[|$)/, remoteSection);
  } else {
    content = content.trimEnd() + '\n\n' + remoteSection;
  }

  const track = serverData.track || '';
  const trackConfig = serverData.trackConfig || '';
  const serverIpLine = serverData.ip + ':' + serverData.port;

  function setRaceKey(ini, key, value) {
    const raceRe = /\[RACE\]([\s\S]*?)(?=\n\[|$)/;
    const raceMatch = ini.match(raceRe);
    if (!raceMatch) return ini;
    const raceBody = raceMatch[1];
    const keyRe = new RegExp('^' + key + '=.*$', 'm');
    let newRaceBody;
    if (keyRe.test(raceBody)) {
      newRaceBody = raceBody.replace(keyRe, key + '=' + value);
    } else {
      newRaceBody = raceBody.trimEnd() + '\n' + key + '=' + value;
    }
    return ini.replace(raceRe, '[RACE]' + newRaceBody);
  }

  if (carId) content = setRaceKey(content, 'MODEL', carId);
  if (sessionData.skin) content = setRaceKey(content, 'SKIN', sessionData.skin);
  if (track) content = setRaceKey(content, 'TRACK', track);
  if (trackConfig !== undefined) content = setRaceKey(content, 'CONFIG_TRACK', trackConfig);
  content = setRaceKey(content, 'SERVER_IP', serverIpLine);

  const sessionLines = [
    '[SESSION_0]',
    'NAME=Nothing',
    'TYPE=1',
    'DURATION_MINUTES=0',
    'SPAWN_SET=PIT'
  ];
  const sessionBlock = sessionLines.join('\n') + '\n';

  if (/\[SESSION_0\]/.test(content)) {
    content = content.replace(/\[SESSION_0\][\s\S]*?(?=\n\[|$)/, sessionBlock);
  } else {
    content = content.trimEnd() + '\n\n' + sessionBlock;
  }

  fs.writeFileSync(raceIniPath, content, 'utf8');
  return true;
}

async function resolveServerHost(host) {
  if (!host) return host;
  // Si c'est déjà une IP, on la renvoie telle quelle
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return host;
  try {
    const result = await dns.lookup(host);
    console.log('[resolveServerHost]', host, '→', result.address);
    return result.address;
  } catch (e) {
    console.warn('[resolveServerHost] échec résolution', host, ':', e.message);
    return host; // fallback : on garde le hostname
  }
}

ipcMain.handle('join-server', async (event, serverData, sessionData) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");

  const { path: documentsPath } = resolveDocumentsPath(settings);

  if (!serverData || !serverData.ip || !serverData.port) {
    throw new Error("Données serveur invalides.");
  }

    const resolvedIp = await resolveServerHost(serverData.ip);
  const serverDataForIni = { ...serverData, ip: resolvedIp };
  writeRemoteServerInRaceIni(documentsPath, serverDataForIni, sessionData || {});

  // ⚠️ INDISPENSABLE : variables Steam pour qu'AC honore [REMOTE] ACTIVE=1
  // Sans ça, AC se lance en solo même avec un race.ini parfait.
  // (c'est aussi ce qui permet à CSP de décrypter certains modèles)
  const steamEnv = {
    ...process.env,
    SteamAppId: '244210',
    SteamGameId: '244210'
  };

  const acExePath = path.join(acPath, 'acs.exe');
  if (fs.existsSync(acExePath)) {
    try {
      const child = spawn(acExePath, [], {
        cwd: acPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: steamEnv
      });
      child.unref();
      return { success: true };
    } catch (e) {
      throw new Error("Impossible de lancer acs.exe : " + e.message);
    }
  } else {
    try {
      spawn('cmd', ['/c', 'start', 'steam://rungameid/244210'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      return { success: true };
    } catch (e) {
      throw new Error("Impossible de lancer AC via Steam : " + e.message);
    }
  }
});

/* ============================================================
   INSTALLATION DE MODS
   ============================================================ */
function getArchiveTool() {
  const candidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe'
  ];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', '7-Zip', '7z.exe'));
  if (process.env.ProgramW6432) candidates.push(path.join(process.env.ProgramW6432, '7-Zip', '7z.exe'));
  for (const exe of candidates) if (fs.existsSync(exe)) return { type: '7z', exe };
  try {
    const out = execSync('where 7z', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
    const first = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
    if (first && fs.existsSync(first)) return { type: '7z', exe: first };
  } catch (e) {}
  return { type: 'admzip' };
}

function extractArchive(filePath, destDir) {
  const ext = path.extname(filePath).toLowerCase();
  const tool = getArchiveTool();
  if (tool.type === '7z') {
    return new Promise((resolve, reject) => {
      exec(`"${tool.exe}" x "${filePath}" -o"${destDir}" -y`, { maxBuffer: 200 * 1024 * 1024 }, (error) => {
        if (error) return reject(new Error("Échec 7-Zip : " + error.message));
        resolve();
      });
    });
  }
  if (ext !== '.zip') throw new Error("Format non supporté sans 7-Zip.");
  try { const zip = new AdmZip(filePath); zip.extractAllTo(destDir, true); }
  catch (e) { throw new Error("Échec .zip : " + e.message); }
  return Promise.resolve();
}

function findUiJson(dir, jsonName) {
  const uiDir = path.join(dir, 'ui');
  if (!fs.existsSync(uiDir)) return false;
  if (fs.existsSync(path.join(uiDir, jsonName))) return true;
  try {
    for (const e of fs.readdirSync(uiDir, { withFileTypes: true }))
      if (e.isDirectory() && fs.existsSync(path.join(uiDir, e.name, jsonName))) return true;
  } catch (e) {}
  return false;
}

function buildInstallPlan(tempDir, acPath) {
  const plan = [];
  const seen = new Set();
  function tryDetect(dir, depth) {
    if (seen.has(dir) || depth > 8) return !!seen.has(dir);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return false; }
    const dirName = path.basename(dir).toLowerCase();
    if (dirName === 'content') {
      const subNames = entries.filter(e => e.isDirectory()).map(e => e.name.toLowerCase());
      if (subNames.includes('cars') || subNames.includes('tracks')) {
        const carsDir = path.join(dir, 'cars');
        const tracksDir = path.join(dir, 'tracks');
        if (fs.existsSync(carsDir)) for (const e of fs.readdirSync(carsDir, { withFileTypes: true }))
          if (e.isDirectory()) { const src = path.join(carsDir, e.name);
            plan.push({ kind: 'car', src, dest: path.join(acPath, 'content', 'cars', e.name), label: `Voiture : ${e.name}` });
            seen.add(src); }
        if (fs.existsSync(tracksDir)) for (const e of fs.readdirSync(tracksDir, { withFileTypes: true }))
          if (e.isDirectory()) { const src = path.join(tracksDir, e.name);
            plan.push({ kind: 'track', src, dest: path.join(acPath, 'content', 'tracks', e.name), label: `Circuit : ${e.name}` });
            seen.add(src); }
        seen.add(dir); return true;
      }
    }
    if ((dirName === 'apps' || dirName === 'extension' || dirName === 'system') && !seen.has(dir)) {
      for (const e of entries) { const src = path.join(dir, e.name);
        plan.push({ kind: dirName, src, dest: path.join(acPath, dirName, e.name), label: `${dirName}/${e.name}` });
        seen.add(src); }
      seen.add(dir); return true;
    }
    const hasKn5 = entries.some(e => e.isFile() && e.name.toLowerCase().endsWith('.kn5'));
    if (hasKn5) {
      const hasCar = findUiJson(dir, 'ui_car.json');
      const hasTrack = findUiJson(dir, 'ui_track.json');
      if (hasCar && !hasTrack) { plan.push({ kind: 'car', src: dir, dest: path.join(acPath, 'content', 'cars', path.basename(dir)), label: `Voiture : ${path.basename(dir)}` }); seen.add(dir); return true; }
      if (hasTrack && !hasCar) { plan.push({ kind: 'track', src: dir, dest: path.join(acPath, 'content', 'tracks', path.basename(dir)), label: `Circuit : ${path.basename(dir)}` }); seen.add(dir); return true; }
    }
    return false;
  }
  function walk(dir, depth) {
    if (tryDetect(dir, depth)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
  }
  walk(tempDir, 0);
  return plan;
}

function countFilesInTree(src) {
  let count = 0, stat;
  try { stat = fs.statSync(src); } catch (e) { return 0; }
  if (stat.isDirectory()) {
    let entries;
    try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch (e) { return 0; }
    for (const e of entries) count += countFilesInTree(path.join(src, e.name));
  } else count = 1;
  return count;
}

function copyRecursive(src, dest, onFile) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true }))
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name), onFile);
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
    if (onFile) onFile(path.basename(dest));
  }
}

ipcMain.handle('install-mod', async (event, filePath) => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error("Dossier AC non configuré.");
  if (!filePath || !fs.existsSync(filePath)) throw new Error("Fichier introuvable.");
  const tempDir = path.join(os.tmpdir(), `ac_launcher_extract_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    event.sender.send('install-mod-progress', { status: 'Décompression...', percent: 5, copiedFiles: 0, totalFiles: 0 });
    await extractArchive(filePath, tempDir);
    event.sender.send('install-mod-progress', { status: 'Analyse...', percent: 20, copiedFiles: 0, totalFiles: 0 });
    const plan = buildInstallPlan(tempDir, acPath);
    if (plan.length === 0) throw new Error("Aucun contenu valide détecté.");
    const conflicts = plan.filter(p => fs.existsSync(p.dest));
    let conflictMode = 'replace';
    if (conflicts.length > 0) {
      const detail = conflicts.slice(0, 15).map(c => '• ' + c.label).join('\n') + (conflicts.length > 15 ? `\n… et ${conflicts.length - 15} autre(s)` : '');
      const { response } = await dialog.showMessageBox({
        type: 'warning', buttons: ['Remplacer','Passer','Annuler'], defaultId: 0, cancelId: 2, noLink: true,
        title: 'Conflits', message: `${conflicts.length} élément(s) déjà présent(s).`, detail
      });
      if (response === 2) return { success: false, cancelled: true, installed: [], skipped: [] };
      conflictMode = (response === 0) ? 'replace' : 'skip';
    }
    const toInstall = conflictMode === 'skip' ? plan.filter(p => !fs.existsSync(p.dest)) : plan;
    const skipped = conflictMode === 'skip' ? plan.filter(p => fs.existsSync(p.dest)) : [];
    if (toInstall.length === 0) return { success: true, cancelled: false, installed: [], skipped: skipped.map(p => ({ kind: p.kind, name: p.label })), carsCount: 0, tracksCount: 0, extrasCount: 0, skippedCount: skipped.length };

    let totalFiles = 0;
    for (const p of toInstall) totalFiles += countFilesInTree(p.src);
    let copied = 0, lastEmit = 0;
    const emitProgress = (fileName) => {
      const now = Date.now();
      if (copied < totalFiles && now - lastEmit < 80) return;
      lastEmit = now;
      const percent = totalFiles > 0 ? Math.min(99, 30 + Math.floor((copied / totalFiles) * 68)) : 30;
      event.sender.send('install-mod-progress', { status: `Copie : ${fileName}`, percent, copiedFiles: copied, totalFiles });
    };
    for (const p of toInstall) {
      if (fs.existsSync(p.dest) && conflictMode === 'replace') {
        try {
          const stat = fs.statSync(p.dest);
          if (stat.isDirectory()) fs.rmSync(p.dest, { recursive: true, force: true });
          else fs.unlinkSync(p.dest);
        } catch (e) {}
      }
      copyRecursive(p.src, p.dest, (name) => { copied++; emitProgress(name); });
    }

    try {
      const historyEntry = {
        id: 'mod_' + Date.now(),
        date: Date.now(),
        filename: path.basename(filePath),
        items: toInstall.map(p => {
          const itemId = path.basename(p.dest);
          return {
            kind: p.kind,
            id: itemId,
            name: getItemName(p.dest, p.kind),
            dest: p.dest,
            preview: getPreviewForItem(p.dest, p.kind)
          };
        })
      };
      const history = getModsHistory();
      history.unshift(historyEntry);
      if (history.length > 50) history.length = 50;
      saveModsHistory(history);
      event.sender.send('mods-history-updated');
    } catch (e) {
      console.error('[ModsHistory] sauvegarde échouée:', e);
    }

    event.sender.send('install-mod-progress', { status: 'Installation réussie !', percent: 100, copiedFiles: totalFiles, totalFiles });
    return {
      success: true, cancelled: false,
      installed: toInstall.map(p => ({ kind: p.kind, name: p.label })),
      skipped: skipped.map(p => ({ kind: p.kind, name: p.label })),
      carsCount: toInstall.filter(p => p.kind === 'car').length,
      tracksCount: toInstall.filter(p => p.kind === 'track').length,
      extrasCount: toInstall.filter(p => ['apps','extension','system'].includes(p.kind)).length,
      skippedCount: skipped.length
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
});

ipcMain.handle('analyze-hardware', async () => ({ detectedHardware: { gpu: "NVIDIA RTX" }, preset: "Élevé" }));


/* ============================================================
   IPC — FICHIERS INI (controls / video / audio)
   ============================================================ */

// Whitelist stricte des INI éditables (sécurité : pas de chemin arbitraire)
const EDITABLE_INI_FILES = ['controls.ini', 'video.ini', 'audio.ini'];

function getCfgIniPath(documentsPath, filename) {
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', filename);
}

ipcMain.handle('read-ini-file', async (event, filename) => {
  if (!EDITABLE_INI_FILES.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const filePath = getCfgIniPath(documentsPath, filename);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'Fichier introuvable : ' + filePath, path: filePath };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, path: filePath, content };
  } catch (e) {
    return { success: false, error: e.message, path: filePath };
  }
});

ipcMain.handle('write-ini-file', async (event, filename, content) => {
  if (!EDITABLE_INI_FILES.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Contenu invalide (string attendu).' };
  }
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const filePath = getCfgIniPath(documentsPath, filename);

  try {
    // ⭐ Crée le dossier parent si absent (install vierge où AC n'a jamais été lancé)
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Backup automatique avant chaque écriture
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + '.bak');
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message, path: filePath };
  }
});

/* ============================================================
   IPC — CONTRÔLEURS / PROFILS DE CONTRÔLES (v1.5.0)
   ------------------------------------------------------------
   Structure sur disque :
     <Documents>/Assetto Corsa/cfg/controllers/
       ├── <iguid>.ini              ← config par device (auto-généré par AC)
       └── savedsetups/
             ├── mon_profil.ini     ← profils complets sauvegardés
             └── ...
   ============================================================ */

const CONTROLLER_INPUT_METHODS = ['WHEEL', 'GAMEPAD', 'KEYBOARD'];
const CONTROLLER_SETUP_NAME_MAX = 80;

function getControllersDir(documentsPath) {
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', 'controllers');
}
function getSavedSetupsDir(documentsPath) {
  return path.join(getControllersDir(documentsPath), 'savedsetups');
}
function getControlsIniPath(documentsPath) {
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', 'controls.ini');
}

// Sanitize d'un nom de profil : retire les caractères interdits Windows.
// AC accepte les espaces, %, tirets, etc. (cf. "camarade35_ffb_60%_last.ini")
function sanitizeSetupName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, CONTROLLER_SETUP_NAME_MAX);
}

// Parseur INI minimal pour les fichiers controllers (pas d'IniParser côté main)
function parseControllerFile(content) {
  const out = { name: '', product: '', mappings: {} };
  let section = null;
  const lines = String(content || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const secMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (secMatch) { section = secMatch[1].trim(); continue; }
    const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const val = kv[2].trim();
    if (section === 'CONTROLLER') {
      if (key === 'NAME') out.name = val;
      else if (key === 'PRODUCT') out.product = val;
    } else if (section) {
      if (!out.mappings[section]) out.mappings[section] = {};
      out.mappings[section][key] = val;
    }
  }
  return out;
}

// Détermine le type de contrôleur d'après son PGUID (heuristique).
// Sert à filtrer les devices par catégorie dans l'UI.
function guessControllerType(name, product) {
  const n = String(name || '').toLowerCase();
  const p = String(product || '').toLowerCase();
  // Manettes standard
  if (/xbox|gamepad|manette|dualsense|dualshock|joy-?con|nintendo|switch|gpx/.test(n)) return 'gamepad';
  if (/^028e|^045e|^054c|^057e|^0f0d/.test(p)) return 'gamepad';
  // Volants / pédaliers / shifter
  if (/wheel|volant|fanatec|logitech|thrustmaster|racing|shifter|pedal|clutch|csl|club.?sport|csw|g25|g27|g29|g920|t500|f430|csr/.test(n)) return 'wheel';
  if (/^0eb7|^046d|^044f/.test(p)) return 'wheel';
  return 'other';
}

// Liste les devices AC configurés (fichiers .ini directs dans controllers/)
ipcMain.handle('list-ac-controller-devices', async () => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const dir = getControllersDir(documentsPath);

  if (!fs.existsSync(dir)) return { success: true, devices: [], path: dir };

  const devices = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.toLowerCase().endsWith('.ini')) continue;
      const full = path.join(dir, e.name);
      try {
        const content = fs.readFileSync(full, 'utf8');
        const parsed = parseControllerFile(content);
        const iguid = e.name.replace(/\.ini$/i, '');
        const sections = Object.keys(parsed.mappings || {});
        devices.push({
          iguid,
          filename: e.name,
          name: parsed.name || iguid,
          product: parsed.product || '',
          type: guessControllerType(parsed.name, parsed.product),
          sections,
          mappingCount: sections.length,
        });
      } catch (err) {
        console.warn('[list-ac-controller-devices] lecture KO', full, err.message);
      }
    }
  } catch (err) {
    return { success: false, error: err.message, devices: [] };
  }

  // Tri : par type (wheel > gamepad > other), puis par nom
  const order = { wheel: 0, gamepad: 1, other: 2 };
  devices.sort((a, b) => {
    const oa = order[a.type] ?? 9;
    const ob = order[b.type] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });

  return { success: true, devices, path: dir };
});

// Liste les setups sauvegardés dans savedsetups/
ipcMain.handle('list-saved-controller-setups', async () => {
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const dir = getSavedSetupsDir(documentsPath);

  if (!fs.existsSync(dir)) return { success: true, setups: [], path: dir };

  const setups = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.toLowerCase().endsWith('.ini')) continue;
      const full = path.join(dir, e.name);
      try {
        const stat = fs.statSync(full);
        setups.push({
          filename: e.name,
          name: e.name.replace(/\.ini$/i, ''),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch (err) {}
    }
  } catch (err) {
    return { success: false, error: err.message, setups: [] };
  }

  setups.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  return { success: true, setups, path: dir };
});

// Lit le contenu d'un setup sauvegardé
ipcMain.handle('read-controller-setup', async (event, filename) => {
  if (!filename || typeof filename !== 'string') return { success: false, error: 'Nom manquant.' };
  const safe = sanitizeSetupName(filename).replace(/\.ini$/i, '') + '.ini';
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const full = path.join(getSavedSetupsDir(documentsPath), safe);
  if (!fs.existsSync(full)) return { success: false, error: 'Fichier introuvable.' };
  try {
    const content = fs.readFileSync(full, 'utf8');
    return { success: true, filename: safe, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Applique un setup sauvegardé sur controls.ini (avec backup auto)
ipcMain.handle('apply-controller-setup', async (event, filename) => {
  if (!filename || typeof filename !== 'string') return { success: false, error: 'Nom manquant.' };
  const safe = sanitizeSetupName(filename).replace(/\.ini$/i, '') + '.ini';
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const src = path.join(getSavedSetupsDir(documentsPath), safe);
  const dst = getControlsIniPath(documentsPath);

  if (!fs.existsSync(src)) return { success: false, error: 'Setup introuvable : ' + safe };

  try {
    const cfgDir = path.dirname(dst);
    if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

    // Backup auto avant écrasement
    if (fs.existsSync(dst)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.copyFileSync(dst, dst + '.bak-' + stamp);
    }

    fs.copyFileSync(src, dst);
    console.log('[apply-controller-setup] Appliqué', safe, '→', dst);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Sauvegarde l'état actuel de controls.ini en tant que nouveau setup
ipcMain.handle('save-current-as-setup', async (event, name) => {
  const cleanName = sanitizeSetupName(name);
  if (!cleanName) return { success: false, error: 'Nom invalide.' };
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const src = getControlsIniPath(documentsPath);
  const dir = getSavedSetupsDir(documentsPath);
  const dst = path.join(dir, cleanName + '.ini');

  if (!fs.existsSync(src)) return { success: false, error: 'controls.ini introuvable.' };
  if (fs.existsSync(dst)) return { success: false, error: 'Un profil avec ce nom existe déjà.' };

  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dst);
    console.log('[save-current-as-setup] Sauvegardé', cleanName);
    return { success: true, filename: cleanName + '.ini' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Supprime un setup sauvegardé
ipcMain.handle('delete-controller-setup', async (event, filename) => {
  if (!filename || typeof filename !== 'string') return { success: false, error: 'Nom manquant.' };
  const safe = sanitizeSetupName(filename).replace(/\.ini$/i, '') + '.ini';
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const full = path.join(getSavedSetupsDir(documentsPath), safe);
  if (!fs.existsSync(full)) return { success: true, alreadyGone: true };
  try {
    fs.unlinkSync(full);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Écrit INPUT_METHOD dans [HEADER] de controls.ini
ipcMain.handle('set-input-method', async (event, method) => {
  const m = String(method || '').toUpperCase();
  if (!CONTROLLER_INPUT_METHODS.includes(m)) {
    return { success: false, error: 'Méthode inconnue : ' + method };
  }
  const settings = fs.existsSync(settingsFilePath) ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  const file = getControlsIniPath(documentsPath);

  try {
    const cfgDir = path.dirname(file);
    if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

    let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const eol = content.includes('\r\n') ? '\r\n' : '\n';

    if (!content) {
      content = '[HEADER]' + eol + 'INPUT_METHOD=' + m + eol;
    } else {
      const lines = content.split(/\r?\n/);
      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const secMatch = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
        if (secMatch && secMatch[1].trim().toUpperCase() === 'HEADER') { headerIdx = i; break; }
      }
      if (headerIdx < 0) {
        // Insère la section [HEADER] au tout début
        lines.unshift('[HEADER]', 'INPUT_METHOD=' + m, '');
      } else {
        // Cherche INPUT_METHOD dans la section HEADER
        let imIdx = -1;
        for (let i = headerIdx + 1; i < lines.length; i++) {
          if (/^\s*\[/.test(lines[i])) break;
          if (/^\s*INPUT_METHOD\s*=/i.test(lines[i])) { imIdx = i; break; }
        }
        if (imIdx >= 0) lines[imIdx] = 'INPUT_METHOD=' + m;
        else lines.splice(headerIdx + 1, 0, 'INPUT_METHOD=' + m);
      }
      content = lines.join(eol);
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log('[set-input-method] INPUT_METHOD =', m);
    return { success: true, method: m };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — LISTE DES FILTRES POST-PROCESS (ppfilters)
   ============================================================ */
ipcMain.handle('list-ppfilters', async () => {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) {
    return { success: false, error: 'Dossier AC non configuré.', filters: [] };
  }
  const ppDir = path.join(acPath, 'system', 'cfg', 'ppfilters');
  if (!fs.existsSync(ppDir)) {
    return { success: false, error: 'Dossier ppfilters introuvable : ' + ppDir, filters: [] };
  }
  try {
    const entries = fs.readdirSync(ppDir, { withFileTypes: true });
    const filters = [];
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.ini')) {
        filters.push(e.name.replace(/\.ini$/i, ''));
      }
    }
    filters.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    return { success: true, filters, path: ppDir };
  } catch (e) {
    return { success: false, error: e.message, filters: [] };
  }
});

/* ============================================================
   IPC — WEATHER FX STYLE (weather_fx.ini)
   On modifie UNIQUEMENT la ligne IMPLEMENTATION= dans [BASIC].
   - Default    → supprime la ligne
   - Pure Gamma → IMPLEMENTATION=pure
   - Pure LCS   → IMPLEMENTATION=Pure LCS
   ============================================================ */

// ⭐ Chaque style écrit 2 clés dans [BASIC] de weather_fx.ini :
//   impl : IMPLEMENTATION (weather script) — null = supprime la ligne
//   ctrl : CONTROLLER    (controller script) — null = supprime la ligne
// Règles :
//   - Sol style       → pas d'IMPLEMENTATION, juste CONTROLLER=sol2
//   - Default style   → IMPLEMENTATION=base (Kunos)
//   - Pure Gamma/LCS  → IMPLEMENTATION=pure / Pure LCS + CONTROLLER=pureCtrl
const WEATHER_FX_VALUES = {
  'default': { impl: 'base',     ctrl: 'sol2'     },
  'sol':     { impl: null,       ctrl: 'sol2'     },
  'gamma':   { impl: 'pure',     ctrl: 'pureCtrl' },
  'lcs':     { impl: 'Pure LCS', ctrl: 'pureCtrl' },
};

function getWeatherFxActivePath() {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension', 'weather_fx.ini');
}

ipcMain.handle('get-weather-fx-style', async () => {
  const active = getWeatherFxActivePath();
  if (!fs.existsSync(active)) {
    return { success: true, style: 'default', implementation: '', controller: '', path: active };
  }
  try {
    const content = fs.readFileSync(active, 'utf8');
    const implM = content.match(/^\s*IMPLEMENTATION\s*=\s*(.*)$/m);
    const ctrlM = content.match(/^\s*CONTROLLER\s*=\s*(.*)$/m);
    const impl = implM ? implM[1].trim() : '';
    const ctrl = ctrlM ? ctrlM[1].trim().toLowerCase() : '';

    // ⭐ Priorité au CONTROLLER (car Sol n'a pas d'IMPLEMENTATION)
    let style = 'default';
    if (ctrl === 'sol2' || ctrl === 'sol2static' || ctrl === 'sol') {
      style = 'sol';
    } else if (ctrl === 'purectrl') {
      style = /^pure\s*lcs$/i.test(impl) ? 'lcs' : 'gamma';
    } else if (/^pure\s*lcs$/i.test(impl)) {
      style = 'lcs';
    } else if (/^pure$/i.test(impl)) {
      style = 'gamma';
    } else if (/^sol(\s|$|_)/i.test(impl)) {
      style = 'sol';
    }

    return { success: true, style, implementation: impl, controller: ctrl, path: active };
  } catch (e) {
    return { success: false, error: e.message, style: null };
  }
});

ipcMain.handle('set-weather-fx-style', async (event, style) => {
  if (!(style in WEATHER_FX_VALUES)) {
    return { success: false, error: 'Style inconnu : ' + style };
  }
  const values = WEATHER_FX_VALUES[style];
  const newImpl = values.impl;
  const newCtrl = values.ctrl;

  const active = getWeatherFxActivePath();
  const activeDir = path.dirname(active);

  if (!fs.existsSync(activeDir)) {
    try { fs.mkdirSync(activeDir, { recursive: true }); }
    catch (e) { return { success: false, error: 'Créer ' + activeDir + ' : ' + e.message }; }
  }
  if (!fs.existsSync(active)) {
    try { fs.writeFileSync(active, '[BASIC]\n', 'utf8'); }
    catch (e) { return { success: false, error: 'Créer weather_fx.ini : ' + e.message }; }
  }

  try {
    fs.copyFileSync(active, active + '.bak');
    const original = fs.readFileSync(active, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/);

    function setBasicKey(linesArr, keyName, newValue) {
      const keyRe = new RegExp('^\\s*' + keyName + '\\s*=', 'i');
      let idx = -1, inBasic = false;
      for (let i = 0; i < linesArr.length; i++) {
        const secM = linesArr[i].match(/^\s*\[([^\]]+)\]\s*$/);
        if (secM) { inBasic = (secM[1].toUpperCase() === 'BASIC'); continue; }
        if (!inBasic) continue;
        if (keyRe.test(linesArr[i])) { idx = i; break; }
      }
      if (newValue === null) {
        if (idx >= 0) linesArr.splice(idx, 1);
      } else {
        const newLine = keyName + '=' + newValue;
        if (idx >= 0) linesArr[idx] = newLine;
        else {
          const basicIdx = linesArr.findIndex(l => /^\s*\[BASIC\]\s*$/i.test(l));
          if (basicIdx >= 0) linesArr.splice(basicIdx + 1, 0, newLine);
          else linesArr.unshift('[BASIC]', newLine, '');
        }
      }
    }

    setBasicKey(lines, 'IMPLEMENTATION', newImpl);
    setBasicKey(lines, 'CONTROLLER', newCtrl);

    fs.writeFileSync(active, lines.join(eol), 'utf8');
    console.log('[set-weather-fx-style] Style', style, '→ IMPL=' + newImpl + ' / CTRL=' + newCtrl);
    return { success: true, appliedStyle: style, target: active, impl: newImpl, ctrl: newCtrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — AUTO-CONFIG STYLE + FILTRE PP selon ce qui est installé
   ============================================================ */
ipcMain.handle('auto-configure-weather', async () => {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const acPath = settings.acPath;
  const { path: documentsPath } = resolveDocumentsPath(settings);

  if (!acPath || !fs.existsSync(acPath)) {
    return { success: false, error: 'Dossier AC non configuré' };
  }

  // Détection des capacités
  const caps = {
    hasCSP: fs.existsSync(path.join(acPath, 'extension', 'config')),
    hasSol: fs.existsSync(path.join(acPath, 'extension', 'weather', 'sol', 'manifest.ini')),
    hasPure: fs.existsSync(path.join(acPath, 'extension', 'config-ext', 'PurePlanner')),
  };

  // Cible
  let targetStyle, targetFilter;
  if (caps.hasCSP && caps.hasPure) {
    targetStyle = 'gamma';
    targetFilter = 'pure';
  } else if (caps.hasCSP && caps.hasSol) {
    targetStyle = 'sol';
    targetFilter = '__Sol';
  } else {
    targetStyle = 'default';
    targetFilter = 'default';
  }

  const changes = [];

  // --- Weather FX ---
  const wfxPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension', 'weather_fx.ini');
  let currentStyle = 'default';
  if (fs.existsSync(wfxPath)) {
    try {
      const content = fs.readFileSync(wfxPath, 'utf8');
      const implM = content.match(/^\s*IMPLEMENTATION\s*=\s*(.*)$/m);
      const ctrlM = content.match(/^\s*CONTROLLER\s*=\s*(.*)$/m);
      const impl = implM ? implM[1].trim() : '';
      const ctrl = ctrlM ? ctrlM[1].trim().toLowerCase() : '';
      if (['sol2', 'sol2static', 'sol'].includes(ctrl)) currentStyle = 'sol';
      else if (ctrl === 'purectrl') currentStyle = /^pure\s*lcs$/i.test(impl) ? 'lcs' : 'gamma';
      else if (/^pure\s*lcs$/i.test(impl)) currentStyle = 'lcs';
      else if (/^pure$/i.test(impl)) currentStyle = 'gamma';
    } catch (e) { /* ignore */ }
  }

  const styleCoherent = (
    (targetStyle === 'default' && currentStyle === 'default') ||
    (targetStyle === 'sol' && currentStyle === 'sol') ||
    (targetStyle === 'gamma' && (currentStyle === 'gamma' || currentStyle === 'lcs'))
  );

  if (!styleCoherent) {
    const vals = WEATHER_FX_VALUES[targetStyle];
    const dir = path.dirname(wfxPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(wfxPath)) fs.writeFileSync(wfxPath, '[BASIC]\n', 'utf8');

    try {
      fs.copyFileSync(wfxPath, wfxPath + '.bak');
      const original = fs.readFileSync(wfxPath, 'utf8');
      const eol = original.includes('\r\n') ? '\r\n' : '\n';
      let lines = original.split(/\r?\n/);

      const setKey = (key, val) => {
        const keyRe = new RegExp('^\\s*' + key + '\\s*=', 'i');
        let idx = -1, inBasic = false;
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
          if (m) { inBasic = (m[1].toUpperCase() === 'BASIC'); continue; }
          if (!inBasic) continue;
          if (keyRe.test(lines[i])) { idx = i; break; }
        }
        if (val === null) { if (idx >= 0) lines.splice(idx, 1); }
        else {
          const newLine = key + '=' + val;
          if (idx >= 0) lines[idx] = newLine;
          else {
            const bIdx = lines.findIndex(l => /^\s*\[BASIC\]\s*$/i.test(l));
            if (bIdx >= 0) lines.splice(bIdx + 1, 0, newLine);
            else lines.unshift('[BASIC]', newLine, '');
          }
        }
      };
      setKey('IMPLEMENTATION', vals.impl);
      setKey('CONTROLLER', vals.ctrl);
      fs.writeFileSync(wfxPath, lines.join(eol), 'utf8');
      changes.push({ target: 'weather_fx', from: currentStyle, to: targetStyle });
    } catch (e) {
      changes.push({ target: 'weather_fx', error: e.message });
    }
  }

  // --- Filtre PP ---
  const videoPath = path.join(documentsPath, 'Assetto Corsa', 'cfg', 'video.ini');
  let currentFilter = null;
  if (fs.existsSync(videoPath)) {
    currentFilter = readIniValue(videoPath, 'POST_PROCESS', 'FILTER');
  }

  const KUNOS_PP = ['default', 'natural', 'CDimImaged'];
  const isKunos = currentFilter && KUNOS_PP.includes(currentFilter);
  const isSol = currentFilter && /^__sol/i.test(currentFilter);
  const isPure = currentFilter && !isKunos && !isSol;

  const filterCoherent = (
    !currentFilter ? false :
    targetStyle === 'default' ? isKunos :
    targetStyle === 'sol' ? isSol :
    (targetStyle === 'gamma' || targetStyle === 'lcs') ? isPure :
    true
  );

  if (!filterCoherent) {
    try {
      if (!fs.existsSync(videoPath)) throw new Error('video.ini introuvable');
      writeIniValue(videoPath, 'POST_PROCESS', 'FILTER', targetFilter);
      changes.push({ target: 'pp_filter', from: currentFilter, to: targetFilter });
    } catch (e) {
      changes.push({ target: 'pp_filter', error: e.message });
    }
  }

  console.log('[auto-configure-weather] caps=', caps, 'changes=', changes);
  return { success: true, caps, targetStyle, targetFilter, changes };
});
  
  /* ============================================================
   IPC — PROFILS VOLANT (mapping Chromium → AC)
   ============================================================ */
const { createManager: createWheelProfilesManager } = require('./src/wheelProfiles');
const wheelProfiles = createWheelProfilesManager(app.getPath('userData'));

ipcMain.handle('get-wheel-profile', async (event, vendor, product) => {
  return wheelProfiles.getProfile(vendor, product);
});

ipcMain.handle('get-all-wheel-profiles', async () => {
  return wheelProfiles.getAllProfiles();
});

ipcMain.handle('save-wheel-profile', async (event, vendor, product, data) => {
  return wheelProfiles.saveProfile(vendor, product, data);
});

ipcMain.handle('merge-wheel-profile', async (event, vendor, product, axes, source) => {
  return wheelProfiles.mergeAxisMapping(vendor, product, axes, source);
});

ipcMain.handle('delete-wheel-profile', async (event, vendor, product) => {
  return { success: wheelProfiles.deleteProfile(vendor, product) };
});


/* ============================================================
   IPC — RÉSOLUTIONS DISPONIBLES (pour le widget VIDÉO)
   ============================================================ */
ipcMain.handle('list-resolutions', async () => {
  try {
    const { screen } = require('electron');
    const primary = screen.getPrimaryDisplay();
    const nativeW = primary.size.width;
    const nativeH = primary.size.height;

    const standard = [
      [1280, 720], [1366, 768], [1600, 900], [1920, 1080], [1920, 1200],
      [2560, 1080], [2560, 1440], [2560, 1600],
      [3440, 1440], [3840, 1600], [3840, 2160],
      [5120, 1440], [5120, 2880],
    ];

    const list = standard.map(([w, h]) => ({ width: w, height: h, label: `${w} × ${h}` }));

    if (!list.some(r => r.width === nativeW && r.height === nativeH)) {
      list.push({ width: nativeW, height: nativeH, label: `${nativeW} × ${nativeH} (native)` });
    }
    list.sort((a, b) => (a.width - b.width) || (a.height - b.height));
    for (const r of list) {
      if (r.width === nativeW && r.height === nativeH) r.label = `${r.width} × ${r.height} (native)`;
    }
    return { success: true, resolutions: list, native: { width: nativeW, height: nativeH } };
  } catch (e) {
    return { success: false, error: e.message, resolutions: [] };
  }
});


/* ============================================================
   IPC — OPTIONS CAMÉRA (free camera + orbite F5)
   ============================================================ */

function getAcCfgPath() {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) throw new Error('Dossier AC non configuré.');
  return path.join(acPath, 'system', 'cfg');
}

function readIniValue(filePath, sectionName, keyName) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    let inSection = false;
    for (const line of lines) {
      const secMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (secMatch) {
        inSection = (secMatch[1].trim() === sectionName);
        continue;
      }
      if (!inSection) continue;
      const kvMatch = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!kvMatch) continue;
      if (kvMatch[1].trim() === keyName) return kvMatch[2].trim();
    }
    return null;
  } catch (e) { return null; }
}

function writeIniValue(filePath, sectionName, keyName, value) {
  if (!fs.existsSync(filePath)) throw new Error('Fichier introuvable : ' + filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);

  // 1) Cherche la section
  let secIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (m && m[1].trim() === sectionName) { secIdx = i; break; }
  }

  // 2) Section introuvable → on la crée à la fin
  if (secIdx < 0) {
    lines.push('');
    lines.push('[' + sectionName + ']');
    lines.push(keyName + '=' + value);
    fs.copyFileSync(filePath, filePath + '.bak');
    fs.writeFileSync(filePath, lines.join(eol), 'utf8');
    return true;
  }

  // 3) Cherche la clé dans la section
  let keyIdx = -1;
  for (let i = secIdx + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) break;   // nouvelle section → stop
    const m = lines[i].match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (m && m[1].trim() === keyName) { keyIdx = i; break; }
  }

  // 4) Écrit la nouvelle ligne
  const newLine = keyName + '=' + value;
  if (keyIdx >= 0) lines[keyIdx] = newLine;
  else lines.splice(secIdx + 1, 0, newLine);

  fs.copyFileSync(filePath, filePath + '.bak');
  fs.writeFileSync(filePath, lines.join(eol), 'utf8');
  return true;
}

ipcMain.handle('get-free-camera-options', async () => {
  try {
    const cfgDir = getAcCfgPath();
    const fileFree   = path.join(cfgDir, 'assetto_corsa.ini');
    const fileOrbit  = path.join(cfgDir, 'camera_onboard_free.ini');

    const freeCam  = readIniValue(fileFree,  'CAMERA',          'ALLOW_FREE_CAMERA');
    const orbitMode = readIniValue(fileOrbit, 'CAMERA_SETTINGS', 'SPHERICAL_COORDS');

    return {
      success: true,
      allowFreeCamera: freeCam === '1',
      orbitMode: orbitMode === '1',
      fileFree,
      fileOrbit,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('set-free-camera-options', async (event, opts) => {
  try {
    const cfgDir = getAcCfgPath();
    const fileFree  = path.join(cfgDir, 'assetto_corsa.ini');
    const fileOrbit = path.join(cfgDir, 'camera_onboard_free.ini');

    if (typeof opts.allowFreeCamera === 'boolean') {
      writeIniValue(fileFree, 'CAMERA', 'ALLOW_FREE_CAMERA', opts.allowFreeCamera ? '1' : '0');
    }
    if (typeof opts.orbitMode === 'boolean') {
      writeIniValue(fileOrbit, 'CAMERA_SETTINGS', 'SPHERICAL_COORDS', opts.orbitMode ? '1' : '0');
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — ÉTAT ENABLED de weather_fx.ini
   ============================================================ */
function getWeatherFxIniPath() {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension', 'weather_fx.ini');
}

ipcMain.handle('get-weather-fx-enabled', async () => {
  const file = getWeatherFxIniPath();
  if (!fs.existsSync(file)) return { success: false, error: 'weather_fx.ini introuvable' };
  try {
    const content = fs.readFileSync(file, 'utf8');
    const m = content.match(/^\s*ENABLE\s*=\s*(\d+)\s*$/mi);
    // Pas de ligne ENABLE → activé par défaut
    const enabled = !m || m[1] === '1';
    return { success: true, enabled };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('set-weather-fx-enabled', async (event, enabled) => {
  const file = getWeatherFxIniPath();
  if (!fs.existsSync(file)) return { success: false, error: 'weather_fx.ini introuvable' };
  try {
    fs.copyFileSync(file, file + '.bak');
    const original = fs.readFileSync(file, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/);

    const enableRe = /^\s*ENABLE\s*=/i;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (enableRe.test(lines[i])) { idx = i; break; }
    }

    if (enabled) {
      // Activé : on supprime la ligne (AC considère absent = actif)
      if (idx >= 0) lines.splice(idx, 1);
    } else {
      // Désactivé : on écrit ENABLE=0
      if (idx >= 0) lines[idx] = 'ENABLE=0';
      else {
        // Insère dans [BASIC]
        const basicIdx = lines.findIndex(l => /^\s*\[BASIC\]\s*$/i.test(l));
        if (basicIdx >= 0) lines.splice(basicIdx + 1, 0, 'ENABLE=0');
        else lines.unshift('[BASIC]', 'ENABLE=0', '');
      }
    }

    fs.writeFileSync(file, lines.join(eol), 'utf8');
    return { success: true, enabled };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — MODULES CSP (extension/*.ini)
   ============================================================ */

function getCspExtensionPath() {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const { path: documentsPath } = resolveDocumentsPath(settings);
  return path.join(documentsPath, 'Assetto Corsa', 'cfg', 'extension');
}

// Whitelist : uniquement des fichiers .ini directement dans extension/
const CSP_ALLOWED_FILES = [
  'car_instruments.ini', 'chaser_camera.ini', 'chat_shortcuts.ini',
  'custom_rendering_modes.ini', 'dxgi_tweaks.ini', 'extra_fx.ini',
  'ffb_tweaks.ini', 'freer_camera.ini', 'g27_lights.ini', 'gamepad_fx.ini',
  'general.ini', 'graphics_adjustments.ini', 'grass_fx.ini', 'gui.ini',
  'lighting_fx.ini', 'music.ini', 'neck.ini', 'new_behaviour.ini',
  'nice_screenshots.ini', 'particles_fx.ini', 'rain_fx.ini',
  'reflections_fx.ini', 'skidmarks_fx.ini', 'small_tweaks.ini',
  'smart_mirror.ini', 'smart_shadows.ini', 'splashscreen.ini',
  'surfaces_fx.ini', 'taskbar.ini', 'track_adjustments.ini',
  'triple_custom.ini', 'tyres_fx.ini', 'vr_tweaks.ini', 'windscreen_fx.ini',
];

ipcMain.handle('list-csp-modules', async () => {
  const dir = getCspExtensionPath();
  // ⭐ Templates : fallback si le fichier user n'existe pas encore
  let templateDir = null;
  try { templateDir = getCspTemplatePath(); } catch (e) { /* AC non configuré */ }

  if (!fs.existsSync(dir) && !templateDir) {
    return { success: false, error: 'Dossier extension introuvable : ' + dir, modules: [] };
  }

  const modules = [];
  for (const filename of CSP_ALLOWED_FILES) {
    const userPath = path.join(dir, filename);
    const tplPath = templateDir ? path.join(templateDir, filename) : null;

    const hasUser = fs.existsSync(userPath);
    const hasTpl = tplPath && fs.existsSync(tplPath);
    if (!hasUser && !hasTpl) continue;

    const sourcePath = hasUser ? userPath : tplPath;
    const stat = fs.statSync(sourcePath);
    modules.push({
      filename,
      exists: true,
      fromTemplate: !hasUser,
      empty: stat.size === 0,
      size: stat.size,
    });
  }
  return { success: true, modules, path: dir, templateDir };
});

ipcMain.handle('read-csp-module', async (event, filename) => {
  if (!CSP_ALLOWED_FILES.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  const dir = getCspExtensionPath();
  const userPath = path.join(dir, filename);
  let tplPath = null;
  try {
    tplPath = path.join(getCspTemplatePath(), filename);
  } catch (e) { /* AC non configuré */ }

  // ⭐ Priorité au fichier user ; fallback sur le template
  let filePath = null;
  if (fs.existsSync(userPath)) filePath = userPath;
  else if (tplPath && fs.existsSync(tplPath)) filePath = tplPath;

  if (!filePath) {
    return { success: false, error: 'Fichier introuvable : ' + userPath };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const raw = readIniValue(filePath, 'BASIC', 'ENABLED');
    // ⭐ Absence de ligne ENABLED = module ACTIVÉ (pattern CSP standard)
    const enabledBool = (raw === null || raw === undefined || raw === '1');

    return {
      success: true,
      path: filePath,
      fromTemplate: filePath === tplPath,
      content,
      enabled: enabledBool,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ⭐ S'assure que le fichier user existe dans Documents\...\extension\
// Si absent → copie le template depuis <AC>\extension\config\
// Retourne le chemin du fichier user (ou null si impossible)
function ensureUserCspFile(filename) {
  const dir = getCspExtensionPath();
  const userPath = path.join(dir, filename);

  if (fs.existsSync(userPath)) return userPath;

  let tplPath = null;
  try {
    tplPath = path.join(getCspTemplatePath(), filename);
  } catch (e) {
    return null;
  }
  if (!fs.existsSync(tplPath)) return null;

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(tplPath, userPath);
  console.log('[ensureUserCspFile] Template copié →', userPath);
  return userPath;
}

ipcMain.handle('set-csp-module-enabled', async (event, filename, enabled) => {
  if (!CSP_ALLOWED_FILES.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  // ⭐ Copie le template si le user n'existe pas encore
  const filePath = ensureUserCspFile(filename);
  if (!filePath) {
    return { success: false, error: 'Fichier introuvable (user ni template) : ' + filename };
  }
  try {
    const original = fs.readFileSync(filePath, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/);

    // Trouve [BASIC]
    let basicIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const clean = lines[i].replace(/^\uFEFF/, '').trim();
      if (/^\[BASIC\]$/i.test(clean)) { basicIdx = i; break; }
    }

    // Trouve ENABLED dans [BASIC]
    let enabledIdx = -1;
    if (basicIdx >= 0) {
      for (let i = basicIdx + 1; i < lines.length; i++) {
        const clean = lines[i].replace(/^\uFEFF/, '').trim();
        if (/^\[/.test(clean)) break;
        if (/^ENABLED\s*=/i.test(clean)) { enabledIdx = i; break; }
      }
    }

    if (enabled) {
      // ACTIVER → supprime la ligne ENABLED (absence = actif)
      if (enabledIdx >= 0) lines.splice(enabledIdx, 1);
    } else {
      // DÉSACTIVER → écrit ENABLED=0
      if (enabledIdx >= 0) {
        lines[enabledIdx] = 'ENABLED=0';
      } else if (basicIdx >= 0) {
        lines.splice(basicIdx + 1, 0, 'ENABLED=0');
      } else {
        lines.unshift('[BASIC]', 'ENABLED=0', '');
      }
    }

    fs.copyFileSync(filePath, filePath + '.bak');
    fs.writeFileSync(filePath, lines.join(eol), 'utf8');
    return { success: true, enabled: !!enabled };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('write-csp-module', async (event, filename, content) => {
  if (!CSP_ALLOWED_FILES.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Contenu invalide' };
  }
  // ⭐ Copie le template si le user n'existe pas encore
  const filePath = ensureUserCspFile(filename);
  if (!filePath) {
    return { success: false, error: 'Fichier introuvable (user ni template) : ' + filename };
  }
  try {
    fs.copyFileSync(filePath, filePath + '.bak');
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — TEMPLATES CSP (lecture seule)
   Lit les fichiers modèles livrés par CSP dans <AC>\extension\config\
   → sert à extraire les labels et métadonnées structurés.
   ============================================================ */

function getCspTemplatePath() {
  const settings = fs.existsSync(settingsFilePath)
    ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    : {};
  const acPath = settings.acPath;
  if (!acPath || !fs.existsSync(acPath)) {
    throw new Error('Dossier AC non configuré.');
  }
  return path.join(acPath, 'extension', 'config');
}

ipcMain.handle('read-csp-template', async (event, filename) => {
  if (!CSP_ALLOWED_FILES.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  let dir;
  try {
    dir = getCspTemplatePath();
  } catch (e) {
    return { success: false, error: e.message };
  }
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'Template introuvable : ' + filePath };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, path: filePath, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/* ============================================================
   IPC — FICHIERS i18n (lecture seule)
   Lit public/assets/i18n/<lang>.json — whitelist stricte.
   ============================================================ */
ipcMain.handle('read-i18n-file', async (event, filename) => {
  const allowed = ['fr.json', 'en.json'];
  if (!allowed.includes(filename)) {
    return { success: false, error: 'Fichier non autorisé : ' + filename };
  }
  const filePath = path.join(__dirname, 'public', 'assets', 'i18n', filename);
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'Fichier introuvable : ' + filePath };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, path: filePath, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});