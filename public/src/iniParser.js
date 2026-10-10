// public/src/iniParser.js
// Parseur INI minimaliste pour fichiers Assetto Corsa.
// Objectif : lecture + réécriture en préservant ordre et commentaires.
//
// Utilisable côté Node (pour tests) ET côté navigateur/Electron (window.IniParser).

(function (global) {
  'use strict';

  /**
   * Parse un texte INI en une liste ordonnée de sections.
   * Structure retournée :
   * [
   *   { name: '', entries: [ ... ] },        // en-tête avant la 1ère section
   *   { name: 'SECTION', entries: [
   *       { kind: 'kv',  key: 'CLE', value: 'valeur' },
   *       { kind: 'raw', raw: '; commentaire' }
   *   ]},
   *   ...
   * ]
   */
    /**
   * Parse un texte INI en une liste ordonnée de sections.
   * Structure retournée :
   * [
   *   { name: '', entries: [ ... ] },
   *   { name: 'SECTION', entries: [
   *       { kind: 'kv',  key: 'CLE', value: 'valeur', comment: ' ; A' },
   *       { kind: 'raw', raw: '; commentaire' }
   *   ]},
   *   ...
   * ]
   *
   * Note : les commentaires inline (`KEY=0x41 ; A`) sont séparés :
   *   - value   = "0x41"
   *   - comment = " ; A"  (avec l'espace initial, pour round-trip exact)
   */
  function parseIni(text) {
    if (typeof text !== 'string') text = '';
    const lines = text.split(/\r?\n/);
    const sections = [];
    let current = { name: '', entries: [] };
    sections.push(current);

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      // Ligne de section : [NOM]
      const secMatch = raw.match(/^\s*\[([^\]]+)\]\s*$/);
      if (secMatch) {
        current = { name: secMatch[1], entries: [] };
        sections.push(current);
        continue;
      }

      // Ligne clé = valeur (la clé ne commence pas par ; # ou =)
      const kvMatch = raw.match(/^\s*([^=;#\s][^=]*?)\s*=\s*(.*)$/);
      if (kvMatch) {
        let value = kvMatch[2];
        let comment = '';
        // Commentaire inline : uniquement si " ;" (espace + point-virgule)
        const idx = value.indexOf(' ;');
        if (idx !== -1) {
          comment = value.slice(idx);
          value = value.slice(0, idx);
        }
        current.entries.push({
          kind: 'kv',
          key: kvMatch[1].trim(),
          value: value,
          comment: comment,
        });
        continue;
      }

      // Tout le reste : ligne brute (vide, commentaire, ligne bizarre…)
      current.entries.push({ kind: 'raw', raw: raw });
    }

    return sections;
  }

  /**
   * Reconstruit un texte INI à partir de la structure.
   */
  function serializeIni(sections) {
    const out = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.name) out.push('[' + s.name + ']');
      for (let j = 0; j < s.entries.length; j++) {
        const e = s.entries[j];
        if (e.kind === 'kv') {
          out.push(e.key + '=' + e.value + (e.comment || ''));
        } else {
          out.push(e.raw);
        }
      }
    }
    return out.join('\n');
  }
  
  /**
   * Récupère la valeur d'une clé SANS son commentaire inline.
   * Pratique pour l'édition (on écrit la nouvelle valeur, on garde le comment).
   */
  function getPureValue(entry) {
    return entry && entry.value != null ? entry.value : '';
  }

  /**
   * Devine le type d'une valeur pour l'affichage en formulaire.
   * Retourne : 'bool' | 'int' | 'float' | 'string'
   */
  function detectValueType(value) {
    if (value === null || value === undefined) return 'string';
    const v = String(value).trim();
    if (v === '') return 'string';
    if (v === '0' || v === '1') return 'bool';
    if (v === 'true' || v === 'false') return 'bool';
    if (/^-?\d+$/.test(v)) return 'int';
    if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(v)) return 'float';
    if (/^-?\d+([eE][-+]?\d+)$/.test(v)) return 'float';
    return 'string';
  }

  /**
   * Regroupe les entrées par section pour un accès rapide.
   * Retourne : { NOM_SECTION: { CLE: 'valeur', ... }, ... }
   */
  function groupBySection(sections) {
    const result = {};
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s.name) continue;
      const obj = {};
      for (let j = 0; j < s.entries.length; j++) {
        const e = s.entries[j];
        if (e.kind === 'kv') obj[e.key] = e.value;
      }
      result[s.name] = obj;
    }
    return result;
  }

  const API = { parseIni, serializeIni, detectValueType, groupBySection, getPureValue };

  // Export Node (pour les tests en ligne de commande)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
  // Export navigateur / Electron renderer
  if (typeof global !== 'undefined') {
    global.IniParser = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);