/**
 * Ultimate Weather Card  v1.0.4
 * github.com/Sven2410/ultimate-weather-card
 *
 * v1.0.4:
 *  - Herberekende background-position voor thumbnail én popup (NL gecentreerd)
 *  - Eigen geanimeerde tijdlijn in popup (-30min → Nu → +3u)
 *  - Tijdlijn-animatie gesynchroniseerd met geschatte GIF-looptijd
 */

const UWCVERSION = '1.0.8';
console.info(
  '%c ULTIMATE-WEATHER-CARD %c v' + UWCVERSION + ' ',
  'background:#026FA1;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold',
  'background:#004f78;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0'
);

// ─── Positie-berekening ───────────────────────────────────────────────────────
//
// Buienradar 512×512 GIF — Nederland bevindt zich op:
//   Horizontaal: ~30% (westkust) tot ~58% (oostgrens) → midden ≈ 44%
//   Verticaal:   ~18% (Wadden)   tot ~57% (Limburg)   → midden ≈ 38%
//
// CSS background-position berekening:
//   offset_px  = (centerFrac × scaledSize) − (containerSize / 2)
//   position%  = offset_px / (scaledSize − containerSize)
//
// Thumbnail: container 116px, scale 210% → scaledSize 243.6px, excess 127.6px
//   x = (0.44×243.6 − 58) / 127.6 = (107.2 − 58) / 127.6 = 38.6% ≈ 39%
//   y = (0.38×243.6 − 58) / 127.6 = (92.6  − 58) / 127.6 = 27.1% ≈ 27%
//
// Popup: container ~420px, scale 175% → scaledSize 735px, excess 315px
//   x = (0.44×735 − 210) / 315 = (323.4 − 210) / 315 = 36.0% ≈ 36%
//   y = (0.38×735 − 210) / 315 = (279.3 − 210) / 315 = 22.0% ≈ 22%

var UWC_THUMB_SIZE = '185%';
var UWC_THUMB_POS  = '57% 49.5%';

var UWC_POPUP_SIZE = '173%';
var UWC_POPUP_POS  = '55% 44.5%';

// GIF heeft ±22 frames (3 history + 1 nu + 18 forecast) × ~500ms ≈ 11s looptijd
var UWC_GIF_LOOP_SEC = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

var UWC_CONDITION_ICON = {
  'clear-night':'mdi:weather-night','cloudy':'mdi:weather-cloudy',
  'exceptional':'mdi:alert-circle-outline','fog':'mdi:weather-fog',
  'hail':'mdi:weather-hail','lightning':'mdi:weather-lightning',
  'lightning-rainy':'mdi:weather-lightning-rainy','partlycloudy':'mdi:weather-partly-cloudy',
  'pouring':'mdi:weather-pouring','rainy':'mdi:weather-rainy',
  'snowy':'mdi:weather-snowy','snowy-rainy':'mdi:weather-snowy-rainy',
  'sunny':'mdi:weather-sunny','windy':'mdi:weather-windy',
  'windy-variant':'mdi:weather-windy-variant',
};
var UWC_CONDITION_NL = {
  'clear-night':'Helder','cloudy':'Bewolkt','exceptional':'Bijzonder',
  'fog':'Mist','hail':'Hagel','lightning':'Onweer',
  'lightning-rainy':'Onweer met regen','partlycloudy':'Gedeeltelijk bewolkt',
  'pouring':'Zware regen','rainy':'Regen','snowy':'Sneeuw',
  'snowy-rainy':'Sneeuwregen','sunny':'Zonnig','windy':'Winderig',
  'windy-variant':'Winderig',
};
var UWC_DAYS = ['zo','ma','di','wo','do','vr','za'];

function uwcRadarUrl() {
  return 'https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL' +
    '?height=512&width=512&renderBackground=True&renderBranding=False' +
    '&renderText=False&History=3&Forecast=19&_t=' + Math.floor(Date.now()/300000);
}
function uwcRadarUrlLarge() {
  return 'https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL' +
    '?height=700&width=700&renderBackground=True&renderBranding=False' +
    '&renderText=False&History=3&Forecast=19&_t=' + Math.floor(Date.now()/300000);
}
function uwcIcon(c)  { return UWC_CONDITION_ICON[c] || 'mdi:weather-cloudy'; }
function uwcLabel(c) { return UWC_CONDITION_NL[c] || (c ? c.replace(/-/g,' ') : '\u2014'); }
function uwcTemp(v)  { return (v!==null&&v!==undefined) ? Math.round(v)+'\u00b0' : '\u2014'; }

// ─── Editor ──────────────────────────────────────────────────────────────────

class UltimateWeatherCardEditor extends HTMLElement {
  constructor() { super(); this._config={}; this._hass=null; this._ready=false; }

  set hass(h) {
    this._hass = h;
    if (this._ready) { var f=this.querySelector('ha-form'); if(f) f.hass=h; }
    else this._init();
  }
  setConfig(c) {
    this._config = Object.assign({},c);
    if (this._ready) { var f=this.querySelector('ha-form'); if(f) f.data={weather_entity:this._config.weather_entity||''}; }
    else this._init();
  }
  _fire() {
    this.dispatchEvent(new CustomEvent('config-changed',{
      detail:{config:Object.assign({},this._config)}, bubbles:true, composed:true
    }));
  }
  _init() {
    if (!this._hass||this._ready) return;
    this._ready = true;
    this.innerHTML = '<ha-form></ha-form>';
    var form=this.querySelector('ha-form'), self=this;
    form.hass   = this._hass;
    form.schema = [{name:'weather_entity',selector:{entity:{domain:'weather'}},label:'Weer entiteit'}];
    form.data   = {weather_entity:this._config.weather_entity||''};
    form.addEventListener('value-changed',function(e){
      var v=(e.detail&&e.detail.value)?e.detail.value:{}, changed=false;
      Object.keys(v).forEach(function(k){ if(v[k]!==self._config[k]){self._config[k]=v[k];changed=true;} });
      if(changed) self._fire();
    });
  }
}

// ─── Main Card ───────────────────────────────────────────────────────────────

class UltimateWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this._config={}; this._hass=null; this._domBuilt=false;
    this._forecast=[]; this._forecastSub=null; this._radarTimer=null; this._timeTimer=null;
  }

  static getConfigElement() { return document.createElement('ultimate-weather-card-editor'); }
  static getStubConfig()    { return {weather_entity:''}; }
  getCardSize()             { return 2; }

  setConfig(config) {
    if (!config) throw new Error('Geen configuratie opgegeven.');
    var prev = this._config && this._config.weather_entity;
    this._config = Object.assign({},config);
    if (this._hass && prev!==this._config.weather_entity) this._subscribeForecast();
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

  connectedCallback()    { if (this._domBuilt) this._startRadarRefresh(); }
  disconnectedCallback() { this._stopRadarRefresh(); this._unsubForecast(); this._stopTimeIndicator(); }

  _startRadarRefresh() {
    if (this._radarTimer) return;
    var self=this;
    this._radarTimer = setInterval(function(){
      self._setRadarBg('.radar-bg', uwcRadarUrl());
      // Ververs popup alleen als die open is
      var ov=self.shadowRoot&&self.shadowRoot.querySelector('.popup-overlay');
      if (ov&&ov.classList.contains('open')) self._setRadarBg('.popup-radar-bg', uwcRadarUrlLarge());
    }, 300000);
  }
  _stopRadarRefresh() {
    if (this._radarTimer) { clearInterval(this._radarTimer); this._radarTimer=null; }
  }

  _setRadarBg(sel, url) {
    var el=this.shadowRoot&&this.shadowRoot.querySelector(sel);
    if (el) el.style.backgroundImage='url("'+url+'")';
  }

  _unsubForecast() {
    if (typeof this._forecastSub==='function') { try{this._forecastSub();}catch(e){} }
    this._forecastSub = null;
  }
  _subscribeForecast() {
    this._unsubForecast();
    if (!this._config.weather_entity||!this._hass) return;
    var self=this;
    this._hass.connection.subscribeMessage(
      function(event){ self._forecast=(event&&event.forecast)?event.forecast:[]; self._render(); },
      {type:'weather/subscribe_forecast', entity_id:this._config.weather_entity, forecast_type:'daily'}
    ).then(function(u){ self._forecastSub=u; })
     .catch(function(){
       var s=self._hass&&self._hass.states[self._config.weather_entity];
       self._forecast=(s&&s.attributes&&s.attributes.forecast)?s.attributes.forecast:[];
       self._render();
     });
  }

  _openPopup() {
    var ov=this.shadowRoot.querySelector('.popup-overlay');
    if (!ov) return;
    this._setRadarBg('.popup-radar-bg', uwcRadarUrlLarge());
    ov.classList.add('open');
    document.body.style.overflow='hidden';
    this._startTimeIndicator();
  }
  _closePopup() {
    var ov=this.shadowRoot.querySelector('.popup-overlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.body.style.overflow='';
    this._stopTimeIndicator();
  }

  // Geeft HH:MM terug van een Date-object
  _fmt(date) {
    return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
  }

  // Bereken 5 kloktijden voor de tijdlijn op basis van huidige tijd
  // Afgerond op 5 minuten naar beneden
  _buildTimes() {
    var now=new Date();
    now.setSeconds(0,0);
    now.setMinutes(Math.floor(now.getMinutes()/5)*5);
    var offsets=[-30,0,60,120,180]; // in minuten t.o.v. nu
    var pcts=['0%','14.3%','42.9%','71.4%','100%'];
    var html='';
    for(var i=0;i<offsets.length;i++){
      var t=new Date(now.getTime()+offsets[i]*60000);
      html+='<span class="tl-tick" style="left:'+pcts[i]+'">'+this._fmt(t)+'</span>';
    }
    return html;
  }

  // Gesynchroniseerde tijdsindicator — loopt mee met de tijdlijn-animatie
  // 15 seconden = 210 minuten radartime → update elke ~357ms (= 5 radarminuten)
  _startTimeIndicator() {
    this._stopTimeIndicator();
    var self=this;
    var totalMs=UWC_GIF_LOOP_SEC*1000;
    var totalMin=210;
    var snapNow=new Date();
    snapNow.setSeconds(0,0);
    snapNow.setMinutes(Math.floor(snapNow.getMinutes()/5)*5);
    var radarStart=new Date(snapNow.getTime()-30*60000);
    var origin=Date.now();
    function tick(){
      var elapsed=(Date.now()-origin)%totalMs;
      var fraction=elapsed/totalMs;
      var minOffset=Math.round(fraction*totalMin/5)*5;
      var frameTime=new Date(radarStart.getTime()+minOffset*60000);
      var el=self.shadowRoot&&self.shadowRoot.querySelector('#popup-clock');
      if(el) el.textContent=self._fmt(frameTime);
    }
    tick();
    self._timeTimer=setInterval(tick,357);
  }
  _stopTimeIndicator(){
    if(this._timeTimer){clearInterval(this._timeTimer);this._timeTimer=null;}
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────

  _buildDOM() {
    var self=this;
    var loopSec = UWC_GIF_LOOP_SEC;

    var style = [
      ':host{display:block;}',

      /* ── Card ── */
      'ha-card{',
      '  display:flex;flex-direction:row;align-items:center;',
      '  padding:10px 12px;gap:12px;box-sizing:border-box;',
      '}',

      /* ── Radar thumbnail ──
       * background-image + background-size/position voor zoom op NL.
       * Geen transform op de afbeelding → animated GIF blijft animeren.
       */
      '.radar-wrap{',
      '  flex:0 0 auto;width:116px;height:116px;',
      '  border-radius:14px;overflow:hidden;position:relative;',
      '  background:#0f1f0f;box-shadow:0 2px 10px rgba(0,0,0,0.4);',
      '  cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
      '}',
      '.radar-bg{',
      '  width:100%;height:100%;',
      '  background-repeat:no-repeat;',
      '  background-size:'+UWC_THUMB_SIZE+';',
      '  background-position:'+UWC_THUMB_POS+';',
      '}',
      /* Badges — links-onder: +3u | rechts-onder: vergrootglas */
      '.badge{',
      '  position:absolute;bottom:5px;',
      '  background:rgba(0,0,0,0.65);color:rgba(255,255,255,0.92);',
      '  font-size:9px;font-weight:700;letter-spacing:0.04em;',
      '  border-radius:4px;padding:1px 5px;pointer-events:none;line-height:16px;',
      '}',
      '.badge-time{left:6px;}',
      '.badge-zoom{right:6px;display:flex;align-items:center;gap:2px;padding:1px 4px;}',
      '.badge-zoom svg{width:10px;height:10px;fill:currentColor;flex:0 0 auto;}',

      /* ── Weerinfo ── */
      '.weather-wrap{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:5px;}',
      '.current{display:flex;align-items:center;gap:8px;}',
      '.current-icon{--mdc-icon-size:42px;color:var(--primary-color);flex:0 0 auto;}',
      '.current-info{flex:1 1 0;min-width:0;}',
      '.condition-text{font-size:.75em;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}',
      '.temp-current{font-size:1.45em;font-weight:700;color:var(--primary-text-color);line-height:1.1;letter-spacing:-.02em;}',
      '.divider{height:1px;background:var(--divider-color);opacity:.6;}',
      '.forecast-row{display:flex;justify-content:space-between;align-items:center;}',
      '.fc-day{display:flex;flex-direction:column;align-items:center;gap:1px;flex:1 1 0;}',
      '.fc-day-name{font-size:.68em;font-weight:700;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.06em;}',
      '.fc-icon{--mdc-icon-size:22px;color:var(--primary-color);}',
      '.fc-high{font-size:.8em;font-weight:700;color:var(--primary-text-color);line-height:1.1;}',
      '.fc-low{font-size:.7em;color:var(--secondary-text-color);line-height:1.1;}',

      /* ── Popup overlay ── */
      '.popup-overlay{',
      '  display:none;position:fixed;inset:0;z-index:9999;',
      '  background:rgba(0,0,0,0.8);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
      '  align-items:center;justify-content:center;padding:16px;box-sizing:border-box;',
      '}',
      '.popup-overlay.open{display:flex;}',
      '.popup-box{',
      '  position:relative;background:var(--card-background-color,#1c1c1c);',
      '  border-radius:20px;overflow:hidden;',
      '  max-width:420px;width:100%;',
      '  box-shadow:0 8px 40px rgba(0,0,0,0.65);',
      '}',

      /* Popup header */
      '.popup-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px;}',
      '.popup-title{font-size:.9em;font-weight:700;color:var(--primary-text-color);}',
      '.popup-close{',
      '  background:var(--secondary-background-color,rgba(128,128,128,.2));',
      '  border:none;border-radius:50%;width:32px;height:32px;',
      '  display:flex;align-items:center;justify-content:center;',
      '  cursor:pointer;color:var(--primary-text-color);',
      '  touch-action:manipulation;-webkit-tap-highlight-color:transparent;flex:0 0 auto;',
      '}',
      '.popup-close:hover{background:var(--primary-color);color:#fff;}',
      '.popup-close svg{width:16px;height:16px;fill:currentColor;}',


      /* Tijdsbereik label op de radar (links-boven) */
      '.clock-overlay{',
      '  position:absolute;top:8px;left:10px;z-index:5;',
      '  background:rgba(0,0,0,0.65);',
      '  color:rgba(255,255,255,0.9);',
      '  font-size:11px;font-weight:600;letter-spacing:.03em;',
      '  padding:3px 8px;border-radius:6px;',
      '  pointer-events:none;font-variant-numeric:tabular-nums;',
      '  line-height:1.4;',
      '}',
      /* Popup radar — zelfde background-image techniek, iets minder ingezoomd */
      '.popup-radar-wrap{width:100%;aspect-ratio:1/1;overflow:hidden;position:relative;background:#0f1f0f;}',
      '.popup-radar-bg{',
      '  width:100%;height:100%;',
      '  background-repeat:no-repeat;',
      '  background-size:'+UWC_POPUP_SIZE+';',
      '  background-position:'+UWC_POPUP_POS+';',
      '}',

      /* ── Tijdlijn ──────────────────────────────────────────────────────────
       * Geanimeerde tijdbalk: een stip beweegt van links (-30min) naar rechts (+3u)
       * gesynchroniseerd met de geschatte GIF-looptijd van ~11 seconden.
       *
       * De balk is verdeeld in:
       *   Verleden (30 min) = 30/(30+180) = 14.3% van de breedte
       *   Toekomst (180 min) = 85.7%
       *   'Nu' zit op 14.3%
       */
      '.timeline-wrap{padding:10px 16px 14px;user-select:none;}',
      '.timeline-labels{display:flex;justify-content:space-between;margin-bottom:4px;}',
      '.tl-label{font-size:.65em;color:var(--secondary-text-color);font-weight:600;}',
      '.tl-label-now{',
      '  position:absolute;left:14.3%;transform:translateX(-50%);',
      '  font-size:.65em;font-weight:700;color:var(--primary-color);',
      '}',
      '.timeline-track{',
      '  position:relative;height:6px;',
      '  background:var(--secondary-background-color,rgba(128,128,128,.25));',
      '  border-radius:3px;overflow:visible;',
      '}',
      /* Verleden-deel van de balk (donkerder) */
      '.tl-past{',
      '  position:absolute;left:0;top:0;bottom:0;width:14.3%;',
      '  background:var(--primary-color);opacity:.35;border-radius:3px 0 0 3px;',
      '}',
      /* Nu-markering */
      '.tl-now-mark{',
      '  position:absolute;left:14.3%;top:50%;transform:translate(-50%,-50%);',
      '  width:2px;height:12px;background:var(--primary-color);border-radius:1px;',
      '}',
      /* Bewegende stip */
      '@keyframes uwc-dot-move{',
      '  0%   {left:0%}',
      '  100% {left:100%}',
      '}',
      '.tl-dot{',
      '  position:absolute;top:50%;transform:translate(-50%,-50%);',
      '  width:10px;height:10px;',
      '  background:var(--primary-color);',
      '  border:2px solid var(--card-background-color,#1c1c1c);',
      '  border-radius:50%;',
      '  box-shadow:0 0 4px var(--primary-color);',
      '  animation:uwc-dot-move '+loopSec+'s linear infinite;',
      '}',
      /* Tijdsmarkeringen */
      '.tl-ticks{position:relative;height:14px;margin-top:2px;}',
      '.tl-tick{',
      '  position:absolute;transform:translateX(-50%);',
      '  font-size:.6em;color:var(--secondary-text-color);',
      '}',
    ].join('\n');

    var zoomSvg  = '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
    var closeSvg = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

    var fcSlots='';
    for (var i=0;i<3;i++) {
      fcSlots+='<div class="fc-day" id="fc-'+i+'">'+
        '<span class="fc-day-name">\u2014</span>'+
        '<ha-icon class="fc-icon" icon="mdi:weather-cloudy"></ha-icon>'+
        '<span class="fc-high">\u2014</span>'+
        '<span class="fc-low">\u2014</span>'+
        '</div>';
    }

    // Tijdlijn ticks met echte kloktijden (afgerond op 5 min)
    var tickHtml = this._buildTimes();

    this.shadowRoot.innerHTML =
      '<style>'+style+'</style>'+

      '<ha-card>'+
        '<div class="radar-wrap" id="radar-thumb">'+
          '<div class="radar-bg"></div>'+
          '<div class="badge badge-time">+3u</div>'+
          '<div class="badge badge-zoom">'+zoomSvg+'</div>'+
        '</div>'+
        '<div class="weather-wrap">'+
          '<div class="current">'+
            '<ha-icon class="current-icon" icon="mdi:weather-cloudy"></ha-icon>'+
            '<div class="current-info">'+
              '<div class="condition-text">Laden\u2026</div>'+
              '<div class="temp-current">\u2014</div>'+
            '</div>'+
          '</div>'+
          '<div class="divider"></div>'+
          '<div class="forecast-row">'+fcSlots+'</div>'+
        '</div>'+
      '</ha-card>'+

      '<div class="popup-overlay" id="popup-overlay">'+
        '<div class="popup-box">'+
          '<div class="popup-header">'+
            '<div class="popup-title">Buienradar \u2014 Neerslagradar</div>'+
            '<button class="popup-close" id="popup-close" aria-label="Sluiten">'+closeSvg+'</button>'+
          '</div>'+
          '<div class="popup-radar-wrap">'+
            '<div class="popup-radar-bg"></div>'+
            '<div class="clock-overlay" id="popup-clock">\u2014</div>'+
          '</div>'+
          /* Tijdlijn */
          '<div class="timeline-wrap">'+
            '<div class="timeline-track">'+
              '<div class="tl-past"></div>'+
              '<div class="tl-now-mark"></div>'+
              '<div class="tl-dot"></div>'+
            '</div>'+
            '<div class="tl-ticks">'+tickHtml+'</div>'+
          '</div>'+
        '</div>'+
      '</div>';

    this._setRadarBg('.radar-bg', uwcRadarUrl());

    // Events
    var thumb   =this.shadowRoot.querySelector('#radar-thumb');
    var overlay =this.shadowRoot.querySelector('#popup-overlay');
    var closeBtn=this.shadowRoot.querySelector('#popup-close');

    var sy=0,sx=0,fired=false;
    thumb.addEventListener('touchstart',function(e){sy=e.touches[0].clientY;sx=e.touches[0].clientX;fired=false;},{passive:true});
    thumb.addEventListener('touchend',function(e){
      if(Math.abs(e.changedTouches[0].clientY-sy)>8||Math.abs(e.changedTouches[0].clientX-sx)>8)return;
      e.preventDefault();fired=true;self._openPopup();
    },{passive:false});
    thumb.addEventListener('click',function(){if(fired){fired=false;return;}self._openPopup();});
    closeBtn.addEventListener('click',function(){self._closePopup();});
    overlay.addEventListener('click',function(e){if(e.target===overlay)self._closePopup();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')self._closePopup();});
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._domBuilt||!this._hass) return;
    var sr=this.shadowRoot;
    var entity=this._config.weather_entity;
    var state=entity?this._hass.states[entity]:null;
    var condEl=sr.querySelector('.condition-text');
    if (!state) {
      if(condEl) condEl.textContent=entity?'Entiteit niet gevonden':'Geen entiteit ingesteld';
      return;
    }
    var condition=state.state;
    var temp=state.attributes.temperature;
    var unit=state.attributes.temperature_unit||'\u00b0C';

    var iconEl=sr.querySelector('.current-icon');
    if(iconEl) iconEl.setAttribute('icon',uwcIcon(condition));
    if(condEl) condEl.textContent=uwcLabel(condition);

    var tempEl=sr.querySelector('.temp-current');
    if(tempEl) tempEl.textContent=(temp!==null&&temp!==undefined)
      ?parseFloat(temp).toFixed(1).replace('.',',')+'\u00a0'+unit:'\u2014';

    var fc=this._forecast?this._forecast.slice(0,3):[];
    for(var i=0;i<3;i++){
      var day=fc[i];
      var dayEl=sr.querySelector('#fc-'+i);
      if(!dayEl) continue;
      var nameEl=dayEl.querySelector('.fc-day-name');
      var icoEl =dayEl.querySelector('.fc-icon');
      var hiEl  =dayEl.querySelector('.fc-high');
      var loEl  =dayEl.querySelector('.fc-low');
      if(!day){
        if(nameEl) nameEl.textContent='\u2014';
        if(icoEl)  icoEl.setAttribute('icon','mdi:weather-cloudy');
        if(hiEl)   hiEl.textContent='\u2014';
        if(loEl)   loEl.textContent='\u2014';
        continue;
      }
      var dt  =new Date(day.datetime);
      var high=(day.temperature!=null)?day.temperature:(day.tempmax!=null?day.tempmax:null);
      var low =(day.templow!=null)?day.templow:(day.tempmin!=null?day.tempmin:null);
      if(nameEl) nameEl.textContent=UWC_DAYS[dt.getDay()];
      if(icoEl)  icoEl.setAttribute('icon',uwcIcon(day.condition));
      if(hiEl)   hiEl.textContent=uwcTemp(high);
      if(loEl)   loEl.textContent=uwcTemp(low);
    }
  }
}

// ─── Registratie ──────────────────────────────────────────────────────────────

if(!customElements.get('ultimate-weather-card-editor'))
  customElements.define('ultimate-weather-card-editor',UltimateWeatherCardEditor);
if(!customElements.get('ultimate-weather-card'))
  customElements.define('ultimate-weather-card',UltimateWeatherCard);

window.customCards=window.customCards||[];
if(!window.customCards.find(function(c){return c.type==='ultimate-weather-card';}))
  window.customCards.push({
    type:'ultimate-weather-card',
    name:'Ultimate Weather Card',
    description:'Compacte weerskaart met live Buienradar animatie (+3 uur) en 3-daagse voorspelling.',
    preview:false,
  });
