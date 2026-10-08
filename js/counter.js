// Retro visitor counter in the footer.
// Every visitor adds 1 (once per visit, so refreshing doesn't inflate it), but only
// the owner, logged in, can see the number. The database refuses to tell anyone else.
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

    M.db.auth.getSession().then(function (res) {
      var loggedIn = Boolean(res.data && res.data.session);
      // Your own visits don't count.
      if (!loggedIn && !alreadyCounted()) {
        M.db.rpc('bump_visits').then(function (r) { if (!r.error) markCounted(); });
      }
      if (!loggedIn) return;
      return M.db.rpc('get_visits').then(function (r) {
        if (r.error || r.data === null || r.data === undefined) return;
        var digits = String(r.data);
        while (digits.length < 6) digits = '0' + digits;
        box.textContent = digits;
        line.hidden = false;
      });
    }).catch(function () { line.hidden = true; });
  });
})();
