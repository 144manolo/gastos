/* sync.js — sincronización por movimiento con el Gist · Contabilidad MFB v2
 * Sustituye a loadFromCloud / saveToCloudImmediate del original.
 * En vez de "lo último que sube pisa todo", cada movimiento se fusiona por id:
 *   - gana la edición con `updatedAt` más reciente
 *   - lo borrado (lápidas `deletedIds`) no revive
 *   - lo nuevo de cualquiera de los dos lados se conserva */

function gistHeaders(json) {
  const h = { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function fetchCloudParsed() {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: gistHeaders() });
  if (!response.ok) throw new Error(`Error ${response.status}`);
  const data = await response.json();
  const content = await cloudFileContent(data.files && data.files[GIST_FILENAME]);
  return content ? JSON.parse(content) : null;
}

function backupLocalBeforeMerge() {
  try { localStorage.setItem('nexus_backup_before_cloud', JSON.stringify({ at: new Date().toISOString(), transactions })); } catch (e) {}
}

// Aplica la fusión al estado local. Devuelve el resultado de SyncMerge.
function applyCloudMerge(parsed) {
  const r = SyncMerge.mergeTransactions(transactions, parsed.transactions || [], deletedIds, parsed.deletedIds || []);
  if (r.changed) {
    if (transactions.length) backupLocalBeforeMerge();
    transactions = r.merged;
    saveTransactionsLocal();
  }
  if (r.deleted.length !== deletedIds.length) setDeleted(r.deleted);
  return r;
}

async function loadFromCloud() {
  try {
    const parsed = await fetchCloudParsed();
    if (!parsed) { updateSyncStatus('☁️ Nube vacía, usando locales', 'online'); return false; }
    let dataUpdated = false, pushNeeded = false;
    const r = applyCloudMerge(parsed);
    if (r.changed) dataUpdated = true;
    if (r.localAhead) pushNeeded = true;
    if (parsed.categories && Object.keys(parsed.categories).length > 0) {
      if (categories.income && Object.keys(categories.income).length > 0) {
        for (let type in parsed.categories) {
          if (!categories[type]) categories[type] = {};
          for (let cat in parsed.categories[type]) {
            if (!categories[type][cat]) categories[type][cat] = parsed.categories[type][cat];
            else parsed.categories[type][cat].forEach(sub => { if (!categories[type][cat].includes(sub)) categories[type][cat].push(sub); });
          }
        }
      } else categories = parsed.categories;
      saveCategoriesLocal(); dataUpdated = true;
    }
    if (parsed.venues && typeof venuesMerge === 'function' && venuesMerge(parsed.venues)) dataUpdated = true;
    if (parsed.budgets) { budgets = parsed.budgets; localStorage.setItem('nexus_budgets', JSON.stringify(budgets)); dataUpdated = true; }
    if (parsed.shoppingList) { shoppingList = parsed.shoppingList; localStorage.setItem('nexus_shopping', JSON.stringify(shoppingList)); dataUpdated = true; }
    if (parsed.shoppingHistory) { shoppingHistory = parsed.shoppingHistory; localStorage.setItem('nexus_shopping_history', JSON.stringify(shoppingHistory)); dataUpdated = true; }
    localStorage.setItem('nexus_last_sync', new Date().toISOString());
    if (dataUpdated) { updateSyncStatus('☁️ Sincronizado: ' + new Date().toLocaleTimeString(), 'online'); showNotification('☁️ Datos cargados'); }
    else updateSyncStatus('☁️ Nube vacía, usando locales', 'online');
    if (pushNeeded && cloudSyncEnabled) saveToCloud();
    return dataUpdated;
  } catch (e) {
    console.log('Error al cargar desde la nube:', e);
    updateSyncStatus('❌ Error: ' + e.message, 'offline');
    showNotification('⚠️ Usando datos locales', true);
    return false;
  }
}

async function saveToCloudImmediate() {
  if (!cloudSyncEnabled) return;
  try {
    // 1) traer lo que haya en la nube y fusionarlo (otro móvil puede haber escrito mientras tanto)
    const parsed = await fetchCloudParsed();
    if (parsed) {
      const r = applyCloudMerge(parsed);
      if (r.changed && typeof updateUI === 'function') updateUI();
    }
    // 2) escribir el resultado
    const syncTime = new Date().toISOString();
    const data = { transactions, deletedIds, venues: (typeof venues !== 'undefined' ? venues : {}), categories, budgets, shoppingList, shoppingHistory, lastUpdate: syncTime };
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH', headers: gistHeaders(true),
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } })
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    localStorage.setItem('nexus_last_sync', syncTime);
    updateSyncStatus('☁️ Guardado: ' + new Date().toLocaleTimeString(), 'online');
  } catch (e) {
    console.log('Error al guardar en la nube:', e);
    updateSyncStatus('❌ Error al guardar', 'offline');
  }
}
