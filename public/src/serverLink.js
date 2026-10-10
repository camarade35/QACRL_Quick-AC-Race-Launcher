/* ============================================================
   QACRL — Parseur de liens serveur (acstuff, acmanager, IP:PORT)
   ============================================================ */

/**
 * Analyse une chaîne de texte et extrait les infos serveur.
 * Supporte :
 *   - https://acstuff.club/s/qrace/online/join?ip=X.X.X.X&httpPort=YYYY
 *   - https://acstuff.ru/s/qrace/online/join?ip=X.X.X.X&httpPort=YYYY
 *   - acmanager://race/online/join?ip=X.X.X.X&httpPort=YYYY&password=ZZZ
 *   - 51.38.180.172:28093
 *
 * Retourne { ip, httpPort, port, password, source } ou null.
 */
function parseServerLink(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const s = rawInput.trim();
  if (!s) return null;

  // --- Cas 1 : IP:PORT simple ---
  const ipPortMatch = s.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})$/);
  if (ipPortMatch) {
    const p = parseInt(ipPortMatch[2], 10);
    if (p > 0 && p < 65536) {
      return {
        ip: ipPortMatch[1],
        httpPort: p,
        port: p,
        password: '',
        source: 'ip-port'
      };
    }
  }

  // --- Cas 2 : URL acstuff / acmanager ---
  // On cherche le paramètre ip=... dans la query string
  const urlIpMatch = s.match(/[?&]ip=([^&]+)/i);
  if (!urlIpMatch) return null;

  let ip = decodeURIComponent(urlIpMatch[1]).trim();
  // On accepte aussi bien les IP que les hostnames (résolus côté main.js)
  if (!/^[\w.\-]+$/i.test(ip)) return null;

  const httpPortMatch = s.match(/[?&]httpPort=(\d+)/i);
  const portMatch     = s.match(/[?&](?:tport|port)=(\d+)/i);
  const pwdMatch      = s.match(/[?&]password=([^&]+)/i);

  const httpPort = httpPortMatch ? parseInt(httpPortMatch[1], 10) : null;
  const gamePort = portMatch ? parseInt(portMatch[1], 10) : null;

  // On privilégie httpPort (car /INFO se fait TOUJOURS sur le HTTP port)
  const chosenPort = httpPort || gamePort;
  if (!chosenPort || chosenPort < 1 || chosenPort > 65535) return null;

  return {
    ip,
    httpPort: chosenPort,
    port: chosenPort,
    password: pwdMatch ? decodeURIComponent(pwdMatch[1]) : '',
    source: 'url'
  };
}

/**
 * Handler du bouton "Rejoindre" à côté du champ "Coller un lien".
 */
async function handleServerLinkJoin() {
  const input = document.getElementById('server-link-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) { alert('Colle un lien ou une adresse IP:PORT.'); return; }

  const parsed = parseServerLink(raw);
  if (!parsed) {
    alert(
      'Lien non reconnu.\n\n' +
      'Formats acceptés :\n' +
      '• https://acstuff.club/s/qrace/online/join?ip=X.X.X.X&httpPort=YYYY\n' +
      '• acmanager://race/online/join?ip=X.X.X.X&httpPort=YYYY\n' +
      '• 51.38.180.172:28093'
    );
    return;
  }

    console.log('[ServerLink] Lien parsé :', parsed);

  // Si le lien contient un mot de passe, on le mémorise pour ce serveur
  if (parsed.password) {
    const pwdKey = `${parsed.ip}:${parsed.port}`;
    if (!appData.serverPasswords) appData.serverPasswords = {};
    appData.serverPasswords[pwdKey] = parsed.password;
    saveCurrentState();
  }

  // ⭐ On propose d'ajouter le serveur aux manuels + favoris
  const alreadyKnown = (appData.customServers || []).some(s => s.ip === parsed.ip && s.port === parsed.port);
  if (!alreadyKnown) {
    const add = confirm(
      `Voulez-vous enregistrer ce serveur dans vos favoris ?\n\n` +
      `📡 ${parsed.ip}:${parsed.port}\n\n` +
      `Tu pourras le retrouver facilement dans "Mes serveurs enregistrés".`
    );
    if (add) {
      if (!appData.customServers) appData.customServers = [];
      appData.customServers.push({
        id: 'srv_' + Date.now(),
        ip: parsed.ip,
        port: parsed.port,
        httpPort: parsed.httpPort,
        name: `${parsed.ip}:${parsed.port}`
      });
      // Ajout auto aux favoris
      if (!Array.isArray(appData.favoriteServers)) appData.favoriteServers = [];
      const key = `${parsed.ip}:${parsed.port}`;
      if (!appData.favoriteServers.includes(key)) appData.favoriteServers.push(key);
      saveCurrentState();
      renderManualServers();
    }
  }

  // On ouvre la modale habituelle — elle fera son /INFO pour trouver le vrai gamePort
  await openServerJoinModal({
    id: 'link_' + Date.now(),
    ip: parsed.ip,
    port: parsed.port,
    httpPort: parsed.httpPort,
    name: `${parsed.ip}:${parsed.port}`,
    source: 'link'
  });

  // Optionnel : on vide le champ après
  input.value = '';
}