/* review.js — revisión guiada de datos · Contabilidad MFB v2
 * Muestra lo que conviene revisar (importes 0, duplicados, subcategorías fuera de lista…)
 * y permite arreglarlo sin salir de la pantalla. */

let reviewIsOpen = false, reviewSection = null;

const REVIEW_TITLES = {
  zeros: 'Importe 0', negatives: 'Importe negativo', duplicates: 'Posibles duplicados',
  unknownSubs: 'Subcategorías fuera de lista', noSub: 'Sin subcategoría', tests: 'Movimientos de prueba',
  recover: 'Solo en el archivo (2025 en adelante)'
};

function openReview() {
  reviewSection = null;
  document.getElementById('reviewOverlay').classList.add('active');
  reviewIsOpen = true;
  reviewRender();
  document.getElementById('reviewBody').scrollTop = 0;
}
function closeReview() {
  document.getElementById('reviewOverlay').classList.remove('active');
  reviewIsOpen = false;
}
function reviewRefresh() { if (reviewIsOpen) reviewRender(); }
function reviewBack() { reviewSection = null; reviewRender(); document.getElementById('reviewBody').scrollTop = 0; }
function reviewOpenSection(s) { reviewSection = s; reviewRender(); document.getElementById('reviewBody').scrollTop = 0; }

function reviewData() {
  const r = DataCheck.findIssues(getAllTransactions(), categories);
  r.recover = archiveOnlyRecent();
  return r;
}
function reviewCount(r, s) {
  return s === 'duplicates' ? r.counts.duplicateExtras : s === 'unknownSubs' ? r.counts.unknownSubGroups : r[s].length;
}

function reviewRow(t, extra) {
  const sub = t.subcategory && t.subcategory !== t.category ? ' → ' + escapeHtml(t.subcategory) : '';
  return '<div class="hrow rrow"><div class="hrow-date">' + hDate(t.date) + '</div>' +
    '<div class="hrow-info" onclick="viewTransaction(' + t.id + ',\'review\')"><h4>' + escapeHtml(t.description) + '</h4><span>' +
    escapeHtml(t.category) + sub + (extra ? ' · ' + extra : '') + '</span></div>' +
    '<div class="activity-amount ' + (t.type === 'income' ? 'positive' : 'negative') + '">' + (t.type === 'income' ? '+' : '-') + fmtEUR(t.amount) + '</div>' +
    '<div class="rbtns"><button onclick="editTransaction(' + t.id + ')">✏️</button><button onclick="reviewDelete(' + t.id + ')">🗑️</button></div></div>';
}

function reviewRender() {
  const body = document.getElementById('reviewBody');
  const title = document.getElementById('reviewTitle');
  const back = document.getElementById('reviewBackBtn');
  const r = reviewData();

  if (!reviewSection) {
    title.textContent = 'REVISAR DATOS';
    back.onclick = closeReview;
    const sections = Object.keys(REVIEW_TITLES).filter(s => reviewCount(r, s) > 0);
    if (!sections.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div>Todo en orden. No hay nada que revisar.</div></div>';
      return;
    }
    const desc = {
      zeros: 'Gastos pagados por otra persona o importes sin rellenar.',
      negatives: 'Un importe negativo suele ser un error de signo.',
      duplicates: 'Mismo día, importe, categoría y descripción. Se conserva el original.',
      unknownSubs: 'Se usan pero no están en tu lista de categorías.',
      noSub: 'La categoría tiene subcategorías y estos movimientos no eligieron ninguna.',
      tests: 'Descripciones que empiezan por "prueba" o "test".',
      recover: 'Están en el archivo pero no en la nube. Puedes recuperarlos o descartarlos.'
    };
    body.innerHTML = '<p class="rev-intro">Toca un apartado para revisarlo. Nada se cambia sin que lo pidas.</p>' +
      sections.map(s => '<div class="rev-card" onclick="reviewOpenSection(\'' + s + '\')"><div><b>' + REVIEW_TITLES[s] + '</b><span>' + desc[s] +
        '</span></div><div class="rev-n">' + hN(reviewCount(r, s)) + '</div></div>').join('');
    return;
  }

  title.textContent = REVIEW_TITLES[reviewSection].toUpperCase();
  back.onclick = reviewBack;
  const sorted = a => a.slice().sort((x, y) => y.date.localeCompare(x.date));
  let html = '';

  if (reviewSection === 'duplicates') {
    html += '<button class="rev-main" onclick="reviewDeleteAllCopies()">🗑️ Borrar las ' + r.counts.duplicateExtras + ' copias (se conservan los originales)</button>';
    r.duplicates.forEach(g => {
      html += '<div class="rev-group"><div class="rev-gh">×' + g.length + ' · ' + hDate(g[0].date) + ' · ' + fmtEUR(g[0].amount) + '</div>' +
        g.map((t, i) => reviewRow(t, i === 0 ? 'original' : 'copia')).join('') + '</div>';
    });
  } else if (reviewSection === 'unknownSubs') {
    r.unknownSubs.forEach((g, i) => {
      html += '<div class="rev-group"><div class="rev-gh">' + escapeHtml(g.category) + ' → ' + escapeHtml(g.sub) + ' · ' + g.items.length + ' mov.</div>' +
        '<button class="rev-main" onclick="reviewAddSub(' + i + ')">➕ Añadir "' + escapeHtml(g.sub) + '" a la lista de ' + escapeHtml(g.category) + '</button></div>';
    });
  } else if (reviewSection === 'recover') {
    html += '<div class="rev-btns"><button class="rev-main" onclick="reviewRecover(true)">☁️ Recuperar los ' + r.recover.length + ' en la nube</button>' +
      '<button class="rev-main sec" onclick="reviewRecover(false)">Descartarlos</button></div>' +
      sorted(r.recover).slice(0, 100).map(t => reviewRow(t)).join('');
  } else {
    html += sorted(r[reviewSection]).slice(0, 150).map(t => reviewRow(t)).join('');
    if (r[reviewSection].length > 150) html += '<p class="rev-intro">Se muestran 150 de ' + hN(r[reviewSection].length) + '. Arregla estos y vuelve a entrar.</p>';
  }
  body.innerHTML = html;
}

function reviewDone(msg) {
  saveTransactions();
  invalidateAll();
  updateUI();
  reviewRender();
  if (msg) showNotification(msg);
}
function reviewDelete(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  deleteTransactionQuiet(id);
  reviewDone('Eliminado');
}
function reviewDeleteAllCopies() {
  const r = reviewData();
  const n = r.counts.duplicateExtras;
  if (!n || !confirm('¿Borrar las ' + n + ' copias y conservar los originales?')) return;
  r.duplicates.forEach(g => g.slice(1).forEach(t => deleteTransactionQuiet(t.id)));
  reviewDone('✓ ' + n + ' copias eliminadas');
}
function reviewAddSub(i) {
  const g = reviewData().unknownSubs[i];
  if (!g) return;
  if (!categories[g.type]) categories[g.type] = {};
  if (!categories[g.type][g.category]) categories[g.type][g.category] = [];
  if (!categories[g.type][g.category].includes(g.sub)) categories[g.type][g.category].push(g.sub);
  saveCategories();
  updateCategoriesSelect();
  reviewDone('✓ Subcategoría añadida');
}
function reviewRecover(keep) {
  const items = archiveOnlyRecent();
  if (!items.length) return;
  if (keep) { promoteToLive(items); reviewDone('✓ ' + items.length + ' movimientos recuperados en la nube'); }
  else {
    if (!confirm('¿Descartar ' + items.length + ' movimientos del archivo? No volverán a aparecer.')) return;
    items.forEach(t => addTombstone(t.id));
    reviewDone('Descartados');
  }
}
