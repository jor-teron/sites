/*
 * Weather Chart — configuration.
 * Location, Open-Meteo API, hours shown, chart sizes/colours/fonts and text.
 * weather-chart_logic.js reads everything from WEATHER_CHART_CONFIG.
 */
const WEATHER_CHART_CONFIG = {
  // Location (Diphu, Assam, India)
  location: {
    name: "Diphu",                // used in the chart title
    latitude: 25.8436,
    longitude: 93.4303,
  },

  // Open-Meteo forecast API
  api: {
    url: "https://api.open-meteo.com/v1/forecast", // endpoint
    hourly: "temperature_2m",     // hourly variable requested (and read from data.hourly)
    timezone: "auto",             // timezone parameter
  },

  // Hours of today that are plotted (local hour, inclusive)
  hours: {
    from: 3,                      // 3 AM
    to: 23,                       // 11 PM (last slot before midnight)
  },

  // Chart geometry
  chart: {
    padding: 50,                  // px around the plot area
    tempMargin: 1,                // °C added above max / below min
    curveCp1: 0.4,                // Bezier control point 1 (fraction of segment)
    curveCp2: 0.6,                // Bezier control point 2 (fraction of segment)
    lineWidth: 3,                 // temperature line width
    pointRadius: 3,               // dot radius at each real data point
  },

  // Colours
  colors: {
    axis: "#fff",                             // axis lines
    fillTop: "rgba(255, 165, 0, 0.7)",        // area gradient at top
    fillBottom: "rgba(255, 165, 0, 0.2)",     // area gradient at bottom
    line: "orange",                           // temperature line
    text: "#222",                             // dots and labels
  },

  // Fonts
  fonts: {
    label: "12px sans-serif",     // point and hour labels
    title: "16px sans-serif",     // chart title
  },

  // Label offsets (px)
  offsets: {
    tempX: -12,                   // temperature label x offset from point
    tempY: -10,                   // temperature label y offset from point
    hourX: -15,                   // hour label x offset from point
    hourY: 15,                    // hour label y offset below the x axis
    titleX: -120,                 // title x offset from canvas centre
    titleY: -20,                  // title y offset from top padding
  },

  // On-screen text
  text: {
    unit: "\u00B0C",              // appended to temperatures
    am: "AM",
    pm: "PM",
    // {name} is replaced with location.name
    title: "{name} Hourly Temperature (Today, 3AM - 12AM, \u00B0C)",
  },
};
