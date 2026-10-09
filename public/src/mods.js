/* ============================================================
   QACRL — Installation de mods (drag & drop)
   ============================================================ */

/* ============================================================
   DRAG & DROP
   ============================================================ */
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  if (!dropZone) return;

  dropZone.addEventListener('click', async () => {
    if (isInstallingMod) return;
    const filePath = await window.api.selectModFile();
    if (filePath) await runInstallMod(filePath);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    if (isInstallingMod) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) await runInstallMod(files[0].path);
  });
}

/* ============================================================
   PROGRESSION
   ============================================================ */
function showInstallProgress(show) {
  const w = document.getElementById('install-progress-wrap');
  if (w) w.classList.toggle('visible', show);
}

function updateInstallProgress({ status, percent, copiedFiles, totalFiles }) {
  const w = document.getElementById('install-progress-wrap');
  const f = document.getElementById('install-progress-fill');
  const t = document.getElementById('install-progress-text');
  const d = document.getElementById('install-progress-detail');
  if (!w || !f || !t || !d) return;

  w.classList.add('visible');
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  f.style.width = p + '%';
  t.innerText = `${p}%`;
  d.innerText = (totalFiles > 0 && copiedFiles !== undefined)
    ? `${status || ''} (${copiedFiles}/${totalFiles})`
    : (status || '');
}

/* ============================================================
   INSTALLATION
   ============================================================ */
async function runInstallMod(filePath) {
  if (isInstallingMod) return;
  isInstallingMod = true;

  const dropZone = document.getElementById('drop-zone');
  const orig = dropZone ? dropZone.innerHTML : '';

  if (dropZone) {
    dropZone.innerHTML = "⏳ Installation...";
    dropZone.style.pointerEvents = 'none';
    dropZone.style.opacity = '0.6';
  }

  showInstallProgress(true);
  updateInstallProgress({ status: 'Préparation...', percent: 0, copiedFiles: 0, totalFiles: 0 });

  try {
    const res = await window.api.installMod(filePath);

    if (res.cancelled) {
      updateInstallProgress({ status: 'Annulé.', percent: 0 });
      setTimeout(() => showInstallProgress(false), 1500);
      return;
    }

    const parts = [];
    if (res.carsCount > 0) parts.push(`${res.carsCount} voiture(s)`);
    if (res.tracksCount > 0) parts.push(`${res.tracksCount} circuit(s)`);
    if (res.extrasCount > 0) parts.push(`${res.extrasCount} annexe(s)`);
    if (res.skippedCount > 0) parts.push(`${res.skippedCount} ignoré(s)`);

    updateInstallProgress({
      status: `Installation réussie ! (${parts.join(', ') || 'aucun'})`,
      percent: 100,
      copiedFiles: 1,
      totalFiles: 1
    });

    await refreshAllContent();
    await loadModsHistory();

    setTimeout(() => {
      showInstallProgress(false);
      if (dropZone) {
        dropZone.innerHTML = orig;
        dropZone.style.pointerEvents = '';
        dropZone.style.opacity = '';
      }
    }, 3000);

  } catch (err) {
    alert(`Erreur : ${err.message}`);
    updateInstallProgress({ status: `Erreur : ${err.message}`, percent: 0 });
    setTimeout(() => showInstallProgress(false), 3000);
  } finally {
    isInstallingMod = false;
    if (dropZone) {
      dropZone.style.pointerEvents = '';
      dropZone.style.opacity = '';
    }
  }
}