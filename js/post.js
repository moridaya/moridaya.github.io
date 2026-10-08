// Posting page: log in, write an entry, upload photos, edit or delete recent posts.
//
// This page only makes the form. What's actually allowed is decided by the database
// rules (sql/setup.sql): if someone else got past the login, every save would be refused.
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var el = function () { return M.el.apply(null, arguments); };
  function $(id) { return document.getElementById(id); }

  // ---------- what each entry type asks for ----------
  //
  // Field names match the README's "Entry fields" table, which is what render.js reads.
  // `need` lists what must be filled in; an inner list means "at least one of these".

  function f(name, label, kind, extra) {
    return Object.assign({ name: name, label: label, kind: kind || 'text' }, extra || {});
  }

  var TYPES = {
    thought: { fields: [f('text', "what's on your mind", 'textarea', { rows: 6 })], need: ['text'] },
    learned: {
      fields: [
        f('topic', 'topic (blank = taken from the Wikipedia link)'),
        f('wikipedia_url', 'Wikipedia link', 'url'),
        f('own_words', 'in my own words', 'textarea', { rows: 4 }),
        f('rabbit_hole', 'rabbit hole (optional): pages visited, one link per line, in order', 'lines'),
        f('voice_note', 'voice note (optional)', 'audio')
      ],
      need: [['topic', 'wikipedia_url']]
    },
    fasting: {
      fields: [
        f('start', 'started (Manila time)', 'datetime'),
        f('end', 'ended (blank if still going)', 'datetime'),
        f('note', 'note')
      ],
      need: ['start']
    },
    run: {
      fields: [
        f('distance_km', 'distance (km)', 'number', { step: '0.01' }),
        f('minutes', 'time (minutes)', 'number', { step: '0.1' }),
        f('note', 'note')
      ],
      need: [['distance_km', 'minutes']]
    },
    photo: { fields: [f('caption', 'caption')], need: ['@photos'] },
    song: {
      fields: [
        f('title', 'song title'),
        f('artist', 'artist'),
        f('album_art', 'album art image link (optional)', 'url'),
        f('spotify_url', 'Spotify link (optional, shows a player)', 'url')
      ],
      need: ['title']
    },
    quote: { fields: [f('text', 'quote', 'textarea', { rows: 3 }), f('source', 'who said it')], need: ['text'] },
    reading: {
      fields: [
        f('title', 'book title'),
        f('author', 'author'),
        f('page', 'page I\'m on (optional)', 'number', { step: '1' }),
        f('note', 'note')
      ],
      need: ['title']
    },
    body: {
      fields: [
        f('weight_kg', 'weight (kg)', 'number', { step: '0.1' }),
        f('height_cm', 'height (cm)', 'number', { step: '0.1' }),
        f('note', 'note')
      ],
      need: [['weight_kg', 'height_cm']]
    },
    food: { fields: [f('text', 'what I ate', 'textarea', { rows: 3 })], need: [['text', '@photos']] },
    goal: {
      fields: [
        f('text', 'goal', 'textarea', { rows: 2 }),
        f('target_date', 'by when (optional)', 'date'),
        f('done', 'done', 'checkbox')
      ],
      need: ['text']
    },
    mood: { fields: [f('mood', 'mood (a word)'), f('note', 'note')], need: ['mood'] }
  };

  // ---------- page state ----------

  var editing = null;        // the entry being edited, or null for a new one
  var keptMedia = [];        // storage paths already on the entry being edited
  var removedMedia = [];     // storage paths to delete once the edit is saved
  var keptVoice = null;      // existing voice note path on the entry being edited
  var busy = false;

  // ---------- small helpers ----------

  function status(message, kind, linkHref, linkText) {
    var box = $('status');
    box.textContent = '';
    box.className = 'notice' + (kind ? ' ' + kind : '');
    box.appendChild(document.createTextNode(message));
    if (linkHref) {
      box.appendChild(document.createTextNode(' '));
      box.appendChild(el('a', { href: linkHref }, [linkText]));
    }
    box.hidden = false;
  }
  function clearStatus() { $('status').hidden = true; }

  function isWebLink(s) { return /^https?:\/\/\S+$/i.test(s); }
  function isYouTube(s) { return /(?:youtube\.com|youtu\.be)\//i.test(s); }

  function wikiTitle(url) {
    var m = /\/wiki\/([^?#]+)/.exec(url);
    if (!m) return url;
    try { return decodeURIComponent(m[1]).replace(/_/g, ' '); } catch (e) { return m[1]; }
  }

  // 'running, Books ,  running' -> ['running', 'books']
  function parseTags(text) {
    var seen = {};
    return text.split(',').map(function (t) { return t.trim().toLowerCase().replace(/\s+/g, ' '); })
      .filter(function (t) { if (!t || seen[t]) return false; seen[t] = true; return true; });
  }

  function randomName() {
    var bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return (b % 36).toString(36); }).join('');
  }

  // '2026-10-08' + 'jpg' -> '2026/10/08/k3j9x0q2m1zp.jpg'
  function storagePath(date, ext) { return date.replace(/-/g, '/') + '/' + randomName() + '.' + ext; }

  function upload(blob, path, contentType) {
    return M.db.storage.from(M.MEDIA_BUCKET)
      .upload(path, blob, { contentType: contentType, cacheControl: '31536000', upsert: false })
      .then(function (res) { if (res.error) throw res.error; return path; });
  }

  function removeFiles(paths) {
    paths = paths.filter(function (p) { return p && !isWebLink(p); });
    if (!paths.length) return Promise.resolve();
    return M.db.storage.from(M.MEDIA_BUCKET).remove(paths).then(function (res) {
      if (res.error && window.console) console.error('cleanup', res.error);
    });
  }

  // Datetime box value ('2026-10-08T20:00', read as Manila time) <-> stored ISO with +08:00
  function toManilaIso(local) { return local ? local + ':00+08:00' : ''; }
  function fromIso(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: M.TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }

  // ---------- building the form ----------

  function fieldInput(field) {
    var id = 'd-' + field.name;
    switch (field.kind) {
      case 'textarea': return el('textarea', { id: id, rows: field.rows || 3 });
      case 'lines': return el('textarea', { id: id, rows: 3 });
      case 'url': return el('input', { id: id, type: 'url', placeholder: 'https://...' });
      case 'number': return el('input', { id: id, type: 'number', step: field.step || 'any', min: '0', inputmode: 'decimal' });
      case 'datetime': return el('input', { id: id, type: 'datetime-local' });
      case 'date': return el('input', { id: id, type: 'date' });
      case 'checkbox': return el('input', { id: id, type: 'checkbox' });
      case 'audio': return el('input', { id: id, type: 'file', accept: 'audio/*' });
      default: return el('input', { id: id, type: 'text' });
    }
  }

  function buildTypeFields(type) {
    var box = $('type-fields');
    box.textContent = '';
    TYPES[type].fields.forEach(function (field) {
      var input = fieldInput(field);
      if (field.kind === 'checkbox') {
        box.appendChild(el('div', { class: 'field check' }, [el('label', null, [input, ' ' + field.label])]));
      } else {
        box.appendChild(el('div', { class: 'field' }, [
          el('label', { for: input.id }, [field.label]), input,
          field.kind === 'audio' ? el('div', { id: 'existing-voice' }) : null
        ]));
      }
    });
    var needsPhoto = TYPES[type].need.some(function (n) { return n === '@photos'; });
    $('photos-label').textContent = needsPhoto ? 'photos' : 'photos (optional)';
    showExistingVoice();
  }

  function showExistingMedia() {
    var box = $('existing-media');
    box.textContent = '';
    keptMedia.forEach(function (path) {
      box.appendChild(el('div', { class: 'note existing' }, [
        el('a', { href: M.mediaUrl(path), target: '_blank', rel: 'noopener' }, [path.split('/').pop()]),
        ' ',
        removeButton(function () {
          keptMedia = keptMedia.filter(function (p) { return p !== path; });
          removedMedia.push(path);
          showExistingMedia();
        })
      ]));
    });
  }

  function showExistingVoice() {
    var box = $('existing-voice');
    if (!box) return;
    box.textContent = '';
    if (!keptVoice) return;
    box.appendChild(el('div', { class: 'note existing' }, [
      el('a', { href: M.mediaUrl(keptVoice), target: '_blank', rel: 'noopener' }, ['current voice note']),
      ' (choosing a new file replaces it) ',
      removeButton(function () { removedMedia.push(keptVoice); keptVoice = null; showExistingVoice(); })
    ]));
  }

  function removeButton(onClick) {
    var b = el('button', { type: 'button', class: 'small' }, ['remove']);
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- reading the form ----------

  function readData(type) {
    var data = {};
    var problems = [];
    TYPES[type].fields.forEach(function (field) {
      var input = $('d-' + field.name);
      var raw = typeof input.value === 'string' ? input.value.trim() : '';
      switch (field.kind) {
        case 'checkbox':
          data[field.name] = input.checked;
          break;
        case 'number':
          if (raw === '') break;
          var n = Number(raw);
          if (!isFinite(n) || n < 0) problems.push(field.label + ' should be a number');
          else data[field.name] = n;
          break;
        case 'url':
          if (raw === '') break;
          if (!isWebLink(raw)) problems.push(field.label + ' should start with https://');
          else data[field.name] = raw;
          break;
        case 'datetime':
          if (raw) data[field.name] = toManilaIso(raw);
          break;
        case 'lines':
          var steps = raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
            .map(function (s) { return isWebLink(s) ? { title: wikiTitle(s), url: s } : { title: s }; });
          if (steps.length) data[field.name] = steps;
          break;
        case 'audio':
          break;   // handled with the uploads
        default:
          if (raw) data[field.name] = raw;
      }
    });

    if (type === 'learned' && !data.topic && data.wikipedia_url) data.topic = wikiTitle(data.wikipedia_url);
    if (type === 'fasting' && data.start && data.end && new Date(data.end) <= new Date(data.start)) {
      problems.push('the fast has to end after it starts');
    }
    return { data: data, problems: problems };
  }

  function missing(type, data, hasPhotos) {
    var out = [];
    TYPES[type].need.forEach(function (rule) {
      var options = Array.isArray(rule) ? rule : [rule];
      var ok = options.some(function (name) {
        if (name === '@photos') return hasPhotos;
        return data[name] !== undefined && data[name] !== '';
      });
      if (!ok) {
        out.push(options.map(function (name) {
          if (name === '@photos') return 'a photo';
          var field = TYPES[type].fields.filter(function (x) { return x.name === name; })[0];
          return field.label.replace(/ \(.*\)$/, '');
        }).join(' or '));
      }
    });
    return out;
  }

  // ---------- saving ----------

  function setBusy(on, label) {
    busy = on;
    $('save').disabled = on;
    $('save').textContent = on ? (label || 'saving...') : (editing ? 'save changes' : 'post');
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    clearStatus();

    var type = $('f-type').value;
    var date = $('f-date').value;
    var photos = Array.prototype.slice.call($('f-photos').files || []);
    var voiceInput = $('d-voice_note');
    var voice = voiceInput && voiceInput.files && voiceInput.files[0];
    var youtube = $('f-youtube').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);

    var read = readData(type);
    var problems = read.problems.slice();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push('pick a date');
    youtube.forEach(function (link) {
      if (!isWebLink(link) || !isYouTube(link)) problems.push('"' + link + '" is not a YouTube link');
    });
    var gaps = missing(type, read.data, photos.length + keptMedia.length > 0);
    if (gaps.length) problems.push('fill in ' + gaps.join(', and '));
    if (problems.length) { status('Not saved: ' + problems.join('; ') + '.', 'error'); return; }

    var uploaded = [];
    var toRemove = removedMedia.slice();   // only acted on if the save succeeds
    try {
      for (var i = 0; i < photos.length; i++) {
        setBusy(true, 'photo ' + (i + 1) + ' of ' + photos.length + '...');
        var blob = await M.compressImage(photos[i]);
        uploaded.push(await upload(blob, storagePath(date, 'jpg'), 'image/jpeg'));
      }
      var data = read.data;
      if (type === 'learned') {
        if (voice) {
          setBusy(true, 'voice note...');
          var ext = (/\.([a-z0-9]{2,5})$/i.exec(voice.name) || [, 'webm'])[1].toLowerCase();
          var voicePath = await upload(voice, storagePath(date, ext), voice.type || 'audio/' + ext);
          uploaded.push(voicePath);
          data.voice_note = voicePath;
          if (keptVoice) toRemove.push(keptVoice);
        } else if (keptVoice) {
          data.voice_note = keptVoice;
        }
      } else if (keptVoice) {
        toRemove.push(keptVoice);   // type changed away from "learned"
      }

      setBusy(true, 'saving...');
      var row = {
        type: type,
        entry_date: date,
        tags: parseTags($('f-tags').value),
        data: data,
        media: keptMedia.concat(uploaded.filter(function (p) { return p !== data.voice_note; }), youtube),
        private: $('f-private').checked
      };
      var res = editing
        ? await M.db.from('entries').update(row).eq('id', editing.id).select().single()
        : await M.db.from('entries').insert(row).select().single();
      if (res.error) throw res.error;

      if (editing) await removeFiles(toRemove);
      var wasEditing = Boolean(editing);
      resetForm(true);
      status(wasEditing ? 'Saved.' : 'Posted.', 'ok', M.dayUrl(res.data.entry_date), 'see that day');
      loadRecent();
    } catch (err) {
      if (window.console) console.error(err);
      await removeFiles(uploaded);   // don't leave orphan files behind
      status('Not saved: ' + explain(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  function explain(err) {
    var msg = (err && (err.message || err.error_description || err.error)) || String(err);
    if (/row-level security|violates|unauthorized|not allowed|403|PGRST116|0 rows/i.test(msg) || (err && err.code === 'PGRST116')) {
      return 'the database refused. Is this account added as the owner? (see README step 3)';
    }
    if (/JWT|expired/i.test(msg)) return 'your login expired. Refresh and log in again.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'no connection. Check your internet and try again.';
    return msg;
  }

  // ---------- new / edit / reset ----------

  function resetForm(keepTypeAndDate) {
    editing = null;
    keptMedia = [];
    removedMedia = [];
    keptVoice = null;
    var type = keepTypeAndDate ? $('f-type').value : 'thought';
    var date = keepTypeAndDate ? $('f-date').value : M.manilaDate();
    $('entry-form').reset();
    $('f-type').value = type;
    $('f-date').value = date;
    buildTypeFields(type);
    showExistingMedia();
    $('form-title').textContent = 'New entry';
    $('cancel-edit').hidden = true;
    setBusy(false);
  }

  function startEdit(entry) {
    resetForm(false);
    editing = entry;
    var d = entry.data || {};
    $('f-type').value = TYPES[entry.type] ? entry.type : 'thought';
    $('f-date').value = entry.entry_date;
    buildTypeFields($('f-type').value);

    TYPES[$('f-type').value].fields.forEach(function (field) {
      var input = $('d-' + field.name);
      var v = d[field.name];
      if (v === undefined || v === null) return;
      if (field.kind === 'checkbox') input.checked = Boolean(v);
      else if (field.kind === 'datetime') input.value = fromIso(v);
      else if (field.kind === 'lines') {
        input.value = (Array.isArray(v) ? v : []).map(function (s) {
          return typeof s === 'string' ? s : (s.url || s.title || '');
        }).join('\n');
      } else if (field.kind !== 'audio') input.value = v;
    });

    var media = entry.media || [];
    keptMedia = media.filter(function (m) { return !isWebLink(m); });
    $('f-youtube').value = media.filter(isWebLink).join('\n');
    keptVoice = d.voice_note || null;
    $('f-tags').value = (entry.tags || []).join(', ');
    $('f-private').checked = Boolean(entry.private);

    showExistingMedia();
    showExistingVoice();
    $('form-title').textContent = 'Editing: ' + entry.type + ' from ' + M.formatDate(entry.entry_date, { weekday: undefined, month: 'short' });
    $('cancel-edit').hidden = false;
    setBusy(false);
    clearStatus();
    $('form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- recent posts (edit / delete) ----------

  function summary(entry) {
    var d = entry.data || {};
    var text = d.text || d.title || d.topic || d.caption || d.mood || d.own_words || d.note || '';
    if (!text && entry.type === 'run' && d.distance_km) text = d.distance_km + ' km';
    if (!text && entry.type === 'body') text = [d.weight_kg && d.weight_kg + ' kg', d.height_cm && d.height_cm + ' cm'].filter(Boolean).join(', ');
    if (!text && entry.type === 'fasting') text = M.fastingWindow(d) || '';
    text = String(text).replace(/\s+/g, ' ');
    return text.length > 60 ? text.slice(0, 57) + '...' : text;
  }

  function loadRecent() {
    var box = $('recent');
    return M.db.from('entries').select('*').order('created_at', { ascending: false }).limit(20)
      .then(function (res) {
        if (res.error) throw res.error;
        box.textContent = '';
        if (!res.data.length) { box.appendChild(el('p', { class: 'note' }, ['nothing posted yet.'])); return; }
        var ul = el('ul', { class: 'recent' });
        res.data.forEach(function (entry) {
          var editBtn = el('button', { type: 'button', class: 'small' }, ['edit']);
          var delBtn = el('button', { type: 'button', class: 'small' }, ['delete']);
          editBtn.addEventListener('click', function () { startEdit(entry); });
          delBtn.addEventListener('click', function () { removeEntry(entry); });
          ul.appendChild(el('li', null, [
            el('a', { href: M.dayUrl(entry.entry_date) }, [M.formatDate(entry.entry_date, { weekday: undefined, month: 'short' })]),
            ' · ', el('b', null, [entry.type]),
            entry.private ? el('span', { class: 'note' }, [' (private)']) : null,
            summary(entry) ? ' · ' + summary(entry) : null,
            ' ', editBtn, ' ', delBtn
          ]));
        });
        box.appendChild(ul);
      })
      .catch(function (err) {
        box.textContent = '';
        box.appendChild(el('p', { class: 'note' }, ["couldn't load recent posts: " + explain(err)]));
      });
  }

  async function removeEntry(entry) {
    var when = M.formatDate(entry.entry_date, { weekday: undefined, month: 'short' });
    if (!window.confirm('Delete this ' + entry.type + ' from ' + when + '? This can\'t be undone.')) return;
    var res = await M.db.from('entries').delete().eq('id', entry.id).select();
    if (res.error || !res.data || !res.data.length) {
      status('Not deleted: ' + explain(res.error || 'the database refused'), 'error');
      return;
    }
    await removeFiles((entry.media || []).concat(entry.data && entry.data.voice_note ? [entry.data.voice_note] : []));
    if (editing && editing.id === entry.id) resetForm(true);
    status('Deleted.', 'ok');
    loadRecent();
  }

  // ---------- login ----------

  async function showForSession(session) {
    if (!session) {
      $('editor').hidden = true;
      $('login-box').hidden = false;
      return;
    }
    $('login-box').hidden = true;
    $('editor').hidden = false;
    $('who').textContent = session.user.email;

    var owner = await M.db.rpc('is_owner');
    if (owner.data === false) {
      status('You\'re logged in, but this account isn\'t marked as the owner yet, so saving will be refused. ' +
        'Run the site_owner line from the README (step 3) in the Supabase SQL editor.', 'error');
    }
    await loadRecent();

    // post.html?edit=123 opens that entry for editing
    var editId = new URLSearchParams(location.search).get('edit');
    if (editId) {
      var one = await M.db.from('entries').select('*').eq('id', editId).maybeSingle();
      if (one.data) startEdit(one.data);
    }
  }

  async function login(event) {
    event.preventDefault();
    clearStatus();
    var btn = $('login-button');
    btn.disabled = true;
    btn.textContent = 'logging in...';
    var res = await M.db.auth.signInWithPassword({
      email: $('login-email').value.trim(),
      password: $('login-password').value
    });
    btn.disabled = false;
    btn.textContent = 'log in';
    if (res.error) {
      status(/invalid/i.test(res.error.message) ? 'Wrong email or password.' : 'Login failed: ' + explain(res.error), 'error');
      return;
    }
    $('login-password').value = '';
    showForSession(res.data.session);
  }

  async function logout(event) {
    event.preventDefault();
    await M.db.auth.signOut();
    resetForm(false);
    status('Logged out.', 'ok');
    showForSession(null);
  }

  // ---------- start ----------

  document.addEventListener('DOMContentLoaded', function () {
    if (!M.db) {
      status(M.configured
        ? "Couldn't load the Supabase library. Check your internet connection and refresh."
        : 'Not connected to the database yet. Fill in js/config.js (see README).', 'error');
      return;
    }

    var select = $('f-type');
    Object.keys(TYPES).forEach(function (t) { select.appendChild(el('option', { value: t }, [t])); });
    select.addEventListener('change', function () { buildTypeFields(select.value); });
    resetForm(false);

    $('entry-form').addEventListener('submit', save);
    $('cancel-edit').addEventListener('click', function () { resetForm(false); clearStatus(); });
    $('login-form').addEventListener('submit', login);
    $('logout').addEventListener('click', logout);

    M.db.auth.getSession().then(function (res) { showForSession(res.data.session); });
  });
})();
