// public/src/cspTemplate.js
// Parser pour les fichiers TEMPLATES CSP (dans <AC>\extension\config\).
// Extrait labels, types et métadonnées depuis les commentaires structurés.
//
// Format d'une ligne :
//   KEY=value ; Label; contraintes; flags
// Exemples :
//   ENABLED=0 ; Active; 1 or 0
//   QUALITY=2 ; Quality; 0 for Very low, 1 for Low, 2 for Medium
//   RADIUS=1 ;; hidden
//   STEPS=36 ; Steps; from 24 to 80; visible with TRACING_QUALITY3:3

(function (global) {
  'use strict';

  const SECTION_SKIP = ['ℹ', 'ⓘ', 'META', 'HEADER'];

  // =========================================================================
  // Parse un template complet
  // Retourne : { sections: [ { name, label, hidden, hint, entries: [...] } ] }
  // =========================================================================
  function parseTemplate(content) {
    const lines = String(content || '').split(/\r?\n/);
    const sections = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/^\uFEFF/, '').trim();
      if (!line) continue;

      // [SECTION]
      const secMatch = line.match(/^\[([^\]]+)\]\s*$/);
      if (secMatch) {
        const name = secMatch[1].trim();
        if (SECTION_SKIP.includes(name)) {
          current = null;  // on ignore cette section
          continue;
        }
        current = { name, label: null, hidden: false, hint: null, entries: [] };
        sections.push(current);
        continue;
      }

      if (!current) continue;

      // Ligne commentaire pur
      if (line.startsWith(';')) {
        const c = line.replace(/^;+\s*/, '').trim();
        // Label de section = 1er commentaire avant tout kv
        if (current.entries.length === 0 && current.label === null && !current.hidden) {
          if (/^hidden$/i.test(c)) current.hidden = true;
          else if (c) current.label = c;
        }
        continue;
      }

      // Ligne KEY=VALUE
      const kvMatch = line.match(/^([^=;#\s][^=]*?)\s*=\s*(.*)$/);
      if (!kvMatch) continue;

      const key = kvMatch[1].trim();
      const rest = kvMatch[2];

      const { value, comment } = splitValueComment(rest);

      // __HINT_BOTTOM → note en bas de section
      if (key === '__HINT_BOTTOM') {
        current.hint = value;
        continue;
      }
      if (key.startsWith('__')) continue;

      const meta = parseTemplateComment(comment);
      const type = inferType(value, meta);

      current.entries.push({
        key,
        defaultValue: value,
        label: meta.label || key,
        hidden: meta.hidden,
        type,
        options: meta.options,
        min: meta.min,
        max: meta.max,
        step: meta.step,
        rawConstraints: meta.constraints || ''
      });
    }

    return { sections };
  }

  // =========================================================================
  // Sépare "value ; commentaire"
  // Gère " ; x" et ";x" (pas d'espace avant)
  // Ignore les ; dans les guillemets (rare)
  // =========================================================================
  function splitValueComment(rest) {
    let inQuote = false, quoteChar = '';
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (!inQuote && (c === '"' || c === "'")) { inQuote = true; quoteChar = c; continue; }
      if (inQuote && c === quoteChar) { inQuote = false; continue; }
      if (!inQuote && c === ';') {
        return { value: rest.slice(0, i).trim(), comment: rest.slice(i) };
      }
    }
    return { value: rest.trim(), comment: '' };
  }

  // =========================================================================
  // Parse un commentaire CSP
  // Format : " ; Label; contraintes; flags"
  //       ou " ;; hidden"  (double ;, pas de label)
  // =========================================================================
  function parseTemplateComment(comment) {
    const out = {
      label: null, hidden: false, constraints: '',
      options: null, min: null, max: null, step: null
    };
    if (!comment) return out;

    let c = comment.replace(/^;+\s*/, '').trim();
    if (!c) return out;

    // Cas "hidden" tout seul
    if (/^hidden$/i.test(c)) { out.hidden = true; return out; }

    // Cas "hidden; reste"
    if (/^hidden\s*;/i.test(c)) {
      out.hidden = true;
      c = c.replace(/^hidden\s*;\s*/i, '');
      if (!c) return out;
    }

    // Split sur ;
    const parts = c.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return out;

    const first = parts[0];
    if (looksLikeConstraint(first)) {
      out.constraints = parts.join('; ');
    } else {
      out.label = first;
      out.constraints = parts.slice(1).join('; ');
    }

    // Détecte "hidden" en fin de contraintes
    const cparts = out.constraints.split(';').map(s => s.trim().toLowerCase());
    if (cparts.includes('hidden')) out.hidden = true;

    // Range ?
    const range = extractRange(out.constraints);
    if (range) { out.min = range.min; out.max = range.max; out.step = range.step; }

    // Enum ?
    const opts = extractEnumOptions(out.constraints);
    if (opts && opts.length > 1) out.options = opts;

    return out;
  }

  function looksLikeConstraint(s) {
    if (!s) return false;
    if (/^from\s+[\d\-.]/i.test(s)) return true;
    if (/^\d+(\.\d+)?\s+(or|for|is)\s+/i.test(s)) return true;
    if (/\bperc\.?\s*$/i.test(s)) return true;
    if (/round to/i.test(s)) return true;
    return false;
  }

  // =========================================================================
  // "from 4° to 20, round to 1" → { min: 4, max: 20, step: 1 }
  // =========================================================================
  function extractRange(c) {
    if (!c) return null;
    const m = c.match(/from\s+(-?\d+(?:\.\d+)?)\s*[^\d\s]?\s*to\s+(-?\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const min = parseFloat(m[1]);
    const max = parseFloat(m[2]);
    let step = (Number.isInteger(min) && Number.isInteger(max)) ? 1 : 0.01;
    const rm = c.match(/round to\s+(\d+(?:\.\d+)?)/i);
    if (rm) step = parseFloat(rm[1]);
    return { min, max, step };
  }

  // =========================================================================
  // Extrait options enum. Gère 2 patterns :
  //   "0 for Very low, 1 for Low"          (valeur en premier)
  //   "Always is 0, \"Exterior view\" is 1"  (label en premier)
  // =========================================================================
  function extractEnumOptions(c) {
    if (!c) return null;
    const opts = [];
    let m;

    // Pattern A : <nombre> for <label>
    const reA = /(-?\d+(?:\.\d+)?)\s+for\s+(?:"([^"]+)"|'([^']+)'|([^,;]+))/gi;
    while ((m = reA.exec(c)) !== null) {
      const value = m[1];
      const label = (m[2] || m[3] || m[4] || '').trim();
      if (label) opts.push({ value, label });
    }

    // Pattern B : <label> is <nombre>
    const reB = /(?:"([^"]+)"|'([^']+)'|([A-Za-z][^,;]*?))\s+is\s+(-?\d+(?:\.\d+)?)/gi;
    while ((m = reB.exec(c)) !== null) {
      const value = m[4];
      const label = (m[1] || m[2] || m[3] || '').trim();
      if (label) opts.push({ value, label });
    }

    // ⭐ Pattern C : <VALEUR_EN_MAJUSCULES> for <label>
    // Ex : "CLOSE for Large drops, DISTANT for Small drops, NONE for Disabled"
    const reC = /\b([A-Z][A-Z0-9_]{2,})\s+for\s+([^,;]+)/g;
    while ((m = reC.exec(c)) !== null) {
      const value = m[1];
      const label = m[2].trim();
      if (label) opts.push({ value, label });
    }

    return opts.length > 1 ? opts : null;
  }

  // =========================================================================
  // Devine le type d'une clé
  // =========================================================================
  function inferType(defaultValue, meta) {
    if (meta.options && meta.options.length > 1) return 'enum';

    // Range détecté : on affine int vs float
    if (meta.min != null && meta.max != null) {
      const defStr = String(defaultValue || '').trim();
      // 1) Valeur par défaut décimale → float
      if (/^-?\d+\.\d+$/.test(defStr)) return 'float';
      // 2) Step décimal → float
      if (meta.step != null && !Number.isInteger(meta.step)) return 'float';
      // 3) Tout est entier → int
      if (Number.isInteger(meta.min) && Number.isInteger(meta.max)) return 'int';
      return 'float';
    }

    const c = (meta.constraints || '').toLowerCase();
    if (/^\s*1\s+or\s+0/.test(c)) return 'bool';
    if (defaultValue === '1' || defaultValue === '0') return 'bool';
    if (/^-?\d+$/.test(defaultValue)) return 'int';
    if (/^-?\d+\.\d+$/.test(defaultValue)) return 'float';
    return 'string';
  }

  const API = {
    parseTemplate,
    parseTemplateComment,
    extractRange,
    extractEnumOptions,
    inferType
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.CspTemplate = API;
})(typeof window !== 'undefined' ? window : globalThis);