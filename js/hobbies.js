// Hobbies: every tag, with how many entries use it. Clicking one (hobbies.html?tag=running)
// shows every entry with that tag, newest first, as a bento grid with dates.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };

  function say(out, text, cls) { out.textContent = ''; out.appendChild(el('p', { class: cls || 'empty' }, [text])); }

  function allTags(out) {
    M.layered(function (c) { return c.rpc('tag_counts').then(M.rows); }, function (rows) {
      out.textContent = '';
      rows = (rows || []).filter(function (r) { return r.tag; });
      if (!rows.length) { say(out, 'No hobbies yet. Tags on entries show up here.'); return; }
      var list = el('p', { class: 'tag-cloud' });
      rows.forEach(function (r, i) {
        if (i) list.appendChild(document.createTextNode(' '));
        list.appendChild(el('span', { class: 'item' }, [
          '[', el('a', { href: M.tagUrl(r.tag) }, [r.tag]), ' ', el('span', { class: 'note' }, [String(r.entry_count)]), ']'
        ]));
      });
      out.appendChild(list);
    }, function () { say(out, "Couldn't load hobbies. Check your connection and refresh.", 'note'); }, 'hobbies:tags');
  }

  function oneTag(out, tag) {
    document.title = tag + ' - Moriyada';
    var head = el('h2', { class: 'section-head' }, [tag]);
    var back = el('p', { class: 'note' }, [el('a', { href: M.root() + 'html/hobbies.html' }, ['« all hobbies'])]);
    var grid = el('div', { id: 'bento' }, [el('p', { class: 'note' }, ['loading...'])]);
    out.textContent = '';
    out.appendChild(back); out.appendChild(head); out.appendChild(grid);
    M.layered(function (c) {
      return c.from('entries').select('id, created_at, entry_date, type, tags, data, media, private')
        .contains('tags', [tag]).order('entry_date', { ascending: false }).order('created_at', { ascending: false })
        .limit(300).then(M.rows);
    }, function (entries) {
      head.textContent = tag + ' · ' + entries.length + (entries.length === 1 ? ' entry' : ' entries');
      M.renderBento(grid, entries, { showDate: true, emptyText: 'Nothing with this tag yet.' });
    }, function () { say(grid, "Couldn't load these entries. Refresh to try again.", 'note'); }, 'hobbies:tag:' + tag);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var out = document.getElementById('content');
    if (!M.db) { say(out, 'Not connected to the database yet.', 'note'); return; }
    var tag = (new URLSearchParams(location.search).get('tag') || '').trim();
    if (tag && tag.length <= 50) oneTag(out, tag); else allTags(out);
  });
})();
