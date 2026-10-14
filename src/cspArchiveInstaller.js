// src/cspArchiveInstaller.js
// Extraction intelligente d'archives CSP / Sol / Pure.
// Remplace Content Manager pour l'installation des mods météo.
//
// ⭐ 100% async (fs.promises) → ne bloque PAS l'UI Electron.
// ⭐ Écrasement fichier par fichier avec progression fine.
// ⭐ 7za embarqué via 7zip-bin → pas besoin que l'utilisateur installe 7-Zip.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');

// ---------------------------------------------------------------------------
// Racines à installer dans l'AC root
// ---------------------------------------------------------------------------
const KNOWN_ROOTS = [
  'extension',
  'system',
  'content',
  'apps',              // ⭐ apps Python (Sol Config, Sol Planner…)
  'dwrite.dll',
  'd3d11.dll',
  'd3dcompiler_47.dll',
  'steam_appid.txt',
  'soluninstall.bat',  // ⭐ AJOUT : désinstalleur Sol
];

// ---------------------------------------------------------------------------
// ⭐ Trouve 7za.exe embarqué (7zip-bin) ou 7z.exe système en fallback
// ---------------------------------------------------------------------------
function findSevenZip() {
  try {
    const sevenBin = require('7zip-bin');
    const bundled = sevenBin.path7za;
    if (bundled && fs.existsSync(bundled)) {
      console.log('[cspArchiveInstaller] Utilise 7za embarqué :', bundled);
      return bundled;
    }
  } catch (e) {
    console.warn('[cspArchiveInstaller] 7zip-bin indisponible :', e.message);
  }

  const candidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', '7-Zip', '7z.exe'));
  if (process.env.ProgramW6432) candidates.push(path.join(process.env.ProgramW6432, '7-Zip', '7z.exe'));
  for (const exe of candidates) if (fs.existsSync(exe)) {
    console.log('[cspArchiveInstaller] Utilise 7-Zip système :', exe);
    return exe;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Extraction d'une archive dans un dossier (via 7z, async)
// ---------------------------------------------------------------------------
function extractArchiveTo(filePath, destDir) {
  const sevenZip = findSevenZip();

  if (sevenZip) {
    return new Promise((resolve, reject) => {
      exec(`"${sevenZip}" x "${filePath}" -o"${destDir}" -y -bso0 -bsp0`,
        { maxBuffer: 200 * 1024 * 1024 }, (err) => {
          if (err) return reject(new Error('Échec 7-Zip : ' + err.message));
          resolve();
        });
    });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.zip') {
    return Promise.reject(new Error(
      'Format ' + ext + ' nécessite 7-Zip. Installe 7zip-bin (npm install 7zip-bin).'
    ));
  }

  try {
    const zip = new AdmZip(filePath);
    zip.extractAllTo(destDir, true);
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(new Error('Échec de lecture .zip : ' + e.message));
  }
}

// ---------------------------------------------------------------------------
// ⭐ Trouve la "racine AC" dans le dossier temporaire
// ---------------------------------------------------------------------------
function findAcRootInTemp(tempDir) {
  const markers = [
    'extension/weather/sol/manifest.ini',
    'extension/weather/pure/manifest.ini',
    'extension/config',
    'dwrite.dll',
    'content/weather',
    'apps/python',           // ⭐ apps Python (Sol Config, Sol Planner…)
  ];

  function hasMarker(dir) {
    for (const m of markers) {
      if (fs.existsSync(path.join(dir, m))) return true;
    }
    return false;
  }

  if (hasMarker(tempDir)) return tempDir;

  try {
    for (const e of fs.readdirSync(tempDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const sub = path.join(tempDir, e.name);
      if (hasMarker(sub)) return sub;

      for (const e2 of fs.readdirSync(sub, { withFileTypes: true })) {
        if (!e2.isDirectory()) continue;
        const sub2 = path.join(sub, e2.name);
        if (hasMarker(sub2)) return sub2;
      }
    }
  } catch (err) {
    console.warn('[findAcRootInTemp] erreur scan :', err.message);
  }

  return tempDir;
}

// ---------------------------------------------------------------------------
// Détecte le type depuis la structure extraite
// ---------------------------------------------------------------------------
function detectAcRootType(acRootPath) {
  if (fs.existsSync(path.join(acRootPath, 'dwrite.dll'))) return 'csp';

  const weatherDir = path.join(acRootPath, 'content', 'weather');
  if (fs.existsSync(weatherDir)) {
    try {
      const subs = fs.readdirSync(weatherDir);
      if (subs.some(s => /^sol_/i.test(s)))  return 'sol';
      if (subs.some(s => /^pure_/i.test(s))) return 'pure';
    } catch (e) {}
  }

  if (fs.existsSync(path.join(acRootPath, 'extension', 'config-ext', 'PurePlanner'))) return 'pure';

  return null;
}

// ---------------------------------------------------------------------------
// (backupIfExistsAsync supprimé — on backup fichier par fichier dans copyTreeAsync)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ⭐ Copie récursive ASYNC d'un dossier
// ---------------------------------------------------------------------------
async function copyDirAsync(srcDir, destDir) {
  await fsp.mkdir(destDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(srcDir, e.name);
    const d = path.join(destDir, e.name);
    if (e.isDirectory()) {
      await copyDirAsync(s, d);
    } else {
      await fsp.copyFile(s, d);
    }
  }
}

// ---------------------------------------------------------------------------
// ⭐ Collecte ASYNC de tous les fichiers d'un dossier (pour compter)
// ---------------------------------------------------------------------------
async function collectFilesAsync(srcDir, baseDir, out) {
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(srcDir, e.name);
    if (e.isDirectory()) {
      await collectFilesAsync(full, baseDir, out);
    } else {
      out.push({
        src: full,
        rel: path.relative(baseDir, full),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// ⭐ Copie ASYNC d'une racine (dossier OU fichier simple)
// Backup à la volée, progression fine
// ---------------------------------------------------------------------------
async function copyRootAsync(srcPath, destPath, backupBase, onProgress, state) {
  const srcStat = await fsp.stat(srcPath);

  if (srcStat.isDirectory()) {
    // ── Cas dossier : parcourt récursivement ──
    const files = [];
    await collectFilesAsync(srcPath, srcPath, files);

    for (const f of files) {
      const dest = path.join(destPath, f.rel);
      const backupDest = backupBase ? path.join(backupBase, f.rel) : null;
      await copyOneFileAsync(f.src, dest, backupDest, onProgress, state);
    }
  } else {
    // ── Cas fichier simple (dwrite.dll, steam_appid.txt…) ──
    await copyOneFileAsync(srcPath, destPath, backupBase, onProgress, state);
  }
}

// ---------------------------------------------------------------------------
// ⭐ Copie ASYNC d'UN fichier + backup si destination existe
// ---------------------------------------------------------------------------
async function copyOneFileAsync(src, dest, backupDest, onProgress, state) {
  // Backup si destination existe déjà
  if (backupDest && fs.existsSync(dest)) {
    try {
      await fsp.mkdir(path.dirname(backupDest), { recursive: true });
      await fsp.copyFile(dest, backupDest);
      state.backedUp++;
    } catch (e) {
      console.warn('[copyOneFileAsync] backup KO pour', dest, e.message);
    }
  }

  // Copie
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);

  state.copied++;

  // Progression (toutes les 25 copies OU toutes les 120ms OU à la fin)
  const now = Date.now();
  if (state.copied % 25 === 0 || now - state.lastEmit > 120 || state.copied === state.total) {
    state.lastEmit = now;
    const pct = state.total > 0
      ? 30 + Math.floor((state.copied / state.total) * 65)
      : 50;
    onProgress && onProgress({
      status: `Copie… ${state.copied} / ${state.total} fichiers`,
      percent: Math.min(99, pct),
      copiedFiles: state.copied,
      totalFiles: state.total,
    });
  }
}

// ---------------------------------------------------------------------------
// ⭐ Active les apps Python Sol dans Documents/Assetto Corsa/cfg/python.ini
// ---------------------------------------------------------------------------
function activateSolPythonApps(documentsPath) {
  if (!documentsPath) return;

  const cfgDir = path.join(documentsPath, 'Assetto Corsa', 'cfg');
  const iniPath = path.join(cfgDir, 'python.ini');

  const SOL_APPS = ['SOL_CONFIG', 'SOL_CUSTOM_WEATHER', 'SOL_PLANNER', 'SOL_WEATHER'];

  let content = '';
  if (fs.existsSync(iniPath)) {
    content = fs.readFileSync(iniPath, 'utf8');
  }
  const eol = content.includes('\r\n') ? '\r\n' : '\n';

  for (const app of SOL_APPS) {
    // ⭐ Regex qui accepte \r\n ET \n, et englobe TOUTE la section
    //    (jusqu'à la prochaine [SECTION] ou fin de fichier)
    const sectionRe = new RegExp(
      '\\[' + app + '\\][\\s\\S]*?(?=\\r?\\n\\[[A-Z_][A-Z0-9_]*\\]|$)',
      'i'
    );

    if (sectionRe.test(content)) {
      // ⭐ Section existante → on la RÉÉCRIT proprement (header sur sa ligne, ACTIVE sur la suivante)
      content = content.replace(sectionRe, '[' + app + ']' + eol + 'ACTIVE=1' + eol);
    } else {
      // ⭐ Section absente → ajout à la fin avec la bonne mise en forme
      content = content.replace(/[\r\n\s]+$/, '') + eol + eol + '[' + app + ']' + eol + 'ACTIVE=1' + eol;
    }
  }

  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(iniPath, content, 'utf8');
  console.log('[cspArchiveInstaller] Apps Sol activées dans python.ini →', iniPath);
}

// ---------------------------------------------------------------------------
// Installation principale
// ---------------------------------------------------------------------------
async function installArchive(filePath, acPath, documentsPath, onProgress) {
  if (!fs.existsSync(filePath)) throw new Error('Fichier introuvable : ' + filePath);
  if (!acPath || !fs.existsSync(acPath)) throw new Error('Dossier AC invalide.');

  onProgress && onProgress({ status: 'Préparation…', percent: 3 });

  const tempDir = path.join(os.tmpdir(), 'qacrl_csp_install_' + Date.now());
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    // 1. Extraction
    onProgress && onProgress({ status: 'Extraction de l\'archive…', percent: 10 });
    await extractArchiveTo(filePath, tempDir);

    // 2. Détection racine + type
    const acRootInTemp = findAcRootInTemp(tempDir);
    console.log('[cspArchiveInstaller] Racine AC détectée :', acRootInTemp);

    const type = detectAcRootType(acRootInTemp);
    if (!type) {
      throw new Error(
        'Type d\'archive non reconnu. Attendu : CSP (contient dwrite.dll), Sol ou Pure (content/weather/…).'
      );
    }
    onProgress && onProgress({ status: 'Détection : ' + type.toUpperCase(), percent: 20 });

    // 3. Liste les racines présentes
    const roots = [];
    for (const root of KNOWN_ROOTS) {
      const src = path.join(acRootInTemp, root);
      if (fs.existsSync(src)) roots.push({ name: root, src });
    }
    if (roots.length === 0) throw new Error('Aucune racine connue dans l\'archive.');

    // 4. Compte le nombre total de fichiers
    onProgress && onProgress({ status: 'Analyse des fichiers…', percent: 22 });
    const state = { copied: 0, total: 0, backedUp: 0, lastEmit: 0 };
    for (const r of roots) {
      const stat = await fsp.stat(r.src);
      if (stat.isDirectory()) {
        const list = [];
        await collectFilesAsync(r.src, r.src, list);
        state.total += list.length;
      } else {
        state.total += 1;
      }
    }
    console.log('[cspArchiveInstaller] Total fichiers à copier :', state.total);

    // 5. Prépare le dossier de backup (créé vide, rempli à la volée)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupRoot = path.join(acPath, '_qacrl_backups', type + '_' + stamp);
    await fsp.mkdir(backupRoot, { recursive: true });

    onProgress && onProgress({ status: 'Démarrage de la copie…', percent: 28 });

    // 6. Copie + backup fichier par fichier
    const results = [];
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      const dest = path.join(acPath, r.name);

      // ⭐ Backup à la volée dans <backupRoot>/<rootName>/
      const rootBackupBase = path.join(backupRoot, r.name);

      await copyRootAsync(r.src, dest, rootBackupBase, onProgress, state);

      results.push({
        name: r.name,
        backedUp: fs.existsSync(rootBackupBase),
      });
    }

    // ⭐ Si on vient d'installer Sol → activer les apps Python associées
    if (type === 'sol' && documentsPath) {
      try {
        activateSolPythonApps(documentsPath);
      } catch (e) {
        console.warn('[cspArchiveInstaller] Activation apps Sol KO :', e.message);
      }
    }

    const msg = 'Terminé — ' + state.total + ' fichiers installés'
      + (state.backedUp > 0 ? ' (' + state.backedUp + ' écrasés)' : '');
    onProgress && onProgress({
      status: msg,
      percent: 100,
      copiedFiles: state.total,
      totalFiles: state.total,
    });

    return {
      success: true,
      type,
      backupPath: backupRoot,
      roots: results,
      fileCount: state.total,
      backedUpCount: state.backedUp,
    };
  } finally {
    // Nettoyage temp (async, best effort)
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Aperçu (sans installation)
// ---------------------------------------------------------------------------
async function previewArchive(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('Fichier introuvable.');

  const tempDir = path.join(os.tmpdir(), 'qacrl_csp_preview_' + Date.now());
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    await extractArchiveTo(filePath, tempDir);
    const acRootInTemp = findAcRootInTemp(tempDir);
    const type = detectAcRootType(acRootInTemp);

    const roots = [];
    for (const root of KNOWN_ROOTS) {
      if (fs.existsSync(path.join(acRootInTemp, root))) {
        roots.push({ name: root });
      }
    }

    return { type, roots };
  } finally {
    try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

module.exports = { installArchive, previewArchive };