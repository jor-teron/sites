/*
 * Weather Forecast — configuration (WX1a).
 * Place, Open-Meteo request, cache and on-screen text. Nothing else in the app hardcodes these.
 */
const WEATHER_FORECAST_CONFIG = {
  version: "WX1a",

  // Default place (Diphu, Assam, India)
  location: {
    name: "Diphu",
    region: "Assam, India",
    latitude: 25.8436,
    longitude: 93.4303,
  },

  api: {
    url: "https://api.open-meteo.com/v1/forecast",
    // Current conditions (and today's high/low from daily)
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "is_day",
    ],
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "sunrise",
      "sunset",
    ],
    timezone: "auto",
    timeoutMs: 12000,
  },

  // Cache: shows the last reading instantly and offline. 10 minutes is "fresh".
  // v2: adds the daily array; the key bump drops the WX1a shape.
  cache: {
    key: "sites-hub.weather-forecast.v2",
    maxAge: 10 * 60 * 1000,
  },

  // Small UI preferences (WX1b: the 7-day list expanded on phones)
  prefs: {
    key: "sites-hub.weather-forecast.prefs",
  },

  // Shown when the API omits units
  units: {
    temp: "\u00B0C",
    wind: "km/h",
  },

  text: {
    loading: "Loading weather\u2026",
    errorTitle: "Weather unavailable",
    errorBody: "Could not reach Open-Meteo. Check the connection and try again.",
    retry: "Try again",
    feels: "Feels like",
    updated: "Updated",
    offline: "Offline \u2014 showing weather from",
    source: "Open-Meteo",
    daysTitle: "7-day forecast",
    showAll: "Show all 7 days",
    showLess: "Show fewer days",
    today: "Today",
  },
};
