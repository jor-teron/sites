/*
 * Weather Hourly — page logic.
 * All app-specific values are read from WEATHER_HOURLY_CONFIG.
 */
const CFG = WEATHER_HOURLY_CONFIG;

const titleElement = document.getElementById(CFG.dom.titleId);
const weatherElement = document.getElementById(CFG.dom.weatherId);
const loadingElement = document.getElementById(CFG.dom.loadingId);

Object.entries(CFG.styles.variables).forEach(function (entry) {
  document.documentElement.style.setProperty(entry[0], entry[1]);
});

document.title = CFG.text.title;
titleElement.textContent = CFG.text.title;
loadingElement.textContent = CFG.start.loadingMessage;

function buildForecastUrl() {
  const url = new URL(CFG.api.url);
  const params = {
    latitude: CFG.location.latitude,
    longitude: CFG.location.longitude,
    ...CFG.api.params,
  };

  Object.entries(params).forEach(function (entry) {
    url.searchParams.set(entry[0], entry[1]);
  });

  return url.toString();
}

function tableHeader(label) {
  return `<th class="${CFG.table.classes.cell}">${label}</th>`;
}

function tableCell(value) {
  return `<td class="${CFG.table.classes.cell}">${value}</td>`;
}

function renderWeather(data) {
  const hourly = data.hourly;
  const hours = CFG.forecast.hours;
  const start = CFG.formatting.arrayStart;
  const times = hourly.time.slice(start, hours);
  const temperatures = hourly.temperature_2m.slice(start, hours);
  const humidities = hourly.relative_humidity_2m.slice(start, hours);
  const precipitations = hourly.precipitation.slice(start, hours);
  const weatherCodes = hourly.weather_code.slice(start, hours);
  const windSpeeds = hourly.wind_speed_10m.slice(start, hours);
  const decimals = CFG.formatting.decimalPlaces;
  const unit = CFG.units;
  const labels = CFG.text.headers;

  let tableHtml = `
    <table class="${CFG.table.classes.table}">
      <thead>
        <tr>
          ${tableHeader(labels.time)}
          ${tableHeader(labels.temperature + " (" + unit.temperature + ")")}
          ${tableHeader(labels.humidity + " (" + unit.humidity + ")")}
          ${tableHeader(labels.precipitation + " (" + unit.precipitation + ")")}
          ${tableHeader(labels.windSpeed + " (" + unit.windSpeed + ")")}
          ${tableHeader(labels.condition)}
        </tr>
      </thead>
      <tbody>
  `;

  times.forEach(function (time, index) {
    const date = new Date(time);
    const localTime = date.toLocaleTimeString(CFG.formatting.locale, CFG.formatting.time);
    const condition = CFG.weatherCodes[weatherCodes[index]] || CFG.text.unknownCondition;
    const rowClass = index % CFG.table.stripeModulo === CFG.table.evenRowIndex
      ? CFG.table.classes.evenRow
      : CFG.table.classes.oddRow;

    tableHtml += `
      <tr class="${rowClass}">
        ${tableCell(localTime)}
        ${tableCell(temperatures[index].toFixed(decimals))}
        ${tableCell(humidities[index])}
        ${tableCell(precipitations[index].toFixed(decimals))}
        ${tableCell(windSpeeds[index].toFixed(decimals))}
        ${tableCell(condition)}
      </tr>
    `;
  });

  tableHtml += `
      </tbody>
    </table>
  `;

  weatherElement.innerHTML = tableHtml;
}

async function fetchWeather() {
  try {
    const response = await fetch(buildForecastUrl());
    if (!response.ok) {
      throw new Error(CFG.text.fetchFailure);
    }

    renderWeather(await response.json());
  } catch (error) {
    weatherElement.innerHTML = `<p class="error-message">${CFG.text.errorPrefix}${error.message}</p>`;
  }
}

window.onload = fetchWeather;

if (CFG.forecast.refreshIntervalMs > 0) {
  window.setInterval(fetchWeather, CFG.forecast.refreshIntervalMs);
}
