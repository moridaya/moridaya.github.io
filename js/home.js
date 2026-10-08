// Home page: fills the header, quote of the day, NOW box, On this day, and today's bento grid.
// Each part loads on its own, so one failing doesn't blank the whole page.
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var el = function () { return M.el.apply(null, arguments); };

  function $(id) { return document.getElementById(id); }

  // Supabase replies with {data, error}; turn an error into a thrown one.
  function rows(res) {
    if (res.error) throw res.error;
    return res.data || [];
  }

  function failed(node, what) {
    return function (err) {
      if (window.console) console.error(what, err);
      if (node) {
        node.textContent = '';
        node.appendChild(el('p', { class: 'note' }, ["couldn't load " + what + '.']));
      }
    };
  }

  // ---------- header: last updated ----------

  function loadLastUpdated() {
    var out = $('last-updated');
    return M.db.from('entries').select('created_at')
      .order('created_at', { ascending: false }).limit(1)
      .then(rows)
      .then(function (r) {
        out.textContent = r.length ? M.formatDateTime(r[0].created_at) + ' (Manila)' : 'no posts yet';
      })
      .catch(function () { out.textContent = '?'; });
  }

  // ---------- day counter + streak (both come from the list of dates) ----------

  function countStreak(daySet, today) {
    // Today counts if posted; if not yet, the streak is still alive from yesterday.
    var d = daySet[today] ? today : M.addDays(today, -1);
    var n = 0;
    while (daySet[d]) { n++; d = M.addDays(d, -1); }
    return n;
  }

  function loadDates(today) {
    return M.db.rpc('entry_dates').then(rows).then(function (dates) {
      var daySet = {};
      dates.forEach(function (r) { daySet[r.day] = true; });
      if (dates.length) {
        var first = dates[dates.length - 1].day;   // list is newest first
        var dayNo = Math.max(1, M.daysBetween(first, today) + 1);
        var padded = String(dayNo);
        while (padded.length < 4) padded = '0' + padded;
        $('day-counter').textContent = 'DAY ' + padded;
      }
      return { streak: countStreak(daySet, today) };
    }).catch(function (err) {
      if (window.console) console.error('dates', err);
      return { streak: 0 };
    });
  }

  // ---------- quote of the day ----------

  function loadQuote(today) {
    return M.db.from('entries').select('id, data').eq('type', 'quote').order('id')
      .then(rows)
      .then(function (quotes) {
        quotes = quotes.filter(function (q) { return q.data && q.data.text; });
        if (!quotes.length) return;
        // Same quote all day, a different one tomorrow.
        var q = quotes[M.dayNumber(today) % quotes.length].data;
        var box = $('qotd');
        box.querySelector('blockquote').textContent = '“' + q.text + '”';
        box.querySelector('.source').textContent = q.source ? '— ' + q.source : '';
        box.hidden = false;
      })
      .catch(function (err) { if (window.console) console.error('quote', err); });
  }

  // ---------- NOW box ----------

  function latest(type, limit) {
    return M.db.from('entries').select('data, created_at').eq('type', type)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false })
      .limit(limit || 1)
      .then(rows);
  }

  function firstWith(list, field) {
    for (var i = 0; i < list.length; i++) {
      var v = list[i].data && list[i].data[field];
      if (v !== null && v !== undefined && v !== '') return list[i].data;
    }
    return null;
  }

  function loadNow(datesPromise) {
    var box = $('now');
    var tbody = box.querySelector('tbody');

    return Promise.all([
      latest('reading'), latest('body', 30), latest('fasting'),
      latest('learned'), latest('goal', 30), datesPromise
    ]).then(function (r) {
      var reading = r[0][0] && r[0][0].data;
      var weight = firstWith(r[1], 'weight_kg');
      var height = firstWith(r[1], 'height_cm');
      var fast = r[2][0] && r[2][0].data;
      var learned = r[3][0] && r[3][0].data;
      var goal = null;
      for (var i = 0; i < r[4].length; i++) {
        var g = r[4][i].data || {};
        if (g.text && !g.done) { goal = g; break; }
      }
      var streak = r[5].streak;

      var list = [];
      if (reading && reading.title) {
        list.push(['reading', [el('i', null, [reading.title]), reading.author ? ' by ' + reading.author : null]]);
      }
      if (weight) list.push(['weight', [weight.weight_kg + ' kg']]);
      if (height) list.push(['height', [height.height_cm + ' cm']]);
      var win = fast && M.fastingWindow(fast);
      if (win) list.push(['fasting', [win]]);
      if (learned && learned.topic) list.push(['learning', [M.link(learned.wikipedia_url, learned.topic) || learned.topic]]);
      if (goal) list.push(['goal', [goal.text]]);
      if (streak > 0) list.push(['streak', [streak + (streak === 1 ? ' day' : ' days')]]);

      // Rows with no data are simply never added. No rows at all: hide the box.
      list.forEach(function (row) {
        tbody.appendChild(el('tr', null, [el('th', null, [row[0]]), el('td', null, row[1])]));
      });
      box.hidden = list.length === 0;
    }).catch(function (err) { if (window.console) console.error('NOW', err); });
  }

  // ---------- On this day ----------

  function loadOnThisDay(today) {
    var out = $('otd-list');
    return M.db.rpc('on_this_day', { d: today }).then(rows).then(function (entries) {
      out.textContent = '';
      if (!entries.length) {
        out.appendChild(el('p', { class: 'note' }, ['nothing from this date in past years yet.']));
        return;
      }
      // Group by date: one line per past year.
      var byDate = {}, order = [];
      entries.forEach(function (e) {
        if (!byDate[e.entry_date]) { byDate[e.entry_date] = []; order.push(e.entry_date); }
        byDate[e.entry_date].push(e.type);
      });
      var thisYear = Number(today.slice(0, 4));
      var ul = el('ul');
      order.forEach(function (date) {
        var ago = thisYear - Number(date.slice(0, 4));
        var types = byDate[date].filter(function (t, i, a) { return a.indexOf(t) === i; });
        ul.appendChild(el('li', null, [
          el('a', { href: M.dayUrl(date) }, [date.slice(0, 4)]),
          ' (' + ago + (ago === 1 ? ' year' : ' years') + ' ago)',
          el('div', { class: 'note' }, [types.join(', ')])
        ]));
      });
      out.appendChild(ul);
    }).catch(failed(out, 'past years'));
  }

  // ---------- today's entries (bento grid) ----------

  function loadTimeline(today) {
    var out = $('bento');
    return M.db.from('entries').select('*').eq('entry_date', today)
      .order('created_at', { ascending: false })
      .then(rows)
      .then(function (entries) {
        // The whole day as a bento grid that fits in one screen (3 rows).
        M.renderBento(out, entries, {
          maxRows: 3,
          moreHref: M.dayUrl(today),
          dayHref: function (e) { return M.dayUrl(e.entry_date); },
          emptyText: 'Nothing yet today. A new page, waiting.'
        });
      })
      .catch(failed(out, "today's entries"));
  }

  // ---------- start ----------

  document.addEventListener('DOMContentLoaded', function () {
    // "Today" is always Manila's date, whatever timezone the visitor's device is in.
    var today = M.manilaDate();
    $('today-label').textContent = M.formatDate(today);
    M.reloadAtMidnight(today);

    if (!M.db) {
      var notice = $('notice');
      notice.textContent = M.configured
        ? "Couldn't load the Supabase library. Check your internet connection and refresh."
        : 'Not connected to the database yet. Fill in js/config.js (see README).';
      notice.hidden = false;
      $('last-updated').textContent = '-';
      $('bento').textContent = '';
      $('otd-list').textContent = '';
      return;
    }

    var dates = loadDates(today);
    loadLastUpdated();
    loadQuote(today);
    loadNow(dates);
    loadOnThisDay(today);
    loadTimeline(today);
  });
})();
