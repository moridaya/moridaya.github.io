// Day page: day.html?date=YYYY-MM-DD shows that day's entries the same way the home page
// does. One page serves every date, so new days work automatically.
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var el = function () { return M.el.apply(null, arguments); };
  function $(id) { return document.getElementById(id); }

  // '2026-10-08' -> true; '2026-02-30', 'hello', '2026-1-8' -> false
  function isRealDate(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && M.addDays(s, 0) === s;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function fact(label, value) {
    var box = $('day-facts');
    if (box.childNodes.length) box.appendChild(document.createTextNode(' \u00B7 '));
    box.appendChild(el('span', { class: 'fact' }, [el('span', { class: 'note' }, [label + ' ']), value]));
  }

  function message(text) {
    var out = $('bento');
    out.textContent = '';
    out.appendChild(el('p', { class: 'empty' }, [text]));
  }

  function navLink(date, label) {
    return date ? el('a', { href: M.dayUrl(date) }, [label]) : el('span', { class: 'note' }, [label]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var date = new URLSearchParams(location.search).get('date') || '';
    var today = M.manilaDate();

    if (!isRealDate(date)) {
      $('day-title').textContent = 'no such day';
      $('day-box').hidden = true;
      message("That page doesn't exist. Pick a day from the archive.");
      return;
    }

    var nice = M.formatDate(date);
    document.title = nice + ' - Moridaya';
    $('day-title').textContent = nice;
    $('day-heading').textContent = date === today ? 'Today' : M.formatDate(date, { weekday: undefined, month: 'short' });

    if (date > today) {
      $('day-box').hidden = true;
      message("This page hasn't been written yet.");
      return;
    }
    if (!M.db) { message('Not connected to the database yet.'); return; }

    // Chapter number and previous/next day, from the list of dates with entries.
    var datesP = M.db.rpc('entry_dates').then(function (res) {
      if (res.error) throw res.error;
      var days = (res.data || []).map(function (r) { return r.day; }).filter(isRealDate);   // newest first
      if (days.length) {
        var first = days[days.length - 1];
        if (date >= first) fact('chapter', pad(M.daysBetween(first, date) + 1, 4));
      }
      var older = days.filter(function (d) { return d < date; })[0] || null;
      var newer = days.filter(function (d) { return d > date; }).pop() || null;
      var nav = $('day-nav');
      nav.textContent = '';
      nav.appendChild(navLink(older, '« previous day'));
      nav.appendChild(document.createTextNode(' · '));
      nav.appendChild(el('a', { href: M.root() + 'html/archive.html' }, ['archive']));
      nav.appendChild(document.createTextNode(' · '));
      nav.appendChild(navLink(newer, 'next day »'));
    }).catch(function (err) { if (window.console) console.error('dates', err); });

    // Weather saved for that day, if any.
    var weatherP = M.db.from('day_weather').select('summary, temp_c').eq('weather_date', date).maybeSingle()
      .then(function (res) {
        var w = res.data;
        if (w && (w.summary || w.temp_c !== null)) {
          return 'Manila: ' + (w.temp_c !== null && w.temp_c !== undefined ? Math.round(w.temp_c) + '°C' : '') +
            (w.summary ? (w.temp_c !== null && w.temp_c !== undefined ? ', ' : '') + w.summary : '');
        }
        return null;
      }).catch(function () { return null; });

    var entriesP = M.db.from('entries').select('*').eq('entry_date', date)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });

    Promise.all([datesP, weatherP, entriesP]).then(function (r) {
      var weather = r[1], entries = r[2];
      if (weather) fact('weather', weather);
      fact('entries', String(entries.length));
      // Same bento grid as the home page, but with every entry and tiles that grow to fit.
      M.renderBento($('bento'), entries, {
        emptyText: date === today ? 'Nothing yet today. A new page, waiting.' : 'Nothing was written on this day.'
      });
      if (location.hash) {
        var target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView({ block: 'center' });
      }
    }).catch(function (err) {
      if (window.console) console.error('day', err);
      message("Couldn't load this day. Try refreshing.");
    });
  });
})();
