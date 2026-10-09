// Song entries: type to search the iTunes Search API (free, no key). Picking a result fills
// in title, artist and album art (a 600px version). Everything stays editable, and if the
// search can't be reached the form still works by typing the song in by hand.
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };

  var API = 'https://itunes.apple.com/search?media=music&entity=song&limit=6&country=PH&term=';

  function bigArt(url) {
    // iTunes gives 100x100 art; the same address serves larger sizes.
    return typeof url === 'string' ? url.replace(/\/\d+x\d+bb\./, '/600x600bb.') : '';
  }

  M.attachSongSearch = function (box) {
    var input = el('input', { type: 'search', id: 'song-search', autocomplete: 'off', placeholder: 'type a song or artist' });
    var results = el('ul', { class: 'song-results', role: 'listbox', 'aria-label': 'search results' });
    var note = el('p', { class: 'note', 'aria-live': 'polite' });
    box.insertBefore(el('div', { class: 'field' }, [
      el('label', { for: 'song-search' }, ['search a song (fills in the fields below)']), input, note, results
    ]), box.firstChild);

    var timer = null, current = null, seq = 0;

    function pick(r) {
      var set = function (id, v) { var f = document.getElementById(id); if (f && v) f.value = v; };
      set('d-title', r.trackName);
      set('d-artist', r.artistName);
      set('d-album_art', bigArt(r.artworkUrl100));
      results.textContent = '';
      note.textContent = 'Filled in: ' + r.trackName + ' — ' + r.artistName + '. You can still edit it.';
      input.value = '';
    }

    function search(term) {
      var mine = ++seq;
      if (current) current.abort();
      current = new AbortController();
      note.textContent = 'searching...';
      (M.fetch || fetch)(API + encodeURIComponent(term), { signal: current.signal })
        .then(function (r) { if (!r.ok) throw new Error('search ' + r.status); return r.json(); })
        .then(function (data) {
          if (mine !== seq) return;   // a newer search already started
          results.textContent = '';
          var list = (data && data.results) || [];
          note.textContent = list.length ? '' : 'No songs found. Type the title and artist below instead.';
          list.forEach(function (r) {
            if (!r.trackName) return;
            var b = el('button', { type: 'button', class: 'song-result' }, [
              r.artworkUrl60 ? el('img', { src: r.artworkUrl60, alt: '', loading: 'lazy' }) : null,
              el('span', null, [el('b', null, [r.trackName]), ' — ' + (r.artistName || ''),
                r.collectionName ? el('span', { class: 'note' }, [' (' + r.collectionName + ')']) : null])
            ]);
            b.addEventListener('click', function () { pick(r); });
            results.appendChild(el('li', null, [b]));
          });
        })
        .catch(function (err) {
          if (mine !== seq || (err && err.name === 'AbortError' && current && current.signal.aborted && mine !== seq)) return;
          results.textContent = '';
          note.textContent = "Song search isn't available right now. Type the title and artist below.";
        });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var term = input.value.trim();
      if (term.length < 2) { results.textContent = ''; note.textContent = ''; seq++; return; }
      timer = setTimeout(function () { search(term); }, 350);   // wait for a pause in typing
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });   // don't submit the form
  };
})();
