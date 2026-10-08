// Retro visitor counter in the footer.
// Every visitor adds 1 (once per visit, so refreshing doesn't inflate it), but only the
// owner, logged in, can see the number: the database refuses to tell anyone else.
// Visitors use the public connection; only a browser with a saved login asks for the number.
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var KEY = 'moridaya-counted';

  function alreadyCounted() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markCounted() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* fine, may count twice */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var box = document.getElementById('visitors');
    if (!box) return;
    var line = box.parentNode;
    line.hidden = true;
    if (!M.db) return;

    var owner = M.ownerClient();
    if (!owner) {
      // A visitor: add 1, show nothing. Your own visits (saved login) don't count.
      if (!alreadyCounted()) {
        M.withTimeout(M.db.rpc('bump_visits'), 10000, 'counter')
          .then(function (r) { if (!r.error) markCounted(); })
          .catch(function () { /* not worth bothering anyone about */ });
      }
      return;
    }
    M.withTimeout(owner.rpc('get_visits'), 15000, 'counter').then(function (r) {
      if (r.error || r.data === null || r.data === undefined) return;
      var digits = String(r.data);
      while (digits.length < 6) digits = '0' + digits;
      box.textContent = digits;
      line.hidden = false;
    }).catch(function () { line.hidden = true; });
  });
})();
