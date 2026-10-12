/* ============================================================
   QACRL — Serveurs en ligne (liste GS4u)
   ============================================================ */

// Helper : traduit une chaîne hardcodée via I18n.tFr si dispo
function tSrv(s) {
  return (window.I18n && window.I18n.tFr) ? window.I18n.tFr(s) : s;
}

/* ============================================================
   SERVEURS MANUELS
   ============================================================ */
function renderManualServers() {
  const container = document.getElementById('online-manual-list');
  if (!container) return;
  container.innerHTML = '';

  let list = appData.customServers || [];

  // Filtre favoris
  if (typeof manualFilter !== 'undefined' && manualFilter.favoritesOnly) {
    list = list.filter(srv => isFavoriteServer(srv));
  }

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'servers-empty';
    empty.textContent = (typeof manualFilter !== 'undefined' && manualFilter.favoritesOnly)
      ? 'Aucun serveur favori enregistré. Ajoute une étoile ⭐ à un de tes serveurs.'
      : 'Aucun serveur manuel enregistré. Ajoute-en un ci-dessus.';
    container.appendChild(empty);
    return;
  }

  list.forEach((srv) => {
    // On retrouve l'index RÉEL dans appData.customServers (car list peut être filtrée)
    const realIndex = appData.customServers.indexOf(srv);
    const row = document.createElement('div');
    row.className = 'server-row';
    const fav = isFavoriteServer(srv);
    row.innerHTML = `
      <div class="server-flag">🔧</div>
      <div class="server-info">
        <div class="server-name">${srv.name || tSrv('(sans nom)')}</div>
        <div class="server-meta">
          <code>${srv.ip}:${srv.port}</code>
          <span>${tSrv('Serveur manuel')}</span>
        </div>
      </div>
      <div class="server-players empty">—</div>
      <button class="server-fav-btn ${fav ? 'active' : ''}" title="${fav ? tSrv('Retirer des favoris') : tSrv('Ajouter aux favoris')}">${fav ? '★' : '☆'}</button>
      <button class="server-action edit" title="${tSrv('Modifier')}">⚙️</button>
      <button class="server-action join">▶ ${tSrv('Rejoindre')}</button>
      <button class="server-action delete" title="${tSrv('Supprimer')}">🗑️</button>
    `;

    row.querySelector('.server-fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteServer(srv);
    });
    row.querySelector('.join').addEventListener('click', () => openServerJoinModal(srv));
    row.querySelector('.edit').addEventListener('click', () => openEditServerModal(realIndex));
    row.querySelector('.delete').addEventListener('click', () => {
      if (!confirm(`Supprimer le serveur "${srv.name || srv.ip}" ?`)) return;
      appData.customServers.splice(realIndex, 1);
      saveCurrentState();
      renderManualServers();
    });
    container.appendChild(row);
  });
}

/* ============================================================
   MODALE D'ÉDITION DE SERVEUR MANUEL
   ============================================================ */
let currentEditIndex = -1;

function openEditServerModal(index) {
  if (index < 0 || !appData.customServers || !appData.customServers[index]) return;
  currentEditIndex = index;
  const srv = appData.customServers[index];

  document.getElementById('server-edit-name').value = srv.name || '';
  document.getElementById('server-edit-ip').value = `${srv.ip}:${srv.port}`;
  document.getElementById('server-edit-modal').style.display = 'flex';

  setTimeout(() => document.getElementById('server-edit-name').focus(), 100);
}

function closeServerEditModal() {
  document.getElementById('server-edit-modal').style.display = 'none';
  currentEditIndex = -1;
}

function saveServerEdit() {
  if (currentEditIndex < 0) return;
  const srv = appData.customServers[currentEditIndex];
  if (!srv) return;

  const newName = (document.getElementById('server-edit-name').value || '').trim();
  const newIpPort = (document.getElementById('server-edit-ip').value || '').trim();

  const m = newIpPort.match(/^([\w.\-]+):(\d{1,5})$/);
  if (!m) {
    alert('Format invalide. Attendu : IP:PORT (ex: 51.38.180.172:28093)');
    return;
  }

  const port = parseInt(m[2], 10);
  if (!port || port < 1 || port > 65535) {
    alert('Port invalide.');
    return;
  }

  appData.customServers[currentEditIndex] = {
    ...srv,
    name: newName || `${m[1]}:${port}`,
    ip: m[1],
    port,
    httpPort: port + 1
  };

  saveCurrentState();
  renderManualServers();
  closeServerEditModal();
}

// Handlers de la modale d'édition (à appeler une seule fois au démarrage)
function setupServerEditModalHandlers() {
  document.getElementById('server-edit-close')?.addEventListener('click', closeServerEditModal);
  document.getElementById('server-edit-cancel')?.addEventListener('click', closeServerEditModal);
  document.getElementById('server-edit-save')?.addEventListener('click', saveServerEdit);
  document.getElementById('server-edit-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('server-edit-modal')) closeServerEditModal();
  });
}

/* ============================================================
   TRI
   ============================================================ */
function applyOnlineSort(servers) {
  const arr = servers.slice();
  const dir = onlineSort.dir === 'asc' ? 1 : -1;
  switch (onlineSort.by) {
    case 'name':
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr') * dir);
      break;
    case 'players':
      arr.sort((a, b) => ((a.playersCurrent || 0) - (b.playersCurrent || 0)) * dir);
      break;
    case 'country':
      arr.sort((a, b) => ((a.countryName || '').localeCompare(b.countryName || '', 'fr') || (a.name || '').localeCompare(b.name || '', 'fr')) * dir);
      break;
    case 'rating':
      arr.sort((a, b) => ((a.rating || 0) - (b.rating || 0)) * dir);
      break;
  }
  return arr;
}

function updateSortButtonsUI() {
  const buttons = [
    { id: 'btn-sort-name', key: 'name' },
    { id: 'btn-sort-players', key: 'players' },
    { id: 'btn-sort-country', key: 'country' },
    { id: 'btn-sort-rating', key: 'rating' }
  ];
  buttons.forEach(({ id, key }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', onlineSort.by === key);
    const existingArrow = btn.querySelector('.sort-arrow');
    if (existingArrow) existingArrow.remove();
    if (onlineSort.by === key) {
      const span = document.createElement('span');
      span.className = 'sort-arrow';
      span.textContent = onlineSort.dir === 'desc' ? ' ▼' : ' ▲';
      btn.appendChild(span);
    }
  });
}

/* ============================================================
   FILTRES
   ============================================================ */
function getUniqueCountries(servers) {
  const set = new Set();
  servers.forEach(s => { if (s.countryName) set.add(s.countryName); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

function getUniqueTracks(servers) {
  const set = new Set();
  servers.forEach(s => { if (s.map) set.add(s.map); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

function updateOnlineFilterDropdowns() {
  const countrySelect = document.getElementById('online-filter-country');
  const trackSelect = document.getElementById('online-filter-track');
  if (!countrySelect || !trackSelect) return;

  const servers = appData.onlineServers || [];
  const countries = getUniqueCountries(servers);
  const tracks = getUniqueTracks(servers);

  const prevCountry = countrySelect.value;
  countrySelect.innerHTML = '<option value="">Tous les pays</option>';
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    countrySelect.appendChild(opt);
  });
  if (prevCountry && countries.includes(prevCountry)) countrySelect.value = prevCountry;
  else { countrySelect.value = ''; onlineFilter.country = ''; }

  const prevTrack = trackSelect.value;
  trackSelect.innerHTML = '<option value="">Tous les circuits</option>';
  tracks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    trackSelect.appendChild(opt);
  });
  if (prevTrack && tracks.includes(prevTrack)) trackSelect.value = prevTrack;
  else { trackSelect.value = ''; onlineFilter.track = ''; }
}

/* ============================================================
   PING
   ============================================================ */
function getPingClass(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 100) return 'good';
  if (ms < 300) return 'ok';
  return 'bad';
}

async function pingAllServersInBackground() {
  const servers = appData.onlineServers || [];
  const CONCURRENCY = 6;
  let idx = 0;

  async function worker() {
    while (idx < servers.length) {
      const myIdx = idx++;
      const srv = servers[myIdx];
      if (appData.serverPings[srv.id]) continue;

      try {
        const res = await window.api.pingServer(srv.ip, srv.port);
        if (res && res.success) {
          appData.serverPings[srv.id] = { ms: res.ms, status: 'ok' };
        } else {
          appData.serverPings[srv.id] = { ms: null, status: 'fail' };
        }
      } catch (e) {
        appData.serverPings[srv.id] = { ms: null, status: 'fail' };
      }

      const el = document.querySelector(`.server-ping[data-ping-id="${srv.id}"]`);
      if (el) {
        const d = appData.serverPings[srv.id];
        if (d.status === 'ok') {
          el.className = 'server-ping ' + getPingClass(d.ms);
          el.textContent = d.ms + ' ms';
        } else {
          el.className = 'server-ping bad';
          el.textContent = '✕';
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

/* ============================================================
   SERVEURS RÉCENTS
   ============================================================ */
function pushRecentServer(server, info) {
  if (!server || !server.ip || !server.port) return;
  if (!Array.isArray(appData.recentServers)) appData.recentServers = [];

  const key = `${server.ip}:${server.port}`;
  appData.recentServers = appData.recentServers.filter(s => `${s.ip}:${s.port}` !== key);

  appData.recentServers.unshift({
    ip: server.ip,
    port: server.port,
    httpPort: (info && info.httpPort) || server.httpPort || (server.port + 1),
    name: (info && info.name) || server.name || `${server.ip}:${server.port}`,
    track: (info && info.track) || '',
    trackConfig: (info && info.trackConfig) || '',
    countryCode: server.countryCode || '',
    countryName: server.countryName || '',
    playersCurrent: (info && info.clients) || server.playersCurrent || 0,
    playersMax: (info && info.maxClients) || server.playersMax || 0,
    date: Date.now()
  });

  if (appData.recentServers.length > 15) appData.recentServers.length = 15;
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '—';
  const tFr = (window.I18n && window.I18n.tFr) ? window.I18n.tFr : (s) => s;
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return tFr("à l'instant");
  if (min < 60) return tFr('il y a') + ' ' + min + ' ' + tFr('min');
  const h = Math.floor(min / 60);
  if (h < 24) return tFr('il y a') + ' ' + h + 'h';
  const d = Math.floor(h / 24);
  if (d < 30) return tFr('il y a') + ' ' + d + 'j';
  const mo = Math.floor(d / 30);
  return tFr('il y a') + ' ' + mo + ' ' + tFr('mois');
}

function renderRecentServers() {
  const container = document.getElementById('online-recent-list');
  if (!container) return;
  container.innerHTML = '';

let recent = appData.recentServers || [];

  // Filtre favoris
  if (typeof recentFilter !== 'undefined' && recentFilter.favoritesOnly) {
    recent = recent.filter(srv => isFavoriteServer(srv));
  }

  if (recent.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'servers-empty';
    empty.textContent = "Aucun serveur récent. Rejoins un serveur pour qu'il apparaisse ici.";
    container.appendChild(empty);
    return;
  }

  recent.forEach((srv, index) => {
    const row = document.createElement('div');
    row.className = 'server-row';

    const flagDisplay = (srv.countryCode || '🌐').toUpperCase();
    const timeAgo = formatTimeAgo(srv.date);
    const fav = isFavoriteServer(srv);

    row.innerHTML = `
      <div class="server-flag" title="${srv.countryName || ''}">${flagDisplay}</div>
      <div class="server-info">
        <div class="server-name">${srv.name || tSrv('(sans nom)')}</div>
        <div class="server-meta">
          <code>${srv.ip}:${srv.port}</code>
          <span>🕒 ${timeAgo}</span>
          ${srv.track ? `<span>${srv.track}</span>` : ''}
        </div>
      </div>
      <div class="server-players empty">—</div>
      <button class="server-fav-btn ${fav ? 'active' : ''}" title="${fav ? tSrv('Retirer des favoris') : tSrv('Ajouter aux favoris')}">${fav ? '★' : '☆'}</button>
      <button class="server-action edit" title="${tSrv('Modifier')}">⚙️</button>
      <button class="server-action join">▶ ${tSrv('Rejoindre')}</button>
      <button class="server-action delete" title="${tSrv('Retirer de l\'historique')}">🗑️</button>
    `;

    row.querySelector('.server-fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteServer(srv);
    });

    row.querySelector('.edit').addEventListener('click', () => {
      openEditServerModalFromRecent(srv);
    });

    row.querySelector('.join').addEventListener('click', () => {
      const srvObj = {
        id: `recent_${srv.ip}_${srv.port}`,
        ip: srv.ip,
        port: srv.port,
        httpPort: srv.httpPort || (srv.port + 1),
        name: srv.name || '',
        playersCurrent: srv.playersCurrent || 0,
        playersMax: srv.playersMax || 0,
        countryCode: srv.countryCode || '',
        countryName: srv.countryName || '',
        source: 'recent'
      };
      openServerJoinModal(srvObj);
    });

    row.querySelector('.delete').addEventListener('click', () => {
      if (!confirm(`Retirer "${srv.name || srv.ip}" de l'historique ?`)) return;
      appData.recentServers.splice(index, 1);
      saveCurrentState();
      renderRecentServers();
    });

    container.appendChild(row);
  });
}

/**
 * Ouvre la modale d'édition depuis un serveur "récent".
 * Comme un récent n'est pas dans appData.customServers, on l'AJOUTE
 * aux serveurs manuels puis on ouvre l'édition sur ce nouvel index.
 */
function openEditServerModalFromRecent(srv) {
  if (!appData.customServers) appData.customServers = [];
  const newIndex = appData.customServers.push({
    id: 'srv_' + Date.now(),
    ip: srv.ip,
    port: srv.httpPort || srv.port,
    httpPort: srv.httpPort || (srv.port + 1),
    name: srv.name || `${srv.ip}:${srv.port}`
  }) - 1;

  saveCurrentState();
  renderManualServers();
  openEditServerModal(newIndex);
}

/* ============================================================
   RENDU DE LA LISTE
   ============================================================ */
function renderOnlineServers() {
  const container = document.getElementById('online-servers-list');
  if (!container) return;
  container.innerHTML = '';

  const search = (onlineFilter.search || '').toLowerCase();
  const minPlayers = parseInt(onlineFilter.minPlayers, 10) || 0;
  let servers = appData.onlineServers || [];

  if (search) {
    servers = servers.filter(s =>
      (s.name || '').toLowerCase().includes(search) ||
      (s.map || '').toLowerCase().includes(search) ||
      (`${s.ip}:${s.port}`).toLowerCase().includes(search) ||
      (s.countryName || '').toLowerCase().includes(search)
    );
  }
  if (onlineFilter.country) {
    servers = servers.filter(s => s.countryName === onlineFilter.country);
  }
  if (onlineFilter.track) {
    servers = servers.filter(s => s.map === onlineFilter.track);
  }
  if (minPlayers > 0) {
    servers = servers.filter(s => (s.playersCurrent || 0) >= minPlayers);
  }
  if (onlineFilter.favoritesOnly) {
    servers = servers.filter(s => isFavoriteServer(s));
  }

  servers = applyOnlineSort(servers);

  const countEl = document.getElementById('online-servers-count');
  if (countEl) countEl.textContent = `${servers.length} serveur(s)`;

  if (servers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'servers-empty';
    empty.textContent = appData.onlineServers.length === 0
      ? 'Clique sur "Rafraîchir" pour charger la liste des serveurs.'
      : 'Aucun serveur ne correspond à ta recherche.';
    container.appendChild(empty);
    return;
  }

  servers.forEach(srv => {
    const row = document.createElement('div');
    row.className = 'server-row';

    const playerClass = srv.playersMax > 0 && srv.playersCurrent >= srv.playersMax
      ? 'full'
      : (srv.playersCurrent === 0 ? 'empty' : '');

    const flagDisplay = (srv.countryCode || '??').toUpperCase();
    const fav = isFavoriteServer(srv);

    const pingData = appData.serverPings[srv.id];
    let pingHtml = '<div class="server-ping" data-ping-id="' + srv.id + '">⏳</div>';
    if (pingData) {
      if (pingData.status === 'ok') {
        const cls = getPingClass(pingData.ms);
        pingHtml = `<div class="server-ping ${cls}" data-ping-id="${srv.id}">${pingData.ms} ms</div>`;
      } else {
        pingHtml = `<div class="server-ping bad" data-ping-id="${srv.id}">✕</div>`;
      }
    }

    row.innerHTML = `
      <div class="server-flag" title="${srv.countryName || ''}">${flagDisplay}</div>
      <div class="server-info">
        <div class="server-name">${srv.name || tSrv('(sans nom)')}</div>
        <div class="server-meta">
          <code>${srv.ip}:${srv.port}</code>
          ${srv.map ? `<span>${srv.map}</span>` : ''}
          ${srv.rating ? `<span>⭐ ${srv.rating}</span>` : ''}
        </div>
      </div>
      <div class="server-players ${playerClass}">${srv.playersCurrent} / ${srv.playersMax}</div>
      ${pingHtml}
      <button class="server-fav-btn ${fav ? 'active' : ''}" title="${fav ? tSrv('Retirer des favoris') : tSrv('Ajouter aux favoris')}">${fav ? '★' : '☆'}</button>
      <button class="server-action join">▶ ${tSrv('Rejoindre')}</button>
    `;
    row.querySelector('.server-fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteServer(srv);
    });
    row.querySelector('.join').addEventListener('click', () => openServerJoinModal(srv));
    container.appendChild(row);
  });
}

/* ============================================================
   FETCH GS4u
   ============================================================ */
async function fetchOnlineServers(append = false) {
  if (isLoadingServers) return;
  isLoadingServers = true;

  const container = document.getElementById('online-servers-list');
  const nextPage = append ? (appData.onlineServersPage + 1) : 1;

  if (!append) {
    appData.onlineServers = [];
    appData.onlineServersPage = 0;
    appData.serverPings = {};
    if (container) container.innerHTML = '<div class="servers-loading">⏳ Chargement des serveurs...</div>';
  } else {
    if (container) container.insertAdjacentHTML('beforeend', '<div class="servers-loading" id="online-loading-more">⏳ Chargement de la page suivante...</div>');
  }

  try {
    const res = await window.api.fetchOnlineServers(nextPage);
    const existingLoading = document.getElementById('online-loading-more');
    if (existingLoading) existingLoading.remove();

    if (!res || !res.success) {
      if (container) container.innerHTML = `<div class="servers-empty">❌ Erreur : ${res?.error || 'inconnue'}</div>`;
      return;
    }

    appData.onlineServers = append ? [...appData.onlineServers, ...res.servers] : res.servers;
    appData.onlineServersPage = res.page;
    appData.onlineServersHasNext = res.hasNext;

    updateOnlineFilterDropdowns();
    renderOnlineServers();

    pingAllServersInBackground();
  } catch (err) {
    if (container) container.innerHTML = `<div class="servers-empty">❌ Erreur : ${err.message}</div>`;
  } finally {
    isLoadingServers = false;
  }
}