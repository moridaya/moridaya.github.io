// Turns entry rows into HTML. Shared by the home page and the day page (via js/bento.js),
// so a day looks the same everywhere.
//
// Text is always inserted as plain text, never as HTML, so nothing typed into an
// entry can break the page or run code.
(function () {
  var M = window.Moridaya = window.Moridaya || {};

  // el('p', {class: 'x'}, ['text', otherElement]) -> <p class="x">text...</p>
  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
        if (k === 'class') node.className = attrs[k];
        else node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false || kid === '') return;
      // Anything that isn't a real element (odd data, objects) is shown as plain text.
      node.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }
  M.el = el;

  function has(v) { return v !== null && v !== undefined && v !== ''; }

  // Only allow real web links (no javascript: tricks).
  function safeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null; }

  // Link text is never a raw URL: without a title it shows the page or site name.
  function link(url, text) {
    var u = safeUrl(url);
    return u ? el('a', { href: u, rel: 'noopener' }, [has(text) ? text : decodeTitle(u)]) : (has(text) ? text : null);
  }
  M.link = link;

  function para(text) { return has(text) ? el('p', null, [String(text)]) : null; }

  function num(v) {
    var n = Number(v);
    return has(v) && isFinite(n) ? n : null;
  }

  function trimNum(n, digits) { return String(Number(n.toFixed(digits === undefined ? 2 : digits))); }

  // ---------- media: YouTube, Spotify, storage files ----------

  function youtubeId(url) {
    var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
    return m ? m[1] : null;
  }

  function spotifyEmbed(url) {
    var m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/.exec(url || '');
    if (!m) return null;
    return el('iframe', {
      class: 'spotify',
      src: 'https://open.spotify.com/embed/' + m[1] + '/' + m[2],
      height: m[1] === 'track' ? '152' : '352',
      loading: 'lazy',
      allow: 'clipboard-write; encrypted-media; fullscreen; picture-in-picture',
      title: 'Spotify player'
    });
  }

  var AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm)(\?|$)/i;

  function mediaItem(item, caption, alt) {
    if (typeof item !== 'string' || !item) return null;
    var yt = youtubeId(item);
    if (yt) {
      return el('iframe', {
        class: 'video',
        src: 'https://www.youtube-nocookie.com/embed/' + yt,
        loading: 'lazy',
        allow: 'encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: true,
        title: 'YouTube video'
      });
    }
    var url = safeUrl(item) || M.mediaUrl(item);
    if (!url) return null;
    if (AUDIO_EXT.test(item)) return el('audio', { controls: true, preload: 'none', src: url });
    return zoomable(url, '', caption, alt);
  }

  // A picture that opens big in the viewer (js/lightbox.js) when clicked.
  // It's a button, not a link, so the file's address never shows or opens in a new tab.
  function zoomable(url, cls, caption, alt) {
    var b = el('button', {
      type: 'button',
      class: 'zoom' + (cls ? ' ' + cls : ''),
      'aria-label': 'enlarge photo' + (has(caption) ? ': ' + caption : '')
    }, [el('img', { src: url, alt: has(alt) ? alt : (has(caption) ? caption : 'photo'), loading: 'lazy' })]);
    if (has(caption)) b.setAttribute('data-caption', String(caption));
    return b;
  }

  function isImagePath(item) {
    return typeof item === 'string' && !youtubeId(item) && !AUDIO_EXT.test(item) && !/^https?:/i.test(item);
  }

  function mediaBlock(list, caption, alt) {
    if (!Array.isArray(list) || !list.length) return null;
    return el('div', { class: 'media' }, list.map(function (m) { return mediaItem(m, caption, alt); }).filter(Boolean));
  }

  // The words that go with an entry's photos: caption under the enlarged photo, and alt text.
  function photoCaption(entry, d) {
    var c = d.caption || (entry.type === 'food' ? d.text : null) ||
      (entry.type === 'song' && has(d.title) ? d.title + (has(d.artist) ? ' \u2014 ' + d.artist : '') : null) ||
      d.topic || d.text || null;
    return has(c) ? String(c).replace(/\s+/g, ' ').slice(0, 300) : null;
  }
  function photoAlt(entry, caption) {
    if (caption) return caption;
    var day = M.formatDate(entry.entry_date, { weekday: undefined });
    return entry.type + ' photo' + (day ? ' from ' + day : '');
  }

  // ---------- per-type bodies ----------

  function hoursBetween(a, b) {
    var ms = new Date(b) - new Date(a);
    if (!isFinite(ms) || ms <= 0) return null;
    var mins = Math.round(ms / 60000);
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  // '8:00 PM - 12:00 PM (16 h)' or 'started 8:00 PM, still going'
  M.fastingWindow = function (d) {
    if (!has(d.start) || !M.formatTime(d.start)) return null;
    if (!has(d.end) || !M.formatTime(d.end)) return 'started ' + M.formatTime(d.start) + ', still going';
    var span = hoursBetween(d.start, d.end);
    return M.formatTime(d.start) + ' – ' + M.formatTime(d.end) + (span ? ' (' + span + ')' : '');
  };

  function runLine(d) {
    var km = num(d.distance_km), min = num(d.minutes);
    var bits = [];
    if (km !== null) bits.push(trimNum(km) + ' km');
    if (min !== null) bits.push((bits.length ? 'in ' : '') + trimNum(min, 1) + ' min');
    if (km && min) {
      var pace = min / km;
      var secs = Math.round((pace - Math.floor(pace)) * 60);
      var whole = Math.floor(pace);
      if (secs === 60) { whole += 1; secs = 0; }
      bits.push('(' + whole + ':' + (secs < 10 ? '0' : '') + secs + ' /km)');
    }
    return bits.join(' ');
  }

  function rabbitHole(list) {
    if (!Array.isArray(list) || !list.length) return null;
    var kids = ['rabbit hole: '];
    list.forEach(function (step, i) {
      if (i) kids.push(' → ');
      if (typeof step === 'string') kids.push(safeUrl(step) ? link(step, decodeTitle(step)) : step);
      else if (step) kids.push(link(step.url, step.title) || step.title || '');
    });
    return el('p', { class: 'note' }, kids);
  }

  // 'https://en.wikipedia.org/wiki/Opportunity_cost' -> 'Opportunity cost'
  // any other link -> just the site name, e.g. 'investopedia.com'
  function decodeTitle(url) {
    url = String(url);
    var m = /\/wiki\/([^?#]+)/.exec(url);
    if (m) {
      try { return decodeURIComponent(m[1]).replace(/_/g, ' '); } catch (e) { return m[1].replace(/_/g, ' '); }
    }
    var host = /^https?:\/\/([^\/?#:]+)/i.exec(url);
    return host ? host[1].replace(/^www\./i, '') : 'link';
  }

  var BODIES = {
    thought: function (d) { return [para(d.text)]; },

    learned: function (d) {
      var topic = has(d.topic) ? d.topic : (d.wikipedia_url ? decodeTitle(d.wikipedia_url) : null);
      return [
        topic ? el('p', null, [el('b', null, [link(d.wikipedia_url, topic) || topic])]) : null,
        para(d.own_words),
        has(d.voice_note) ? el('div', { class: 'media' }, [mediaItem(d.voice_note)]) : null,
        rabbitHole(d.rabbit_hole)
      ];
    },

    fasting: function (d) { return [para(M.fastingWindow(d)), para(d.note)]; },

    run: function (d) { return [para(runLine(d)), para(d.note)]; },

    photo: function (d) { return [para(d.caption)]; },

    song: function (d, entry) {
      var title = has(d.title) ? d.title : 'untitled';
      var cover = songCover(d, entry);
      var line = el('div', { class: 'song' }, [
        cover ? zoomable(cover, 'cover', photoCaption(entry, d), 'album cover' + (has(d.title) ? ': ' + d.title : '')) : null,
        el('div', null, [el('b', null, [title]), has(d.artist) ? ' — ' + d.artist : null])
      ]);
      var player = spotifyEmbed(d.spotify_url);
      if (player) line.className += ' has-player';   // small tiles show just the player
      return [line, player];
    },

    quote: function (d) {
      return [
        has(d.text) ? el('blockquote', null, ['“' + d.text + '”']) : null,
        has(d.source) ? el('p', { class: 'note' }, ['— ' + d.source]) : null
      ];
    },

    reading: function (d) {
      var line = [];
      if (has(d.title)) line.push(el('i', null, [d.title]));
      if (has(d.author)) line.push(' by ' + d.author);
      if (has(d.page)) line.push(', p. ' + d.page);
      return [line.length ? el('p', null, line) : null, para(d.note)];
    },

    body: function (d) {
      var bits = [];
      if (num(d.weight_kg) !== null) bits.push('weight ' + trimNum(num(d.weight_kg), 1) + ' kg');
      if (num(d.height_cm) !== null) bits.push('height ' + trimNum(num(d.height_cm), 1) + ' cm');
      return [para(bits.join(', ')), para(d.note)];
    },

    food: function (d) { return [para(d.text)]; },

    goal: function (d) {
      return [
        el('p', null, [
          d.done ? '[done] ' : null,
          has(d.text) ? d.text : null,
          has(d.target_date) ? ' (by ' + M.formatDate(d.target_date, { weekday: undefined, month: 'short' }) + ')' : null
        ]),
        para(d.note)
      ];
    },

    mood: function (d) {
      return [has(d.mood) ? el('p', null, [el('b', null, [String(d.mood)])]) : null, para(d.note)];
    }
  };

  // Song cover: the album art link, or else the first uploaded picture on the entry.
  function songCover(d, entry) {
    if (safeUrl(d.album_art)) return d.album_art;
    var media = Array.isArray(entry.media) ? entry.media : [];
    for (var i = 0; i < media.length; i++) if (isImagePath(media[i])) return M.mediaUrl(media[i]);
    return null;
  }

  function tagsLine(tags) {
    if (!Array.isArray(tags) || !tags.length) return null;
    var kids = ['tags: '];
    tags.forEach(function (t, i) {
      if (i) kids.push(', ');
      kids.push(el('a', { href: M.tagUrl(t) }, [t]));
    });
    return el('div', { class: 'tags' }, kids);
  }

  // One entry row -> one <article>.
  M.renderEntry = function (entry) {
    var d = (entry.data && typeof entry.data === 'object') ? entry.data : {};
    var body = (BODIES.hasOwnProperty(entry.type) ? BODIES[entry.type] : function (x) { return [para(x.text || x.note)]; })(d, entry);
    var media = Array.isArray(entry.media) ? entry.media : [];
    if (entry.type === 'song' && !safeUrl(d.album_art)) {
      // the first picture is already shown as the small cover
      var used = false;
      media = media.filter(function (m) { if (!used && isImagePath(m)) { used = true; return false; } return true; });
    }
    return el('article', { class: 'entry entry-' + entry.type }, [
      el('div', { class: 'entry-meta' }, [
        M.formatTime(entry.created_at), ' · ',
        el('span', { class: 'kind' }, [entry.type]),
        entry.private ? el('span', { class: 'private' }, [' · private']) : null
      ])
    ].concat(body, [mediaBlock(media, photoCaption(entry, d), photoAlt(entry, photoCaption(entry, d))), tagsLine(entry.tags)]));
  };
})();
