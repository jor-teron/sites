/*
 * Weather Chart — logic.
 * Fetches today's hourly temperature from Open-Meteo and draws it on a canvas.
 * Settings, colours and text come from WEATHER_CHART_CONFIG (weather-chart_config.js).
 */
const WC = WEATHER_CHART_CONFIG;

async function drawWeatherChart() {
    // Coordinates from config
    const latitude = WC.location.latitude;
    const longitude = WC.location.longitude;

    // Fetching the weather data from Open-Meteo API
    const response = await fetch(`${WC.api.url}?latitude=${latitude}&longitude=${longitude}&hourly=${WC.api.hourly}&timezone=${WC.api.timezone}`);
    const data = await response.json();

    // Extract the time and temperature data from the API response
    const hours = data.hourly.time;
    const temps = data.hourly[WC.api.hourly];

    // Filter data to today's configured hour range
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // Extract today's date (YYYY-MM-DD)

    const labels = [], values = [];

    // Loop through the hours and collect data in the configured range
    for (let i = 0; i < hours.length; i++) {
        if (hours[i].startsWith(today)) {
            const hour = new Date(hours[i]).getHours();
            if (hour >= WC.hours.from && hour <= WC.hours.to) {
                labels.push(hour);
                values.push(temps[i]);
            }
        }
    }

    // Optional: Interpolate data for smoother curves
    const interpolatedLabels = [];
    const interpolatedValues = [];
    for (let i = 0; i < values.length - 1; i++) {
        interpolatedLabels.push(labels[i]);
        interpolatedValues.push(values[i]);
        // Add an interpolated point between each pair
        const midHour = (labels[i] + labels[i + 1]) / 2;
        const midTemp = (values[i] + values[i + 1]) / 2;
        interpolatedLabels.push(midHour);
        interpolatedValues.push(midTemp);
    }
    // Add the last point
    interpolatedLabels.push(labels[labels.length - 1]);
    interpolatedValues.push(values[values.length - 1]);

    const canvas = document.getElementById("tempChart");
    canvas.width = canvas.clientWidth; // Ensure proper internal resolution
    canvas.height = canvas.clientHeight;
    const ctx = canvas.getContext("2d");

    const padding = WC.chart.padding;
    const graphWidth = canvas.width - 2 * padding;
    const graphHeight = canvas.height - 2 * padding;

    const minTemp = Math.min(...interpolatedValues) - WC.chart.tempMargin;
    const maxTemp = Math.max(...interpolatedValues) + WC.chart.tempMargin;
    const tempToY = t => padding + ((maxTemp - t) / (maxTemp - minTemp)) * graphHeight;
    const getX = i => padding + (i / (interpolatedValues.length - 1)) * graphWidth;

    // Fill background and draw axis
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.strokeStyle = WC.colors.axis;
    ctx.stroke();

    // Create a gradient for the fill
    const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
    gradient.addColorStop(0, WC.colors.fillTop);
    gradient.addColorStop(1, WC.colors.fillBottom);

    // Draw fill area under curve
    ctx.beginPath();
    ctx.moveTo(getX(0), tempToY(interpolatedValues[0]));
    for (let i = 0; i < interpolatedValues.length - 1; i++) {
        const x0 = getX(i), y0 = tempToY(interpolatedValues[i]);
        const x1 = getX(i + 1), y1 = tempToY(interpolatedValues[i + 1]);
        // Adjusted control points for smoother Bezier curves
        const cp1X = x0 + (x1 - x0) * WC.chart.curveCp1;
        const cp1Y = y0;
        const cp2X = x0 + (x1 - x0) * WC.chart.curveCp2;
        const cp2Y = y1;
        ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x1, y1);
    }
    ctx.lineTo(getX(interpolatedValues.length - 1), canvas.height - padding);
    ctx.lineTo(getX(0), canvas.height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw smooth line
    ctx.beginPath();
    ctx.moveTo(getX(0), tempToY(interpolatedValues[0]));
    for (let i = 0; i < interpolatedValues.length - 1; i++) {
        const x0 = getX(i), y0 = tempToY(interpolatedValues[i]);
        const x1 = getX(i + 1), y1 = tempToY(interpolatedValues[i + 1]);
        const cp1X = x0 + (x1 - x0) * WC.chart.curveCp1;
        const cp1Y = y0;
        const cp2X = x0 + (x1 - x0) * WC.chart.curveCp2;
        const cp2Y = y1;
        ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x1, y1);
    }
    ctx.strokeStyle = WC.colors.line;
    ctx.lineWidth = WC.chart.lineWidth;
    ctx.stroke();

    // Plot points and labels (only for original data points)
    ctx.fillStyle = WC.colors.text;
    ctx.font = WC.fonts.label;
    values.forEach((temp, i) => {
        const x = getX(i * 2), y = tempToY(temp); // Adjust index for interpolated data
        ctx.beginPath();
        ctx.arc(x, y, WC.chart.pointRadius, 0, 2 * Math.PI);
        ctx.fill();

        const t = Math.round(temp);
        ctx.fillText(`${t}${WC.text.unit}`, x + WC.offsets.tempX, y + WC.offsets.tempY);

        const hour = labels[i];
        const ampm = hour < 12 ? WC.text.am : WC.text.pm;
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;
        ctx.fillText(`${hour12}${ampm}`, x + WC.offsets.hourX, canvas.height - padding + WC.offsets.hourY);
    });

    // Title
    ctx.font = WC.fonts.title;
    ctx.fillText(WC.text.title.replace("{name}", WC.location.name), canvas.width / 2 + WC.offsets.titleX, padding + WC.offsets.titleY);
}

drawWeatherChart();
