/* ============================================================
   QACRL — Fonctions utilitaires
   ============================================================ */

/* ============================================================
   COULEURS — helpers
   ============================================================ */
function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return { r: 211, g: 47, b: 47 };
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

function lightenHex(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 + percent / 100;
  return '#' +
    Math.min(255, Math.round(r * f)).toString(16).padStart(2, '0') +
    Math.min(255, Math.round(g * f)).toString(16).padStart(2, '0') +
    Math.min(255, Math.round(b * f)).toString(16).padStart(2, '0');
}

/* ============================================================
   TAGS — helpers
   ============================================================ */
function normalizeTag(t) {
  return String(t).toLowerCase().replace(/^#+/, '').trim();
}

function getItemTags(item) {
  if (!Array.isArray(item?.tags)) return [];
  return item.tags.map(normalizeTag).filter(Boolean);
}

function collectTags(items) {
  const counts = {};
  for (const item of items) {
    const tags = getItemTags(item);
    for (const t of tags) counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr'));
}

function matchesTags(item, activeTags) {
  if (!activeTags || activeTags.length === 0) return true;
  const itemTags = getItemTags(item);
  return activeTags.some(t => itemTags.includes(t));
}

/* ============================================================
   FLAGS — helpers
   ============================================================ */
function flagFileToCountryName(flagFile) {
  if (!flagFile) return '';
  return flagFile
    .replace(/\.png$/i, '')
    .replace(/(19|20)?\d{2}([-_]\d{2})?$/, '')
    .replace(/[_-]+$/, '')
    .replace(/_/g, ' ')
    .trim();
}

function normalizeCountryKey(s) {
  if (!s) return '';
  const k = String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/[_\s\-'&]/g, '');
  return COUNTRY_ALIASES[k] || k;
}

function findFlagFileByName(countryName, flagsList) {
  if (!countryName || !flagsList || flagsList.length === 0) return null;
  const target = normalizeCountryKey(countryName);
  if (!target) return null;
  for (const f of flagsList) {
    if (normalizeCountryKey(flagFileToCountryName(f)) === target) return f;
  }
  if (target.length >= 4) {
    for (const f of flagsList) {
      const base = normalizeCountryKey(flagFileToCountryName(f));
      if (!base || base.length < 4) continue;
      if (base.includes(target) || target.includes(base)) return f;
    }
  }
  return null;
}

function flagUrl(flagFile) {
  if (!flagFile) return null;
  return 'assets/flags/' + encodeURIComponent(flagFile);
}

/* ============================================================
   MÉTÉO — traduction
   ============================================================ */
function translateWeatherName(id) {
  if (!id) return '';
  const lower = id.toLowerCase();
  if (WEATHER_NAME_MAP[lower]) return WEATHER_NAME_MAP[lower];
  const stripped = lower.replace(/^(sol|pure|sfx)[_-]/i, '').replace(/^\d+[_-]/, '');
  if (WEATHER_NAME_MAP[stripped]) return WEATHER_NAME_MAP[stripped];
  return id.replace(/^(sol|pure|sfx)[_-]/i, '').replace(/^\d+[_-]/, '').replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) || id;
}

/* ============================================================
   BBCode → HTML
   ============================================================ */
function bbcodeToHtml(input) {
  if (!input || typeof input !== 'string') return '';

  let s = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre class="bb-code">$1</pre>');
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote class="bb-quote">$1</blockquote>');

  s = s.replace(/\[img="?([^"\]]+)"?\]([\s\S]*?)\[\/img\]/gi, (m, url, alt) => {
    const cleanUrl = String(url).trim().replace(/^"|"$/g, '');
    const safeAlt = String(alt).trim() || 'image';
    return `<img class="bb-img" src="${cleanUrl}" alt="${safeAlt}" onerror="this.style.display='none'">`;
  });

  s = s.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (m, url) => {
    const cleanUrl = String(url).trim().replace(/^"|"$/g, '');
    return `<img class="bb-img" src="${cleanUrl}" alt="" onerror="this.style.display='none'">`;
  });

  s = s.replace(/\[url="?([^"\]]+)"?\]([\s\S]*?)\[\/url\]/gi, (m, url, text) => {
    const cleanUrl = String(url).trim().replace(/^"|"$/g, '');
    return `<a class="bb-link" href="${cleanUrl}" data-external-url="${cleanUrl}">${text}</a>`;
  });

  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (m, url) => {
    const cleanUrl = String(url).trim().replace(/^"|"$/g, '');
    return `<a class="bb-link" href="${cleanUrl}" data-external-url="${cleanUrl}">${cleanUrl}</a>`;
  });

  s = s.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (m, color, text) => {
    return `<span style="color:${color}">${text}</span>`;
  });

  s = s.replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi, (m, size, text) => {
    const n = Math.max(8, Math.min(48, parseInt(size, 10) || 14));
    return `<span style="font-size:${n}px;line-height:1.3">${text}</span>`;
  });

  s = s.replace(/\[center\]([\s\S]*?)\[\/center\]/gi, '<div style="text-align:center">$1</div>');
  s = s.replace(/\[left\]([\s\S]*?)\[\/left\]/gi, '<div style="text-align:left">$1</div>');
  s = s.replace(/\[right\]([\s\S]*?)\[\/right\]/gi, '<div style="text-align:right">$1</div>');

  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
  s = s.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>');

  // Nettoie les tags orphelins
  s = s.replace(/\[(size|color|url|img|b|i|u|s|center|left|right|quote|code)=?[^\]]*\]/gi, '');
  s = s.replace(/\[\/(size|color|url|img|b|i|u|s|center|left|right|quote|code)\]/gi, '');

  s = s.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');

  return s;
}

/* ============================================================
   NETTOYAGE CHEMINS / IDs
   ============================================================ */
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

function safeModId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function buildModSearchUrl(modId) {
  const q = `${modId} Assetto Corsa mod`;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(q) + '&ia=web';
}

/* ============================================================
   MAPPING CONSTRUCTEUR → LOGO / PAYS
   ============================================================ */
function findManufacturerLogo(carId, carName, brand) {
  const haystack = (carId + ' ' + (carName || '') + ' ' + (brand || '')).toLowerCase();
  for (const kw of BRAND_KEYS_SORTED) {
    if (haystack.includes(kw)) return 'assets/manufacturers/' + encodeURIComponent(BRAND_ALIASES[kw]);
  }
  return null;
}

function findManufacturerCountry(carId, carName, brand) {
  const haystack = (carId + ' ' + (carName || '') + ' ' + (brand || '')).toLowerCase();
  for (const kw of BRAND_COUNTRY_KEYS_SORTED) {
    if (haystack.includes(kw)) return BRAND_TO_COUNTRY[kw];
  }
  return null;
}

function findCountryFromTags(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const key = String(tag).toLowerCase().replace(/^#+/, '').trim();
    if (TAG_TO_COUNTRY[key]) return TAG_TO_COUNTRY[key];
  }
  return null;
}

function findCarCountry(car) {
  if (!car) return null;
  return findManufacturerCountry(car.id, car.name, car.brand)
      || findCountryFromTags(car.tags);
}

/* ============================================================
   TIME PICKER
   ============================================================ */
function populateTimePickers() {
  const h = document.getElementById('session-start-hour');
  const m = document.getElementById('session-start-minute');
  if (!h || !m) return;
  h.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const opt = document.createElement('option');
    const v = String(i).padStart(2, '0');
    opt.value = v; opt.textContent = v;
    h.appendChild(opt);
  }
  m.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const opt = document.createElement('option');
    const v = String(i).padStart(2, '0');
    opt.value = v; opt.textContent = v;
    m.appendChild(opt);
  }
}

function getTimeStringFromPicker() {
  const h = document.getElementById('session-start-hour');
  const m = document.getElementById('session-start-minute');
  if (!h || !m) return '12:00';
  return `${h.value}:${m.value}`;
}

function setTimePickerFromString(timeStr) {
  const h = document.getElementById('session-start-hour');
  const m = document.getElementById('session-start-minute');
  if (!h || !m) return;
  if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [hh, mm] = timeStr.split(':');
    h.value = String(hh).padStart(2, '0');
    m.value = String(mm).padStart(2, '0');
  }
}

/* ============================================================
   HELPERS DOM
   ============================================================ */
function getValue(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function setValue(id, val) { const el = document.getElementById(id); if (el && val != null) el.value = val; }
function getChecked(id) { const el = document.getElementById(id); return el ? el.checked : false; }
function setChecked(id, val) { const el = document.getElementById(id); if (el && val != null) el.checked = Boolean(val); }

/* ============================================================
   PARSING DE LIEN DE SERVEUR
   ============================================================ */
function parseServerLink(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  s = s.replace(/^["'<>\s]+|["'<>\s]+$/g, '');
  if (!s) return null;

  let ip = '', httpPort = 0, gamePort = 0, password = '';

  // 1) Format URL avec query params (acstuff.club, acmanager://, etc.)
  const ipMatch = s.match(/[?&]ip=([^&\s]+)/i);
  if (ipMatch) ip = decodeURIComponent(ipMatch[1]);

  const httpMatch = s.match(/[?&]httpPort=([^&\s]+)/i);
  if (httpMatch) httpPort = parseInt(httpMatch[1], 10) || 0;

  const portMatch = s.match(/[?&](?:port|gamePort|tcpPort)=([^&\s]+)/i);
  if (portMatch) gamePort = parseInt(portMatch[1], 10) || 0;

  const pwdMatch = s.match(/[?&](?:password|pass|pwd)=([^&\s]*)/i);
  if (pwdMatch) password = decodeURIComponent(pwdMatch[1] || '');

  // 2) Format simple IP:PORT (avec ou sans protocole devant)
  if (!ip) {
    const ipport = s.match(/([\d\.a-zA-Z\-]+):(\d+)$/);
    if (ipport) {
      ip = ipport[1];
      gamePort = parseInt(ipport[2], 10);
    }
  }

  // 3) Fallback : n'importe quelle IPv4 dans la chaîne
  if (!ip) {
    const anyIp = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (anyIp) ip = anyIp[1];
  }

  if (!ip) return null;

  // 4) Détermine le gamePort (convention AssettoServer : gamePort = httpPort - 1)
  if (!gamePort && httpPort) gamePort = httpPort - 1;
  if (!gamePort && !httpPort) return null;
  if (gamePort <= 0 || gamePort > 65535) return null;

  return {
    ip: ip,
    port: gamePort,
    httpPort: httpPort || (gamePort + 1),
    password: password
  };
}