// Shrinks a photo in the browser before upload, so phone photos (often 3-8 MB) end up
// around 200-300 KB. Output is always JPEG. Re-drawing the image also drops the hidden
// EXIF data phones attach, including GPS location.
(function () {
  var M = window.Moriyada = window.Moriyada || {};

  var TARGET_BYTES = 300 * 1024;
  var MAX_SIDE = 1600;     // longest side in pixels; plenty for a diary column
  var MIN_SIDE = 480;

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("couldn't read " + file.name + ' (try a JPEG or PNG)'));
      };
      img.src = url;
    });
  }

  function toJpeg(img, side, quality) {
    var scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';   // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error('compression failed'));
      }, 'image/jpeg', quality);
    });
  }

  // File -> Promise<Blob> (JPEG, about TARGET_BYTES or less).
  // opts can lower the limits, e.g. {maxSide: 600, targetBytes: 120 * 1024} for a song cover.
  M.compressImage = function (file, opts) {
    opts = opts || {};
    var target = opts.targetBytes || TARGET_BYTES;
    return loadImage(file).then(function (img) {
      var side = opts.maxSide || MAX_SIDE, quality = 0.85;
      function attempt() {
        return toJpeg(img, side, quality).then(function (blob) {
          if (blob.size <= target) return blob;
          // Too big: lower the quality a bit first, then shrink the size.
          if (quality > 0.6) quality -= 0.1;
          else if (side > MIN_SIDE) { side = Math.round(side * 0.8); quality = 0.8; }
          else return blob;   // good enough; tiny images that are still big are rare
          return attempt();
        });
      }
      return attempt();
    });
  };
})();
