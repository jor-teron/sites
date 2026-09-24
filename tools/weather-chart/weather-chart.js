async function drawWeatherChart() {
    // Coordinates for Diphu, Assam, India
    const latitude = 25.8436;
    const longitude = 93.4303;

    // Fetching the weather data from Open-Meteo API
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&timezone=auto`);
    const data = await response.json();

    // Extract the time and temperature data from the API response
    const hours = data.hourly.time;
    const temps = data.hourly.temperature_2m;

    // Filter data between 3 AM and 12 AM (midnight)
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // Extract today's date (YYYY-MM-DD)

    const labels = [], values = [];

    // Loop through the hours and collect data from 3 AM to 12 AM
    for (let i = 0; i < hours.length; i++) {
        if (hours[i].startsWith(today)) {
            const hour = new Date(hours[i]).getHours();
            if (hour >= 3 && hour <= 23) { // Changed from <= 21 to <= 23
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

    const padding = 50;
    const graphWidth = canvas.width - 2 * padding;
    const graphHeight = canvas.height - 2 * padding;

    const minTemp = Math.min(...interpolatedValues) - 1;
    const maxTemp = Math.max(...interpolatedValues) + 1;
    const tempToY = t => padding + ((maxTemp - t) / (maxTemp - minTemp)) * graphHeight;
    const getX = i => padding + (i / (interpolatedValues.length - 1)) * graphWidth;

    // Fill background and draw axis
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    // Create a gradient for the fill
    const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
    gradient.addColorStop(0, "rgba(255, 165, 0, 0.7)");
    gradient.addColorStop(1, "rgba(255, 165, 0, 0.2)");

    // Draw fill area under curve
    ctx.beginPath();
    ctx.moveTo(getX(0), tempToY(interpolatedValues[0]));
    for (let i = 0; i < interpolatedValues.length - 1; i++) {
        const x0 = getX(i), y0 = tempToY(interpolatedValues[i]);
        const x1 = getX(i + 1), y1 = tempToY(interpolatedValues[i + 1]);
        // Adjusted control points for smoother Bezier curves
        const cp1X = x0 + (x1 - x0) * 0.4;
        const cp1Y = y0;
        const cp2X = x0 + (x1 - x0) * 0.6;
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
        const cp1X = x0 + (x1 - x0) * 0.4;
        const cp1Y = y0;
        const cp2X = x0 + (x1 - x0) * 0.6;
        const cp2Y = y1;
        ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x1, y1);
    }
    ctx.strokeStyle = "orange";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Plot points and labels (only for original data points)
    ctx.fillStyle = "#222";
    ctx.font = "12px sans-serif";
    values.forEach((temp, i) => {
        const x = getX(i * 2), y = tempToY(temp); // Adjust index for interpolated data
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();

        const t = Math.round(temp);
        ctx.fillText(`${t}\u00B0C`, x - 12, y - 10);

        const hour = labels[i];
        const ampm = hour < 12 ? "AM" : "PM";
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;
        ctx.fillText(`${hour12}${ampm}`, x - 15, canvas.height - padding + 15);
    });

    // Title
    ctx.font = "16px sans-serif";
    ctx.fillText(`Diphu Hourly Temperature (Today, 3AM - 12AM, \u00B0C)`, canvas.width / 2 - 120, padding - 20);
}

drawWeatherChart();
