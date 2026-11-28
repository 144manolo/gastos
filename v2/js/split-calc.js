/* split-calc.js — cuentas a medias · Contabilidad MFB v2 (código puro, probado en Node)
 * Todo en céntimos para que no se pierda ni sobre ningún céntimo. */
(function (root) {
  'use strict';
  function cents(x) { return Math.round(Number(x) * 100); }

  // people: ['Yo','Ana'] · expenses: [{ desc, amount, payer, shares: ['Yo','Ana'] }]
  // Devuelve { paid, owed, balance (€, + = le deben, - = debe), transfers: [{from,to,amount}] }
  function compute(people, expenses) {
    var paid = {}, owed = {};
    people.forEach(function (p) { paid[p] = 0; owed[p] = 0; });
    (expenses || []).forEach(function (e) {
      var amt = cents(e.amount);
      var sh = (e.shares && e.shares.length ? e.shares : people).filter(function (n) { return n in owed; });
      if (!(amt > 0) || !sh.length || !(e.payer in paid)) return;
      paid[e.payer] += amt;
      var base = Math.floor(amt / sh.length), rest = amt - base * sh.length;
      sh.forEach(function (n, i) { owed[n] += base + (i < rest ? 1 : 0); }); // el céntimo suelto va a los primeros
    });
    var bal = {}; people.forEach(function (p) { bal[p] = paid[p] - owed[p]; });
    var cred = [], debt = [];
    people.forEach(function (p) { if (bal[p] > 0) cred.push({ n: p, v: bal[p] }); else if (bal[p] < 0) debt.push({ n: p, v: -bal[p] }); });
    cred.sort(function (a, b) { return b.v - a.v; }); debt.sort(function (a, b) { return b.v - a.v; });
    var tr = [], i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      var m = Math.min(debt[i].v, cred[j].v);
      tr.push({ from: debt[i].n, to: cred[j].n, amount: m / 100 });
      debt[i].v -= m; cred[j].v -= m;
      if (debt[i].v === 0) i++; if (cred[j].v === 0) j++;
    }
    var out = { paid: {}, owed: {}, balance: {}, transfers: tr };
    people.forEach(function (p) { out.paid[p] = paid[p] / 100; out.owed[p] = owed[p] / 100; out.balance[p] = bal[p] / 100; });
    return out;
  }
  var api = { compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SplitCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
