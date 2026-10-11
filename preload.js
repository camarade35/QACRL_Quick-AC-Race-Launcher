const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppState: () => ipcRenderer.invoke('get-app-state'),
  saveAppState: (state) => ipcRenderer.invoke('save-app-state', state),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectAcFolder: () => ipcRenderer.invoke('select-ac-folder'),
  selectDocumentsFolder: () => ipcRenderer.invoke('select-documents-folder'),
  getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),
  loadContent: () => ipcRenderer.invoke('load-content'),
  launchGame: (sessionData) => ipcRenderer.invoke('launch-game', sessionData),
  installMod: (filePath) => ipcRenderer.invoke('install-mod', filePath),
  selectModFile: () => ipcRenderer.invoke('select-mod-file'),
  openFolder: (type, id) => ipcRenderer.invoke('open-folder', type, id),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveCustomPlan: (planName, steps, startTime, timeMult, loop) =>
    ipcRenderer.invoke('save-custom-plan', planName, steps, startTime, timeMult, loop),
  scanAssets: () => ipcRenderer.invoke('scan-assets'),
  getPresets: () => ipcRenderer.invoke('get-presets'),
  savePreset: (preset) => ipcRenderer.invoke('save-preset', preset),
  deletePreset: (id) => ipcRenderer.invoke('delete-preset', id),

  loadPurePlan: (planId) => ipcRenderer.invoke('load-pure-plan', planId),
  deletePurePlan: (planId) => ipcRenderer.invoke('delete-pure-plan', planId),
  readPureCtrlSettings: () => ipcRenderer.invoke('read-purectrl-settings'),

  // ⭐ Détection SteamID : essaie Steam puis fallback race.ini
  detectSteamId: () => ipcRenderer.invoke('detect-steam-id'),

  // SERVEURS EN LIGNE
  fetchOnlineServers: (page) => ipcRenderer.invoke('fetch-online-servers', page),
  fetchServerInfo: (ip, port) => ipcRenderer.invoke('fetch-server-info', ip, port),
  fetchServerDetails: (ip, httpPort, gamePort) =>
    ipcRenderer.invoke('fetch-server-details', ip, httpPort, gamePort),
  fetchServerOccupancy: (ip, httpPort, gamePort) =>
    ipcRenderer.invoke('fetch-server-occupancy', ip, httpPort, gamePort),
  pingServer: (ip, port) => ipcRenderer.invoke('ping-server', ip, port),
  joinServer: (serverData, sessionData) => ipcRenderer.invoke('join-server', serverData, sessionData),

  getModsHistory: () => ipcRenderer.invoke('get-mods-history'),
  deleteModFromHistory: (historyId, itemId) => ipcRenderer.invoke('delete-mod-from-history', historyId, itemId),
  onModsHistoryUpdated: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('mods-history-updated', subscription);
    return () => ipcRenderer.removeListener('mods-history-updated', subscription);
  },

  getSessionHistory: () => ipcRenderer.invoke('get-session-history'),
  deleteSessionHistoryEntry: (id) => ipcRenderer.invoke('delete-session-history-entry', id),
  clearSessionHistory: () => ipcRenderer.invoke('clear-session-history'),
  onSessionHistoryUpdated: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('session-history-updated', subscription);
    return () => ipcRenderer.removeListener('session-history-updated', subscription);
  },

  onInstallProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('install-mod-progress', subscription);
    return () => ipcRenderer.removeListener('install-mod-progress', subscription);
  },
  analyzeHardware: () => ipcRenderer.invoke('analyze-hardware'),

  // ⭐ Fichiers INI (controls / video / audio)
  readIniFile: (filename) => ipcRenderer.invoke('read-ini-file', filename),
  writeIniFile: (filename, content) => ipcRenderer.invoke('write-ini-file', filename, content),

  // ⭐ Filtres post-process (PP filters)
  listPpfilters: () => ipcRenderer.invoke('list-ppfilters'),

  // ⭐ Weather FX Style
  getWeatherFxStyle: () => ipcRenderer.invoke('get-weather-fx-style'),
  setWeatherFxStyle: (style) => ipcRenderer.invoke('set-weather-fx-style', style),
  getWeatherFxEnabled: () => ipcRenderer.invoke('get-weather-fx-enabled'),
  setWeatherFxEnabled: (enabled) => ipcRenderer.invoke('set-weather-fx-enabled', enabled),
  
    // ⭐ Résolutions d'écran disponibles
  listResolutions: () => ipcRenderer.invoke('list-resolutions'),
  
  // ⭐ Options caméra libre / orbite F5
  getFreeCameraOptions: () => ipcRenderer.invoke('get-free-camera-options'),
  setFreeCameraOptions: (opts) => ipcRenderer.invoke('set-free-camera-options', opts),
  
  // ⭐ Modules CSP
  listCspModules: () => ipcRenderer.invoke('list-csp-modules'),
  readCspModule: (filename) => ipcRenderer.invoke('read-csp-module', filename),
  setCspModuleEnabled: (filename, enabled) => ipcRenderer.invoke('set-csp-module-enabled', filename, enabled),

  // ⭐ Profils volant (mapping Chromium → AC)
  getWheelProfile: (vendor, product) => ipcRenderer.invoke('get-wheel-profile', vendor, product),
  getAllWheelProfiles: () => ipcRenderer.invoke('get-all-wheel-profiles'),
  saveWheelProfile: (vendor, product, data) => ipcRenderer.invoke('save-wheel-profile', vendor, product, data),
  mergeWheelProfile: (vendor, product, axes, source) => ipcRenderer.invoke('merge-wheel-profile', vendor, product, axes, source),
  deleteWheelProfile: (vendor, product) => ipcRenderer.invoke('delete-wheel-profile', vendor, product),

  // ⭐ Contrôles de fenêtre (custom titlebar)
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChange: (callback) => {
    const subscription = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window-maximized', subscription);
    return () => ipcRenderer.removeListener('window-maximized', subscription);
  }
});