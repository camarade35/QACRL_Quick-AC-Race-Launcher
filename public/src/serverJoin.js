/* ============================================================
   QACRL — Modale "Rejoindre un serveur"
   ============================================================ */

/* ============================================================
   VÉRIFICATIONS
   ============================================================ */
function checkTrackAvailability(track, trackConfig) {
  if (!track) return { ok: false, reason: 'no-track-info' };

  const cleaned = cleanTrackPath(track);
  const cleanTrackName = cleaned.track || track;

  const localTrack = (appData.tracks || []).find(t => t.id.toLowerCase() === cleanTrackName.toLowerCase());
  if (!localTrack) return { ok: false, reason: 'track-missing', track: cleanTrackName, trackConfig };

  const cfg = trackConfig || cleaned.trackConfig;
  if (cfg) {
    const hasVariant = (localTrack.variants || []).some(v => (v.id || '').toLowerCase() === cfg.toLowerCase());
    if (!hasVariant && localTrack.variants.length > 0) {
      return { ok: false, reason: 'layout-missing', track: cleanTrackName, trackConfig: cfg };
    }
  }
  return { ok: true, localTrack };
}

/* ============================================================
   BLOC MODS MANQUANTS
   ============================================================ */
function renderMissingModsBlock(title, missingIds) {
  if (!missingIds || missingIds.length === 0) return '';
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const idsHtml = missingIds.map(id => {
    const safe = String(id).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="missing-mod-id" data-mod-id="${safe}">
      <span class="missing-mod-name">${safe}</span>
      <button class="missing-mod-search" data-mod-search="${safe}" title="Chercher ce mod sur DuckDuckGo">🔍</button>
    </span>`;
  }).join('');

  return `
    <div class="missing-mods-block">
      <div class="missing-mods-header">
        <span>${safeTitle} (${missingIds.length})</span>
        <button class="missing-mods-copy" data-copy-mods="${encodeURIComponent(missingIds.join('\n'))}">📋 Copier</button>
      </div>
      <div class="missing-mods-list">${idsHtml}</div>
    </div>
  `;
}

function wireMissingModsEvents(rootEl) {
  if (!rootEl) return;

  rootEl.querySelectorAll('.missing-mods-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = decodeURIComponent(btn.dataset.copyMods || '');
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copié !';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }).catch(() => {
        alert('Copie échouée. Contenu :\n\n' + text);
      });
    });
  });

  rootEl.querySelectorAll('.missing-mod-search').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const modId = btn.dataset.modSearch || '';
      if (!modId) return;
      const url = buildModSearchUrl(modId);
      try {
        await window.api.openExternal(url);
      } catch (err) {
        alert('Impossible d\'ouvrir le navigateur : ' + err.message);
      }
    });
  });
}

/* ============================================================
   FEATURES CSP
   ============================================================ */
function renderFeaturesBadges(features) {
  if (!Array.isArray(features) || features.length === 0) return '';

  return features.map(feat => {
    const meta = CSP_FEATURE_META[feat] || { icon: '⚙️', label: feat, title: feat };
    return `<span class="csp-feature" title="${meta.title}">
      <span class="csp-feature-icon">${meta.icon}</span>
      <span class="csp-feature-label">${meta.label}</span>
    </span>`;
  }).join('');
}

/* ============================================================
   CHARGEMENT DES INFOS SERVEUR
   ============================================================ */
async function fetchServerDataUnified(server) {
  // 1) Tentative /api/details (AssettoServer)
  try {
    const res = await window.api.fetchServerDetails(server.ip, server.port, null);
    if (res && res.success && res.details) {
      const d = res.details;
      let carsList = Array.isArray(d.cars) ? d.cars.slice() : [];
      if (carsList.length === 0 && d.slotsByCar) {
        carsList = Object.keys(d.slotsByCar);
      }

      return {
        source: 'assettoserver',
        info: {
          name: d.name || server.name || '',
          track: d.track || '',
          trackConfig: d.trackConfig || '',
          trackFull: d.trackFull || d.track || '',
          cars: carsList,
          clients: d.clients || 0,
          maxClients: d.maxClients || 0,
          passwordRequired: !!d.passwordRequired,
          description: d.description || '',
          slotsByCar: d.slotsByCar || {},
          drivers: d.drivers || [],
          gamePort: d.gamePort || server.port,
          httpPort: d.httpPort || (server.port + 1),
          currentWeatherId: d.currentWeatherId || '',
          ambientTemperature: d.ambientTemperature,
          roadTemperature: d.roadTemperature,
          grip: d.grip,
          poweredBy: d.poweredBy || '',
          country: d.country || [],
          features: Array.isArray(d.features) ? d.features : [],
          city: d.city || '',
          frequency: d.frequency,
          until: d.until
        }
      };
    }
  } catch (e) {
    console.warn('[fetchServerDataUnified] /api/details KO, fallback /INFO + /ENTRY :', e.message);
  }

  // 2) Fallback /INFO + /ENTRY
  const infoRes = await window.api.fetchServerInfo(server.ip, server.port);
  if (!infoRes || !infoRes.success) {
    throw new Error(infoRes?.error || 'Serveur injoignable (ni /api/details ni /INFO).');
  }

  let slotsByCar = {};
  let drivers = [];
  try {
    const occRes = await window.api.fetchServerOccupancy(
      server.ip,
      server.port,
      infoRes.gamePort || server.port
    );
    if (occRes && occRes.success) {
      slotsByCar = occRes.slotsByCar || {};
      drivers = occRes.drivers || [];
    }
  } catch (e) {
    console.warn('[fetchServerDataUnified] /ENTRY KO :', e.message);
  }

  return {
    source: 'kunos',
    info: {
      name: infoRes.name || server.name || '',
      track: infoRes.track || '',
      trackConfig: infoRes.trackConfig || '',
      trackFull: infoRes.trackFull || infoRes.track || '',
      cars: Array.isArray(infoRes.cars) ? infoRes.cars : [],
      clients: infoRes.clients || 0,
      maxClients: infoRes.maxClients || 0,
      passwordRequired: !!infoRes.passwordRequired,
      description: '',
      slotsByCar: slotsByCar,
      drivers: drivers,
      gamePort: infoRes.gamePort || server.port,
      httpPort: infoRes.httpPort || (server.port + 1),
      features: [],
      city: '',
      frequency: null,
      until: null
    }
  };
}

/* ============================================================
   RENDU MODALE
   ============================================================ */
function applyServerJoinData(unified) {
  const info = unified.info;

  // En-tête
  document.getElementById('server-join-name').textContent = info.name || serverJoinState.server.name || '(sans nom)';
  const trackDisplay = info.trackConfig
    ? `${info.track} (${info.trackConfig})`
    : (info.trackFull || info.track || '—');
  document.getElementById('server-join-track').textContent = trackDisplay;
  document.getElementById('server-join-players').textContent = `${info.clients} / ${info.maxClients}`;
  document.getElementById('server-join-password-required').textContent = info.passwordRequired ? '🔒 Oui' : 'Non';

  // Features CSP
  const featuresContainer = document.getElementById('server-join-features');
  if (featuresContainer) {
    if (info.features && info.features.length > 0) {
      featuresContainer.innerHTML = `
        <div class="csp-features-label">CSP Features</div>
        <div class="csp-features-list">${renderFeaturesBadges(info.features)}</div>
      `;
      featuresContainer.style.display = 'block';
    } else {
      featuresContainer.innerHTML = '';
      featuresContainer.style.display = 'none';
    }
  }

  // Description BBCode
  const descEl = document.getElementById('server-join-description');
  const descWrap = document.getElementById('server-join-description-wrap');
  if (info.description && descEl && descWrap) {
    descEl.innerHTML = bbcodeToHtml(info.description);
    descEl.style.display = 'block';
    descWrap.style.display = 'block';

    descEl.querySelectorAll('a[data-external-url]').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await window.api.openExternal(a.dataset.externalUrl); } catch (_) {}
      });
    });
  } else if (descEl && descWrap) {
    descEl.innerHTML = '';
    descWrap.style.display = 'none';
  }

  // Vérif circuit local
  const trackCheck = checkTrackAvailability(info.track, info.trackConfig);
  serverJoinState.trackMissing = !trackCheck.ok;

  // Filtre voitures : serveur ∩ local
  const localCars = appData.cars || [];
  const serverCars = info.cars || [];
  const commonCars = serverCars.filter(id =>
    localCars.some(c => c.id.toLowerCase() === id.toLowerCase())
  );

  const slotsByCar = info.slotsByCar || {};

  serverJoinState.availableCars = commonCars.map(id => {
    const local = localCars.find(c => c.id.toLowerCase() === id.toLowerCase());
    let occ = null;
    if (slotsByCar[local.id]) occ = slotsByCar[local.id];
    else {
      const key = Object.keys(slotsByCar).find(k => k.toLowerCase() === local.id.toLowerCase());
      if (key) occ = slotsByCar[key];
    }
    return {
      id: local.id,
      name: local.name || local.id,
      skins: local.skins || [],
      max: occ ? occ.max : null,
      used: occ ? occ.used : null,
      free: occ ? occ.free : null
    };
  });

  // Détection mods manquants
  const warnings = [];
  let missingModsHtml = '';

  if (!trackCheck.ok) {
    if (trackCheck.reason === 'track-missing') {
      warnings.push(`❌ Tu n'as pas le circuit <code>${trackCheck.track}</code>. Installe-le via <strong>Gestion Mods</strong>.`);
      missingModsHtml += renderMissingModsBlock('Circuits manquants', [trackCheck.track]);
    } else if (trackCheck.reason === 'layout-missing') {
      warnings.push(`❌ Tu as le circuit <code>${trackCheck.track}</code> mais pas le layout <code>${trackCheck.trackConfig}</code>.`);
      missingModsHtml += renderMissingModsBlock('Layouts manquants', [`${trackCheck.track}-${trackCheck.trackConfig}`]);
    }
  }

  const missingCars = serverCars.filter(id =>
    !localCars.some(c => c.id.toLowerCase() === id.toLowerCase())
  );
  if (commonCars.length === 0) {
    warnings.push(`❌ Aucune voiture en commun avec le serveur (serveur a ${serverCars.length} voitures, tu en as ${localCars.length}). Installe au moins une voiture via <strong>Gestion Mods</strong>.`);
  }
  if (missingCars.length > 0) {
    warnings.push(`⚠️ ${missingCars.length} voiture(s) du serveur ne sont pas installées chez toi.`);
    missingModsHtml += renderMissingModsBlock('Voitures manquantes', missingCars);
  }

  if (info.passwordRequired) {
    warnings.push(`🔒 Ce serveur nécessite un mot de passe.`);
  }

  if (unified.source === 'assettoserver' && info.poweredBy) {
    warnings.push(`ℹ️ Serveur détecté via <code>${info.poweredBy}</code> — infos détaillées disponibles.`);
  } else if (unified.source === 'kunos') {
    warnings.push(`ℹ️ Serveur Kunos classique — pas de description ni de slots avancés disponibles.`);
  }

  if (unified.source === 'assettoserver' && Object.keys(slotsByCar).length === 0) {
    warnings.push(`⚠️ Liste des slots vide — toutes les voitures restent cliquables.`);
  }
  if (unified.source === 'kunos' && Object.keys(slotsByCar).length === 0) {
    warnings.push(`⚠️ Impossible de récupérer les slots occupés (le serveur n'a pas répondu sur /ENTRY). Toutes les voitures restent cliquables.`);
  }

  const warnEl = document.getElementById('server-join-warnings');
  warnEl.innerHTML =
    warnings.map(w => `<div class="server-join-warning${/^❌/.test(w) ? ' error' : ''}">${w}</div>`).join('')
    + missingModsHtml;

  wireMissingModsEvents(warnEl);

  // Auto-suffixe du online name
  try {
    const desiredName = (getValue('online-name') || '').trim() || (getValue('player-name') || '').trim() || 'Player';
    const takenLower = new Set((info.drivers || []).map(d => String(d).toLowerCase()));
    if (takenLower.has(desiredName.toLowerCase())) {
      let finalName = desiredName;
      let i = 1;
      while (takenLower.has(finalName.toLowerCase()) && i < 100) {
        finalName = `${desiredName}_${i}`;
        i++;
      }
      warnEl.innerHTML += `<div class="server-join-warning">💡 Ton nom "<code>${desiredName}</code>" est déjà pris, il sera remplacé par <code>${finalName}</code>.</div>`;
      serverJoinState.resolvedOnlineName = finalName;
    } else {
      serverJoinState.resolvedOnlineName = desiredName;
    }
  } catch (e) {
    serverJoinState.resolvedOnlineName = null;
  }

  // ⭐ Profil serveur : pré-sélectionne le combo mémorisé
  const profileKey = `${serverJoinState.server.ip}:${serverJoinState.server.port}`;
  const profile = (appData.serverProfiles || {})[profileKey];
  if (profile && profile.car) {
    const profileCar = serverJoinState.availableCars.find(c => c.id === profile.car);
    if (profileCar) {
      serverJoinState.selectedCar = profileCar.id;
      // Vérifie que la skin existe toujours dans cette voiture
      const skinExists = (profileCar.skins || []).some(s => s.id === profile.skin);
      if (skinExists) serverJoinState.selectedSkin = profile.skin;
    }
  }

  // ⭐ Sélection auto de la 1ère voiture dispo si rien n'est sélectionné
  if (!serverJoinState.selectedCar && serverJoinState.availableCars.length > 0) {
    const firstAvailable = serverJoinState.availableCars.find(
      c => c.free === null || c.free === undefined || c.free > 0
    ) || serverJoinState.availableCars[0];
    serverJoinState.selectedCar = firstAvailable.id;
  }

  renderServerJoinCars();
  updateServerJoinButton();
}

/* ============================================================
   OUVERTURE / FERMETURE / REFRESH
   ============================================================ */
async function openServerJoinModal(server) {
    serverJoinState = {
      server: server,
      info: null,
      occupancy: null,
      details: null,
      availableCars: [],
      selectedCar: null,
      availableSkins: [],
      selectedSkin: null,
      trackMissing: false,
      resolvedOnlineName: null,
      source: null,
      isRefreshing: false
  };

  // Reset UI
  document.getElementById('server-join-name').textContent = server.name || '(sans nom)';
  document.getElementById('server-join-track').textContent = '⏳';
  document.getElementById('server-join-players').textContent = `${server.playersCurrent || 0} / ${server.playersMax || 0}`;
  document.getElementById('server-join-password-required').textContent = '⏳';
  document.getElementById('server-join-warnings').innerHTML = '';
  document.getElementById('server-join-cars').innerHTML = '<div class="servers-loading">⏳ Chargement des voitures du serveur...</div>';

  // ⭐ Pré-remplit le mot de passe mémorisé pour ce serveur
  const pwdKey = `${server.ip}:${server.port}`;
  const savedPwd = (appData.serverPasswords || {})[pwdKey] || '';
  document.getElementById('server-join-password').value = savedPwd;

  // ⭐ Reset section skins
  const skinSection = document.getElementById('server-join-skin-section');
  if (skinSection) skinSection.style.display = 'none';
  const skinList = document.getElementById('server-join-skins');
  if (skinList) skinList.innerHTML = '';

  const descEl = document.getElementById('server-join-description');
  const descWrap = document.getElementById('server-join-description-wrap');
  if (descEl) descEl.innerHTML = '';
  if (descWrap) descWrap.style.display = 'none';

  const featuresEl = document.getElementById('server-join-features');
  if (featuresEl) {
    featuresEl.innerHTML = '';
    featuresEl.style.display = 'none';
  }

  document.getElementById('server-join-modal').style.display = 'flex';

  try {
    const unified = await fetchServerDataUnified(server);
    serverJoinState.info = unified.info;
    serverJoinState.source = unified.source;
    applyServerJoinData(unified);
  } catch (err) {
    document.getElementById('server-join-track').textContent = '❌';
    document.getElementById('server-join-password-required').textContent = '❌';
    document.getElementById('server-join-cars').innerHTML = `<div class="server-join-warning error">Erreur : ${err.message}</div>`;
    updateServerJoinButton();
  }
}

async function refreshServerJoinModal() {
  const server = serverJoinState.server;
  if (!server) return;
  if (serverJoinState.isRefreshing) return;

  serverJoinState.isRefreshing = true;

  const btn = document.getElementById('server-join-refresh');
  const orig = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳';
    btn.style.opacity = '0.6';
  }

  const savedSelectedCar = serverJoinState.selectedCar;
  const savedSelectedSkin = serverJoinState.selectedSkin;

  try {
    const unified = await fetchServerDataUnified(server);
    serverJoinState.info = unified.info;
    serverJoinState.source = unified.source;

    serverJoinState.selectedCar = savedSelectedCar;
    serverJoinState.selectedSkin = savedSelectedSkin;

    applyServerJoinData(unified);

    if (savedSelectedCar) {
      const stillExists = serverJoinState.availableCars.some(c => c.id === savedSelectedCar);
      if (!stillExists) {
        serverJoinState.selectedCar = null;
        serverJoinState.selectedSkin = null;
        renderServerJoinCars();
        updateServerJoinButton();
      }
    }
  } catch (err) {
    console.error('[refreshServerJoinModal]', err);
    const warnEl = document.getElementById('server-join-warnings');
    if (warnEl) {
      warnEl.insertAdjacentHTML('afterbegin',
        `<div class="server-join-warning error">❌ Échec rafraîchissement : ${err.message}</div>`);
    }
  } finally {
    serverJoinState.isRefreshing = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
      btn.style.opacity = '1';
    }
  }
}

function closeServerJoinModal() {
  document.getElementById('server-join-modal').style.display = 'none';
  serverJoinState = {
    server: null, info: null, occupancy: null, details: null,
    availableCars: [], selectedCar: null,
    availableSkins: [], selectedSkin: null,
    trackMissing: false,
    resolvedOnlineName: null, source: null, isRefreshing: false
  };
}

/* ============================================================
   SKINS DE LA VOITURE SÉLECTIONNÉE
   ============================================================ */
function updateSelectedCarSkins() {
  if (!serverJoinState.selectedCar) {
    serverJoinState.availableSkins = [];
    serverJoinState.selectedSkin = null;
    return;
  }
  const car = serverJoinState.availableCars.find(c => c.id === serverJoinState.selectedCar);
  serverJoinState.availableSkins = (car && Array.isArray(car.skins)) ? car.skins.slice() : [];

  const stillValid = serverJoinState.selectedSkin
    && serverJoinState.availableSkins.some(s => s.id === serverJoinState.selectedSkin);
  if (!stillValid) {
    serverJoinState.selectedSkin = serverJoinState.availableSkins[0]?.id || null;
  }
}

function renderServerJoinSkins() {
  const container = document.getElementById('server-join-skins');
  const section = document.getElementById('server-join-skin-section');
  if (!container || !section) return;
  container.innerHTML = '';

  if (serverJoinState.availableSkins.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'flex';

  serverJoinState.availableSkins.forEach(skin => {
    const row = document.createElement('div');
    const isSelected = serverJoinState.selectedSkin === skin.id;
    row.className = 'skin-select-row' + (isSelected ? ' selected' : '');

    const safeName = (skin.name || skin.id || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    let previewHtml;
    if (skin.preview) {
      previewHtml = `<img class="skin-select-preview" src="${skin.preview}" alt="" `
                  + `onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                  + `<div class="skin-select-preview placeholder" style="display:none;">🚗</div>`;
    } else {
      previewHtml = `<div class="skin-select-preview placeholder">🚗</div>`;
    }

    row.innerHTML = `
      ${previewHtml}
      <div class="skin-select-name" title="${safeName}">${safeName}</div>
    `;

    row.addEventListener('click', () => {
      serverJoinState.selectedSkin = skin.id;
      renderServerJoinSkins();
      updateServerJoinButton();
    });

    container.appendChild(row);
  });
}

/* ============================================================
   VOITURES DISPONIBLES
   ============================================================ */
function renderServerJoinCars() {
  // ⭐ Synchronise les skins avec la voiture sélectionnée
  updateSelectedCarSkins();

  const container = document.getElementById('server-join-cars');
  if (!container) return;
  container.innerHTML = '';

  if (serverJoinState.availableCars.length === 0) {
    container.innerHTML = '<div class="server-join-warning error">Aucune voiture disponible.</div>';
    return;
  }

  serverJoinState.availableCars.forEach(car => {
    const row = document.createElement('div');
    const isFull = car.free !== null && car.free !== undefined && car.free <= 0;
    row.className = 'car-select-row'
      + (serverJoinState.selectedCar === car.id ? ' selected' : '')
      + (isFull ? ' disabled' : '');

    let countHtml = '';
    if (car.free !== null && car.free !== undefined && car.max !== null) {
      const cls = isFull ? 'full' : 'free';
      countHtml = `<span class="car-select-count ${cls}">(${car.free}/${car.max})</span>`;
    } else {
      countHtml = `<span class="car-select-count unknown">(?)</span>`;
    }

    row.innerHTML = `
      <div class="car-select-radio"></div>
      <div class="car-select-main">
        <div class="car-select-name">${car.name}</div>
        <div class="car-select-id">${car.id}</div>
      </div>
      ${countHtml}
    `;

    if (!isFull) {
      row.addEventListener('click', () => {
        serverJoinState.selectedCar = car.id;
        serverJoinState.selectedSkin = null;
        renderServerJoinCars();
        updateServerJoinButton();
      });
    }

    container.appendChild(row);
  });

  // ⭐ Affiche les skins de la voiture sélectionnée
  renderServerJoinSkins();
}

function updateServerJoinButton() {

  const btn = document.getElementById('server-join-confirm');
  if (!btn) return;
  const canJoin = !serverJoinState.trackMissing
    && serverJoinState.selectedCar
    && serverJoinState.info;
  btn.disabled = !canJoin;
  btn.style.opacity = canJoin ? '1' : '0.4';
  btn.style.cursor = canJoin ? 'pointer' : 'not-allowed';
}

/* ============================================================
   CONFIRMATION JOINTURE
   ============================================================ */
async function confirmServerJoin() {
  const server = serverJoinState.server;
  const info = serverJoinState.info;
  if (!server || !info) { alert("Infos serveur manquantes."); return; }
  if (serverJoinState.trackMissing) { alert("Circuit manquant en local."); return; }
  if (!serverJoinState.selectedCar) { alert("Sélectionne une voiture."); return; }

  const localCar = (appData.cars || []).find(c => c.id === serverJoinState.selectedCar);
  if (!localCar) { alert("Voiture introuvable en local."); return; }

  // ⭐ Utilise la skin choisie, sinon fallback sur la 1ère
  const skin = serverJoinState.selectedSkin
    || (localCar.skins && localCar.skins.length > 0 ? localCar.skins[0].id : '');

  const flagFile = getValue('player-flag');
  const flagInfo = flagFile
    ? { name: flagFileToCountryName(flagFile), code: flagFileToCountryName(flagFile).substring(0, 3).toUpperCase() }
    : { name: 'France', code: 'FRA' };

  const password = (getValue('server-join-password') || '').trim();

  const onlineNameFinal = serverJoinState.resolvedOnlineName
    || getValue('online-name')
    || '';

  // ⭐ Ping rapide pour trouver le bon port jeu
	let gamePort = server.port; // Par défaut : port entré par l'utilisateur

	// Essaie le gamePort déclaré si différent et valide
	if (info.gamePort && info.gamePort > 0 && info.gamePort !== server.port) {
	  try {
		const ping = await window.api.pingServer(server.ip, info.gamePort);
		if (ping && ping.success) {
		  gamePort = info.gamePort;
		  console.log('[Join] gamePort déclaré OK :', gamePort);
		}
	  } catch (e) {
		console.log('[Join] gamePort KO, utilise port entré :', server.port);
	  }
	}

	const serverData = {
	  ip: server.ip,
	  port: gamePort,
	  httpPort: info.httpPort || server.httpPort || (server.port + 1),
	  name: info.name || server.name || '',
	  track: info.track || '',
	  trackConfig: info.trackConfig || info.layout || '',   // ⭐ fallback au cas où
	  features: Array.isArray(info.features) ? info.features : []
	};

  const sessionData = {
    car: localCar.id,
    skin: skin,
    driverName: getValue('player-name') || 'Driver',
    onlineName: onlineNameFinal,
    steamId: getValue('steam-id') || '',
    password: password,
    nationality: flagInfo.name,
    nationCode: flagInfo.code
  };

  const btn = document.getElementById('server-join-confirm');
  const orig = btn.innerText;
  btn.disabled = true; btn.innerText = "⏳ Lancement...";

  try {
    await window.api.joinServer(serverData, sessionData);

    // ⭐ Mémorise le combo voiture+skin pour ce serveur
    try {
      const profileKey = `${server.ip}:${server.port}`;
      if (!appData.serverProfiles) appData.serverProfiles = {};
      appData.serverProfiles[profileKey] = {
        car: localCar.id,
        skin: skin,
        onlineName: onlineNameFinal,
        date: Date.now()
      };
    } catch (e) {
      console.warn('[ServerProfile] sauvegarde KO :', e.message);
    }

    // ⭐ Mémorise le mot de passe (ou le supprime s'il est vide)
    try {
      const pwdKey = `${server.ip}:${server.port}`;
      if (!appData.serverPasswords) appData.serverPasswords = {};
      if (password) appData.serverPasswords[pwdKey] = password;
      else delete appData.serverPasswords[pwdKey];
    } catch (e) {
      console.warn('[ServerPassword] sauvegarde KO :', e.message);
    }

    // ⭐ Ajoute le serveur aux récents
    try {
      pushRecentServer(server, info);
    } catch (e) {
      console.warn('[RecentServers] push KO :', e.message);
    }

    saveCurrentState();
    closeServerJoinModal();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  } finally {
    btn.disabled = false; btn.innerText = orig;
    updateServerJoinButton();
  }
}