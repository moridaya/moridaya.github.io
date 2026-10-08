// The [bracketed] menu. Lives here so changing the menu means editing one file, not every page.
//
// `ready: true` marks pages that exist. Anything else shows gray with "(soon)" and can't be
// clicked. When a page gets built, the same change that adds it flips its flag to true here,
// so "(soon)" disappears by itself the moment that update goes live.
(function () {
  var ITEMS = [
    { label: 'home', path: 'index.html', ready: true },
    { label: 'archive', path: 'html/archive.html', ready: true },
    { label: 'favorites', path: 'html/favorites.html', ready: true },
    { label: 'hobbies', path: 'html/hobbies.html', ready: true },
    { label: 'bookshelf', path: 'html/bookshelf.html', ready: true },
    { label: 'quotes', path: 'html/quotes.html', ready: true },
    { label: 'goals', path: 'html/goals.html', ready: true },
    { label: 'places', path: 'html/places.html' },
    { label: 'about', path: 'html/about.html', ready: true }
  ];
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.getElementById('ribbon');
    if (!nav) return;
    var root = document.body.getAttribute('data-root') || '';
    var current = document.body.getAttribute('data-page');

    ITEMS.forEach(function (item) {
      var span = document.createElement('span');
      var label;
      if (!item.ready) {
        span.className = 'item soon';
        span.setAttribute('aria-disabled', 'true');
        label = document.createElement('span');
        label.textContent = item.label + ' (soon)';
      } else if (item.label === current) {
        span.className = 'item';
        label = document.createElement('b');
        label.textContent = item.label;
      } else {
        span.className = 'item';
        label = document.createElement('a');
        label.href = root + item.path;
        label.textContent = item.label;
      }
      span.appendChild(document.createTextNode('['));
      span.appendChild(label);
      span.appendChild(document.createTextNode(']'));
      nav.appendChild(span);
      nav.appendChild(document.createTextNode(' '));
    });
  });
})();
