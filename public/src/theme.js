/* ============================================================
   QACRL — Thème (accent + clair/sombre)
   ============================================================ */

let currentTheme = { accent: '#d32f2f' };

/**
 * Applique une couleur d'accent personnalisée.
 */
function applyAccentColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const hover = lightenHex(hex, 12);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-hover', hover);
  document.documentElement.style.setProperty('--accent-muted', `rgba(${r},${g},${b},0.14)`);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.4)`);
  document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  const input = document.getElementById('theme-color-input');
  if (input) input.value = hex;
  currentTheme.accent = hex;
}

/**
 * Applique un mode clair ou sombre.
 */
function applyThemeMode(mode) {
  const theme = (mode === 'light') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Bascule entre clair et sombre, et sauvegarde le choix.
 */
async function toggleThemeMode() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyThemeMode(next);
  try {
    const settings = await window.api.getSettings();
    settings.themeMode = next;
    await window.api.saveSettings(settings);
  } catch (e) {
    console.warn('[Theme] Échec sauvegarde :', e.message);
  }
}

/**
 * Initialise le color picker d'accent + le bouton toggle clair/sombre.
 */
function setupThemePicker() {
  // 1) Color picker d'accent
  const input = document.getElementById('theme-color-input');
  if (input) {
    input.addEventListener('input', (e) => applyAccentColor(e.target.value));
    input.addEventListener('change', async (e) => {
      applyAccentColor(e.target.value);
      try {
        const settings = await window.api.getSettings();
        settings.accentColor = e.target.value;
        await window.api.saveSettings(settings);
      } catch (err) {}
    });
  }

  // 2) Bouton toggle thème clair/sombre ⭐
  const toggleBtn = document.getElementById('theme-mode-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleThemeMode);
  }
}