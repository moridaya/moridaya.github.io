// Quotes: every saved quote, newest first.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };

  document.addEventListener('DOMContentLoaded', function () {
    var out = document.getElementById('content');
    function say(text, cls) { out.textContent = ''; out.appendChild(el('p', { class: cls || 'empty' }, [text])); }
    if (!M.db) { say('Not connected to the database yet.', 'note'); return; }
    M.layered(function (c) {
      return c.from('entries').select('id, entry_date, private, text:data->>text, source:data->>source')
        .eq('type', 'quote').order('entry_date', { ascending: false }).order('created_at', { ascending: false })
        .then(M.rows);
    }, function (rows) {
      rows = (rows || []).filter(function (q) { return q.text; });
      out.textContent = '';
      if (!rows.length) { say('No quotes saved yet.'); return; }
      rows.forEach(function (q) {
        out.appendChild(el('div', { class: 'quote-item' }, [
          el('blockquote', null, ['“' + q.text + '”']),
          el('p', { class: 'note' }, [
            q.source ? '— ' + q.source + ' · ' : null,
            el('a', { href: M.dayUrl(q.entry_date) }, ['saved ' + M.formatDate(q.entry_date, { weekday: undefined, month: 'short' })]),
            q.private ? ' · private' : null
          ])
        ]));
      });
    }, function () { say("Couldn't load quotes. Check your connection and refresh.", 'note'); }, 'quotes');
  });
})();
