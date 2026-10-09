// Bookshelf: built from reading entries. Entries with the same title (ignoring capitals)
// are one book. A book is finished once any of its entries has "finished this book" ticked.
// Pages logged = the highest page reached in each book, added up.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };
  function short(d) { return M.formatDate(d, { weekday: undefined, month: 'short' }); }

  function books(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) {   // oldest first
      var d = r.data || {};
      if (typeof d.title !== 'string' || !d.title.trim()) return;
      var key = d.title.trim().toLowerCase();
      var b = map[key];
      if (!b) { b = map[key] = { title: d.title.trim(), author: '', first: r.entry_date, last: r.entry_date, page: 0, finished: null, logs: 0 }; order.push(key); }
      if (d.author) b.author = d.author;
      b.last = r.entry_date;
      b.logs += 1;
      var p = Number(d.page);
      if (isFinite(p) && p > b.page) b.page = p;
      if (d.finished && !b.finished) b.finished = r.entry_date;
    });
    return order.map(function (k) { return map[k]; });
  }

  function bookLine(b) {
    return el('li', null, [
      el('i', null, [b.title]), b.author ? ' by ' + b.author : null,
      el('div', { class: 'note' }, [
        'started ', el('a', { href: M.dayUrl(b.first) }, [short(b.first)]),
        b.finished ? [' · finished ', el('a', { href: M.dayUrl(b.finished) }, [short(b.finished)])] : [' · last update ', el('a', { href: M.dayUrl(b.last) }, [short(b.last)])],
        b.page ? ' · up to p. ' + b.page : null,
        ' · ' + b.logs + (b.logs === 1 ? ' entry' : ' entries')
      ].reduce(function (a, x) { return a.concat(x); }, []))
    ]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var out = document.getElementById('content');
    function say(text, cls) { out.textContent = ''; out.appendChild(el('p', { class: cls || 'empty' }, [text])); }
    if (!M.db) { say('Not connected to the database yet.', 'note'); return; }
    M.layered(function (c) {
      return c.from('entries').select('entry_date, data').eq('type', 'reading')
        .order('entry_date', { ascending: true }).order('created_at', { ascending: true }).then(M.rows);
    }, function (rows) {
      var all = books(rows || []);
      out.textContent = '';
      if (!all.length) { say('No books yet. Reading entries show up here.'); return; }
      var reading = all.filter(function (b) { return !b.finished; }).reverse();
      var done = all.filter(function (b) { return b.finished; }).sort(function (a, b) { return a.finished < b.finished ? 1 : -1; });
      var pages = all.reduce(function (n, b) { return n + b.page; }, 0);
      out.appendChild(el('p', { class: 'note shelf-stats' }, [
        all.length + (all.length === 1 ? ' book' : ' books') + ' · ' + done.length + ' finished · ' + pages + ' pages logged'
      ]));
      [['Currently reading', reading, 'Nothing on the nightstand right now.'], ['Finished', done, 'None finished yet.']].forEach(function (sec) {
        out.appendChild(el('h2', { class: 'section-head' }, [sec[0]]));
        out.appendChild(sec[1].length ? el('ul', { class: 'shelf' }, sec[1].map(bookLine)) : el('p', { class: 'empty' }, [sec[2]]));
      });
    }, function () { say("Couldn't load the bookshelf. Check your connection and refresh.", 'note'); }, 'bookshelf');
  });
})();
