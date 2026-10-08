// The [bracketed] menu. Lives here so changing the menu means editing one file, not every page.
(function () {
  var ITEMS = [
    ['home', 'index.html'],
    ['archive', 'html/archive.html'],
    ['hobbies', 'html/hobbies.html'],
    ['bookshelf', 'html/bookshelf.html'],
    ['quotes', 'html/quotes.html'],
    ['goals', 'html/goals.html'],
    ['places', 'html/places.html'],
    ['random day', 'html/random.html'],
    ['about', 'html/about.html']
  ];

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.getElementById('ribbon');
    if (!nav) return;
    var root = document.body.getAttribute('data-root') || '';
    var current = document.body.getAttribute('data-page');

    ITEMS.forEach(function (item) {
      var span = document.createElement('span');
      span.className = 'item';
      var label;
      if (item[0] === current) {
        label = document.createElement('b');
      } else {
        label = document.createElement('a');
        label.href = root + item[1];
      }
      label.textContent = item[0];
      span.appendChild(document.createTextNode('['));
      span.appendChild(label);
      span.appendChild(document.createTextNode(']'));
      nav.appendChild(span);
      nav.appendChild(document.createTextNode(' '));
    });
  });
})();
