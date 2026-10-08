// Manila weather from Open-Meteo (free, no key). Shows the current weather in the header.
(function () {
  var M = window.Moridaya = window.Moridaya || {};

  M.WEATHER_URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=14.5995&longitude=120.9842&timezone=Asia%2FManila' +
    '&current=temperature_2m,relative_humidity_2m,weather_code';

  // Open-Meteo sends a number code; these are the words for it.
  var CODES = {
    0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'light showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail'
  };
  M.weatherText = function (code) { return CODES[code] || 'unknown weather'; };

  // Resolves to the raw Open-Meteo reply.
  M.fetchWeather = function () {
    return (M.fetch || fetch)(M.WEATHER_URL).then(function (r) {
      if (!r.ok) throw new Error('weather ' + r.status);
      return r.json();
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var line = document.getElementById('weather');
    if (!line) return;
    M.fetchWeather().then(function (w) {
      var c = w.current || {};
      line.textContent = 'Manila: ' + Math.round(c.temperature_2m) + '°C, ' +
        M.weatherText(c.weather_code) + ', humidity ' + Math.round(c.relative_humidity_2m) + '%';
    }).catch(function () {
      line.textContent = 'Manila weather: unavailable right now';
    });
  });
})();
