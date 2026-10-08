// Retro visitor counter in the footer. Counts each browser once per visit (session),
// so refreshing the page doesn't inflate it.
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
    if (!M.db) { box.parentNode.hidden = true; return; }

    var counted = alreadyCounted();
    M.db.rpc(counted ? 'get_visits' : 'bump_visits').then(function (res) {
      if (res.error || res.data === null) throw res.error;
      if (!counted) markCounted();
      var digits = String(res.data);
      while (digits.length < 6) digits = '0' + digits;
      box.textContent = digits;
    }).catch(function () {
      box.parentNode.hidden = true;
    });
  });
})();
