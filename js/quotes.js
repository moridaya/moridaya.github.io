// Quotes: just the line and who said it. No explanations. Shown big, one at a time down the
// page, newest first. Managed on this page; not daily posts.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };

  M.collection({
    table: 'quotes',
    select: 'id, text, source, saved_on',
    order: function (q) { return q.order('saved_on', { ascending: false }).order('id', { ascending: false }); },
    noun: 'quote',
    cacheKey: 'quotes-v2',
    empty: 'No quotes saved yet.',
    fields: [
      { name: 'text', label: 'the line', kind: 'textarea', rows: 3, required: true, max: 600 },
      { name: 'source', label: 'who said it', max: 200 },
      { name: 'saved_on', label: 'saved on', kind: 'date', today: true }
    ],
    toRow: function (v) { return { text: v.text, source: v.source, saved_on: v.saved_on || M.manilaDate() }; },
    summary: function (q) { return '“' + (q.text.length > 60 ? q.text.slice(0, 57) + '...' : q.text) + '”'; },
    render: function (out, rows, ctx) {
      out.appendChild(el('div', { class: 'quote-wall' }, rows.map(function (q) {
        var edit = null;
        if (ctx.owner) { edit = el('button', { type: 'button', class: 'small' }, ['edit']); edit.addEventListener('click', function () { ctx.edit(q); }); }
        return el('figure', { class: 'quote-card' }, [
          el('blockquote', null, ['“' + q.text + '”']),
          el('figcaption', null, [
            q.source ? el('span', { class: 'quote-source' }, ['— ' + q.source]) : null,
            el('span', { class: 'note' }, [' ' + M.shortDate(q.saved_on)]),
            edit ? ' ' : null, edit
          ])
        ]);
      })));
    }
  });
})();
