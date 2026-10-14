// public/src/cspInstallGuide.js
// Guide d'installation assistée pour CSP / Sol / Pure.
// Ouvre une modale guidée depuis : Wizard > Graphismes, Paramètres > Vidéo, Onglet CSP.

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Liens officiels (à maintenir à jour manuellement si besoin)
  // ---------------------------------------------------------------------------
  const LINKS = {
    csp_0_1_79:   'https://acstuff.club/patch/?get=0.1.79',
    csp_0_2_11:   'https://acstuff.club/patch/?get=0.2.11',
    csp_preview:  'https://www.patreon.com/x4fab',
    sol:          'https://www.overtake.gg/downloads/sol.24914/',
    pure:         'https://www.patreon.com/peterboese',
    content_mgr:  'https://acstuff.ru/app/',
  };

  let initialized = false;
  let currentTab = 'choose'; // 'choose' | 'free' | 'premium'
  let currentCaps = { hasCSP: false, hasSol: false, hasPure: false };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function t(key, fallback) {
    if (global.I18n) {
      const v = global.I18n.t('app.cspInstall.' + key, null);
      if (v && v !== 'app.cspInstall.' + key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function openExternal(url) {
    if (window.api && window.api.openExternal) {
      window.api.openExternal(url).catch(() => {});
    }
  }

  async function openAcFolder() {
    try {
      const settings = await window.api.getSettings();
      if (settings && settings.acPath) {
        // Ouvre la racine du dossier AC via shell
        if (window.api.openFolder) {
          // On peut utiliser openFolder('car', '') mais c'est plus safe d'utiliser
          // un shell open. Pour l'instant on affiche juste un message.
          // (si tu as un IPC dédié pour ouvrir un chemin arbitraire, remplace ici)
        }
      }
      // Fallback : on ouvre la release GitHub ouverte → non, on peut pas.
      // On utilise un dialog pour informer.
      alert(t('folderHint', 'Ouvre manuellement ton dossier Assetto Corsa depuis l\'Explorateur Windows.'));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  function getModal() { return document.getElementById('csp-install-modal'); }
  function getBody()  { return document.getElementById('csp-install-body'); }
  function getFooter(){ return document.getElementById('csp-install-footer'); }
  function getTitle() { return document.getElementById('csp-install-title'); }

  function render() {
    const body = getBody();
    const footer = getFooter();
    if (!body || !footer) return;
    body.innerHTML = '';
    footer.innerHTML = '';

    if (currentTab === 'choose') {
      renderChooseTab(body, footer);
    } else if (currentTab === 'free') {
      renderFreeTab(body, footer);
    } else if (currentTab === 'premium') {
      renderPremiumTab(body, footer);
    }
  }

  function renderChooseTab(body, footer) {
    body.appendChild(el('p', {
      class: 'csp-install-subtitle',
      text: t('chooseIntro', 'Deux options selon ton budget :'),
    }));

    // --- Carte GRATUIT ---
    const freeCard = el('div', { class: 'csp-install-card csp-install-card-free' });
    freeCard.appendChild(el('div', { class: 'csp-install-card-badge', html: '🟢 <strong>' + t('freeLabel', '100% GRATUIT') + '</strong>' }));
    freeCard.appendChild(el('div', { class: 'csp-install-card-title', text: 'CSP 0.1.79 + Sol 2.2.9' }));
    freeCard.appendChild(el('ul', { class: 'csp-install-card-list' }, [
      el('li', { text: t('freeFeat1', 'Stable et éprouvé par la communauté') }),
      el('li', { text: t('freeFeat2', 'Aucune version payante requise') }),
      el('li', { text: t('freeFeat3', '⚠️ Pas de pluie dynamique (RainFX est payant)') }),
    ]));
    const freeBtn = el('button', {
      type: 'button',
      class: 'filter-btn csp-install-card-btn',
      text: '📥 ' + t('seeGuide', 'Voir le guide'),
    });
    freeBtn.addEventListener('click', () => { currentTab = 'free'; render(); });
    freeCard.appendChild(freeBtn);
    body.appendChild(freeCard);

    // --- Carte PREMIUM ---
    const premCard = el('div', { class: 'csp-install-card csp-install-card-premium' });
    premCard.appendChild(el('div', { class: 'csp-install-card-badge', html: '👑 <strong>' + t('premiumLabel', 'PREMIUM (Patreon)') + '</strong>' }));
    premCard.appendChild(el('div', { class: 'csp-install-card-title', text: 'Pure + CSP Preview' }));
    premCard.appendChild(el('ul', { class: 'csp-install-card-list' }, [
      el('li', { text: t('premFeat1', 'Pluie dynamique (RainFX)') }),
      el('li', { text: t('premFeat2', 'Pure LCS / Pure Gamma') }),
      el('li', { text: t('premFeat3', 'Support complet, mises à jour régulières') }),
      el('li', { text: t('premFeat4', '⚠️ Abonnement Patreon obligatoire') }),
    ]));
    const premBtn = el('button', {
      type: 'button',
      class: 'filter-btn csp-install-card-btn',
      text: '📥 ' + t('seeGuide', 'Voir le guide'),
    });
    premBtn.addEventListener('click', () => { currentTab = 'premium'; render(); });
    premCard.appendChild(premBtn);
    body.appendChild(premCard);

    // --- Footer ---
    const openFolderBtn = el('button', {
      type: 'button',
      class: 'filter-btn',
      text: '📁 ' + t('openAcFolder', 'Ouvrir le dossier AC'),
    });
    openFolderBtn.addEventListener('click', openAcFolder);

    const recheckBtn = el('button', {
      type: 'button',
      class: 'filter-btn ini-btn-save',
      text: '🔄 ' + t('recheck', 'J\'ai installé, revérifier'),
    });
    recheckBtn.addEventListener('click', onRecheck);

    footer.appendChild(openFolderBtn);
    footer.appendChild(el('div', { class: 'spacer' }));
    footer.appendChild(recheckBtn);
  }

  function renderFreeTab(body, footer) {
    body.appendChild(el('div', {
      class: 'csp-install-back',
      html: '<button type="button" class="csp-install-back-btn">' + t('back', '← Retour aux options') + '</button>',
    }));
    body.querySelector('.csp-install-back-btn').addEventListener('click', () => {
      currentTab = 'choose'; render();
    });

    body.appendChild(el('div', {
      class: 'csp-install-tab-title',
      html: '🟢 <strong>' + t('freeLabel', '100% GRATUIT') + '</strong> — CSP 0.1.79 + Sol 2.2.9',
    }));

    // ⭐ Bandeau "ordre obligatoire"
    const orderBanner = document.createElement('div');
    orderBanner.className = 'csp-install-order-banner';
    const cspIcon  = currentCaps.hasCSP  ? '✅' : '1️⃣';
    const solIcon  = currentCaps.hasSol  ? '✅' : '2️⃣';
    const cspLabel = currentCaps.hasCSP
      ? '<strong>CSP</strong> — <span style="color:#4caf50;">' + t('alreadyInstalled', 'déjà installé') + '</span>'
      : t('orderStep1', 'Installe <strong>CSP</strong> en premier');
    const solLabel = currentCaps.hasSol
      ? '<strong>Sol</strong> — <span style="color:#4caf50;">' + t('alreadyInstalled', 'déjà installé') + '</span>'
      : t('orderStep2', 'Puis installe <strong>Sol</strong> (ou Pure)');

    const allDone = currentCaps.hasCSP && (currentCaps.hasSol || currentCaps.hasPure);
    const bannerIcon = allDone ? '✅' : '⚠️';

    orderBanner.innerHTML =
      '<div class="csp-install-order-icon">' + bannerIcon + '</div>' +
      '<div class="csp-install-order-body">' +
        '<div class="csp-install-order-title">' + t('orderTitle', 'Ordre d\'installation obligatoire') + '</div>' +
        '<div class="csp-install-order-list">' +
          '<div class="csp-install-order-step"><span class="num">' + cspIcon + '</span> ' + cspLabel + '</div>' +
          '<div class="csp-install-order-step"><span class="num">' + solIcon + '</span> ' + solLabel + '</div>' +
        '</div>' +
        '<div class="csp-install-order-hint">' + t('orderHint', 'Sol et Pure nécessitent CSP pour fonctionner. Si tu installes Sol avant CSP, la détection échouera.') + '</div>' +
      '</div>';
    body.appendChild(orderBanner);

    body.appendChild(el('p', {
      class: 'csp-install-note',
      text: t('freeIntro', 'Cette combinaison est stable et gratuite. Aucune pluie dynamique, mais tout le reste (éclairage, météo dynamique jour/nuit, effets) fonctionne.'),
    }));

    // Étape 1 — CSP
    const step1Title = currentCaps.hasCSP
      ? '✅ CSP — ' + t('alreadyInstalled', 'déjà installé')
      : t('freeStep1Title', 'Télécharge CSP 0.1.79');
    const step1Desc = currentCaps.hasCSP
      ? t('step1Already', 'Tu peux passer directement à l\'étape suivante.')
      : t('freeStep1Desc', 'Fichier .zip officiel depuis acstuff.club.');
    const step1BtnLabel = currentCaps.hasCSP
      ? '↻ ' + t('redownload', 'Retélécharger')
      : '📥 ' + t('download', 'Télécharger');

    const step1 = el('div', { class: 'csp-install-step' }, [
      el('div', { class: 'csp-install-step-num', text: currentCaps.hasCSP ? '✓' : '1' }),
      el('div', { class: 'csp-install-step-body' }, [
        el('div', { class: 'csp-install-step-title', text: step1Title }),
        el('div', { class: 'csp-install-step-desc', text: step1Desc }),
      ]),
      el('button', {
        type: 'button',
        class: 'filter-btn csp-install-step-btn',
        text: step1BtnLabel,
        onclick: () => openExternal(LINKS.csp_0_1_79),
      }),
    ]);
    if (currentCaps.hasCSP) step1.style.opacity = '0.7';
    body.appendChild(step1);

    // Étape 2 — Sol
    const solInstalled = currentCaps.hasSol || currentCaps.hasPure;
    const step2Title = solInstalled
      ? '✅ ' + (currentCaps.hasSol ? 'Sol' : 'Pure') + ' — ' + t('alreadyInstalled', 'déjà installé')
      : t('freeStep2Title', 'Télécharge Sol 2.2.9');
    const step2Desc = solInstalled
      ? t('step2Already', 'Tu peux passer directement à l\'étape suivante.')
      : t('freeStep2Desc', 'Version finale gratuite, développement arrêté.');
    const step2BtnLabel = solInstalled
      ? '↻ ' + t('redownload', 'Retélécharger')
      : '📥 ' + t('download', 'Télécharger');

    const step2 = el('div', { class: 'csp-install-step' }, [
      el('div', { class: 'csp-install-step-num', text: solInstalled ? '✓' : '2' }),
      el('div', { class: 'csp-install-step-body' }, [
        el('div', { class: 'csp-install-step-title', text: step2Title }),
        el('div', { class: 'csp-install-step-desc', text: step2Desc }),
      ]),
      el('button', {
        type: 'button',
        class: 'filter-btn csp-install-step-btn',
        text: step2BtnLabel,
        onclick: () => openExternal(LINKS.sol),
      }),
    ]);
    if (solInstalled) step2.style.opacity = '0.7';
    body.appendChild(step2);

    // Étape 3 : Zone de drop
    const bothDone = currentCaps.hasCSP && (currentCaps.hasSol || currentCaps.hasPure);
    const step3Title = bothDone
      ? '✅ ' + t('allInstalled', 'Tout est installé')
      : t('freeStep3Title', 'Installe via QACRL');
    const step3Desc = bothDone
      ? t('allInstalledDesc', 'Tu peux fermer ce guide et profiter de Sol !')
      : t('freeStep3Desc', 'Glisse les fichiers .zip téléchargés ci-dessous, ou clique pour les parcourir. QACRL détecte le type et installe automatiquement.');

    const step3 = el('div', { class: 'csp-install-step' }, [
      el('div', { class: 'csp-install-step-num', text: bothDone ? '✓' : '3' }),
      el('div', { class: 'csp-install-step-body' }, [
        el('div', { class: 'csp-install-step-title', text: step3Title }),
        el('div', { class: 'csp-install-step-desc', text: step3Desc }),
      ]),
    ]);
    if (bothDone) step3.style.opacity = '0.7';
    body.appendChild(step3);

    body.appendChild(renderDropZone());
    body.appendChild(renderInstallProgress());

    // Footer
    renderBackAndRecheck(footer);
  }

  function renderPremiumTab(body, footer) {
    body.appendChild(el('div', {
      class: 'csp-install-back',
      html: '<button type="button" class="csp-install-back-btn">' + t('back', '← Retour aux options') + '</button>',
    }));
    body.querySelector('.csp-install-back-btn').addEventListener('click', () => {
      currentTab = 'choose'; render();
    });

    body.appendChild(el('div', {
      class: 'csp-install-tab-title',
      html: '👑 <strong>' + t('premiumLabel', 'PREMIUM') + '</strong> — Pure + CSP Preview',
    }));

    body.appendChild(el('p', {
      class: 'csp-install-note',
      text: t('premiumIntro', 'Abonnement Patreon requis (x4fab pour CSP Preview, Peter Boese pour Pure). Support complet, pluie dynamique, Pure LCS.'),
    }));

    // Étape 1
    body.appendChild(el('div', { class: 'csp-install-step' }, [
      el('div', { class: 'csp-install-step-num', text: '1' }),
      el('div', { class: 'csp-install-step-body' }, [
        el('div', { class: 'csp-install-step-title', text: t('premStep1Title', 'Abonne-toi à x4fab sur Patreon (CSP)') }),
        el('div', { class: 'csp-install-step-desc', text: t('premStep1Desc', 'Permet de télécharger CSP Preview (0.2.11 minimum recommandé).') }),
      ]),
      el('button', {
        type: 'button',
        class: 'filter-btn csp-install-step-btn',
        text: '↗ Patreon',
        onclick: () => openExternal(LINKS.csp_preview),
      }),
    ]));

    // Étape 2
    body.appendChild(el('div', { class: 'csp-install-step' }, [
      el('div', { class: 'csp-install-step-num', text: '2' }),
      el('div', { class: 'csp-install-step-body' }, [
        el('div', { class: 'csp-install-step-title', text: t('premStep2Title', 'Abonne-toi à Peter Boese sur Patreon (Pure)') }),
        el('div', { class: 'csp-install-step-desc', text: t('premStep2Desc', 'Donne accès à Pure (v3.2x recommandé avec CSP 0.3.0 Preview).') }),
      ]),
      el('button', {
        type: 'button',
        class: 'filter-btn csp-install-step-btn',
        text: '↗ Patreon',
        onclick: () => openExternal(LINKS.pure),
      }),
    ]));

    // Étape 3 : Zone de drop
    body.appendChild(el('div', { class: 'csp-install-step' }, [
      el('div', { class: 'csp-install-step-num', text: '3' }),
      el('div', { class: 'csp-install-step-body' }, [
        el('div', { class: 'csp-install-step-title', text: t('premStep3Title', 'Installe via QACRL') }),
        el('div', { class: 'csp-install-step-desc', text: t('premStep3Desc', 'Glisse les archives téléchargées ci-dessous, ou clique pour les parcourir. QACRL détecte le type et installe automatiquement.') }),
      ]),
    ]));

    body.appendChild(renderDropZone());
    body.appendChild(renderInstallProgress());

    // Encart "compatibilité"
    body.appendChild(el('div', { class: 'csp-install-warn' }, [
      el('strong', { text: '⚠️ ' + t('compatTitle', 'Compatibilité') }),
      el('div', { class: 'csp-install-warn-body', html:
        '• Pure v3.2x → <code>CSP 0.3.0 Preview</code><br>' +
        '• Pure v2.5x à v3.0 → <code>CSP 0.2.3 Preview</code> minimum<br>' +
        '• Sol 2.2.9 → <code>CSP 0.1.76+</code> mais <strong>PAS 0.2.10+</strong>'
      }),
    ]));

    renderBackAndRecheck(footer);
  }

  // ---------------------------------------------------------------------------
  // Zone de drop / parcourir fichiers
  // ---------------------------------------------------------------------------
  function renderDropZone() {
    const zone = document.createElement('div');
    zone.className = 'csp-install-drop-zone';
    zone.innerHTML =
      '<div class="csp-install-drop-icon">📦</div>' +
      '<div class="csp-install-drop-title">' + t('dropTitle', 'Glisse tes fichiers .zip ici') + '</div>' +
      '<div class="csp-install-drop-subtitle">' + t('dropSubtitle', 'ou clique pour parcourir tes fichiers') + '</div>';

    // Click → dialog fichier
    zone.addEventListener('click', async () => {
      try {
        const filePath = await window.api.selectModFile();
        if (!filePath) return;
        await handleInstall(filePath);
      } catch (e) {
        alert('Erreur : ' + e.message);
      }
    });

    // Drag & drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragging');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('dragging');
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      const filePath = files[0].path;
      if (!filePath) return;
      await handleInstall(filePath);
    });

    return zone;
  }

  function renderInstallProgress() {
    const wrap = document.createElement('div');
    wrap.className = 'csp-install-progress-wrap';
    wrap.id = 'csp-install-progress-wrap';
    wrap.style.display = 'none';
    wrap.innerHTML =
      '<div class="csp-install-progress-bar"><div class="csp-install-progress-fill" id="csp-install-progress-fill"></div></div>' +
      '<div class="csp-install-progress-status" id="csp-install-progress-status">…</div>';
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Installation
  // ---------------------------------------------------------------------------
  let installProgressUnsub = null;

  async function handleInstall(filePath) {
    const wrap = document.getElementById('csp-install-progress-wrap');
    const fill = document.getElementById('csp-install-progress-fill');
    const status = document.getElementById('csp-install-progress-status');

    if (!wrap || !fill || !status) return;

    wrap.style.display = 'flex';
    fill.style.width = '0%';
    fill.style.background = '';
    status.textContent = t('preparing', 'Préparation…');

    // ⭐ Aperçu : détecte le type AVANT d'installer
    try {
      const preview = await window.api.previewCspArchive(filePath);
      if (preview && preview.success && preview.type) {
        const typeLabels = {
          csp:  '🌩️ Custom Shaders Patch',
          sol:  '☀️ Sol',
          pure: '🌦️ Pure',
        };
        const label = typeLabels[preview.type] || preview.type.toUpperCase();
        const fileName = filePath.split(/[\\/]/).pop();
        status.textContent = t('detectedArchive', 'Archive détectée : {type}')
          .replace('{type}', label) + ' — ' + fileName;
        // Petite pause pour que l'utilisateur voie le type
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (e) {
      // Preview KO → on continue quand même, l'install fera la détection
      console.warn('[cspInstallGuide] preview KO', e);
    }

    // Abonnement aux events de progression
    if (installProgressUnsub) installProgressUnsub();
    if (window.api.onCspInstallProgress) {
      installProgressUnsub = window.api.onCspInstallProgress((p) => {
        if (!p) return;
        if (typeof p.percent === 'number') fill.style.width = Math.min(100, p.percent) + '%';
        if (p.status) {
          let txt = p.status;
          if (p.totalFiles > 0 && typeof p.copiedFiles === 'number' && p.copiedFiles > 0) {
            txt = p.status + ' — ' + p.copiedFiles + ' / ' + p.totalFiles;
          }
          status.textContent = txt;
        }
      });
    }

    try {
      const res = await window.api.installCspArchive(filePath);
      if (res && res.success) {
        fill.style.width = '100%';
        fill.style.background = 'linear-gradient(90deg, #4caf50, #6ed47e)';
        status.innerHTML =
          '✅ <strong>' + t('installed', 'Installé') + '</strong> — ' + res.type.toUpperCase() +
          ' <br><span style="font-size:0.72rem;opacity:0.8;">Backup : ' + res.backupPath + '</span>';

        // Refresh des capacités
        setTimeout(() => onRecheck(), 600);
      } else {
        fill.style.background = 'linear-gradient(90deg, #a83a3a, #d32f2f)';
        fill.style.width = '100%';
        status.innerHTML = '❌ ' + (res && res.error ? res.error : 'Erreur inconnue');
      }
    } catch (e) {
      fill.style.background = 'linear-gradient(90deg, #a83a3a, #d32f2f)';
      fill.style.width = '100%';
      status.innerHTML = '❌ ' + e.message;
    } finally {
      if (installProgressUnsub) { installProgressUnsub(); installProgressUnsub = null; }
    }
  }

  function renderBackAndRecheck(footer) {
    const backBtn = el('button', {
      type: 'button',
      class: 'filter-btn',
      text: '← ' + t('back', 'Retour aux options'),
    });
    backBtn.addEventListener('click', () => { currentTab = 'choose'; render(); });

    const recheckBtn = el('button', {
      type: 'button',
      class: 'filter-btn ini-btn-save',
      text: '🔄 ' + t('recheck', 'J\'ai installé, revérifier'),
    });
    recheckBtn.addEventListener('click', onRecheck);

    footer.appendChild(backBtn);
    footer.appendChild(el('div', { class: 'spacer' }));
    footer.appendChild(recheckBtn);
  }

  // ---------------------------------------------------------------------------
  // Revérification après installation
  // ---------------------------------------------------------------------------
  async function onRecheck() {
    const recheckBtn = getFooter().querySelector('.ini-btn-save');
    const orig = recheckBtn ? recheckBtn.textContent : '';
    if (recheckBtn) {
      recheckBtn.disabled = true;
      recheckBtn.textContent = '⏳ ' + t('checking', 'Vérification…');
    }

    try {
      const caps = await window.api.checkCspPure();
      const hasWeatherScript = !!(caps && (caps.hasPure || caps.hasSol));
      const weatherName = caps.hasPure ? 'Pure' : (caps.hasSol ? 'Sol' : null);

      // Rafraîchit les capacités globales
      if (typeof appData !== 'undefined') {
        appData.capabilities = caps;
      }

      // ⭐ Auto-configure style Weather FX + filtre PP selon ce qui est installé
      try { await window.api.autoConfigureWeather(); } catch (e) { console.warn('[AutoConfig] KO', e); }

      // Déclenche un refresh UI générique
      if (typeof window.refreshAllContent === 'function') {
        try { await window.refreshAllContent(); } catch (e) {}
      }
      if (typeof window.updateWeatherUI === 'function') {
        try { window.updateWeatherUI(); } catch (e) {}
      }
      if (window.WeatherFx && typeof window.WeatherFx.load === 'function') {
        try { window.WeatherFx.load(); } catch (e) {}
      }
      if (window.SettingsCsp && typeof window.SettingsCsp.load === 'function') {
        try { window.SettingsCsp.load(); } catch (e) {}
      }

      if (caps && caps.hasCSP && hasWeatherScript) {
        // ⭐ CSP + Sol OU CSP + Pure → OK
        const versionTxt = caps.hasSol && caps.solVersion ? ' (Sol ' + caps.solVersion + ')' : '';
        const msg = t('detectedFull', 'Installation complète détectée : CSP + {name}{version} !')
          .replace('{name}', weatherName || '')
          .replace('{version}', versionTxt);
        alert('✅ ' + msg);
        close();
      } else if (caps && caps.hasCSP) {
        // ⭐ CSP mais pas de script météo
        alert('⚠️ ' + t('detectedPartial', 'CSP est bien installé, mais aucun script météo (Sol / Pure) n\'a été détecté.\n\nGlisse l\'archive Sol ou Pure dans la zone ci-dessus, puis clique à nouveau sur "J\'ai installé, revérifier".'));
      } else {
        // ⭐ Rien du tout → ordre d'installation
        alert('❌ ' + t('detectedNone', 'Aucune installation détectée pour le moment.\n\n⚠️ Ordre important :\n1. Installe CSP en premier\n2. Puis Sol ou Pure\n\nCSP est requis pour que les scripts météo (Sol / Pure) fonctionnent.'));
      }
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      if (recheckBtn) {
        recheckBtn.disabled = false;
        recheckBtn.textContent = orig;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------
  async function open() {
    const modal = getModal();
    if (!modal) return;
    currentTab = 'choose';

    const title = getTitle();
    if (title) title.textContent = t('title', 'Installer CSP + Météo');

    // ⭐ Détecte ce qui est déjà installé
    try {
      const caps = await window.api.checkCspPure();
      currentCaps = {
        hasCSP:  !!(caps && caps.hasCSP),
        hasSol:  !!(caps && caps.hasSol),
        hasPure: !!(caps && caps.hasPure),
      };
    } catch (e) {
      currentCaps = { hasCSP: false, hasSol: false, hasPure: false };
    }

    render();
    modal.style.display = 'flex';
  }

  function close() {
    const modal = getModal();
    if (modal) modal.style.display = 'none';
    // ⭐ Prévient les modules qui attendent la fermeture (ex : setup wizard)
    try {
      window.dispatchEvent(new CustomEvent('qacrl:cspinstall-closed'));
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    if (initialized) return;
    initialized = true;

    const modal = getModal();
    if (!modal) return;

    document.getElementById('csp-install-close')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') close();
    });

    // Bouton dans l'onglet CSP
    const cspInstallBtn = document.getElementById('csp-install-launch');
    if (cspInstallBtn) cspInstallBtn.addEventListener('click', open);
  }

  global.CspInstallGuide = { init, open, close };
})(window);