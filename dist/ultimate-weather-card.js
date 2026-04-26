/**
 * Ultimate Weather Card
 * Compact Home Assistant Lovelace card with live Buienradar animation + 3-day forecast
 * v1.0.0 — github.com/Sven2410/ultimate-weather-card
 */
(() => {
  'use strict';

  const VERSION = '1.0.0';

  console.info(
    `%c ULTIMATE-WEATHER-CARD %c v${VERSION} `,
    'background:#026FA1;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold',
    'background:#004f78;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0'
  );

  // ─── Constants ─────────────────────────────────────────────────────────────

  const CONDITION_ICON = {
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

  const CONDITION_NL = {
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

  const DAYS_NL = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

  // Buienradar animated GIF — refreshes every 5 min via cache-buster
  // Forecast=19 → 18 × 10 min = 3 uur vooruit, History=3 → 30 min verleden
  function radarUrl() {
    const ts = Math.floor(Date.now() / 300000); // Changes every 5 min
    return `https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL?height=512&width=512&renderBackground=True&renderBranding=False&renderText=True&History=3&Forecast=19&_t=${ts}`;
  }

  function icon(condition) {
    return CONDITION_ICON[condition] || 'mdi:weather-cloudy';
  }

  function conditionNL(condition) {
    return CONDITION_NL[condition] || (condition ? condition.replace(/-/g, ' ') : '—');
  }

  function formatTemp(val) {
    if (val == null || val === undefined) return '—';
    return `${Math.round(val)}°`;
  }

  // ─── Editor ────────────────────────────────────────────────────────────────

  class UltimateWeatherCardEditor extends HTMLElement {
    constructor() {
      super();
      this._config = {};
      this._hass = null;
      this._ready = false;
    }

    set hass(h) {
      this._hass = h;
      if (this._ready) {
        const f = this.querySelector('ha-form');
        if (f) f.hass = h;
      } else {
        this._init();
      }
    }

    setConfig(c) {
      this._config = { ...c };
      if (this._ready) {
        const f = this.querySelector('ha-form');
        if (f) f.data = this._data();
      } else {
        this._init();
      }
    }

    _data() {
      return {
        weather_entity: this._config.weather_entity || '',
      };
    }

    _fire() {
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: { ...this._config } },
        bubbles: true,
        composed: true,
      }));
    }

    _init() {
      if (!this._hass || this._ready) return;
      this._ready = true;
      this.innerHTML = '<ha-form></ha-form>';
      const form = this.querySelector('ha-form');
      form.hass = this._hass;
      form.schema = [
        {
          name: 'weather_entity',
          selector: { entity: { domain: 'weather' } },
          label: 'Weer entiteit',
        },
      ];
      form.data = this._data();
      form.addEventListener('value-changed', e => {
        const v = e.detail.value || {};
        let changed = false;
        for (const k of Object.keys(v)) {
          if (v[k] !== this._config[k]) {
            this._config[k] = v[k];
            changed = true;
          }
        }
        if (changed) this._fire();
      });
    }
  }

  // ─── Main Card ─────────────────────────────────────────────────────────────

  class UltimateWeatherCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      this._hass = null;
      this._domBuilt = false;
      this._forecast = [];
      this._forecastSub = null;
      this._radarTimer = null;
    }

    static getConfigElement() {
      return document.createElement('ultimate-weather-card-editor');
    }

    static getStubConfig() {
      return { weather_entity: 'weather.home' };
    }

    setConfig(config) {
      if (!config.weather_entity) throw new Error('Geen weer entiteit ingesteld.');
      const prevEntity = this._config?.weather_entity;
      this._config = { ...config };
      if (prevEntity !== config.weather_entity && this._hass) {
        this._subscribeForecast();
      }
      if (this._domBuilt) this._updateDOM();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._domBuilt) {
        this._buildDOM();
        this._domBuilt = true;
        this._subscribeForecast();
        this._startRadarRefresh();
      }
      this._updateDOM();
    }

    connectedCallback() {
      if (this._domBuilt) this._startRadarRefresh();
    }

    disconnectedCallback() {
      this._stopRadarRefresh();
      this._unsubscribeForecast();
    }

    _startRadarRefresh() {
      if (this._radarTimer) return;
      this._radarTimer = setInterval(() => {
        const img = this.shadowRoot.querySelector('.radar-img');
        if (img) img.src = radarUrl();
      }, 5 * 60 * 1000);
    }

    _stopRadarRefresh() {
      if (this._radarTimer) {
        clearInterval(this._radarTimer);
        this._radarTimer = null;
      }
    }

    _unsubscribeForecast() {
      if (this._forecastSub) {
        try { this._forecastSub(); } catch (_) {}
        this._forecastSub = null;
      }
    }

    async _subscribeForecast() {
      this._unsubscribeForecast();
      if (!this._config.weather_entity || !this._hass) return;
      try {
        this._forecastSub = await this._hass.connection.subscribeMessage(
          (event) => {
            this._forecast = event.forecast || [];
            this._updateDOM();
          },
          {
            type: 'weather/subscribe_forecast',
            entity_id: this._config.weather_entity,
            forecast_type: 'daily',
          }
        );
      } catch (_) {
        // Fallback: read directly from entity attributes (older HA versions)
        const state = this._hass.states[this._config.weather_entity];
        this._forecast = state?.attributes?.forecast || [];
        this._updateDOM();
      }
    }

    _buildDOM() {
      const style = `
        :host {
          display: block;
        }

        ha-card {
          display: flex;
          flex-direction: row;
          align-items: stretch;
          padding: 10px 12px;
          gap: 12px;
          min-height: 0;
          box-sizing: border-box;
        }

        /* ── Radar ─────────────────────────────── */
        .radar-wrap {
          flex: 0 0 auto;
          width: 118px;
          height: 118px;
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
          background: #1a2a1a;
          align-self: center;
        }

        .radar-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 14px;
          /* Center NL in the radar image */
          object-position: 50% 45%;
        }

        .radar-badge {
          position: absolute;
          bottom: 5px;
          right: 6px;
          background: rgba(0,0,0,0.55);
          color: rgba(255,255,255,0.85);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.05em;
          padding: 1px 5px;
          border-radius: 4px;
          pointer-events: none;
          line-height: 1.4;
        }

        /* ── Weather info ───────────────────────── */
        .weather-wrap {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6px;
        }

        /* Current weather row */
        .current {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }

        .current-icon {
          --mdc-icon-size: 42px;
          color: var(--primary-color);
          flex: 0 0 auto;
          filter: drop-shadow(0 1px 3px rgba(0,0,0,0.2));
        }

        .current-info {
          flex: 1 1 0;
          min-width: 0;
        }

        .condition-text {
          font-size: 0.75em;
          color: var(--secondary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          margin-bottom: 1px;
        }

        .temp-current {
          font-size: 1.45em;
          font-weight: 700;
          color: var(--primary-text-color);
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        /* Divider */
        .divider {
          height: 1px;
          background: var(--divider-color);
          opacity: 0.6;
          flex: 0 0 auto;
          margin: 0;
        }

        /* 3-day forecast row */
        .forecast-row {
          display: flex;
          gap: 0;
          justify-content: space-between;
          align-items: center;
          flex: 0 0 auto;
        }

        .fc-day {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          flex: 1 1 0;
        }

        .fc-day-name {
          font-size: 0.68em;
          font-weight: 700;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          line-height: 1;
        }

        .fc-icon {
          --mdc-icon-size: 22px;
          color: var(--primary-color);
        }

        .fc-high {
          font-size: 0.8em;
          font-weight: 700;
          color: var(--primary-text-color);
          line-height: 1.1;
        }

        .fc-low {
          font-size: 0.7em;
          color: var(--secondary-text-color);
          line-height: 1.1;
        }

        /* Error state */
        .error-msg {
          color: var(--error-color);
          font-size: 0.8em;
          padding: 4px 0;
          align-self: center;
        }
      `;

      const forecastSlots = [0, 1, 2].map(i => `
        <div class="fc-day" id="fc-${i}">
          <span class="fc-day-name">—</span>
          <ha-icon class="fc-icon" icon="mdi:weather-cloudy"></ha-icon>
          <span class="fc-high">—</span>
          <span class="fc-low">—</span>
        </div>
      `).join('');

      this.shadowRoot.innerHTML = `
        <style>${style}</style>
        <ha-card>
          <div class="radar-wrap">
            <img
              class="radar-img"
              src="${radarUrl()}"
              alt="Buienradar neerslagradar"
              loading="lazy"
            />
            <div class="radar-badge">+3u</div>
          </div>
          <div class="weather-wrap">
            <div class="current">
              <ha-icon class="current-icon" icon="mdi:weather-cloudy"></ha-icon>
              <div class="current-info">
                <div class="condition-text">Laden...</div>
                <div class="temp-current">—</div>
              </div>
            </div>
            <div class="divider"></div>
            <div class="forecast-row">
              ${forecastSlots}
            </div>
          </div>
        </ha-card>
      `;
    }

    _updateDOM() {
      if (!this._domBuilt || !this._hass) return;
      const sr = this.shadowRoot;
      const state = this._hass.states[this._config.weather_entity];

      if (!state) {
        const condEl = sr.querySelector('.condition-text');
        if (condEl) condEl.textContent = 'Entiteit niet gevonden';
        return;
      }

      // ── Current weather ────────────────────────
      const condition = state.state;
      const temp = state.attributes.temperature;
      const unit = state.attributes.temperature_unit || '°C';

      const iconEl = sr.querySelector('.current-icon');
      if (iconEl) iconEl.setAttribute('icon', icon(condition));

      const condEl = sr.querySelector('.condition-text');
      if (condEl) condEl.textContent = conditionNL(condition);

      const tempEl = sr.querySelector('.temp-current');
      if (tempEl) {
        tempEl.textContent = temp != null
          ? `${parseFloat(temp).toFixed(1).replace('.', ',')} ${unit}`
          : '—';
      }

      // ── 3-day forecast ─────────────────────────
      const fc = this._forecast.slice(0, 3);
      for (let i = 0; i < 3; i++) {
        const day = fc[i];
        const dayEl = sr.querySelector(`#fc-${i}`);
        if (!dayEl) continue;

        if (!day) {
          dayEl.querySelector('.fc-day-name').textContent = '—';
          dayEl.querySelector('.fc-icon').setAttribute('icon', 'mdi:weather-cloudy');
          dayEl.querySelector('.fc-high').textContent = '—';
          dayEl.querySelector('.fc-low').textContent = '—';
          continue;
        }

        const dt = new Date(day.datetime);
        const dayName = DAYS_NL[dt.getDay()];

        // HA uses different field names depending on integration version
        const high = day.temperature ?? day.tempmax ?? null;
        const low  = day.templow ?? day.tempmin ?? null;
        const cond = day.condition;

        dayEl.querySelector('.fc-day-name').textContent = dayName;
        dayEl.querySelector('.fc-icon').setAttribute('icon', icon(cond));
        dayEl.querySelector('.fc-high').textContent = formatTemp(high);
        dayEl.querySelector('.fc-low').textContent = formatTemp(low);
      }
    }

    getCardSize() {
      return 2;
    }
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  if (!customElements.get('ultimate-weather-card-editor')) {
    customElements.define('ultimate-weather-card-editor', UltimateWeatherCardEditor);
  }
  if (!customElements.get('ultimate-weather-card')) {
    customElements.define('ultimate-weather-card', UltimateWeatherCard);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.find(c => c.type === 'ultimate-weather-card')) {
    window.customCards.push({
      type: 'ultimate-weather-card',
      name: 'Ultimate Weather Card',
      description: 'Compacte weerskaart met live Buienradar animatie (+3 uur) en 3-daagse voorspelling.',
      preview: true,
    });
  }
})();
