/* split.js — reparto de cuentas · Contabilidad MFB v2
 * Personas, quién pagó qué y entre quién se reparte → quién debe cuánto a quién.
 * Se guarda en el móvil para retomarlo, se envía como texto y puedes guardar tu parte como gasto. */

let split = { people: ['Yo'], expenses: [], title: '' }, splitOpen = false;
function splitLoad() { try { const s = JSON.parse(localStorage.getItem('mfb_split') || 'null'); if (s && Array.isArray(s.people) && s.people.length) split = s; } catch (e) {} }
function splitSave() { try { localStorage.setItem('mfb_split', JSON.stringify(split)); } catch (e) {} }
splitLoad();

function splitEnsureDom() {
  if (document.getElementById('splitOverlay')) return;
  const d = document.createElement('div');
  d.className = 'v2-overlay'; d.id = 'splitOverlay';
  d.innerHTML = '<div class="v2-head"><button onclick="closeSplit()" aria-label="Volver">‹</button><h2>REPARTO DE CUENTAS</h2><button onclick="splitReset()" title="Empezar uno nuevo">Nuevo</button></div><div class="v2-body" id="splitBody"></div>';
  document.body.appendChild(d);
}
function openSplit() { splitEnsureDom(); document.getElementById('splitOverlay').classList.add('active'); splitOpen = true; splitRender(); }
function closeSplit() { document.getElementById('splitOverlay').classList.remove('active'); splitOpen = false; }
function splitReset() { if (split.expenses.length && !confirm('¿Empezar un reparto nuevo? Se borra el actual.')) return; split = { people: ['Yo'], expenses: [], title: '' }; splitSave(); splitRender(); }

function splitAddPerson() {
  const i = document.getElementById('spPerson'); const n = (i.value || '').trim();
  if (!n) return;
  if (split.people.some(p => p.toLowerCase() === n.toLowerCase())) { showNotification('Ya está en la lista', true); return; }
  split.people.push(n); i.value = ''; splitSave(); splitRender();
}
function splitDelPerson(n) {
  if (split.people.length <= 1) return;
  if (split.expenses.some(e => e.payer === n || (e.shares || []).includes(n)) && !confirm('Hay gastos con ' + n + '. Se quitará también de ellos.')) return;
  split.people = split.people.filter(p => p !== n);
  split.expenses = split.expenses.map(e => ({ ...e, shares: (e.shares || []).filter(p => p !== n) })).filter(e => e.payer !== n);
  splitSave(); splitRender();
}
function splitAddExpense() {
  const desc = document.getElementById('spDesc').value.trim(), amt = parseFloat(String(document.getElementById('spAmt').value).replace(',', '.'));
  const payer = document.getElementById('spPayer').value;
  const shares = [...document.querySelectorAll('#spShares input:checked')].map(i => i.value);
  if (!(amt > 0)) { showNotification('Pon un importe válido', true); return; }
  if (!shares.length) { showNotification('Elige entre quién se reparte', true); return; }
  split.expenses.push({ desc: desc || 'Gasto', amount: Math.round(amt * 100) / 100, payer, shares });
  splitSave(); splitRender();
}
function splitDelExpense(i) { split.expenses.splice(i, 1); splitSave(); splitRender(); }

function splitText() {
  const r = SplitCalc.compute(split.people, split.expenses);
  const total = split.expenses.reduce((s, e) => s + e.amount, 0);
  let t = '🧾 ' + (split.title || 'Reparto de cuentas') + '\nTotal: ' + fmtEUR(total) + '\n';
  split.expenses.forEach(e => { t += '• ' + e.desc + ' ' + fmtEUR(e.amount) + ' (pagó ' + e.payer + (e.shares.length < split.people.length ? ', entre ' + e.shares.join(', ') : '') + ')\n'; });
  t += '\n';
  if (!r.transfers.length) t += '✅ Todo cuadrado, nadie debe nada.';
  else r.transfers.forEach(x => { t += '👉 ' + x.from + ' paga ' + fmtEUR(x.amount) + ' a ' + x.to + '\n'; });
  return t.trim();
}
async function splitShare() {
  const text = splitText();
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); showNotification('✓ Copiado: pégalo en WhatsApp'); } catch (e) { showNotification('No se pudo copiar', true); }
}
function splitMyShare() {
  const me = split.people[0];
  return SplitCalc.compute(split.people, split.expenses).owed[me] || 0;
}
function splitSaveMine() {
  const mine = splitMyShare();
  if (!(mine > 0)) { showNotification('Tu parte es 0', true); return; }
  closeSplit(); openModal();
  selectType('expense');
  document.getElementById('amount').value = mine.toFixed(2);
  document.getElementById('description').value = 'Reparto: ' + (split.title || split.expenses.map(e => e.desc).slice(0, 2).join(', '));
}

function splitRender() {
  const r = SplitCalc.compute(split.people, split.expenses), total = split.expenses.reduce((s, e) => s + e.amount, 0);
  const me = split.people[0];
  const opts = split.people.map(p => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>').join('');
  document.getElementById('splitBody').innerHTML =
    '<div class="rep-q"><b>🍻 ¿Cuenta de bar o restaurante?</b><small>Con el ticket (OCR) y la carta del sitio: dices lo que tomó cada uno y te da lo que paga cada cual.</small><button class="rev-main" onclick="closeSplit(); openBill()">🧾 Cuenta con ticket</button></div>' +
    '<div class="rep-q"><b>1. ¿Quiénes sois? <small style="display:inline">(el primero eres tú)</small></b><div class="rep-chips">' +
    split.people.map((p, i) => '<span class="rep-chip on">' + escapeHtml(p) + (i ? ' <a onclick="splitDelPerson(\'' + p.replace(/'/g, "\\'") + '\')" style="margin-left:6px">✕</a>' : '') + '</span>').join('') + '</div>' +
    '<div class="rep-dates"><input id="spPerson" class="rep-in" style="margin:0" placeholder="Añadir persona" onkeydown="if(event.key===\'Enter\')splitAddPerson()"><button class="rev-main" style="flex:none;width:90px;margin:0" onclick="splitAddPerson()">Añadir</button></div></div>' +
    '<div class="rep-q"><b>2. Añadir un gasto</b>' +
    '<input id="spDesc" class="rep-in" placeholder="Qué fue (cena, gasolina…)">' +
    '<div class="rep-dates"><input id="spAmt" class="rep-in" style="margin:0" inputmode="decimal" placeholder="Importe €"><select id="spPayer" class="rep-in" style="margin:0">' + opts + '</select></div>' +
    '<small>¿Entre quién se reparte?</small><div id="spShares" class="rep-chips" style="margin:6px 0 10px">' +
    split.people.map(p => '<label class="rep-chip on" style="display:flex;gap:6px;align-items:center"><input type="checkbox" checked value="' + escapeHtml(p) + '" style="accent-color:#00f0ff">' + escapeHtml(p) + '</label>').join('') + '</div>' +
    '<button class="rev-main" onclick="splitAddExpense()">➕ Añadir gasto</button></div>' +
    (split.expenses.length ? '<div class="rep-q"><b>Gastos (' + fmtEUR(total) + ')</b>' + split.expenses.map((e, i) =>
      '<div class="hrow"><div class="hrow-info"><h4>' + escapeHtml(e.desc) + '</h4><span>pagó ' + escapeHtml(e.payer) + ' · entre ' + (e.shares.length === split.people.length ? 'todos' : escapeHtml(e.shares.join(', '))) + '</span></div>' +
      '<div class="activity-amount negative">' + fmtEUR(e.amount) + '</div><div class="rbtns"><button onclick="splitDelExpense(' + i + ')">🗑️</button></div></div>').join('') + '</div>' +
      '<div class="rep-q"><b>3. Resultado</b>' +
      split.people.map(p => '<div class="vs-row"><span>' + escapeHtml(p) + ' <small style="display:inline">pagó ' + fmtEUR(r.paid[p]) + ', le toca ' + fmtEUR(r.owed[p]) + '</small></span><b style="color:' + (r.balance[p] > 0.004 ? '#00ff88' : r.balance[p] < -0.004 ? '#ff5c5c' : 'inherit') + '">' + (r.balance[p] > 0.004 ? 'le deben ' + fmtEUR(r.balance[p]) : r.balance[p] < -0.004 ? 'debe ' + fmtEUR(-r.balance[p]) : 'a cero') + '</b></div>').join('') +
      '<div class="vs-ask">' + (r.transfers.length ? r.transfers.map(t => '👉 <b>' + escapeHtml(t.from) + '</b> paga ' + fmtEUR(t.amount) + ' a <b>' + escapeHtml(t.to) + '</b>').join('<br>') : '✅ Todo cuadrado') + '</div>' +
      '<div class="rep-actions"><button class="rev-main" onclick="splitShare()">📤 Enviar resultado</button><button class="rev-main sec" onclick="splitSaveMine()">💾 Mi parte (' + fmtEUR(r.owed[me]) + ') como gasto</button></div></div>' : '');
}
