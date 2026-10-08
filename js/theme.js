// Dark mode toggle. Loaded in <head> so the page never flashes the wrong colors.
// The choice is remembered in localStorage; with nothing saved, it follows the phone/PC setting.
(function () {
  var KEY = 'moridaya-theme';
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* private mode etc: just don't remember */ }
  }

  var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', saved() || (systemDark ? 'dark' : 'light'));

  function isDark() { return root.getAttribute('data-theme') === 'dark'; }

  function updateButton(btn) {
    // ︎ asks phones to draw the sun as a plain symbol, not an emoji.
    btn.textContent = isDark() ? '☀︎' : '☾';
    btn.title = isDark() ? 'switch to light mode' : 'switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    updateButton(btn);
    btn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      remember(next);
      updateButton(btn);
    });
  });
})();
