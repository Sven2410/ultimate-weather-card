/**
 * Ultimate Weather Card
 * v1.0.3 — github.com/Sven2410/ultimate-weather-card
 *
 * Changelog 1.0.3:
 *  - Fix: gebruik background-image i.p.v. <img> transform voor zoom
 *         → animated GIF animeerde niet met CSS transform op <img>
 *  - Fix: +3u badge en vergrootglas zaten op dezelfde plek
 */

const UWCVERSION = '1.0.3';

console.info(
  '%c ULTIMATE-WEATHER-CARD %c v' + UWCVERSION + ' ',
  'background:#026FA1;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold',
  'background:#004f78;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0'
);

// ─── Constants ───────────────────────────────────────────────────────────────

var UWC_CONDITION_ICON = {
  'clear-night':     'mdi:weather-night',
  'cloudy':          'mdi:weather-cloudy',
  'exceptional':     'mdi:alert-circle-outline',
  'fog':             'mdi:weather-fog',
  'hail':            'mdi:weather-hail',
  'lightning':       'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  'partlycloudy':    'mdi:weather-partly-cloudy',
  'pouring':         'mdi:weather-pouring',
  'rainy':           'mdi:weather-rainy',
  'snowy':           'mdi:weather-snowy',
  'snowy-rainy':     'mdi:weather-snowy-rainy',
  'sunny':           'mdi:weather-sunny',
  'windy':           'mdi:weather-windy',
  'windy-variant':   'mdi:weather-windy-variant',
};

var UWC_CONDITION_NL = {
  'clear-night':     'Helder',
  'cloudy':          'Bewolkt',
  'exceptional':     'Bijzonder',
  'fog':             'Mist',
  'hail':            'Hagel',
  'lightning':       'Onweer',
  'lightning-rainy': 'Onweer met regen',
  'partlycloudy':    'Gedeeltelijk bewolkt',
  'pouring':         'Zware regen',
  'rainy':           'Regen',
  'snowy':           'Sneeuw',
  'snowy-rainy':     'Sneeuwregen',
  'sunny':           'Zonnig',
  'windy':           'Winderig',
  'windy-variant':   'Winderig',
};

var UWC_DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

// Buienradar animated GIF — History=3 (30 min terug), Forecast=19 (3 uur vooruit)
function uwcRadarUrl() {
  var ts = Math.floor(Date.now() / 300000); // verandert elke 5 min
  return 'https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL' +
    '?height=512&width=512&renderBackground=True&renderBranding=False' +
    '&renderText=True&History=3&Forecast=19&_t=' + ts;
}

function uwcRadarUrlLarge() {
  var ts = Math.floor(Date.now() / 300000);
  return 'https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL' +
    '?height=700&width=700&renderBackground=True&renderBranding=True' +
    '&renderText=True&History=3&Forecast=19&_t=' + ts;
}

function uwcIcon(cond) {
  return UWC_CONDITION_ICON[cond] || 'mdi:weather-cloudy';
}

function uwcLabel(cond) {
  return UWC_CONDITION_NL[cond] || (cond ? cond.replace(/-/g, ' ') : '\u2014');
}

function uwcTemp(val) {
  return (val !== null && val !== undefined) ? Math.round(val) + '\u00b0' : '\u2014';
}

// ─── Editor ──────────────────────────────────────────────────────────────────

class UltimateWeatherCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass   = null;
    this._ready  = false;
  }

  set hass(h) {
    this._hass = h;
    if (this._ready) {
      var f = this.querySelector('ha-form');
      if (f) f.hass = h;
    } else {
      this._init();
    }
  }

  setConfig(c) {
    this._config = Object.assign({}, c);
    if (this._ready) {
      var f = this.querySelector('ha-form');
      if (f) f.data = { weather_entity: this._config.weather_entity || '' };
    } else {
      this._init();
    }
  }

  _fire() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: Object.assign({}, this._config) },
      bubbles: true,
      composed: true,
    }));
  }

  _init() {
    if (!this._hass || this._ready) return;
    this._ready = true;
    this.innerHTML = '<ha-form></ha-form>';
    var form = this.querySelector('ha-form');
    var self = this;
    form.hass   = this._hass;
    form.schema = [
      {
        name: 'weather_entity',
        selector: { entity: { domain: 'weather' } },
        label: 'Weer entiteit',
      },
    ];
    form.data = { weather_entity: this._config.weather_entity || '' };
    form.addEventListener('value-changed', function(e) {
      var v = (e.detail && e.detail.value) ? e.detail.value : {};
      var changed = false;
      Object.keys(v).forEach(function(k) {
        if (v[k] !== self._config[k]) { self._config[k] = v[k]; changed = true; }
      });
      if (changed) self._fire();
    });
  }
}

// ─── Main Card ───────────────────────────────────────────────────────────────

class UltimateWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config      = {};
    this._hass        = null;
    this._domBuilt    = false;
    this._forecast    = [];
    this._forecastSub = null;
    this._radarTimer  = null;
  }

  static getConfigElement() {
    return document.createElement('ultimate-weather-card-editor');
  }

  static getStubConfig() {
    return { weather_entity: '' };
  }

  getCardSize() { return 2; }

  setConfig(config) {
    if (!config) throw new Error('Geen configuratie opgegeven.');
    var prevEntity = this._config && this._config.weather_entity;
    this._config = Object.assign({}, config);
    if (this._hass && prevEntity !== this._config.weather_entity) {
      this._subscribeForecast();
    }
    if (this._domBuilt) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._domBuilt) {
      this._buildDOM();
      this._domBuilt = true;
      this._subscribeForecast();
      this._startRadarRefresh();
    }
    this._render();
  }

  connectedCallback() {
    if (this._domBuilt) this._startRadarRefresh();
  }

  disconnectedCallback() {
    this._stopRadarRefresh();
    this._unsubForecast();
  }

  // ── Radar refresh ──────────────────────────────────────────────────────────

  _startRadarRefresh() {
    if (this._radarTimer) return;
    var self = this;
    this._radarTimer = setInterval(function() {
      self._setRadarUrl(uwcRadarUrl());
    }, 300000);
  }

  _stopRadarRefresh() {
    if (this._radarTimer) { clearInterval(this._radarTimer); this._radarTimer = null; }
  }

  // Zet de radar URL op de thumbnail (background-image div)
  _setRadarUrl(url) {
    var bg = this.shadowRoot && this.shadowRoot.querySelector('.radar-bg');
    if (bg) bg.style.backgroundImage = 'url("' + url + '")';
  }

  // Zet de radar URL op de popup (background-image div)
  _setPopupRadarUrl(url) {
    var bg = this.shadowRoot && this.shadowRoot.querySelector('.popup-radar-bg');
    if (bg) bg.style.backgroundImage = 'url("' + url + '")';
  }

  // ── Forecast subscription ─────────────────────────────────────────────────

  _unsubForecast() {
    if (typeof this._forecastSub === 'function') {
      try { this._forecastSub(); } catch (e) {}
    }
    this._forecastSub = null;
  }

  _subscribeForecast() {
    this._unsubForecast();
    if (!this._config.weather_entity || !this._hass) return;
    var self = this;
    this._hass.connection.subscribeMessage(
      function(event) {
        self._forecast = (event && event.forecast) ? event.forecast : [];
        self._render();
      },
      {
        type: 'weather/subscribe_forecast',
        entity_id: this._config.weather_entity,
        forecast_type: 'daily',
      }
    ).then(function(unsub) {
      self._forecastSub = unsub;
    }).catch(function() {
      var state = self._hass && self._hass.states[self._config.weather_entity];
      self._forecast = (state && state.attributes && state.attributes.forecast)
        ? state.attributes.forecast : [];
      self._render();
    });
  }

  // ── Popup ─────────────────────────────────────────────────────────────────

  _openPopup() {
    var overlay = this.shadowRoot.querySelector('.popup-overlay');
    if (!overlay) return;
    this._setPopupRadarUrl(uwcRadarUrlLarge());
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  _closePopup() {
    var overlay = this.shadowRoot.querySelector('.popup-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── DOM build (éénmalig) ──────────────────────────────────────────────────

  _buildDOM() {
    var self = this;

    // ── Stijlen ────────────────────────────────────────────────────────────

    var style = [
      ':host { display: block; }',

      /* Card */
      'ha-card {',
      '  display: flex; flex-direction: row; align-items: center;',
      '  padding: 10px 12px; gap: 12px; box-sizing: border-box;',
      '}',

      /* ──────────────────────────────────────────────────────────────────
       * RADAR THUMBNAIL
       *
       * De Buienradar GIF is 512×512 en toont NL + België + Duitsland.
       * Zoom-techniek: background-image + background-size + background-position
       * Dit werkt WEL met animated GIFs (in tegenstelling tot CSS transform op <img>).
       *
       * background-size: 210% → afbeelding 2.1× zo groot als container
       * background-position: 40% 20%
       *   - horizontaal: 40% van de overmaat → schuift naar links (NL zit iets links van midden)
       *   - verticaal:   20% van de overmaat → schuift naar boven  (NL zit in bovenste deel)
       * ────────────────────────────────────────────────────────────────── */
      '.radar-wrap {',
      '  flex: 0 0 auto;',
      '  width: 116px; height: 116px;',
      '  border-radius: 14px; overflow: hidden;',
      '  position: relative;',
      '  background: #0f1f0f;',
      '  box-shadow: 0 2px 10px rgba(0,0,0,0.4);',
      '  cursor: pointer;',
      '  touch-action: manipulation;',
      '  -webkit-tap-highlight-color: transparent;',
      '}',

      '.radar-bg {',
      '  width: 100%; height: 100%;',
      '  background-repeat: no-repeat;',
      '  background-size: 210%;',
      '  background-position: 40% 20%;',
      '  transition: background-size 0.2s ease;',
      '}',
      '.radar-wrap:hover .radar-bg {',
      '  background-size: 200%;', /* licht uitzoomen bij hover als visuele hint */
      '}',

      /* Badges — links-onder: +3u  |  rechts-onder: vergrootglas */
      '.badge {',
      '  position: absolute;',
      '  bottom: 5px;',
      '  background: rgba(0,0,0,0.65);',
      '  color: rgba(255,255,255,0.92);',
      '  font-size: 9px; font-weight: 700;',
      '  letter-spacing: 0.04em;',
      '  border-radius: 4px;',
      '  padding: 1px 5px;',
      '  pointer-events: none;',
      '  line-height: 16px;',
      '}',
      '.badge-time  { left: 6px; }',   /* +3u  — links-onder */
      '.badge-zoom  { right: 6px; display: flex; align-items: center; gap: 2px; padding: 1px 4px; }', /* rechts-onder */
      '.badge-zoom svg { width: 10px; height: 10px; fill: currentColor; flex: 0 0 auto; }',

      /* Weather info */
      '.weather-wrap {',
      '  flex: 1 1 0; min-width: 0;',
      '  display: flex; flex-direction: column;',
      '  justify-content: space-between; gap: 5px;',
      '}',
      '.current { display: flex; align-items: center; gap: 8px; }',
      '.current-icon { --mdc-icon-size: 42px; color: var(--primary-color); flex: 0 0 auto; }',
      '.current-info { flex: 1 1 0; min-width: 0; }',
      '.condition-text {',
      '  font-size: 0.75em; color: var(--secondary-text-color);',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;',
      '}',
      '.temp-current {',
      '  font-size: 1.45em; font-weight: 700;',
      '  color: var(--primary-text-color); line-height: 1.1; letter-spacing: -0.02em;',
      '}',
      '.divider { height: 1px; background: var(--divider-color); opacity: 0.6; }',
      '.forecast-row { display: flex; justify-content: space-between; align-items: center; }',
      '.fc-day { display: flex; flex-direction: column; align-items: center; gap: 1px; flex: 1 1 0; }',
      '.fc-day-name {',
      '  font-size: 0.68em; font-weight: 700; color: var(--secondary-text-color);',
      '  text-transform: uppercase; letter-spacing: 0.06em;',
      '}',
      '.fc-icon { --mdc-icon-size: 22px; color: var(--primary-color); }',
      '.fc-high { font-size: 0.8em; font-weight: 700; color: var(--primary-text-color); line-height: 1.1; }',
      '.fc-low  { font-size: 0.7em; color: var(--secondary-text-color); line-height: 1.1; }',

      /* Popup */
      '.popup-overlay {',
      '  display: none; position: fixed; inset: 0; z-index: 9999;',
      '  background: rgba(0,0,0,0.78);',
      '  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);',
      '  align-items: center; justify-content: center;',
      '  padding: 16px; box-sizing: border-box;',
      '}',
      '.popup-overlay.open { display: flex; }',

      '.popup-box {',
      '  position: relative;',
      '  background: var(--card-background-color, #1c1c1c);',
      '  border-radius: 20px; overflow: hidden;',
      '  max-width: 420px; width: 100%;',
      '  box-shadow: 0 8px 40px rgba(0,0,0,0.6);',
      '}',

      '.popup-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 12px 16px 8px;',
      '}',
      '.popup-title { font-size: 0.9em; font-weight: 700; color: var(--primary-text-color); }',
      '.popup-sub   { font-size: 0.7em; color: var(--secondary-text-color); margin-top: 1px; }',

      '.popup-close {',
      '  background: var(--secondary-background-color, rgba(128,128,128,0.2));',
      '  border: none; border-radius: 50%;',
      '  width: 32px; height: 32px;',
      '  display: flex; align-items: center; justify-content: center;',
      '  cursor: pointer; color: var(--primary-text-color);',
      '  touch-action: manipulation; -webkit-tap-highlight-color: transparent; flex: 0 0 auto;',
      '}',
      '.popup-close:hover { background: var(--primary-color); color: #fff; }',
      '.popup-close svg { width: 16px; height: 16px; fill: currentColor; }',

      /* ──────────────────────────────────────────────────────────────────
       * POPUP RADAR
       *
       * Zelfde techniek: background-image, iets minder ingezoomd (170%)
       * zodat de gebruiker wat meer context ziet.
       * ────────────────────────────────────────────────────────────────── */
      '.popup-radar-wrap {',
      '  width: 100%; aspect-ratio: 1 / 1; overflow: hidden;',
      '  position: relative; background: #0f1f0f;',
      '}',
      '.popup-radar-bg {',
      '  width: 100%; height: 100%;',
      '  background-repeat: no-repeat;',
      '  background-size: 170%;',
      '  background-position: 40% 22%;',
      '}',

      '.popup-legend {',
      '  padding: 8px 16px 14px;',
      '  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;',
      '  font-size: 0.68em; color: var(--secondary-text-color);',
      '}',
      '.ldot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }',
    ].join('\n');

    // ── HTML ────────────────────────────────────────────────────────────────

    var zoomSvg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 ' +
      '3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 ' +
      '5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

    var closeSvg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 ' +
      '12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

    var fcSlots = '';
    for (var i = 0; i < 3; i++) {
      fcSlots +=
        '<div class="fc-day" id="fc-' + i + '">' +
          '<span class="fc-day-name">\u2014</span>' +
          '<ha-icon class="fc-icon" icon="mdi:weather-cloudy"></ha-icon>' +
          '<span class="fc-high">\u2014</span>' +
          '<span class="fc-low">\u2014</span>' +
        '</div>';
    }

    this.shadowRoot.innerHTML =
      '<style>' + style + '</style>' +

      /* Kaart */
      '<ha-card>' +
        '<div class="radar-wrap" id="radar-thumb">' +
          '<div class="radar-bg"></div>' +
          /* +3u badge linksonder, zoom-icoon rechtsonder — apart! */
          '<div class="badge badge-time">+3u</div>' +
          '<div class="badge badge-zoom">' + zoomSvg + '</div>' +
        '</div>' +

        '<div class="weather-wrap">' +
          '<div class="current">' +
            '<ha-icon class="current-icon" icon="mdi:weather-cloudy"></ha-icon>' +
            '<div class="current-info">' +
              '<div class="condition-text">Laden\u2026</div>' +
              '<div class="temp-current">\u2014</div>' +
            '</div>' +
          '</div>' +
          '<div class="divider"></div>' +
          '<div class="forecast-row">' + fcSlots + '</div>' +
        '</div>' +
      '</ha-card>' +

      /* Popup */
      '<div class="popup-overlay" id="popup-overlay">' +
        '<div class="popup-box">' +
          '<div class="popup-header">' +
            '<div>' +
              '<div class="popup-title">Buienradar \u2014 Neerslagradar</div>' +
              '<div class="popup-sub">Afgelopen 30 min + 3 uur vooruit (per 10 min)</div>' +
            '</div>' +
            '<button class="popup-close" id="popup-close" aria-label="Sluiten">' + closeSvg + '</button>' +
          '</div>' +
          '<div class="popup-radar-wrap">' +
            '<div class="popup-radar-bg"></div>' +
          '</div>' +
          '<div class="popup-legend">' +
            '<div class="ldot" style="background:#00e5ff"></div>Lichte regen' +
            '&nbsp;&nbsp;' +
            '<div class="ldot" style="background:#2962ff"></div>Matige regen' +
            '&nbsp;&nbsp;' +
            '<div class="ldot" style="background:#c62828"></div>Zware regen' +
          '</div>' +
        '</div>' +
      '</div>';

    // ── Initialiseer radar ────────────────────────────────────────────────
    this._setRadarUrl(uwcRadarUrl());

    // ── Event listeners ───────────────────────────────────────────────────
    var thumb    = this.shadowRoot.querySelector('#radar-thumb');
    var overlay  = this.shadowRoot.querySelector('#popup-overlay');
    var closeBtn = this.shadowRoot.querySelector('#popup-close');

    // Scroll-bewuste tap op thumbnail
    var startY = 0, startX = 0, fired = false;
    thumb.addEventListener('touchstart', function(e) {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      fired  = false;
    }, { passive: true });
    thumb.addEventListener('touchend', function(e) {
      if (Math.abs(e.changedTouches[0].clientY - startY) > 8 ||
          Math.abs(e.changedTouches[0].clientX - startX) > 8) return;
      e.preventDefault(); fired = true; self._openPopup();
    }, { passive: false });
    thumb.addEventListener('click', function() {
      if (fired) { fired = false; return; } self._openPopup();
    });

    closeBtn.addEventListener('click', function() { self._closePopup(); });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) self._closePopup();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') self._closePopup();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._domBuilt || !this._hass) return;

    var sr     = this.shadowRoot;
    var entity = this._config.weather_entity;
    var state  = entity ? this._hass.states[entity] : null;

    var condEl = sr.querySelector('.condition-text');
    if (!state) {
      if (condEl) condEl.textContent = entity ? 'Entiteit niet gevonden' : 'Geen entiteit ingesteld';
      return;
    }

    var condition = state.state;
    var temp      = state.attributes.temperature;
    var unit      = state.attributes.temperature_unit || '\u00b0C';

    var iconEl = sr.querySelector('.current-icon');
    if (iconEl) iconEl.setAttribute('icon', uwcIcon(condition));
    if (condEl) condEl.textContent = uwcLabel(condition);

    var tempEl = sr.querySelector('.temp-current');
    if (tempEl) {
      tempEl.textContent = (temp !== null && temp !== undefined)
        ? parseFloat(temp).toFixed(1).replace('.', ',') + '\u00a0' + unit
        : '\u2014';
    }

    var fc = this._forecast ? this._forecast.slice(0, 3) : [];
    for (var i = 0; i < 3; i++) {
      var day   = fc[i];
      var dayEl = sr.querySelector('#fc-' + i);
      if (!dayEl) continue;

      var nameEl = dayEl.querySelector('.fc-day-name');
      var icoEl  = dayEl.querySelector('.fc-icon');
      var hiEl   = dayEl.querySelector('.fc-high');
      var loEl   = dayEl.querySelector('.fc-low');

      if (!day) {
        if (nameEl) nameEl.textContent = '\u2014';
        if (icoEl)  icoEl.setAttribute('icon', 'mdi:weather-cloudy');
        if (hiEl)   hiEl.textContent = '\u2014';
        if (loEl)   loEl.textContent = '\u2014';
        continue;
      }

      var dt   = new Date(day.datetime);
      var high = (day.temperature !== undefined && day.temperature !== null) ? day.temperature
               : (day.tempmax    !== undefined && day.tempmax    !== null) ? day.tempmax : null;
      var low  = (day.templow    !== undefined && day.templow    !== null) ? day.templow
               : (day.tempmin    !== undefined && day.tempmin    !== null) ? day.tempmin : null;

      if (nameEl) nameEl.textContent = UWC_DAYS[dt.getDay()];
      if (icoEl)  icoEl.setAttribute('icon', uwcIcon(day.condition));
      if (hiEl)   hiEl.textContent = uwcTemp(high);
      if (loEl)   loEl.textContent = uwcTemp(low);
    }
  }
}

// ─── Registratie ──────────────────────────────────────────────────────────────

if (!customElements.get('ultimate-weather-card-editor')) {
  customElements.define('ultimate-weather-card-editor', UltimateWeatherCardEditor);
}
if (!customElements.get('ultimate-weather-card')) {
  customElements.define('ultimate-weather-card', UltimateWeatherCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(function(c) { return c.type === 'ultimate-weather-card'; })) {
  window.customCards.push({
    type: 'ultimate-weather-card',
    name: 'Ultimate Weather Card',
    description: 'Compacte weerskaart met live Buienradar animatie (+3 uur) en 3-daagse voorspelling.',
    preview: false,
  });
}
