# Ultimate Weather Card

A compact Home Assistant Lovelace card combining a **live animated Buienradar radar** (+3 hours forecast) with current conditions and a **3-day weather forecast**.

![Preview](preview.png)

## Features

- 🌧 **Live Buienradar animated radar** — plays directly as an animated GIF, no iframe needed
- ⏱ **+3 hours forecast** — radar shows past 30 min + next 3 hours at 10-minute intervals
- 🔄 **Auto-refresh** — radar image reloads every 5 minutes automatically
- 🌤 **Current conditions** — icon, condition label (Dutch), temperature
- 📅 **3-day daily forecast** — day name, weather icon, high & low temperature
- 📱 **Compact & responsive** — designed to take minimal vertical space
- 🎨 **Liquid Glass compatible** — uses HA CSS variables, works with card-mod themes

## Requirements

- Home Assistant 2024.1.0 or newer
- A `weather.*` entity (e.g. from the Buienradar integration or any other weather provider)

## Installation via HACS

1. In HACS → Frontend → click **+ Explore & Download Repositories**
2. Search for **Ultimate Weather Card**
3. Download and restart Home Assistant
4. Add the resource in **Settings → Dashboards → Resources**:
   ```
   /hacsfiles/ultimate-weather-card/dist/ultimate-weather-card.js
   ```

## Manual Installation

1. Copy `dist/ultimate-weather-card.js` to `config/www/ultimate-weather-card.js`
2. Add to **Settings → Dashboards → Resources**:
   ```
   /local/ultimate-weather-card.js
   ```

## Configuration

Add via the GUI card picker and select your weather entity. Or configure manually:

```yaml
type: custom:ultimate-weather-card
weather_entity: weather.buienradar
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `weather_entity` | string | ✅ | Your `weather.*` entity ID |

## Radar Details

The radar uses Buienradar's public animated GIF endpoint:

```
https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL
  ?History=3&Forecast=19&renderBackground=True&renderBranding=False
```

- `History=3` → shows the last 30 minutes of radar history
- `Forecast=19` → shows 18 × 10-minute steps = **3 hours ahead**
- Refreshed automatically every **5 minutes**

> **Note:** This uses Buienradar's public image endpoint. Usage is subject to their [terms of service](https://www.buienradar.nl/overbuienradar/gratis-weerdata).

## Forecast Data

The card subscribes to `weather/subscribe_forecast` (daily) — the modern HA forecast API introduced in HA 2023.9. Falls back to `attributes.forecast` for older integrations.

## License

MIT — © 2025 Sven2410
