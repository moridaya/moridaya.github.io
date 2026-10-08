// Supabase connection plus small date helpers shared by every page.
// Everything hangs off one global, window.Moridaya, to keep names from clashing.
(function () {
  var M = window.Moridaya = window.Moridaya || {};
  var cfg = window.MORIDAYA_CONFIG || {};

  M.configured = Boolean(
    cfg.supabaseUrl && cfg.supabaseAnonKey &&
    cfg.supabaseUrl.indexOf('YOUR-') === -1 && cfg.supabaseAnonKey.indexOf('YOUR-') === -1
  );
  M.db = (M.configured && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  M.TZ = 'Asia/Manila';
  M.MEDIA_BUCKET = 'media';

  // Today's date in Manila as 'YYYY-MM-DD', whatever timezone the visitor is in.
  M.manilaDate = function (when) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: M.TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(when || new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + '-' + parts.month + '-' + parts.day;
  };

  // Milliseconds until the next 12:00 AM in Manila. The Philippines is always UTC+8
  // (no daylight saving), so this is plain arithmetic.
  M.msUntilManilaMidnight = function (now) {
    var DAY = 86400000, OFFSET = 8 * 3600000;
    var t = (now === undefined ? Date.now() : now) + OFFSET;
    return DAY - (t % DAY);
  };

  // Pages that show "today" call this: once Manila's date moves past `day`, the page
  // reloads itself onto the new day. Timers can be late (sleeping laptop, background tab),
  // so it also re-checks every 20 seconds and whenever the tab is looked at again.
  M.reloadAtMidnight = function (day) {
    function check() {
      if (M.manilaDate() !== day) location.reload();
    }
    setTimeout(check, M.msUntilManilaMidnight() + 1000);
    setInterval(check, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    window.addEventListener('focus', check);
  };

  // 'YYYY-MM-DD' <-> whole-day arithmetic. Done in UTC so daylight saving never shifts a day.
  function dayNumber(dateStr) { return Math.round(Date.parse(dateStr + 'T00:00:00Z') / 86400000); }
  M.dayNumber = dayNumber;
  M.daysBetween = function (from, to) { return dayNumber(to) - dayNumber(from); };
  M.addDays = function (dateStr, n) {
    return new Date((dayNumber(dateStr) + n) * 86400000).toISOString().slice(0, 10);
  };

  // 'YYYY-MM-DD' -> 'Thursday, October 8, 2026'
  M.formatDate = function (dateStr, opts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return '';
    return new Intl.DateTimeFormat('en-US', Object.assign({
      timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }, opts || {})).format(new Date(dateStr + 'T00:00:00Z'));
  };

  // timestamp -> '9:14 PM' in Manila
  M.formatTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: M.TZ, hour: 'numeric', minute: '2-digit' }).format(d);
  };

  // timestamp -> 'Oct 8, 2026, 9:14 PM' in Manila
  M.formatDateTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: M.TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(d);
  };

  // Storage path -> public link to the file.
  M.mediaUrl = function (path) {
    if (!M.db) return '';
    return M.db.storage.from(M.MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  // Relative path back to the site root ('' on the home page, '../' inside /html/).
  M.root = function () { return document.body.getAttribute('data-root') || ''; };

  M.dayUrl = function (dateStr) { return M.root() + 'html/day.html?date=' + dateStr; };
  M.tagUrl = function (tag) { return M.root() + 'html/hobbies.html?tag=' + encodeURIComponent(tag); };
})();
