// Hobbies: a card for each thing I love doing (name, photo, why, since when).
// Managed on this page; not daily posts.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };

  M.collection({
    table: 'hobbies',
    select: 'id, name, photo, why, since',
    order: function (q) { return q.order('position').order('id'); },
    noun: 'hobby',
    cacheKey: 'hobbies-v2',
    empty: 'No hobbies yet.',
    photo: { field: 'photo', maxSide: 800, targetBytes: 160 * 1024 },
    fields: [
      { name: 'name', label: 'hobby', required: true, max: 100 },
      { name: 'photo', label: 'photo (optional)', kind: 'photo' },
      { name: 'why', label: 'why I love it', kind: 'textarea', rows: 4, max: 2000 },
      { name: 'since', label: 'since when (optional)', kind: 'date' }
    ],
    toRow: function (v) { return { name: v.name, why: v.why, since: v.since }; },
    summary: function (h) { return h.name; },
    render: function (out, rows, ctx) {
      out.appendChild(el('div', { class: 'hobby-grid' }, rows.map(function (h) {
        var edit = null;
        if (ctx.owner) { edit = el('button', { type: 'button', class: 'small' }, ['edit']); edit.addEventListener('click', function () { ctx.edit(h); }); }
        var pic = h.photo
          ? el('button', { type: 'button', class: 'zoom hobby-photo', 'aria-label': 'enlarge photo: ' + h.name, 'data-caption': h.name },
              [el('img', { src: M.mediaUrl(h.photo), alt: h.name, loading: 'lazy' })])
          : el('div', { class: 'hobby-photo hobby-blank', 'aria-hidden': 'true' }, [h.name.charAt(0).toUpperCase()]);
        return el('article', { class: 'hobby' }, [
          pic,
          el('h3', { class: 'hobby-name' }, [h.name, edit ? ' ' : null, edit]),
          h.since ? el('p', { class: 'note' }, ['since ' + M.formatDate(h.since, { weekday: undefined, day: undefined })]) : null,
          h.why ? el('p', { class: 'hobby-why' }, [h.why]) : null
        ]);
      })));
    }
  });
})();
