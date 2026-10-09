// Goals: every goal entry, sorted into active, done and dropped, with their dates.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };
  function short(d) { return M.formatDate(d, { weekday: undefined, month: 'short' }); }
  function isDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); }

  function goalLine(g) {
    var d = g.data || {};
    var bits = ['set ', el('a', { href: M.dayUrl(g.entry_date) }, [short(g.entry_date)])];
    if (isDate(d.target_date)) bits.push(' · by ' + short(d.target_date));
    if ((d.done || d.dropped) && isDate(d.closed_on)) bits.push(' · ' + (d.done ? 'done ' : 'dropped ') + short(d.closed_on));
    if (g.private) bits.push(' · private');
    return el('li', null, [String(d.text), el('div', { class: 'note' }, bits)]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var out = document.getElementById('content');
    function say(text, cls) { out.textContent = ''; out.appendChild(el('p', { class: cls || 'empty' }, [text])); }
    if (!M.db) { say('Not connected to the database yet.', 'note'); return; }
    M.layered(function (c) {
      return c.from('entries').select('entry_date, private, data').eq('type', 'goal')
        .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).then(M.rows);
    }, function (rows) {
      rows = (rows || []).filter(function (g) { return g.data && g.data.text; });
      out.textContent = '';
      if (!rows.length) { say('No goals yet.'); return; }
      var groups = [
        ['Active', rows.filter(function (g) { return !g.data.done && !g.data.dropped; }), 'Nothing in progress.'],
        ['Done', rows.filter(function (g) { return g.data.done; }), 'None done yet.'],
        ['Dropped', rows.filter(function (g) { return !g.data.done && g.data.dropped; }), 'None dropped.']
      ];
      groups.forEach(function (sec) {
        out.appendChild(el('h2', { class: 'section-head' }, [sec[0] + ' · ' + sec[1].length]));
        out.appendChild(sec[1].length ? el('ul', { class: 'shelf' }, sec[1].map(goalLine)) : el('p', { class: 'empty' }, [sec[2]]));
      });
    }, function () { say("Couldn't load goals. Check your connection and refresh.", 'note'); }, 'goals');
  });
})();
