// Favorites page, owner only: manage all-time favorites right where they're shown.
// Favorites aren't daily posts, so this lives here, not on the posting page.
// - "set favorite" makes something the new favorite in a category; the database
//   (set_favorite in sql/004_favorites.sql) moves the old one into history.
// - categories can be added, renamed and deleted; favorites added by mistake can be deleted.
// The box only appears when this browser is logged in as the owner; the database rules
// decide what's allowed either way.
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var el = function () { return M.el.apply(null, arguments); };
  function $(id) { return document.getElementById(id); }
  function short(d) { return M.formatDate(d, { weekday: undefined, month: 'short' }); }
  var wired = false;
  var data = { cats: [], favs: [] };

  function db() { return M.authClient(); }

  // ---- small helpers (status line, uploads) ----

  function status(message, kind) {
    var box = $('fav-status');
    box.textContent = message;
    box.className = 'notice' + (kind ? ' ' + kind : '');
    box.hidden = false;
  }
  function clearStatus() { $('fav-status').hidden = true; }

  function explain(err) {
    var msg = (err && (err.message || err.error_description || err.msg)) || '';
    if (/row-level security|permission|not allowed|403/i.test(msg)) return 'the database refused. Are you logged in as the owner (with your 2-step code)?';
    if (/check constraint|too long/i.test(msg)) return 'something is missing or too long.';
    if (/Failed to fetch|NetworkError|timed out/i.test(msg)) return 'no connection. Try again.';
    return msg || 'something went wrong';
  }

  function storagePath(date, ext) {
    var bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    var name = Array.prototype.map.call(bytes, function (b) { return (b % 36).toString(36); }).join('');
    return date.replace(/-/g, '/') + '/' + name + '.' + ext;
  }

  function upload(blob, path) {
    return db().storage.from(M.MEDIA_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
      .then(function (res) { if (res.error) throw res.error; return path; });
  }

  function removeFiles(paths) {
    paths = paths.filter(Boolean);
    if (!paths.length) return Promise.resolve();
    return db().storage.from(M.MEDIA_BUCKET).remove(paths).then(function () {}, function () {});
  }

  // After any change, redraw the public list above too.
  function changed() { reload(); if (M.refreshFavorites) M.refreshFavorites(); }

  function small(label, onClick) {
    var b = el('button', { type: 'button', class: 'small' }, [label]);
    b.addEventListener('click', onClick);
    return b;
  }

  async function reload() {
    var list = $('fav-list');
    try {
      var c = db();
      var r = await M.withTimeout(Promise.all([
        c.from('favorite_categories').select('id, name, position').order('position').order('id'),
        c.from('favorites').select('id, category_id, name, why, photo, since, until').order('since', { ascending: false }).order('id', { ascending: false })
      ]), 15000, 'favorites');
      data = { cats: M.rows(r[0]), favs: M.rows(r[1]) };
    } catch (err) {
      list.textContent = '';
      list.appendChild(el('p', { class: 'note' }, ["Couldn't load favorites. If you haven't yet, run sql/004_favorites.sql in Supabase."]));
      return;
    }
    var select = $('fav-cat'), keep = select.value;
    select.textContent = '';
    data.cats.forEach(function (cat) { select.appendChild(el('option', { value: String(cat.id) }, [cat.name])); });
    if (keep) select.value = keep;

    list.textContent = '';
    if (!data.cats.length) { list.appendChild(el('p', { class: 'note' }, ['No categories yet. Add one below.'])); return; }
    var ul = el('ul', { class: 'recent' });
    data.cats.forEach(function (cat) {
      var mine = data.favs.filter(function (f) { return f.category_id === cat.id; });
      var li = el('li', null, [
        el('b', null, [cat.name]), ' ',
        small('rename', function () { renameCategory(cat); }), ' ',
        small('delete', function () { deleteCategory(cat, mine.length); })
      ]);
      mine.forEach(function (f) {
        li.appendChild(el('div', { class: 'note' }, [
          f.until ? 'previously: ' : 'now: ', f.name,
          ' (' + short(f.since) + (f.until ? ' to ' + short(f.until) : ' onward') + ') ',
          small('delete', function () { deleteFavorite(f); })
        ]));
      });
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }

  async function setFavorite(event) {
    event.preventDefault();
    clearStatus();
    var cat = Number($('fav-cat').value);
    var name = $('fav-name').value.trim();
    var why = $('fav-why').value.trim();
    var since = $('fav-since').value || M.manilaDate();
    var file = $('fav-photo').files && $('fav-photo').files[0];
    if (!cat) { status('Pick a category first.', 'error'); return; }
    if (!name) { status('Type the new favorite.', 'error'); return; }
    var btn = $('fav-save');
    btn.disabled = true;
    var uploaded = null;
    try {
      if (file) {
        btn.textContent = 'photo...';
        var blob = await M.compressImage(file, { maxSide: 600, targetBytes: 120 * 1024 });
        uploaded = await upload(blob, storagePath(since, 'jpg'));
      }
      btn.textContent = 'saving...';
      var res = await M.withTimeout(db().rpc('set_favorite', {
        p_category: cat, p_name: name, p_why: why || null, p_photo: uploaded, p_since: since
      }), 15000, 'saving');
      if (res.error) throw res.error;
      $('fav-name').value = ''; $('fav-why').value = ''; $('fav-photo').value = '';
      status('Favorite saved.', 'ok');
      changed();
    } catch (err) {
      if (uploaded) await removeFiles([uploaded]);
      status('Not saved: ' + explain(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'set favorite';
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    var name = $('fav-new-cat').value.trim();
    if (!name) return;
    var pos = data.cats.reduce(function (m, c) { return Math.max(m, c.position || 0); }, 0) + 1;
    var res = await M.withTimeout(db().from('favorite_categories').insert({ name: name, position: pos }), 15000, 'saving')
      .catch(function (e) { return { error: e }; });
    if (res.error) {
      status(/duplicate/i.test(res.error.message || '') ? 'That category already exists.' : 'Not added: ' + explain(res.error), 'error');
      return;
    }
    $('fav-new-cat').value = '';
    status('Category added.', 'ok');
    changed();
  }

  async function renameCategory(cat) {
    var name = window.prompt('New name for "' + cat.name + '":', cat.name);
    if (name === null || !name.trim() || name.trim() === cat.name) return;
    var res = await M.withTimeout(db().from('favorite_categories').update({ name: name.trim() }).eq('id', cat.id), 15000, 'saving')
      .catch(function (e) { return { error: e }; });
    if (res.error) { status('Not renamed: ' + explain(res.error), 'error'); return; }
    changed();
  }

  async function deleteCategory(cat, count) {
    var msg = 'Delete the category "' + cat.name + '"' + (count ? ' and its ' + count + ' favorite(s), including history' : '') + "? This can't be undone.";
    if (!window.confirm(msg)) return;
    var photos = data.favs.filter(function (f) { return f.category_id === cat.id && f.photo; }).map(function (f) { return f.photo; });
    var res = await M.withTimeout(db().from('favorite_categories').delete().eq('id', cat.id), 15000, 'deleting')
      .catch(function (e) { return { error: e }; });
    if (res.error) { status('Not deleted: ' + explain(res.error), 'error'); return; }
    await removeFiles(photos);
    changed();
  }

  async function deleteFavorite(f) {
    if (!window.confirm('Delete "' + f.name + '" from your favorites history? (For mistakes; changing your favorite keeps history by itself.)')) return;
    var res = await M.withTimeout(db().from('favorites').delete().eq('id', f.id), 15000, 'deleting')
      .catch(function (e) { return { error: e }; });
    if (res.error) { status('Not deleted: ' + explain(res.error), 'error'); return; }
    if (f.photo) await removeFiles([f.photo]);
    changed();
  }

  // Show the box only for the owner. A visitor never gets past hasStoredSession().
  document.addEventListener('DOMContentLoaded', function () {
    if (!$('fav-manager') || !M.db || !M.hasStoredSession()) return;
    M.withTimeout(db().rpc('is_owner'), 15000, 'login check').then(function (res) {
      if (!res || res.data !== true) return;
      $('fav-manager').hidden = false;
      if (!wired) {
        wired = true;
        $('fav-form').addEventListener('submit', setFavorite);
        $('fav-cat-form').addEventListener('submit', addCategory);
      }
      if (!$('fav-since').value) $('fav-since').value = M.manilaDate();
      reload();
    }).catch(function () { /* not logged in or offline: just the public page */ });
  });
})();
