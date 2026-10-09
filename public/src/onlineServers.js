/* ============================================================
   QACRL — Serveurs en ligne (liste GS4u)
   ============================================================ */

/* ============================================================
   SERVEURS MANUELS
   ============================================================ */
function renderManualServers() {
  const container = document.getElementById('online-manual-list');
  if (!container) return;
  container.innerHTML = '';

  if (!appData.customServers || appData.customServers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'servers-empty';
    empty.textContent = 'Aucun serveur manuel enregistré. Ajoute-en un ci-dessus.';
    container.appendChild(empty);
    return;
  }

  appData.customServers.forEach((srv, index) => {
    const row = document.createElement('div');
    row.className = 'server-row';
    const fav = isFavoriteServer(srv);
    row.innerHTML = `
      <div class="server-flag">🔧</div>
      <div class="server-info">
        <div class="server-name">${srv.name || '(sans nom)'}</div>
        <div class="server-meta">
          <code>${srv.ip}:${srv.port}</code>
          <span>Serveur manuel</span>
        </div>
      </div>
      <div class="server-players empty">—</div>
      <button class="server-fav-btn ${fav ? 'active' : ''}" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>
      <button class="server-action join">▶ Rejoindre</button>
      <button class="server-action delete" title="Supprimer">🗑️</button>
    `;
    row.querySelector('.server-fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteServer(srv);
    });
    row.querySelector('.join').addEventListener('click', () => openServerJoinModal(srv));
    row.querySelector('.delete').addEventListener('click', () => {
      if (!confirm(`Supprimer le serveur "${srv.name || srv.ip}" ?`)) return;
      appData.customServers.splice(index, 1);
      saveCurrentState();
      renderManualServers();
    });
    container.appendChild(row);
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
        <div class="server-name">${srv.name || '(sans nom)'}</div>
        <div class="server-meta">
          <code>${srv.ip}:${srv.port}</code>
          ${srv.map ? `<span>${srv.map}</span>` : ''}
          ${srv.rating ? `<span>⭐ ${srv.rating}</span>` : ''}
        </div>
      </div>
      <div class="server-players ${playerClass}">${srv.playersCurrent} / ${srv.playersMax}</div>
      ${pingHtml}
      <button class="server-fav-btn ${fav ? 'active' : ''}" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>
      <button class="server-action join">▶ Rejoindre</button>
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