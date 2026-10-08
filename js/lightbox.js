// Image viewer: clicking a photo shows it big over the page instead of leaving the page.
// Close it by clicking outside the photo, the [x] button, Esc, or the phone/browser back button.
(function () {
  var box, img, closeBtn, lastFocus, pushed = false;

  function build() {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'photo');

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox-close';
    closeBtn.textContent = '[x] close';

    img = document.createElement('img');
    img.alt = '';

    box.appendChild(closeBtn);
    box.appendChild(img);
    document.body.appendChild(box);

    // Clicking the dark area (anything but the photo itself) closes.
    box.addEventListener('click', function (e) { if (e.target !== img) close(); });
  }

  function open(url) {
    if (!box) build();
    lastFocus = document.activeElement;
    img.src = url;
    box.hidden = false;
    document.documentElement.classList.add('lightbox-open');
    closeBtn.focus();
    // An extra history step, so the back button closes the photo instead of leaving the page.
    try { history.pushState({ lightbox: true }, ''); pushed = true; } catch (e) { pushed = false; }
  }

  function hide() {
    if (!box || box.hidden) return;
    box.hidden = true;
    img.removeAttribute('src');
    document.documentElement.classList.remove('lightbox-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function close() {
    if (!box || box.hidden) return;
    if (pushed) { pushed = false; history.back(); }   // popstate below does the hiding
    else hide();
  }

  window.addEventListener('popstate', function () { pushed = false; hide(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  document.addEventListener('click', function (e) {
    // Normal click only; ctrl/cmd/middle click still opens the photo in a new tab.
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest && e.target.closest('a.zoom');
    if (!link) return;
    e.preventDefault();
    open(link.href);
  });
})();
