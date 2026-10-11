// public/src/cspParser.js
// Parser intelligent pour les fichiers CSP.
// Extrait label, type, min/max, options depuis les commentaires structurés.

(function (global) {
  'use strict';

  // Sections à ignorer complètement
  const IGNORED_SECTIONS = ['ℹ', 'ⓘ', 'META', 'HEADER'];

  // ===========================================================================
  // 1. Parse le commentaire d'une ligne CSP
  // ===========================================================================
  function parseComment(comment) {
    const out = { hidden: false, label: null, hint: null, constraints: null };
    if (!comment) return out;

    // Normalise : enlève les ";" en début
    let c = comment.replace(/^;+\s*/, '').trim();
    if (!c) return out;

    // Détection hidden
    if (/^hidden$/i.test(c) || /^hidden\s/i.test(c)) {
      out.hidden = true;
      return out;
    }

    // Split sur ";"
    // Cas 1 : "Label; constraints"
    // Cas 2 : "Label"
    // Cas 3 : "constraints" (pas de label)
    const semi = c.indexOf(';');
    if (semi >= 0) {
      const first  = c.slice(0, semi).trim();
      const second = c.slice(semi + 1).trim();
      // Est-ce que la première partie est un label ou une contrainte ?
      if (looksLikeConstraint(first)) {
        out.constraints = first + '; ' + second;
      } else {
        out.label = first;
        out.constraints = second;
      }
    } else {
      if (looksLikeConstraint(c)) {
        out.constraints = c;
      } else {
        out.label = c;
      }
    }

    return out;
  }

  function looksLikeConstraint(s) {
    if (!s) return false;
    if (/^from\s/i.test(s)) return true;
    if (/^\d+\s*(or|for|is)\s/i.test(s)) return true;
    if (/^[A-Z_]+$/i.test(s) && s.length < 40 && /,/i.test(s)) return false; // liste de labels sans valeurs
    if (/^disabled,|^active,/i.test(s)) return true;
    if (/\bperc\.?\s*$/i.test(s)) return true;
    if (/round to/i.test(s)) return true;
    return false;
  }

  // ===========================================================================
  // 2. Détermine le type + options depuis les contraintes
  // ===========================================================================
  function inferType(rawValue, constraints) {
    const c = (constraints || '').toLowerCase();

    // bool
    if (/^1 or 0/.test(c) || /\b1 or 0\b/.test(c)) return 'bool';

    // from X to Y → nombre
    const rangeMatch = c.match(/from\s+(-?\d+(?:\.\d+)?)\s*(?:[a-z°%()]+)?\s+to\s+(-?\d+(?:\.\d+)?)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      const isInt = Number.isInteger(min) && Number.isInteger(max);
      return isInt ? 'int' : 'float';
    }

    // enum "0 for X, 1 for Y, ..." ou "X is A, Y is B"
    if (/\d+\s+(?:for|is)\s+/.test(c) || /is\s+[A-Z]/i.test(c)) {
      return 'enum';
    }

    // Si contient plusieurs mots avec des "for" → enum
    if (/\bfor\b/.test(c) && c.split(',').length > 1) return 'enum';

    // Détection basique sur la valeur
    if (/^\d+$/.test(rawValue)) return 'int';
    if (/^-?\d+\.\d+$/.test(rawValue)) return 'float';
    if (rawValue === '1' || rawValue === '0') return 'bool';
    if (/\.dll|\.exe|\.ini|\.lua|\.png|\.jpg/i.test(rawValue)) return 'string';
    return 'string';
  }

  // ===========================================================================
  // 3. Extrait min/max/step depuis les contraintes
  // ===========================================================================
  function extractRange(constraints) {
    if (!constraints) return null;
    const m = constraints.match(/from\s+(-?\d+(?:\.\d+)?)\s*(?:[a-z°%()]+)?\s+to\s+(-?\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const min = parseFloat(m[1]);
    const max = parseFloat(m[2]);
    let step = 0.01;
    if (Number.isInteger(min) && Number.isInteger(max)) {
      step = (max - min) > 40 ? 1 : 0.01;
      if (max - min > 40) step = 1;
      else step = 1;
    }
    // Détection "round to X"
    const rm = constraints.match(/round to\s+(\d+(?:\.\d+)?)/i);
    if (rm) step = parseFloat(rm[1]);
    return { min, max, step };
  }

  // ===========================================================================
  // 4. Extrait les options enum depuis les contraintes
  // ===========================================================================
  function extractEnumOptions(constraints) {
    if (!constraints) return [];
    const opts = [];

    // Pattern "X for Label, Y for Label" ou "X is Label, Y is Label"
    // Supporte les valeurs : 0, 1, 2, X, Y, A, CMAA, "Low (Old)", etc.
    const parts = splitEnumParts(constraints);

    for (const p of parts) {
      const t = p.trim();
      if (!t) continue;

      // Format "0 for Very low"
      let m = t.match(/^(-?\d+(?:\.\d+)?)\s+(?:for|is)\s+(.+)$/i);
      if (m) {
        opts.push({ value: m[1], label: m[2].trim().replace(/^["']|["']$/g, '') });
        continue;
      }

      // Format "A for Label" (valeur non numérique)
      m = t.match(/^([A-Z_][A-Z0-9_]*)\s+(?:for|is)\s+(.+)$/i);
      if (m) {
        opts.push({ value: m[1], label: m[2].trim().replace(/^["']|["']$/g, '') });
        continue;
      }

      // Sinon : juste un label (valeur = label)
      opts.push({ value: t, label: t });
    }

    return opts;
  }

  function splitEnumParts(s) {
    // Sépare sur virgules mais respecte les parenthèses et guillemets
    const parts = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!inQuote && (c === '"' || c === "'")) {
        inQuote = true;
        quoteChar = c;
        current += c;
        continue;
      }
      if (inQuote && c === quoteChar) {
        inQuote = false;
        current += c;
        continue;
      }
      if (!inQuote) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) {
          parts.push(current);
          current = '';
          continue;
        }
      }
      current += c;
    }
    if (current) parts.push(current);
    return parts;
  }

  // ===========================================================================
  // 5. Parse un fichier CSP complet
  // ===========================================================================
  function parseCspContent(content, IniParser) {
    const sections = IniParser.parseIni(content);
    const result = [];

    for (const sec of sections) {
      if (!sec.name) continue;
      if (IGNORED_SECTIONS.includes(sec.name)) continue;

      const sectionObj = {
        name: sec.name,
        label: sec.name,
        entries: [],
      };

      // Cherche un label de section (premier commentaire de la section)
      // Sinon on prend le nom brut

      for (const entry of sec.entries) {
        if (entry.kind !== 'kv') continue;
        if (entry.key === '__HINT_BOTTOM') {
          sectionObj.hint = entry.value;
          continue;
        }
        if (entry.key.startsWith('__')) continue;  // clés internes

        const info = parseComment(entry.comment);
        if (info.hidden) continue;

        // ⭐ Cas spécial : la clé ENABLED est TOUJOURS un booléen
        let type;
        if (entry.key === 'ENABLED' || entry.key === 'ACTIVE') {
          type = 'bool';
        } else {
          type = inferType(entry.value, info.constraints);
        }
        const range = (type === 'int' || type === 'float') ? extractRange(info.constraints) : null;
        const options = (type === 'enum') ? extractEnumOptions(info.constraints) : null;

        sectionObj.entries.push({
          key: entry.key,
          value: entry.value,
          label: info.label || entry.key,
          type,
          min: range ? range.min : null,
          max: range ? range.max : null,
          step: range ? range.step : null,
          options,
          rawConstraints: info.constraints,
        });
      }

      if (sectionObj.entries.length > 0) result.push(sectionObj);
    }

    return result;
  }

  const API = { parseCspContent, parseComment, inferType, extractRange, extractEnumOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.CspParser = API;
})(typeof window !== 'undefined' ? window : globalThis);