/* bill.js — cuenta con ticket: reparto por lo que tomó cada uno · Contabilidad MFB v2
 * Sitio (p. ej. LA INDIA) con su carta de precios → foto del ticket (OCR) o platos de la carta →
 * dictas "Ana una caña y las bravas, yo el café" → te dice cuánto paga cada uno.
 * La carta del sitio se guarda y, al llegar un ticket nuevo, avisa si cambió algún precio. */

let bill = { venue: '', date: '', lines: [], ticketTotal: null, payer: '' }, billOpen = false, billBusy = '', billHeard = null, billRec = null;
let venues = {};
function venuesLoad() { try { venues = JSON.parse(localStorage.getItem('mfb_venues') || '{}') || {}; } catch (e) { venues = {}; } }
function venuesSave() { try { localStorage.setItem('mfb_venues', JSON.stringify(venues)); } catch (e) {} if (typeof saveToCloud === 'function' && typeof cloudSyncEnabled !== 'undefined' && cloudSyncEnabled) saveToCloud(); }
function billLoad() { try { const b = JSON.parse(localStorage.getItem('mfb_bill') || 'null'); if (b && Array.isArray(b.lines)) bill = b; } catch (e) {} }
function billSave() { try { localStorage.setItem('mfb_bill', JSON.stringify(bill)); } catch (e) {} }
venuesLoad(); billLoad();

// Fusiona las cartas de la nube con las locales (gana el precio visto más recientemente)
function venuesMerge(remote) {
  if (!remote || typeof remote !== 'object') return false;
  let changed = false;
  Object.keys(remote).forEach(v => {
    const rv = remote[v]; if (!rv || !Array.isArray(rv.items)) return;
    if (!venues[v]) { venues[v] = { items: rv.items.slice() }; changed = true; return; }
    rv.items.forEach(ri => {
      const li = venues[v].items.find(x => TicketItems.norm(x.name).trim() === TicketItems.norm(ri.name).trim());
      if (!li) { venues[v].items.push(ri); changed = true; }
      else if ((ri.seen || '') > (li.seen || '') && li.price !== ri.price) { li.price = ri.price; li.seen = ri.seen; changed = true; }
    });
  });
  if (changed) { try { localStorage.setItem('mfb_venues', JSON.stringify(venues)); } catch (e) {} }
  return changed;
}

function bEsc(s) { return escapeHtml(s == null ? '' : String(s)); }
function bMoney(n) { return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €'; }
function bToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function bId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function bCatalog() { return (venues[bill.venue] && venues[bill.venue].items) || []; }

function billEnsureDom() {
  if (document.getElementById('billOverlay')) return;
  const d = document.createElement('div');
  d.className = 'v2-overlay'; d.id = 'billOverlay';
  d.innerHTML = '<div class="v2-head"><button onclick="closeBill()" aria-label="Volver">‹</button><h2>CUENTA CON TICKET</h2><button onclick="billReset()">Nueva</button></div><div class="v2-body" id="billBody"></div>' +
    '<input type="file" id="billFileCam" accept="image/*" capture="environment" style="display:none" onchange="billFile(event)">' +
    '<input type="file" id="billFileGal" accept="image/*" style="display:none" onchange="billFile(event)">';
  document.body.appendChild(d);
}
function openBill() {
  billEnsureDom();
  if (!bill.date) bill.date = bToday();
  if (!bill.venue) { const last = localStorage.getItem('mfb_last_venue'); if (last) bill.venue = last; }
  if (!bill.payer) bill.payer = split.people[0];
  document.getElementById('billOverlay').classList.add('active'); billOpen = true;
  billRender();
}
function closeBill() { document.getElementById('billOverlay').classList.remove('active'); billOpen = false; }
function billReset() {
  if (bill.lines.length && !confirm('¿Empezar una cuenta nueva? Se borra la actual (la carta del sitio se conserva).')) return;
  bill = { venue: bill.venue, date: bToday(), lines: [], ticketTotal: null, payer: split.people[0] }; billHeard = null; billSave(); billRender();
}

// ---------- Datos ----------
function billSetVenue(v) { bill.venue = v.trim().toUpperCase(); if (bill.venue) localStorage.setItem('mfb_last_venue', bill.venue); billSave(); billRender(); }
function billSetDate(v) { bill.date = v; billSave(); }
function billSetPayer(v) { bill.payer = v; billSave(); }
function billSetTotal(v) { const n = parseFloat(String(v).replace(',', '.')); bill.ticketTotal = n > 0 ? n : null; billSave(); billRender(); }
function billSetLine(id, field, v) {
  const l = bill.lines.find(x => x.id === id); if (!l) return;
  if (field === 'name') l.name = v.toUpperCase();
  else if (field === 'qty') l.qty = Math.max(1, parseInt(v, 10) || 1);
  else if (field === 'total') l.total = Math.max(0, Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100) / 100);
  delete l.keep; billSave(); billRender();
}
function billDelLine(id) { bill.lines = bill.lines.filter(x => x.id !== id); billSave(); billRender(); }
function billAddManual() {
  const n = document.getElementById('bmName').value.trim(), p = parseFloat(String(document.getElementById('bmPrice').value).replace(',', '.')), q = Math.max(1, parseInt(document.getElementById('bmQty').value, 10) || 1);
  if (!n || !(p > 0)) { showNotification('Pon nombre y precio', true); return; }
  bill.lines.push({ id: bId(), name: n.toUpperCase(), qty: q, total: Math.round(p * q * 100) / 100, assigned: {} }); billSave(); billRender();
}
function billAddFromCatalog() {
  const sel = document.getElementById('bcSel'); if (!sel || sel.value === '') return;
  const it = bCatalog()[+sel.value], q = Math.max(1, parseInt(document.getElementById('bcQty').value, 10) || 1);
  const ex = bill.lines.find(l => TicketItems.norm(l.name).trim() === TicketItems.norm(it.name).trim());
  if (ex) { ex.total = Math.round((ex.total / ex.qty) * (ex.qty + q) * 100) / 100; ex.qty += q; }
  else bill.lines.push({ id: bId(), name: it.name, qty: q, total: Math.round(it.price * q * 100) / 100, assigned: {} });
  billSave(); billRender();
}

// ---------- Ticket (OCR) ----------
function billPick(kind) { document.getElementById(kind === 'cam' ? 'billFileCam' : 'billFileGal').click(); }
async function billFile(ev) {
  const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  billBusy = 'Leyendo el ticket… (la primera vez tarda más)'; billRender();
  try {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    const o = await performOCR(url);
    if (!o || !o.text) throw new Error('no se pudo leer');
    const parsed = TicketItems.parseItems(o.text);
    try { const cat = (venues[bill.venue || ''] || {}).items || []; TicketItems.fixNames(parsed.items, cat); } catch (e) {}
    if (!o.date && parsed.date) o.date = parsed.date;
    if (!parsed.items.length) { billBusy = ''; billRender(); showNotification('No encuentro líneas de consumición. Añádelas a mano o desde la carta.', true); return; }
    if (bill.lines.length && !confirm('Ya hay ' + bill.lines.length + ' líneas. ¿Sustituirlas por las del ticket?')) { billBusy = ''; billRender(); return; }
    bill.lines = parsed.items.map(i => ({ id: bId(), name: i.name, qty: i.qty, total: i.total, assigned: {} }));
    bill.ticketTotal = parsed.total;
    if (o.date) bill.date = o.date;
    if (!bill.venue && o.merchant) bill.venue = String(o.merchant).toUpperCase();
    billSave();
    showNotification('✓ ' + parsed.items.length + ' líneas leídas. Revísalas.');
  } catch (e) { showNotification('Error al leer el ticket: ' + e.message, true); }
  billBusy = ''; billRender();
}

// ---------- Carta ----------
function billCatalogApply(id, mode) { // 'update' | 'add' | 'keep'
  const l = bill.lines.find(x => x.id === id); if (!l || !bill.venue) return;
  const unit = Math.round(l.total / l.qty * 100) / 100;
  if (!venues[bill.venue]) venues[bill.venue] = { items: [] };
  const cur = TicketItems.matchItem(l.name, venues[bill.venue].items);
  if (mode === 'keep') l.keep = true;
  else if (cur) { cur.price = unit; cur.seen = bill.date; }
  else venues[bill.venue].items.push({ name: l.name, price: unit, seen: bill.date });
  billSave(); venuesSave(); billRender();
}
function billCatalogApplyAll() {
  if (!bill.venue) { showNotification('Pon primero el sitio', true); return; }
  let n = 0;
  billStatus().forEach(s => { if (s.status !== 'same' && !s.line.keep) { billCatalogApply(s.line.id, s.status === 'changed' ? 'update' : 'add'); n++; } });
  showNotification(n ? '✓ Carta de ' + bill.venue + ' actualizada (' + n + ')' : 'La carta ya estaba al día');
}
function billStatus() {
  const cmp = TicketItems.compareWithCatalog(bill.lines.map(l => ({ name: l.name, unit: Math.round(l.total / l.qty * 100) / 100, qty: l.qty, total: l.total })), bCatalog());
  return cmp.map((c, i) => ({ ...c, line: bill.lines[i] }));
}

// ---------- Asignar lo que tomó cada uno ----------
function billAssigned(l) { return Object.values(l.assigned || {}).reduce((s, v) => s + v, 0); }
function billTap(id, person) {
  const l = bill.lines.find(x => x.id === id); if (!l) return;
  l.assigned = l.assigned || {};
  const have = l.assigned[person] || 0, free = l.qty - billAssigned(l);
  if (free > 0) l.assigned[person] = have + 1; else l.assigned[person] = 0;
  if (!l.assigned[person]) delete l.assigned[person];
  billSave(); billRender();
}
function billClearAssign() { bill.lines.forEach(l => l.assigned = {}); billHeard = null; billSave(); billRender(); }

function billListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showNotification('Este navegador no tiene dictado. Usa Chrome en Android o asigna tocando.', true); return; }
  if (!bill.lines.length) { showNotification('Primero añade el ticket o las líneas', true); return; }
  if (billRec) { try { billRec.stop(); } catch (e) {} return; }
  const r = new SR(); billRec = r; r.lang = 'es-ES'; r.continuous = false; r.interimResults = false;
  billBusy = '🎤 Escuchando… di, por ejemplo: "Ana una caña y las bravas, yo el café"'; billRender();
  r.onresult = e => billApplySpeech(e.results[0][0].transcript);
  r.onerror = e => showNotification(e.error === 'not-allowed' ? 'Permite el micrófono en el navegador' : e.error === 'no-speech' ? 'No te he oído' : 'Error de voz: ' + e.error, true);
  r.onend = () => { billRec = null; billBusy = ''; billRender(); };
  r.start();
}
function billApplySpeech(said) {
  const res = TicketItems.parseAssign(said, split.people, bill.lines.map(l => ({ name: l.name })));
  let ok = 0, over = [];
  res.assigns.forEach(a => {
    const l = bill.lines[a.line]; l.assigned = l.assigned || {};
    const free = l.qty - billAssigned(l), q = Math.min(a.qty, free);
    if (q > 0) { l.assigned[a.person] = (l.assigned[a.person] || 0) + q; ok++; }
    if (q < a.qty && a.qty < 999) over.push(l.name);
  });
  billHeard = { said, ok, shared: res.shared.map(i => bill.lines[i].name), unknown: res.unknown, over };
  billSave(); billRender();
}

// ---------- Cuenta ----------
function billCompute() {
  const ls = bill.lines.map(l => ({ qty: l.qty, total: l.total, assigned: l.assigned || {} }));
  const sum = bill.lines.reduce((s, l) => s + l.total, 0);
  return { ...TicketItems.allocate(split.people, ls, bill.ticketTotal != null ? bill.ticketTotal : null), sum: Math.round(sum * 100) / 100 };
}
function billSpeakText(p, cents) { const e = Math.floor(cents / 100), c = cents % 100; return p + ': ' + e + ' euro' + (e === 1 ? '' : 's') + (c ? ' con ' + c : ''); }
function billSpeak() {
  const r = billCompute();
  if (!('speechSynthesis' in window)) { showNotification('Este navegador no sabe leer en voz alta', true); return; }
  speechSynthesis.cancel();
  split.people.forEach(p => { const u = new SpeechSynthesisUtterance(billSpeakText(p, r.perPerson[p])); u.lang = 'es-ES'; speechSynthesis.speak(u); });
}
function billText() {
  const r = billCompute(), tot = bill.ticketTotal != null ? bill.ticketTotal : r.sum;
  let t = '🧾 ' + (bill.venue || 'Cuenta') + ' · ' + bill.date.split('-').reverse().join('/') + '\n';
  split.people.forEach(p => { t += '• ' + p + ': ' + bMoney(r.perPerson[p] / 100) + '\n'; });
  t += 'Total: ' + bMoney(tot) + (bill.payer ? '\nPagó ' + bill.payer : '');
  return t;
}
async function billShare() {
  const text = billText();
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); showNotification('✓ Copiado: pégalo en WhatsApp'); } catch (e) { showNotification('No se pudo copiar', true); }
}
// Convierte la cuenta en gastos del reparto: cada uno le debe su parte a quien pagó
function billToSplit() {
  const r = billCompute();
  split.title = bill.venue || split.title;
  split.expenses = split.expenses.filter(e => !e.fromBill);
  split.people.forEach(p => { if (p !== bill.payer && r.perPerson[p] > 0) split.expenses.push({ desc: (bill.venue || 'Cuenta') + ' · ' + p, amount: r.perPerson[p] / 100, payer: bill.payer, shares: [p], fromBill: true }); });
  splitSave(); closeBill(); openSplit();
}
function billSaveMine() {
  const me = split.people[0], mine = billCompute().perPerson[me] / 100;
  if (!(mine > 0)) { showNotification('Tu parte es 0', true); return; }
  closeBill(); openModal(); selectType('expense');
  document.getElementById('amount').value = mine.toFixed(2);
  document.getElementById('description').value = bill.venue || 'Cuenta';
  document.getElementById('date').value = bill.date;
  // la tienda es la subcategoría: se usa la categoría donde más has gastado en ese sitio
  const vn = TicketItems.norm(bill.venue).trim(), cats = (categories.expense || {}), count = {};
  getAllTransactions().forEach(t => { if (t.type === 'expense' && TicketItems.norm(t.subcategory).trim() === vn) count[t.category] = (count[t.category] || 0) + 1; });
  let best = Object.keys(count).filter(c => (cats[c] || []).some(x => TicketItems.norm(x).trim() === vn)).sort((x, y) => count[y] - count[x])[0];
  if (!best) best = Object.keys(cats).find(c => (cats[c] || []).some(x => TicketItems.norm(x).trim() === vn));
  if (best) { document.getElementById('category').value = best; updateSubcategories(); document.getElementById('subcategory').value = (cats[best] || []).find(x => TicketItems.norm(x).trim() === vn); }
}
function billAddPerson() { const i = document.getElementById('bpName'); const n = (i.value || '').trim(); if (!n) return; if (split.people.some(p => p.toLowerCase() === n.toLowerCase())) { showNotification('Ya está', true); return; } split.people.push(n); splitSave(); i.value = ''; billRender(); }

function billRender() {
  const body = document.getElementById('billBody'); if (!body) return;
  const people = split.people, st = billLines_status();
  const r = billCompute(), total = bill.ticketTotal != null ? bill.ticketTotal : r.sum;
  const venueNames = Object.keys(venues);
  const cat = bCatalog();
  const chip = s => s.status === 'same' ? '<span class="bl-tag ok">✓ precio igual</span>' :
    s.line.keep ? '<span class="bl-tag">se deja como está</span>' :
    s.status === 'changed' ? '<span class="bl-tag warn">⚠ antes ' + bMoney(s.catalogItem.price) + ' → ahora ' + bMoney(s.item.unit) + '</span> <button class="bl-mini" onclick="billCatalogApply(\'' + s.line.id + '\',\'update\')">Actualizar</button> <button class="bl-mini sec" onclick="billCatalogApply(\'' + s.line.id + '\',\'keep\')">Mantener</button>' :
    '<span class="bl-tag new">nuevo en la carta</span> <button class="bl-mini" onclick="billCatalogApply(\'' + s.line.id + '\',\'add\')">Añadir</button>';
  const pending = st.filter(s => s.status !== 'same' && !s.line.keep).length;
  body.innerHTML =
    (billBusy ? '<div class="bl-busy">' + bEsc(billBusy) + '</div>' : '') +
    '<div class="rep-q"><b>1. ¿Dónde es?</b><input class="rep-in" list="bvList" placeholder="Sitio (LA INDIA…)" value="' + bEsc(bill.venue) + '" onchange="billSetVenue(this.value)">' +
    '<datalist id="bvList">' + venueNames.map(v => '<option value="' + bEsc(v) + '">').join('') + '</datalist>' +
    '<div class="rep-dates"><input type="date" value="' + bEsc(bill.date) + '" onchange="billSetDate(this.value)"></div>' +
    '<small>' + (bill.venue ? (cat.length ? 'Carta de ' + bEsc(bill.venue) + ': ' + cat.length + ' platos guardados' : 'Aún no hay carta de ' + bEsc(bill.venue) + ': se creará con el primer ticket') : 'Escribe el sitio para usar su carta') + '</small></div>' +
    '<div class="rep-q"><b>2. El ticket</b><div class="rep-actions"><button class="rev-main" onclick="billPick(\'cam\')">📷 Foto</button><button class="rev-main sec" onclick="billPick(\'gal\')">🖼️ Galería</button></div>' +
    '<small>Se lee con OCR y se rellenan las líneas. También puedes añadirlas a mano o desde la carta.</small>' +
    '<div class="rep-dates" style="margin-top:8px"><input id="bmQty" class="rep-in" style="margin:0;max-width:56px" inputmode="numeric" placeholder="Uds" value="1"><input id="bmName" class="rep-in" style="margin:0" placeholder="Plato"><input id="bmPrice" class="rep-in" style="margin:0;max-width:78px" inputmode="decimal" placeholder="€ c/u"><button class="rev-main" style="flex:none;width:44px;margin:0" onclick="billAddManual()">＋</button></div>' +
    (cat.length ? '<div class="rep-dates" style="margin-top:8px"><select id="bcSel" class="rep-in" style="margin:0"><option value="">Desde la carta…</option>' + cat.map((c, i) => '<option value="' + i + '">' + bEsc(c.name) + ' · ' + bMoney(c.price) + '</option>').join('') + '</select><input id="bcQty" class="rep-in" style="margin:0;max-width:56px" inputmode="numeric" value="1"><button class="rev-main" style="flex:none;width:44px;margin:0" onclick="billAddFromCatalog()">＋</button></div>' : '') + '</div>' +
    '<div class="rep-q"><b>3. ¿Quiénes?</b><div class="rep-chips">' + people.map(p => '<span class="rep-chip on">' + bEsc(p) + '</span>').join('') + '</div>' +
    '<div class="rep-dates"><input id="bpName" class="rep-in" style="margin:0" placeholder="Añadir persona" onkeydown="if(event.key===\'Enter\')billAddPerson()"><button class="rev-main" style="flex:none;width:84px;margin:0" onclick="billAddPerson()">Añadir</button></div></div>' +
    (bill.lines.length ?
      '<div class="rep-q"><b>4. ¿Qué tomó cada uno?</b>' +
      '<div class="rep-actions"><button class="rev-main" onclick="billListen()">🎤 Decirlo con la voz</button><button class="rev-main sec" onclick="billClearAssign()">Borrar</button></div>' +
      (billHeard ? '<div class="bl-heard">“' + bEsc(billHeard.said) + '”<br>✓ ' + billHeard.ok + ' asignados' + (billHeard.shared.length ? ' · compartido: ' + bEsc(billHeard.shared.join(', ')) : '') + (billHeard.over.length ? '<br>⚠ más unidades de las que hay: ' + bEsc(billHeard.over.join(', ')) : '') + (billHeard.unknown.length ? '<br>No he entendido: ' + bEsc(billHeard.unknown.join(' ')) : '') + '</div>' : '<small>O toca el nombre bajo cada plato para sumar una unidad. Lo que no asignes se reparte a partes iguales.</small>') +
      st.map(s => { const l = s.line, free = l.qty - billAssigned(l); return '<div class="bl-line"><div class="bl-top"><input class="bl-q" inputmode="numeric" value="' + l.qty + '" onchange="billSetLine(\'' + l.id + '\',\'qty\',this.value)">×<input class="bl-n" value="' + bEsc(l.name) + '" onchange="billSetLine(\'' + l.id + '\',\'name\',this.value)"><input class="bl-p" inputmode="decimal" value="' + l.total.toFixed(2).replace('.', ',') + '" onchange="billSetLine(\'' + l.id + '\',\'total\',this.value)"><button class="bl-x" onclick="billDelLine(\'' + l.id + '\')">🗑️</button></div>' +
        '<div class="bl-pills">' + people.map(p => { const q = (l.assigned || {})[p] || 0; return '<button class="bl-pill' + (q ? ' on' : '') + '" onclick="billTap(\'' + l.id + '\',\'' + p.replace(/'/g, "\\'") + '\')">' + bEsc(p) + (q ? ' ' + q : '') + '</button>'; }).join('') + (free > 0 ? '<span class="bl-free">sin asignar: ' + free + '</span>' : '') + '</div>' +
        (bill.venue ? '<div class="bl-cat">' + chip(s) + '</div>' : '') + '</div>'; }).join('') +
      (bill.venue && pending ? '<button class="rev-main" onclick="billCatalogApplyAll()">💾 Guardar en la carta de ' + bEsc(bill.venue) + ' (' + pending + ' cambios)</button>' : '') + '</div>' +
      '<div class="rep-q"><b>5. La cuenta</b>' +
      '<div class="vs-row"><span>Total del ticket (con propina si la hay)</span><input class="bl-p" style="width:90px" inputmode="decimal" value="' + total.toFixed(2).replace('.', ',') + '" onchange="billSetTotal(this.value)"></div>' +
      (Math.abs(r.extra) > 0 ? '<small>Las líneas suman ' + bMoney(r.sum) + '; la diferencia de ' + bMoney(r.extra / 100) + ' se reparte en proporción a lo que tomó cada uno.</small>' : '') +
      '<div class="vs-row"><span>¿Quién pagó?</span><select class="rep-in" style="width:auto;margin:0" onchange="billSetPayer(this.value)">' + people.map(p => '<option' + (p === bill.payer ? ' selected' : '') + '>' + bEsc(p) + '</option>').join('') + '</select></div>' +
      people.map(p => '<div class="bl-owe"><span>' + bEsc(p) + '</span><b>' + bMoney(r.perPerson[p] / 100) + '</b></div>').join('') +
      '<div class="rep-actions"><button class="rev-main" onclick="billSpeak()">🔊 Leer en voz alta</button><button class="rev-main sec" onclick="billShare()">📤 Enviar</button></div>' +
      '<div class="rep-actions"><button class="rev-main sec" onclick="billToSplit()">🧾 Pasar al reparto (quién paga a quién)</button></div>' +
      '<div class="rep-actions"><button class="rev-main sec" onclick="billSaveMine()">💾 Mi parte (' + bMoney(r.perPerson[people[0]] / 100) + ') como gasto</button></div></div>' : '');
}
function billLines_status() { return bill.venue || bill.lines.length ? billStatus() : []; }
