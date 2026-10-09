// Bookshelf: books as their own thing (not daily posts). Covers on a shelf, split into
// "reading now" and "finished"; my thoughts open under each book. Managed on this page.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };

  function bookCard(b, ctx) {
    var cover = b.cover
      ? el('button', { type: 'button', class: 'zoom book-cover', 'aria-label': 'enlarge cover: ' + b.title, 'data-caption': b.title + (b.author ? ' by ' + b.author : '') },
          [el('img', { src: M.mediaUrl(b.cover), alt: 'cover of ' + b.title, loading: 'lazy' })])
      : el('div', { class: 'book-cover book-spine', 'aria-hidden': 'true' }, [el('span', null, [b.title])]);
    var edit = null;
    if (ctx.owner) { edit = el('button', { type: 'button', class: 'small' }, ['edit']); edit.addEventListener('click', function () { ctx.edit(b); }); }
    return el('article', { class: 'book' }, [
      cover,
      el('div', { class: 'book-info' }, [
        el('h3', { class: 'book-title' }, [b.title]),
        b.author ? el('p', { class: 'book-author' }, ['by ' + b.author]) : null,
        el('p', { class: 'note' }, [
          b.status === 'finished'
            ? 'read ' + M.shortDate(b.started_on) + ' – ' + M.shortDate(b.finished_on || b.started_on)
            : 'reading since ' + M.shortDate(b.started_on),
          edit ? ' ' : null, edit
        ]),
        b.thoughts ? el('details', { class: 'book-thoughts' }, [el('summary', null, ['my thoughts']), el('p', null, [b.thoughts])]) : null
      ])
    ]);
  }

  M.collection({
    table: 'books',
    select: 'id, title, author, cover, status, thoughts, started_on, finished_on',
    order: function (q) { return q.order('started_on', { ascending: false }).order('id', { ascending: false }); },
    noun: 'book',
    cacheKey: 'books',
    empty: 'The shelf is empty for now.',
    photo: { field: 'cover', maxSide: 700, targetBytes: 140 * 1024 },
    fields: [
      { name: 'title', label: 'title', required: true, max: 300 },
      { name: 'author', label: 'author', max: 200 },
      { name: 'cover', label: 'cover photo (optional)', kind: 'photo' },
      { name: 'status', label: 'status', kind: 'select', options: [['reading', 'reading'], ['finished', 'finished']] },
      { name: 'started_on', label: 'started', kind: 'date', today: true },
      { name: 'finished_on', label: 'finished on (when it\'s finished)', kind: 'date' },
      { name: 'thoughts', label: 'my thoughts', kind: 'textarea', rows: 6, max: 10000 }
    ],
    validate: function (v) {
      if (v.finished_on && v.started_on && v.finished_on < v.started_on) return '"Finished on" can\'t be before "started".';
      return null;
    },
    toRow: function (v) {
      return {
        title: v.title, author: v.author, status: v.status, thoughts: v.thoughts,
        started_on: v.started_on || M.manilaDate(),
        finished_on: v.status === 'finished' ? (v.finished_on || M.manilaDate()) : null
      };
    },
    summary: function (b) { return b.title + (b.author ? ' (' + b.author + ')' : ''); },
    render: function (out, rows, ctx) {
      var reading = rows.filter(function (b) { return b.status !== 'finished'; });
      var done = rows.filter(function (b) { return b.status === 'finished'; })
        .sort(function (a, b) { return (b.finished_on || '') < (a.finished_on || '') ? -1 : 1; });
      [['Reading now', reading, 'Nothing on the nightstand right now.'], ['Finished', done, 'None finished yet.']].forEach(function (s) {
        out.appendChild(el('h2', { class: 'section-head' }, [s[0] + ' · ' + s[1].length]));
        out.appendChild(s[1].length ? el('div', { class: 'shelf-grid' }, s[1].map(function (b) { return bookCard(b, ctx); }))
          : el('p', { class: 'empty' }, [s[2]]));
      });
    }
  });
})();
