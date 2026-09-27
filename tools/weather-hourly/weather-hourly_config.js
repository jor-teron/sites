/*
 * Weather Hourly — configuration.
 * Location, request details, formatting, visual values, and on-screen text
 * live here so weather-hourly_logic.js contains no app-specific constants.
 */
const WEATHER_HOURLY_CONFIG = {
  // Location used by the forecast request.
  location: {
    name: "Diphu",
    latitude: 25.8387,
    longitude: 93.4373,
  },

  // Open-Meteo request details. The service's default units match the original page.
  api: {
    url: "https://api.open-meteo.com/v1/forecast",
    params: {
      hourly: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
      timezone: "auto",
    },
  },

  // Forecast window and refresh behavior (zero keeps the original load-only behavior).
  forecast: {
    hours: 24,
    refreshIntervalMs: 0,
  },

  // Display units.
  units: {
    temperature: "°C",
    humidity: "%",
    precipitation: "mm",
    windSpeed: "km/h",
  },

  // Number and date formatting used in the table.
  formatting: {
    arrayStart: 0,
    decimalPlaces: 1,
    locale: [],
    time: {
      hour: "2-digit",
      minute: "2-digit",
    },
  },

  // WMO weather code labels.
  weatherCodes: {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  },

  // Generated table structure.
  table: {
    stripeModulo: 2,
    evenRowIndex: 0,
    classes: {
      table: "weather-table",
      cell: "bordered-cell",
      evenRow: "weather-row-even",
      oddRow: "",
    },
  },

  // Page and table text.
  text: {
    title: "Diphu Hourly Weather Forecast",
    loading: "Loading weather data...",
    errorPrefix: "Error: ",
    fetchFailure: "Failed to fetch weather data",
    unknownCondition: "Unknown",
    headers: {
      time: "Time",
      temperature: "Temperature",
      humidity: "Humidity",
      precipitation: "Precipitation",
      windSpeed: "Wind Speed",
      condition: "Condition",
    },
  },

  // Starting values are kept explicit for the same initial state as the original.
  start: {
    loadingMessage: "Loading weather data...",
  },

  // Kept available for the shared app convention; this app renders a table, not a chart.
  chart: {
    enabled: false,
    type: "table",
    height: 0,
  },

  // DOM handles and style variables used by the page.
  dom: {
    titleId: "weather-title",
    weatherId: "weather",
    loadingId: "weather-loading",
  },
  styles: {
    variables: {
      "--weather-page-background": "#f3f4f6",
      "--weather-body-text": "#111827",
      "--weather-heading-text": "#1f2937",
      "--weather-muted-text": "#6b7280",
      "--weather-error-text": "#ef4444",
      "--weather-panel-background": "#ffffff",
      "--weather-even-row-background": "#f9fafb",
      "--weather-header-background": "#f3f4f6",
      "--weather-cell-border": "1px solid #e5e7eb",
      "--weather-panel-shadow": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      "--weather-font-family": "ui-sans-serif, system-ui, sans-serif",
      "--weather-body-line-height": "1.5",
      "--weather-container-vertical": "2rem",
      "--weather-container-horizontal": "1rem",
      "--weather-heading-margin-bottom": "1.5rem",
      "--weather-heading-size": "1.875rem",
      "--weather-heading-line-height": "2.25rem",
      "--weather-heading-weight": "700",
      "--weather-panel-radius": "0.5rem",
      "--weather-panel-padding": "1.5rem",
      "--weather-cell-padding": "0.75rem",
    },
  },
};
