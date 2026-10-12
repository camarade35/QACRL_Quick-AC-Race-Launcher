// public/src/i18n.js
// Module i18n minimaliste. Charge un fichier JSON de traductions
// et expose t() (interface) et tCsp() (labels CSP).

(function (global) {
  'use strict';

  let currentLang = 'fr';
  let dict = { csp: { sectionLabels: {}, keyLabels: {}, enumOptions: {}, hints: {} } };
  let loaded = false;

  // ---------------------------------------------------------------------------
  // Charge le dictionnaire depuis public/assets/i18n/<lang>.json
  // ---------------------------------------------------------------------------
  async function load(lang) {
  const target = lang || currentLang || 'fr';
    try {
      // ⚠️ fetch() ne marche pas sur file:// dans Electron → on passe par IPC
      const res = await window.api.readI18nFile(target + '.json');
      if (!res || !res.success) throw new Error((res && res.error) || 'Erreur inconnue');
      const json = JSON.parse(res.content);
      dict = json || dict;
      currentLang = target;
      loaded = true;
      console.log('[i18n] Chargé :', target, '(', countKeys(), 'clés )');
      return true;
    } catch (e) {
      console.warn('[i18n] Échec chargement ' + target + ' :', e.message);
      loaded = false;
      return false;
    }
  }
  // ---------------------------------------------------------------------------
  // Change la langue : recharge le dictionnaire et sauvegarde le choix
  // ---------------------------------------------------------------------------
  async function setLanguage(lang) {
    if (!lang) return false;
    const ok = await load(lang);
    if (!ok) {
      console.warn('[i18n] Impossible de charger la langue :', lang);
      return false;
    }
    // Persiste le choix dans les settings
    try {
      const settings = await window.api.getSettings();
      settings.language = lang;
      await window.api.saveSettings(settings);
    } catch (e) {
      console.warn('[i18n] Sauvegarde du choix de langue KO :', e.message);
    }
    return true;
  }

  function countKeys() {
    const csp = (dict && dict.csp) || {};
    return Object.keys(csp.sectionLabels || {}).length
         + Object.keys(csp.keyLabels || {}).length
         + Object.keys(csp.enumOptions || {}).length
         + Object.keys(csp.hints || {}).length;
  }

  // ---------------------------------------------------------------------------
  // Traduit un label de section CSP (fallback : texte original)
  // ---------------------------------------------------------------------------
  function tSection(text) {
    if (!text) return '';
    const csp = dict.csp || {};
    return (csp.sectionLabels && csp.sectionLabels[text]) || text;
  }

  // ---------------------------------------------------------------------------
  // Traduit un label de clé CSP (fallback : texte original)
  // ---------------------------------------------------------------------------
  function tKey(text) {
    if (!text) return '';
    const csp = dict.csp || {};
    return (csp.keyLabels && csp.keyLabels[text]) || text;
  }

  // ---------------------------------------------------------------------------
  // Traduit une option d'enum CSP (fallback : texte original)
  // ---------------------------------------------------------------------------
  function tEnum(text) {
    if (!text) return '';
    const csp = dict.csp || {};
    return (csp.enumOptions && csp.enumOptions[text]) || text;
  }

  // ---------------------------------------------------------------------------
  // Traduit un hint CSP (fallback : texte original)
  // ---------------------------------------------------------------------------
  function tHint(text) {
    if (!text) return '';
    const csp = dict.csp || {};
    return (csp.hints && csp.hints[text]) || text;
  }
  
  // ---------------------------------------------------------------------------
  // Traduit une contrainte brute de template CSP (pour le tooltip/title)
  // Utilise des règles regex plutôt qu'un dictionnaire exhaustif.
  // ---------------------------------------------------------------------------
  function tConstraints(raw) {
    if (!raw) return '';
    let s = String(raw);

    // Ordre important : du plus spécifique au plus général
    s = s.replace(/\b1\s+or\s+0\b/gi, '1 ou 0');
    s = s.replace(/\bfrom\s+(-?\d+(?:\.\d+)?)\s*([^\d\s]?)\s*to\s+(-?\d+(?:\.\d+)?)/gi,
                   'de $1$2 à $3');
    s = s.replace(/\bround\s+to\s+(\d+(?:\.\d+)?)/gi, 'arrondir à $1');
    s = s.replace(/\bround\b/gi, 'arrondi');
    s = s.replace(/\bperc\.?\b/gi, 'pourcent');
    s = s.replace(/\bonly\s+with\s+/gi, 'uniquement avec ');
    s = s.replace(/\bvisible\s+with\s+/gi, 'visible avec ');
    s = s.replace(/\bnot\s+available\s+with\s+/gi, 'non disponible avec ');
    s = s.replace(/\bhidden\s+with\s+/gi, 'masqué avec ');
    s = s.replace(/\bhidden\b/gi, 'masqué');
    s = s.replace(/\bframe\(s\)/gi, 'frame(s)');
    s = s.replace(/\bcar\(s\)/gi, 'voiture(s)');
    s = s.replace(/\bsecond(s)?\b/gi, (m) => m.toLowerCase().includes('s') ? 'secondes' : 'seconde');
    s = s.replace(/\bminute(s)?\b/gi, (m) => m.toLowerCase().includes('s') ? 'minutes' : 'minute');
    s = s.replace(/\bmeter(s)?\b/gi, (m) => m.toLowerCase().includes('s') ? 'mètres' : 'mètre');
    s = s.replace(/\bdegree(s)?\b/gi, (m) => m.toLowerCase().includes('s') ? 'degrés' : 'degré');
    s = s.replace(/\bwith\b/gi, 'avec');
    s = s.replace(/\bfrom\b/gi, 'de');
    s = s.replace(/\bto\b/gi, 'à');
    s = s.replace(/\bor\b/gi, 'ou');
    s = s.replace(/\band\b/gi, 'et');

    return s;
  }
  // ---------------------------------------------------------------------------
  // Traduit un label français (hardcodé dans iniLayout.js / iniSchema.js)
  // vers la langue courante, si une traduction existe dans le dico inverse.
  // Sinon retourne le texte d'origine tel quel.
  // ---------------------------------------------------------------------------
  function tFr(frText) {
    if (!frText) return '';
    if (currentLang === 'fr') return frText; // Pas de traduction nécessaire
    const dict2 = (dict.app && dict.app.iniLabels) || {};
    return dict2[frText] || frText;
  }
  
  // ---------------------------------------------------------------------------
  // Parcourt le DOM et remplace le texte/placeholder/title des éléments
  // ayant un attribut data-i18n, data-i18n-placeholder, data-i18n-title.
  // ---------------------------------------------------------------------------
  function applyToDom(root) {
    const scope = root || document;

    // Text content
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const val = t(key, null);
      if (val == null) return;
      // Si l'élément a des enfants HTML, on remplace tout le contenu texte
      // (mais on garde les <span>, <i>, etc. dans data-i18n-html si fourni)
      el.textContent = val;
    });

    // HTML content (avec balises)
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      const val = t(key, null);
      if (val == null) return;
      el.innerHTML = val;
    });

    // Placeholder
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      const val = t(key, null);
      if (val != null) el.placeholder = val;
    });

    // Title (tooltip)
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      const val = t(key, null);
      if (val != null) el.title = val;
    });
  }

  // ---------------------------------------------------------------------------
  // t() générique : accès par clé pointée "csp.keyLabels.Active"
  // ---------------------------------------------------------------------------
  function t(path, fallback) {
    const parts = String(path || '').split('.');
    let cur = dict;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return fallback != null ? fallback : path;
      cur = cur[p];
    }
    return cur != null ? cur : (fallback != null ? fallback : path);
  }

  function getCurrentLang() { return currentLang; }
  function isLoaded()       { return loaded; }

  const API = { load, setLanguage, t, tSection, tKey, tEnum, tHint, tConstraints, tFr, applyToDom, getCurrentLang, isLoaded };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.I18n = API;
})(typeof window !== 'undefined' ? window : self);