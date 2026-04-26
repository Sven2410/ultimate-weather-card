/**
 * Ultimate Weather Card
 * Compact Home Assistant Lovelace card with live Buienradar animation + 3-day forecast
 * v1.0.1 — github.com/Sven2410/ultimate-weather-card
 */

const UWCVERSION = '1.0.1';

console.info(
  '%c ULTIMATE-WEATHER-CARD %c v' + UWCVERSION + ' ',
  'background:#026FA1;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold',
  'background:#004f78;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0'
);

// ─── Constants ───────────────────────────────────────────────────────────────

const UWC_CONDITION_ICON = {
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

const UWC_CONDITION_NL = {
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

const UWC_DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function uwcRadarUrl() {
  var ts = Math.floor(Date.now() / 300000);
  return 'https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL' +
    '?height=512&width=512&renderBackground=True&renderBranding=False' +
    '&renderText=True&History=3&Forecast=19&_t=' + ts;
}

function uwcIcon(cond) {
  return UWC_CONDITION_ICON[cond] || 'mdi:weather-cloudy';
}

function uwcLabel(cond) {
  return UWC_CONDITION_NL[cond] || (cond ? cond.replace(/-/g, ' ') : '—');
}

function uwcTemp(val) {
  return (val !== null && val !== undefined) ? Math.round(val) + '°' : '—';
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
        if (v[k] !== self._config[k]) {
          self._config[k] = v[k];
          changed = true;
        }
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

  getCardSize() {
    return 2;
  }

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

  _startRadarRefresh() {
    if (this._radarTimer) return;
    var self = this;
    this._radarTimer = setInterval(function() {
      var img = self.shadowRoot && self.shadowRoot.querySelector('.radar-img');
      if (img) img.src = uwcRadarUrl();
    }, 300000);
  }

  _stopRadarRefresh() {
    if (this._radarTimer) {
      clearInterval(this._radarTimer);
      this._radarTimer = null;
    }
  }

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
      // Fallback: attributes.forecast (HA < 2023.9 or unsupported integrations)
      var state = self._hass && self._hass.states[self._config.weather_entity];
      self._forecast = (state && state.attributes && state.attributes.forecast) ? state.attributes.forecast : [];
      self._render();
    });
  }

  _buildDOM() {
    var style = [
      ':host { display: block; }',

      'ha-card {',
      '  display: flex;',
      '  flex-direction: row;',
      '  align-items: center;',
      '  padding: 10px 12px;',
      '  gap: 12px;',
      '  box-sizing: border-box;',
      '}',

      '.radar-wrap {',
      '  flex: 0 0 auto;',
      '  width: 116px;',
      '  height: 116px;',
      '  border-radius: 14px;',
      '  overflow: hidden;',
      '  position: relative;',
      '  background: #0f1f0f;',
      '  box-shadow: 0 2px 10px rgba(0,0,0,0.4);',
      '}',
      '.radar-img {',
      '  display: block;',
      '  width: 100%;',
      '  height: 100%;',
      '  object-fit: cover;',
      '  object-position: 50% 44%;',
      '}',
      '.radar-badge {',
      '  position: absolute;',
      '  bottom: 5px; right: 6px;',
      '  background: rgba(0,0,0,0.6);',
      '  color: rgba(255,255,255,0.9);',
      '  font-size: 9px; font-weight: 700;',
      '  letter-spacing: 0.05em;',
      '  padding: 1px 5px;',
      '  border-radius: 4px;',
      '  pointer-events: none;',
      '}',

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
    ].join('\n');

    var fcSlots = '';
    for (var i = 0; i < 3; i++) {
      fcSlots +=
        '<div class="fc-day" id="fc-' + i + '">' +
          '<span class="fc-day-name">—</span>' +
          '<ha-icon class="fc-icon" icon="mdi:weather-cloudy"></ha-icon>' +
          '<span class="fc-high">—</span>' +
          '<span class="fc-low">—</span>' +
        '</div>';
    }

    this.shadowRoot.innerHTML =
      '<style>' + style + '</style>' +
      '<ha-card>' +
        '<div class="radar-wrap">' +
          '<img class="radar-img" src="' + uwcRadarUrl() + '" alt="Buienradar" />' +
          '<div class="radar-badge">+3u</div>' +
        '</div>' +
        '<div class="weather-wrap">' +
          '<div class="current">' +
            '<ha-icon class="current-icon" icon="mdi:weather-cloudy"></ha-icon>' +
            '<div class="current-info">' +
              '<div class="condition-text">Laden…</div>' +
              '<div class="temp-current">—</div>' +
            '</div>' +
          '</div>' +
          '<div class="divider"></div>' +
          '<div class="forecast-row">' + fcSlots + '</div>' +
        '</div>' +
      '</ha-card>';
  }

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

    // Current weather
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
        : '—';
    }

    // Forecast
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
        if (nameEl) nameEl.textContent = '—';
        if (icoEl)  icoEl.setAttribute('icon', 'mdi:weather-cloudy');
        if (hiEl)   hiEl.textContent = '—';
        if (loEl)   loEl.textContent = '—';
        continue;
      }

      var dt   = new Date(day.datetime);
      var high = (day.temperature !== undefined && day.temperature !== null) ? day.temperature
               : (day.tempmax !== undefined && day.tempmax !== null) ? day.tempmax : null;
      var low  = (day.templow !== undefined && day.templow !== null) ? day.templow
               : (day.tempmin !== undefined && day.tempmin !== null) ? day.tempmin : null;

      if (nameEl) nameEl.textContent = UWC_DAYS[dt.getDay()];
      if (icoEl)  icoEl.setAttribute('icon', uwcIcon(day.condition));
      if (hiEl)   hiEl.textContent = uwcTemp(high);
      if (loEl)   loEl.textContent = uwcTemp(low);
    }
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

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
