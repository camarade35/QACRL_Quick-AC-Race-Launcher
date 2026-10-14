/* ============================================================
   QACRL — Contenu (voitures / circuits)
   ============================================================ */

/* ============================================================
   SCAN ASSETS
   ============================================================ */
async function scanAssets() {
  try {
    const res = await window.api.scanAssets();
    if (res) {
      appData.manufacturers = res.manufacturers || [];
      appData.flags = res.flags || [];
    }
  } catch (err) { console.warn('Scan assets :', err); }
  populateFlagSelect();
  populateManufacturerSelect();
}

function populateFlagSelect() {
  const select = document.getElementById('player-flag');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '';
  const flags = (appData.flags || []).filter(f => !f.toLowerCase().startsWith('blank'))
    .sort((a, b) => a.localeCompare(b, 'fr'));
  flags.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = flagFileToCountryName(f).replace(/_/g, ' ');
    select.appendChild(opt);
  });
  const france = flags.find(f => /france/i.test(f));
  if (prev && flags.some(f => f === prev)) select.value = prev;
  else if (france) select.value = france;
}

function populateManufacturerSelect() {
  const select = document.getElementById('car-manufacturer-select');
  if (!select) return;
  const prev = select.value;
  const brands = new Set();
  appData.cars.forEach(c => {
    const kw = BRAND_KEYS_SORTED.find(k => (c.id + ' ' + c.name + ' ' + (c.brand || '')).toLowerCase().includes(k));
    if (kw) brands.add(BRAND_ALIASES[kw]);
  });
  select.innerHTML = '<option value="">Tous les constructeurs</option>';
  Array.from(brands).sort((a, b) => a.localeCompare(b, 'fr')).forEach(brand => {
    const opt = document.createElement('option');
    opt.value = brand;
    opt.textContent = brand.replace(/\.png$/i, '');
    select.appendChild(opt);
  });
  if (prev && brands.has(prev)) select.value = prev;
}

/* ============================================================
   RENDER CARS
   ============================================================ */
function renderCarsGrid() {
  const grid = document.getElementById('cars-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const searchLower = carFilter.search.toLowerCase();
  const filtered = appData.cars.filter(car => {
    if (carFilter.type === 'kunos' && !car.isKunos) return false;
    if (carFilter.type === 'mods' && car.isKunos) return false;
    if (carFilter.type === 'favorites' && !isFavorite('cars', car.id)) return false;
    if (carFilter.type === 'used' && getUsedCount('cars', car.id) === 0) return false;
    if (carFilter.manufacturer) {
      const logo = findManufacturerLogo(car.id, car.name, car.brand);
      if (!logo || !logo.endsWith(encodeURIComponent(carFilter.manufacturer))) return false;
    }
    if (!matchesTags(car, carFilter.tags)) return false;
    if (searchLower && !car.name.toLowerCase().includes(searchLower) &&
        !car.id.toLowerCase().includes(searchLower) &&
        !(car.brand || '').toLowerCase().includes(searchLower)) return false;
    return true;
  });

  filtered.forEach(car => {
    const card = document.createElement('div');
    card.className = `card ${currentSelection.car && currentSelection.car.id === car.id ? 'selected' : ''}`;
    card.dataset.id = car.id;

    const logoUrl = findManufacturerLogo(car.id, car.name, car.brand);
    const countryName = findCarCountry(car);
    const flagFile = countryName ? findFlagFileByName(countryName, appData.flags) : null;
    const flagSrc = flagUrl(flagFile);
    const fav = isFavorite('cars', car.id);
    const usedCount = getUsedCount('cars', car.id);

    card.innerHTML = `
      ${logoUrl ? `<img class="brand-badge" src="${logoUrl}" alt="" onerror="this.style.display='none'">` : ''}
      ${flagSrc ? `<div class="flag-badge"><img src="${flagSrc}" alt="" onerror="this.parentElement.style.display='none'"></div>` : ''}
      <button class="fav-btn ${fav ? 'active' : ''}" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>
      <img class="car-preview" src="${car.preview || ''}" alt="" onerror="this.style.opacity='0.2'">
      <div class="card-title">
        <span class="card-title-text">${car.name}</span>
        ${usedCount > 0 ? `<span class="used-badge" title="Déjà lancé ${usedCount} fois">✓${usedCount > 1 ? ' ' + usedCount : ''}</span>` : ''}
      </div>
    `;

    card.querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite('cars', car.id);
      renderCarsGrid();
    });

    card.addEventListener('click', () => openSkinModal(car));
    card.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try { await window.api.openFolder('car', car.id); } catch (err) { alert(err.message); }
    });
    grid.appendChild(card);
  });
}

/* ============================================================
   RENDER TRACKS
   ============================================================ */
function renderTracksGrid() {
  const grid = document.getElementById('tracks-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const searchLower = trackFilter.search.toLowerCase();
  const filtered = appData.tracks.filter(track => {
    if (trackFilter.type === 'kunos' && !track.isKunos) return false;
    if (trackFilter.type === 'mods' && track.isKunos) return false;
    if (trackFilter.type === 'favorites' && !isFavorite('tracks', track.id)) return false;
    if (trackFilter.type === 'used' && getUsedCount('tracks', track.id) === 0) return false;
    if (!matchesTags(track, trackFilter.tags)) return false;
    if (searchLower && !track.name.toLowerCase().includes(searchLower) &&
        !track.id.toLowerCase().includes(searchLower) &&
        !(track.country || '').toLowerCase().includes(searchLower)) return false;
    return true;
  });

  filtered.forEach(track => {
    const card = document.createElement('div');
    card.className = `card ${currentSelection.track && currentSelection.track.id === track.id ? 'selected' : ''}`;
    card.dataset.id = track.id;

    const mainVar = track.variants[0] || {};
    const bgSrc = mainVar.preview || '';
    const outlineSrc = mainVar.outline || '';
    const flagFile = track.country ? findFlagFileByName(track.country, appData.flags) : null;
    const flagSrc = flagUrl(flagFile);
    const fav = isFavorite('tracks', track.id);
    const usedCount = getUsedCount('tracks', track.id);

    card.innerHTML = `
      <div class="track-preview-box">
        ${bgSrc ? `<img class="track-bg" src="${bgSrc}">` : ''}
        ${outlineSrc ? `<img class="track-outline" src="${outlineSrc}">` : ''}
      </div>
      ${flagSrc ? `<div class="flag-badge"><img src="${flagSrc}" alt="" onerror="this.parentElement.style.display='none'"></div>` : ''}
      <button class="fav-btn ${fav ? 'active' : ''}" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fav ? '★' : '☆'}</button>
      <div class="card-title">
        <span class="card-title-text">${track.name}</span>
        ${usedCount > 0 ? `<span class="used-badge" title="Déjà lancé ${usedCount} fois">✓${usedCount > 1 ? ' ' + usedCount : ''}</span>` : ''}
      </div>
    `;

    card.querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite('tracks', track.id);
      renderTracksGrid();
    });

    card.addEventListener('click', () => {
      if (track.variants.length > 1) openTrackVariantModal(track);
      else selectTrack(track, track.variants[0] || null);
    });
    card.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try { await window.api.openFolder('track', track.id); } catch (err) { alert(err.message); }
    });
    grid.appendChild(card);
  });
}

/* ============================================================
   MODALES SÉLECTION
   ============================================================ */
function openSkinModal(car) {
  const modal = document.getElementById('selection-modal');
  const title = document.getElementById('modal-title');
  const grid = document.getElementById('modal-grid');
  if (!modal || !grid) return;
  title.innerText = `Livrées - ${car.name}`;
  grid.innerHTML = '';
  car.skins.forEach(skin => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<img class="car-preview" src="${skin.preview || car.preview || ''}"><div class="card-title">${skin.name}</div>`;
    card.addEventListener('click', () => { selectCar(car, skin); closeModal(); });
    grid.appendChild(card);
  });
  modal.style.display = 'flex';
}

function openTrackVariantModal(track) {
  const modal = document.getElementById('selection-modal');
  const title = document.getElementById('modal-title');
  const grid = document.getElementById('modal-grid');
  if (!modal || !grid) return;
  title.innerText = `Variantes - ${track.name}`;
  grid.innerHTML = '';
  track.variants.forEach(variant => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="track-preview-box">
        ${variant.preview ? `<img class="track-bg" src="${variant.preview}">` : ''}
        ${variant.outline ? `<img class="track-outline" src="${variant.outline}">` : ''}
      </div>
      <div class="card-title">${variant.name}</div>
    `;
    card.addEventListener('click', () => { selectTrack(track, variant); closeModal(); });
    grid.appendChild(card);
  });
  modal.style.display = 'flex';
}

function closeModal() {
  const m = document.getElementById('selection-modal');
  if (m) m.style.display = 'none';
}

function selectCar(car, skin) {
  currentSelection.car = car;
  currentSelection.skin = skin;
  updateRecapSidebar(); highlightSelectedCards(); saveCurrentState();
}

function selectTrack(track, variant) {
  currentSelection.track = track;
  currentSelection.variant = variant;
  updateRecapSidebar(); highlightSelectedCards(); saveCurrentState();
}

function highlightSelectedCards() {
  document.querySelectorAll('#cars-grid .card').forEach(c => {
    c.classList.toggle('selected', currentSelection.car && c.dataset.id === currentSelection.car.id);
  });
  document.querySelectorAll('#tracks-grid .card').forEach(c => {
    c.classList.toggle('selected', currentSelection.track && c.dataset.id === currentSelection.track.id);
  });
}

/* ============================================================
   TAGS UI
   ============================================================ */
function updateTagsUI(kind) {
  const filter = kind === 'cars' ? carFilter : trackFilter;
  const prefix = kind === 'cars' ? 'btn-car' : 'btn-track';
  const badge = document.getElementById(`${prefix}-tags-count`);
  const activeBar = document.getElementById(`${kind}-active-tags`);

  if (badge) {
    if (filter.tags.length > 0) {
      badge.textContent = String(filter.tags.length);
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (activeBar) {
    activeBar.innerHTML = '';
    if (filter.tags.length === 0) {
      activeBar.classList.remove('visible');
      return;
    }
    activeBar.classList.add('visible');

    const lbl = document.createElement('span');
    lbl.className = 'active-tags-label';
    lbl.textContent = 'Tags actifs :';
    activeBar.appendChild(lbl);

    filter.tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'active-tag';
      chip.innerHTML = `${tag} <button class="active-tag-close" title="Retirer ce tag">✕</button>`;
      chip.querySelector('.active-tag-close').addEventListener('click', () => {
        const idx = filter.tags.indexOf(tag);
        if (idx >= 0) filter.tags.splice(idx, 1);
        updateTagsUI(kind);
        if (kind === 'cars') renderCarsGrid(); else renderTracksGrid();
      });
      activeBar.appendChild(chip);
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'active-tags-clear';
    clearBtn.textContent = 'Tout effacer';
    clearBtn.addEventListener('click', () => {
      filter.tags = [];
      updateTagsUI(kind);
      if (kind === 'cars') renderCarsGrid(); else renderTracksGrid();
    });
    activeBar.appendChild(clearBtn);
  }
}

function openTagsPopup(kind) {
  currentTagPopup.kind = kind;
  currentTagPopup.search = '';

  const backdrop = document.getElementById('tags-popup-backdrop');
  const popup = document.getElementById('tags-popup');
  const searchInput = document.getElementById('tags-popup-search-input');
  const kindLabel = document.getElementById('tags-popup-kind');

  if (!backdrop || !popup) return;

  kindLabel.textContent = kind === 'cars' ? 'Tags des voitures' : 'Tags des circuits';
  if (searchInput) searchInput.value = '';

  renderTagsPopupBody();
  backdrop.classList.add('visible');
  popup.classList.add('visible');

  setTimeout(() => searchInput?.focus(), 100);
}

function closeTagsPopup() {
  const backdrop = document.getElementById('tags-popup-backdrop');
  const popup = document.getElementById('tags-popup');
  if (backdrop) backdrop.classList.remove('visible');
  if (popup) popup.classList.remove('visible');
  currentTagPopup.kind = null;
  currentTagPopup.search = '';
}

function renderTagsPopupBody() {
  const kind = currentTagPopup.kind;
  if (!kind) return;

  const body = document.getElementById('tags-popup-body');
  const totalEl = document.getElementById('tags-popup-total');
  const selectedInfoEl = document.getElementById('tags-popup-selected-info');
  if (!body) return;

  const items = kind === 'cars' ? appData.cars : appData.tracks;
  const filter = kind === 'cars' ? carFilter : trackFilter;

  const allTags = collectTags(items);
  const searchLower = (currentTagPopup.search || '').toLowerCase();

  const visibleTags = searchLower
    ? allTags.filter(t => t.tag.includes(searchLower))
    : allTags;

  if (totalEl) totalEl.textContent = String(allTags.length);

  body.innerHTML = '';

  if (visibleTags.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tags-popup-empty';
    empty.textContent = searchLower
      ? `Aucun tag ne contient "${currentTagPopup.search}"`
      : 'Aucun tag disponible.';
    body.appendChild(empty);
  } else {
    visibleTags.forEach(({ tag, count }) => {
      const chip = document.createElement('button');
      const isActive = filter.tags.includes(tag);
      chip.className = 'tag-chip' + (isActive ? ' active' : '');
      chip.innerHTML = `${tag} <span class="tag-count">${count}</span>`;
      chip.title = `${count} élément(s) avec ce tag`;

      chip.addEventListener('click', () => {
        const idx = filter.tags.indexOf(tag);
        if (idx >= 0) filter.tags.splice(idx, 1);
        else filter.tags.push(tag);
        renderTagsPopupBody();
        updateTagsUI(kind);
        if (kind === 'cars') renderCarsGrid(); else renderTracksGrid();
      });

      body.appendChild(chip);
    });
  }

  if (selectedInfoEl) {
    selectedInfoEl.textContent = filter.tags.length === 0
      ? 'Aucun tag actif'
      : `${filter.tags.length} tag(s) sélectionné(s)`;
  }
}

/* ============================================================
   RECAP SIDEBAR
   ============================================================ */
function updateRecapSidebar() {
  const recapCar = document.getElementById('recap-car');
  const recapCarFlag = document.getElementById('recap-car-flag');
  const recapSkin = document.getElementById('recap-skin');
  const recapCarImg = document.getElementById('recap-car-img');

  if (currentSelection.car) {
    if (recapCar) recapCar.innerText = currentSelection.car.name;
    if (recapSkin) recapSkin.innerText = currentSelection.skin ? `Skin : ${currentSelection.skin.name}` : '';
    const countryName = findCarCountry(currentSelection.car);
    const flagFile = countryName ? findFlagFileByName(countryName, appData.flags) : null;
    if (recapCarFlag) {
      if (flagFile) { recapCarFlag.src = flagUrl(flagFile); recapCarFlag.style.display = 'block'; }
      else recapCarFlag.style.display = 'none';
    }
    if (recapCarImg) {
      const src = (currentSelection.skin && currentSelection.skin.preview) || currentSelection.car.preview;
      if (src) { recapCarImg.src = src; recapCarImg.style.display = 'block'; }
      else recapCarImg.style.display = 'none';
    }
  } else {
    if (recapCar) recapCar.innerText = 'Aucune sélectionnée';
    if (recapSkin) recapSkin.innerText = '';
    if (recapCarFlag) recapCarFlag.style.display = 'none';
    if (recapCarImg) recapCarImg.style.display = 'none';
  }

  const recapTrack = document.getElementById('recap-track');
  const recapTrackFlag = document.getElementById('recap-track-flag');
  const recapTrackContainer = document.getElementById('recap-track-container');
  const recapTrackBg = document.getElementById('recap-track-bg');
  const recapTrackOutline = document.getElementById('recap-track-outline');

  if (currentSelection.track) {
    const varName = currentSelection.variant && currentSelection.variant.name !== 'Default' ? ` (${currentSelection.variant.name})` : '';
    if (recapTrack) recapTrack.innerText = `${currentSelection.track.name}${varName}`;
    const flagFile = currentSelection.track.country ? findFlagFileByName(currentSelection.track.country, appData.flags) : null;
    if (recapTrackFlag) {
      if (flagFile) { recapTrackFlag.src = flagUrl(flagFile); recapTrackFlag.style.display = 'block'; }
      else recapTrackFlag.style.display = 'none';
    }
    const variant = currentSelection.variant || currentSelection.track.variants[0] || {};
    if (recapTrackContainer && (variant.preview || variant.outline)) {
      if (recapTrackBg) recapTrackBg.src = variant.preview || '';
      if (recapTrackOutline) recapTrackOutline.src = variant.outline || '';
      recapTrackContainer.style.display = 'block';
    } else if (recapTrackContainer) {
      recapTrackContainer.style.display = 'none';
    }
  } else {
    if (recapTrack) recapTrack.innerText = 'Aucun sélectionné';
    if (recapTrackFlag) recapTrackFlag.style.display = 'none';
    if (recapTrackContainer) recapTrackContainer.style.display = 'none';
  }

  const recapSession = document.getElementById('recap-session');
  if (recapSession) {
    const type = getValue('session-type') || 'RACE';
    let label = '';
    if (type === 'RACE') {
      const laps = getValue('race-laps') || 5;
      const opp = getValue('opponents-count') || 0;
      label = `RACE - ${laps} tours (${opp} IA)`;
    } else if (type === 'HOTLAP') label = `HOTLAP - ${getValue('session-minutes') || 30} min`;
    else label = `PRACTICE - ${getValue('session-minutes') || 30} min`;
    const t = getTimeStringFromPicker();
    if (t) label += ` @ ${t}`;
    recapSession.innerText = label;
  }

  const recapWeather = document.getElementById('recap-weather');
  if (recapWeather) {
    const mode = getValue('weather-mode');
    if (mode === 'custom_plan') {
      if (customPlanSteps.length === 0) recapWeather.innerText = 'Météo : Plan perso (vide)';
      else {
        const total = customPlanSteps.reduce((a, s) => a + (parseInt(s.duration, 10) || 0), 0);
        const loopStr = getChecked('plan-loop') ? ' • boucle' : '';
        recapWeather.innerText = `Météo : Plan perso (${customPlanSteps.length} étapes, ${total} min${loopStr})`;
      }
    } else if (mode === 'existing_plan') {
      // ⭐ Route selon le planner actif (Pure prioritaire, sinon Sol)
      const planner = getActivePlanner();
      const plannerLabel = (planner === 'sol') ? 'Sol' : 'Pure';

      if (getChecked('pure-plan-random')) {
        recapWeather.innerText = `Météo : Plan ${plannerLabel} aléatoire`;
      } else {
        const id = getValue('pure-plan-select');
        const list = (planner === 'sol')
          ? (appData.solPlans || [])
          : (appData.purePlans || []);
        const plan = list.find(p => p.id === id);
        recapWeather.innerText = plan
          ? `Météo : ${plan.name} (${plannerLabel})`
          : 'Météo : —';
      }
    } else {
      const w = getValue('weather-select');
      recapWeather.innerText = w ? `Météo : ${translateWeatherName(w)}` : 'Météo : —';
    }
  }
}

function updateSlidersDisplay() {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  const lvl = getValue('ai-level'), lvlVar = getValue('ai-level-var');
  const agg = getValue('ai-aggression'), aggVar = getValue('ai-aggression-var');
  set('ai-level-display', `${lvl}% (±${lvlVar}%)`);
  set('ai-aggression-display', `${agg}% (±${aggVar}%)`);
  set('assist-stability-display', `${getValue('assist-stability')}%`);
  set('fuel-rate-display', getValue('fuel-rate') === '0' ? 'Off' : `${getValue('fuel-rate')}x`);
  set('mechanical-damage-display', `${getValue('mechanical-damage')}%`);
  set('tyre-wear-display', getValue('tyre-wear') === '0' ? 'Off' : `${getValue('tyre-wear')}x`);
  set('slipstream-display', getValue('slipstream') === '0' ? 'Off' : `${getValue('slipstream')}x`);
}

/* ============================================================
   RANDOM
   ============================================================ */
function randomizeAll() {
  if (appData.cars.length === 0 || appData.tracks.length === 0) {
    alert("Aucune voiture ou circuit disponible.");
    return;
  }
  const car = appData.cars[Math.floor(Math.random() * appData.cars.length)];
  const skin = car.skins && car.skins.length > 0 ? car.skins[Math.floor(Math.random() * car.skins.length)] : null;
  const track = appData.tracks[Math.floor(Math.random() * appData.tracks.length)];
  const variant = track.variants && track.variants.length > 0 ? track.variants[Math.floor(Math.random() * track.variants.length)] : null;
  currentSelection.car = car;
  currentSelection.skin = skin;
  currentSelection.track = track;
  currentSelection.variant = variant;
  updateRecapSidebar();
  highlightSelectedCards();
  saveCurrentState();
}

/* ============================================================
   FILTRES BOUTONS
   ============================================================ */
function setupFilterButtons(prefix, callback) {
  ['all','kunos','mods','favorites','used'].forEach(type => {
    const btn = document.getElementById(`${prefix}${type}`);
    if (btn) btn.addEventListener('click', () => {
      document.querySelectorAll(`[id^="${prefix}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); callback(type);
    });
  });
}