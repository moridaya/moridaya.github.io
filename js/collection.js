// A tab with its own things (books, quotes, goals, hobbies): the public list, plus a
// "Manage ..." box that only appears for the logged-in owner, with a form made for that
// kind of thing (add / edit) and a list to edit or delete from.
// These are NOT daily posts: they live in their own tables (sql/005_tabs.sql) and never
// show in the daily feed. The database rules decide who may write; this is just the UI.
//
// M.collection({
//   table, select, order(q) -> q, noun ('book'), cacheKey,
//   fields: [{ name, label, kind: text|textarea|date|select|photo|lines, required, max,
//              options: [[value, label]], rows, today: true (date defaults to today) }],
//   photo: { field, maxSide, targetBytes },          // optional
//   toRow(values, editing) -> changes                // optional: form values -> table row
//   fromRow(row) -> values                           // optional: table row -> form values
//   validate(values) -> error text or null           // optional
//   summary(row) -> short text for the manage list
//   render(out, rows, ctx)                           // ctx: { owner, edit(row), save(row, changes) }
//   empty: 'No books yet.'
// })
(function () {
  var M = window.Moriyada = window.Moriyada || {};
  var el = function () { return M.el.apply(null, arguments); };
  function $(id) { return document.getElementById(id); }

  function explain(err) {
    var msg = (err && (err.message || err.error_description || err.msg)) || '';
    if (/row-level security|permission|not allowed|403/i.test(msg)) return 'the database refused. Are you logged in as the owner (with your 2-step code)?';
    if (/check constraint|too long|violates/i.test(msg)) return 'something is missing, too long, or not allowed.';
    if (/does not exist|relation|schema cache/i.test(msg)) return "this tab's table isn't set up yet: run sql/005_tabs.sql in Supabase.";
    if (/Failed to fetch|NetworkError|timed out/i.test(msg)) return 'no connection. Try again.';
    return msg || 'something went wrong';
  }

  function storagePath(ext) {
    var bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    var name = Array.prototype.map.call(bytes, function (b) { return (b % 36).toString(36); }).join('');
    return M.manilaDate().replace(/-/g, '/') + '/' + name + '.' + ext;
  }

  M.collection = function (cfg) {
    var out, box, form, list, statusBox, titleEl, saveBtn, cancelBtn;
    var rows = [], editing = null, isOwner = false, removePhoto = false;
    var db = function () { return M.authClient(); };

    function fetchRows(c) { return cfg.order(c.from(cfg.table).select(cfg.select)).then(M.rows); }

    function draw() {
      out.textContent = '';
      if (!rows.length) { out.appendChild(el('p', { class: 'empty' }, [cfg.empty])); return; }
      cfg.render(out, rows, {
        owner: isOwner,
        edit: function (row) { startEdit(row); },
        save: function (row, changes) { return update(row, changes, true); }
      });
    }

    function load() {
      M.layered(fetchRows, function (r) { rows = r || []; draw(); if (isOwner) drawList(); }, function () {
        out.textContent = '';
        out.appendChild(el('p', { class: 'note' }, ["Couldn't load this page. Check your connection and refresh."]));
      }, cfg.cacheKey);
    }

    function refresh() {   // after a change: straight from the database, owner's view
      return M.withTimeout(fetchRows(M.ownerClient() || M.db), 15000, 'refresh').then(function (r) {
        rows = r || []; M.cache.set(cfg.cacheKey, rows); draw(); drawList();
      }).catch(function () {});
    }

    // ---- status line ----
    function status(msg, kind) { statusBox.textContent = msg; statusBox.className = 'notice' + (kind ? ' ' + kind : ''); statusBox.hidden = false; }
    function clearStatus() { statusBox.hidden = true; }

    // ---- the form ----
    function inputFor(f) {
      var id = 'c-' + f.name, input;
      if (f.kind === 'textarea' || f.kind === 'lines') input = el('textarea', { id: id, rows: f.rows || 4, maxlength: f.max || null });
      else if (f.kind === 'select') input = el('select', { id: id }, f.options.map(function (o) { return el('option', { value: o[0] }, [o[1]]); }));
      else if (f.kind === 'date') input = el('input', { id: id, type: 'date' });
      else if (f.kind === 'photo') input = el('input', { id: id, type: 'file', accept: 'image/*' });
      else input = el('input', { id: id, type: 'text', maxlength: f.max || null, autocomplete: 'off' });
      return el('div', { class: 'field', id: 'cf-' + f.name }, [
        el('label', { for: id }, [f.label]), input,
        f.kind === 'photo' ? el('div', { id: 'c-photo-now', class: 'existing', hidden: true }) : null
      ]);
    }

    function values() {
      var v = {};
      cfg.fields.forEach(function (f) {
        if (f.kind === 'photo') return;
        var raw = $('c-' + f.name).value;
        v[f.name] = typeof raw === 'string' ? raw.trim() : raw;
      });
      return v;
    }

    function resetForm() {
      editing = null; removePhoto = false;
      form.reset();
      cfg.fields.forEach(function (f) { if (f.kind === 'date' && f.today) $('c-' + f.name).value = M.manilaDate(); });
      titleEl.textContent = 'Add a ' + cfg.noun;
      saveBtn.textContent = 'add ' + cfg.noun;
      cancelBtn.hidden = true;
      var now = $('c-photo-now'); if (now) now.hidden = true;
      if (cfg.onFormChange) cfg.onFormChange(values());
    }

    function startEdit(row) {
      if (!isOwner) return;
      editing = row; removePhoto = false;
      clearStatus();
      var v = cfg.fromRow ? cfg.fromRow(row) : row;
      cfg.fields.forEach(function (f) {
        if (f.kind === 'photo') return;
        var x = v[f.name];
        $('c-' + f.name).value = x === null || x === undefined ? '' : x;
      });
      var now = $('c-photo-now');
      if (now && cfg.photo) {
        now.textContent = '';
        var path = row[cfg.photo.field];
        now.hidden = !path;
        if (path) {
          var rm = el('button', { type: 'button', class: 'small' }, ['remove']);
          rm.addEventListener('click', function () { removePhoto = true; now.hidden = true; });
          now.appendChild(el('img', { class: 'thumb', src: M.mediaUrl(path), alt: 'current photo' }));
          now.appendChild(document.createTextNode(' current photo (choosing a new one replaces it) '));
          now.appendChild(rm);
        }
      }
      titleEl.textContent = 'Edit: ' + cfg.summary(row);
      saveBtn.textContent = 'save changes';
      cancelBtn.hidden = false;
      if (cfg.onFormChange) cfg.onFormChange(values());
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function update(row, changes, quiet) {
      var res = await M.withTimeout(db().from(cfg.table).update(changes).eq('id', row.id).select('id'), 15000, 'saving');
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw new Error('row-level security: nothing was changed');
      if (!quiet) status('Saved.', 'ok');
      await refresh();
    }

    async function submit(e) {
      e.preventDefault();
      clearStatus();
      var v = values();
      var missing = cfg.fields.filter(function (f) { return f.required && !v[f.name]; })[0];
      if (missing) { status('Fill in "' + missing.label + '".', 'error'); return; }
      var problem = cfg.validate ? cfg.validate(v) : null;
      if (problem) { status(problem, 'error'); return; }
      var file = cfg.photo && $('c-' + cfg.photo.field).files && $('c-' + cfg.photo.field).files[0];
      saveBtn.disabled = true;
      var uploaded = null;
      try {
        var row = cfg.toRow ? cfg.toRow(v, editing) : v;
        Object.keys(row).forEach(function (k) { if (row[k] === '') row[k] = null; });
        if (file) {
          saveBtn.textContent = 'photo...';
          var blob = await M.compressImage(file, { maxSide: cfg.photo.maxSide || 800, targetBytes: cfg.photo.targetBytes || 150 * 1024 });
          var path = storagePath('jpg');
          var up = await db().storage.from(M.MEDIA_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
          if (up.error) throw up.error;
          uploaded = path;
          row[cfg.photo.field] = uploaded;
        } else if (editing && removePhoto) {
          row[cfg.photo.field] = null;
        }
        saveBtn.textContent = 'saving...';
        var oldPhoto = editing && cfg.photo ? editing[cfg.photo.field] : null;
        if (editing) {
          await update(editing, row, true);
        } else {
          var res = await M.withTimeout(db().from(cfg.table).insert(row), 15000, 'saving');
          if (res.error) throw res.error;
          await refresh();
        }
        if (oldPhoto && (uploaded || removePhoto)) db().storage.from(M.MEDIA_BUCKET).remove([oldPhoto]).then(function () {}, function () {});
        var was = editing;
        resetForm();
        status(was ? 'Saved.' : 'Added.', 'ok');
      } catch (err) {
        if (uploaded) db().storage.from(M.MEDIA_BUCKET).remove([uploaded]).then(function () {}, function () {});
        status('Not saved: ' + explain(err), 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editing ? 'save changes' : 'add ' + cfg.noun;
      }
    }

    async function remove(row) {
      if (!window.confirm('Delete "' + cfg.summary(row) + '"? This can\'t be undone.')) return;
      try {
        var res = await M.withTimeout(db().from(cfg.table).delete().eq('id', row.id).select('id'), 15000, 'deleting');
        if (res.error) throw res.error;
        var photo = cfg.photo && row[cfg.photo.field];
        if (photo) db().storage.from(M.MEDIA_BUCKET).remove([photo]).then(function () {}, function () {});
        if (editing && editing.id === row.id) resetForm();
        status('Deleted.', 'ok');
        refresh();
      } catch (err) { status('Not deleted: ' + explain(err), 'error'); }
    }

    function drawList() {
      if (!list) return;
      list.textContent = '';
      if (!rows.length) { list.appendChild(el('p', { class: 'note' }, ['Nothing here yet.'])); return; }
      var ul = el('ul', { class: 'recent' });
      rows.forEach(function (row) {
        var edit = el('button', { type: 'button', class: 'small' }, ['edit']);
        var del = el('button', { type: 'button', class: 'small' }, ['delete']);
        edit.addEventListener('click', function () { startEdit(row); });
        del.addEventListener('click', function () { remove(row); });
        ul.appendChild(el('li', null, [cfg.summary(row), ' ', edit, ' ', del]));
      });
      list.appendChild(ul);
    }

    function buildManager() {
      statusBox = el('div', { class: 'notice', role: 'status', 'aria-live': 'polite', hidden: true });
      titleEl = el('h3', { class: 'fav-form-title' });
      saveBtn = el('button', { type: 'submit' });
      cancelBtn = el('button', { type: 'button', hidden: true }, ['cancel edit']);
      form = el('form', { class: 'form' }, [titleEl].concat(cfg.fields.map(inputFor), [el('p', null, [saveBtn, ' ', cancelBtn])]));
      list = el('div');
      box = el('section', { class: 'box manager', id: 'manager' }, [
        el('h2', null, ['Manage ' + cfg.noun + 's']),
        el('p', { class: 'note' }, ['Only you see this box. These are separate from daily posts and never show up in the daily feed.']),
        statusBox, form, el('h3', { class: 'fav-form-title' }, ['All ' + cfg.noun + 's']), list
      ]);
      out.parentNode.insertBefore(box, out.nextSibling);
      form.addEventListener('submit', submit);
      cancelBtn.addEventListener('click', function () { resetForm(); clearStatus(); });
      if (cfg.onFormChange) form.addEventListener('input', function () { cfg.onFormChange(values()); });
      resetForm();
      drawList();
    }

    document.addEventListener('DOMContentLoaded', function () {
      out = $('content');
      if (!out) return;
      if (!M.db) { out.textContent = 'Not connected to the database yet.'; return; }
      load();
      if (!M.hasStoredSession()) return;
      M.withTimeout(db().rpc('is_owner'), 15000, 'login check').then(function (res) {
        if (!res || res.data !== true) return;
        isOwner = true;
        buildManager();
        refresh();
      }).catch(function () { /* not logged in or offline: just the public page */ });
    });
  };

  M.shortDate = function (d) { return d ? M.formatDate(d, { weekday: undefined, month: 'short' }) : ''; };
})();
