// Favorites: all-time favorites by category. Each category shows the current favorite
// (name, optional photo, a one-line "why", since when) and what it replaced:
// "previously: X, from [date] to [date]". Categories without a favorite are hidden.
// Managed from the posting page (js/post-favorites.js).
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var el = function () { return M.el.apply(null, arguments); };
  function short(d) { return M.formatDate(d, { weekday: undefined, month: 'short' }); }

  M.fetchFavorites = function (c) {
    return Promise.all([
      c.from('favorite_categories').select('id, name, position').order('position').order('id').then(M.rows),
      c.from('favorites').select('id, category_id, name, why, photo, since, until').order('since', { ascending: false }).order('id', { ascending: false }).then(M.rows)
    ]).then(function (r) { return { cats: r[0], favs: r[1] }; });
  };

  function photoButton(f) {
    if (!f.photo) return null;
    var b = el('button', { type: 'button', class: 'zoom fav-photo', 'aria-label': 'enlarge photo: ' + f.name }, [
      el('img', { src: M.mediaUrl(f.photo), alt: f.name, loading: 'lazy' })
    ]);
    b.setAttribute('data-caption', f.name + (f.why ? ' — ' + f.why : ''));
    return b;
  }

  function render(out, data) {
    out.textContent = '';
    var shown = 0;
    var grid = el('div', { class: 'fav-grid' });
    data.cats.forEach(function (cat) {
      var mine = data.favs.filter(function (f) { return f.category_id === cat.id; });
      if (!mine.length) return;
      shown++;
      var current = mine.filter(function (f) { return !f.until; })[0];
      var past = mine.filter(function (f) { return f.until; });
      grid.appendChild(el('section', { class: 'fav' }, [
        el('h2', { class: 'section-head' }, [cat.name]),
        current ? el('div', { class: 'fav-current' }, [
          photoButton(current),
          el('div', null, [
            el('p', { class: 'fav-name' }, [current.name]),
            current.why ? el('p', { class: 'fav-why' }, ['“' + current.why + '”']) : null,
            el('p', { class: 'note' }, ['since ' + short(current.since)])
          ])
        ]) : el('p', { class: 'empty' }, ['No current favorite.']),
        past.length ? el('p', { class: 'note fav-past' }, ['previously: '].concat(past.map(function (f, i) {
          return (i ? '; ' : '') + f.name + ', from ' + short(f.since) + ' to ' + short(f.until);
        }))) : null
      ]));
    });
    if (!shown) { out.appendChild(el('p', { class: 'empty' }, ['No favorites yet.'])); return; }
    out.appendChild(grid);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var out = document.getElementById('content');
    if (!out || document.body.getAttribute('data-page') !== 'favorites') return;
    if (!M.db) { out.textContent = 'Not connected to the database yet.'; return; }
    M.layered(M.fetchFavorites, function (data) { render(out, data); }, function () {
      out.textContent = '';
      out.appendChild(el('p', { class: 'note' }, ["Couldn't load favorites. (If this is new: run sql/004_favorites.sql in Supabase.)"]));
    }, 'favorites');
  });
})();
