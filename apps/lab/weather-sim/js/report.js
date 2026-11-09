/* report.js — turns slider values into plain-English weather
   Rule order matters: the first rule that fits wins.
   WS6: rain/snow headlines still read precipType()/precipAmount() — now Rain-slider driven.

   `state.temperature` is the air AT YOUR PLACE (rounded °C). The slider is
   the sea-level air. Both get said out loud, because "12 °C, though it is
   33 °C at sea level below you" is the whole point of standing on a mountain.

   Height is never stored: every rule below asks elevationOf(state.place).
   The tree line the trees obey (js/ground.js) is described here too, so the
   picture and the words can never disagree. */

/* --- "Feels like" --- */

/* wind chill: Environment Canada formula, takes °C and km/h
   (the Wind slider IS km/h — that is why it says km/h) */
function windChill() {
  const t = state.temperature;
  const km = state.wind;
  if (t > 10) return t;
  return 13.12 + 0.6215 * t - 11.37 * Math.pow(km, 0.16) + 0.3965 * t * Math.pow(km, 0.16);
}

/* humid heat: damp air slows sweat, so it feels hotter (+0 … +6 °C) */
function humidBoost() {
  const t = state.temperature;
  if (t < 25) return 0;
  return (state.humidity - 40) * 0.1;
}

function feelsLike() {
  const t = state.temperature;
  if (t <= 10) return Math.min(t, windChill());
  return t + Math.max(0, humidBoost());
}

function withFeels(text, feels) {
  return `${text} Feels like ${Math.round(feels)} °C.`;
}

/* --- small descriptions --- */

function skyName() {
  const c = state.cloud;
  if (c < 15) return "Clear";
  if (c < 40) return "Mostly clear";
  if (c < 70) return "Partly cloudy";
  if (c < 90) return "Cloudy";
  return "Overcast";
}

/* fog needs cloud + moisture + almost no wind (< 2.5 km/h) */
function fogLevel() {
  if (state.cloud < 40 || state.humidity < 70 || state.wind > 2.5) return 0;
  return Math.min(1, (state.humidity - 70) / 20);
}

function precipName() {
  const type = precipType();
  if (type === "none") return "None";
  const strong = precipAmount() > 0.6;
  if (type === "snow") return strong ? "Heavy snow" : "Light snow";
  return strong ? "Heavy rain" : "Light rain";
}

function snowDepthCm() {
  return Math.round(snowAmount() * 20); // 0 … 17 cm
}

/* how thin the air is: 1 % lost per 100 m (South Pole station ≈ 32 %) */
function airThinness() {
  const metres = Math.max(0, elevationOf(state.place));
  return Math.min(0.35, metres / 100 / 100);
}

/* where you are, in words: name, height, and the pressure that comes with it */
function placeLine() {
  const place = PLACE_BY_KEY[state.place];
  if (!place) return "Sea level";
  const [, name, , , metres] = place;
  return `${name} · ${formatAltitude(metres)} · ${pressureAt(state.place)} hPa`;
}

/* the sea-level air, said once, only when it differs enough to matter */
function valleyLine() {
  const sea = Math.round(parseFloat(SLIDERS.temperature.el.value));
  const local = state.temperature;
  const diff = local - sea;
  if (Math.abs(diff) < 3) return "";
  const name = PLACE_BY_KEY[state.place]?.[5] || "the lowlands";
  return diff < 0
    ? `Down at sea level it is ${sea} °C.`
    : `Down beside the ${name} it is ${sea} °C — the basin traps the heat.`;
}

/* --- headline: title + text + accent colour --- */

function headline() {
  const t = state.temperature;
  const type = precipType();
  const amt = precipAmount();
  const feels = feelsLike();
  const fog = fogLevel();
  const depth = snowDepthCm();
  const metres = elevationOf(state.place);
  const high = metres > 1500;

  /* fog hides almost everything, so it comes first */
  if (fog > 0.3) {
    return {
      title: fog > 0.75 ? "Foggy" : "Misty",
      text: fog > 0.75
        ? "Thick fog. Slow down and use headlights."
        : "Low cloud and mist drifting over the ground.",
      color: "#cfd8e6",
    };
  }

  /* falling precipitation */
  if (type === "snow") {
    /* up on a summit the same storm is just called what it is */
    if (high) {
      return {
        title: amt > 0.6 ? "Mountain Snow" : "Mountain Flurries",
        text: withFeels("Snow instead of rain, up here where the air is right at freezing.", feels),
        color: "#bfe3ff",
      };
    }
    if (amt <= 0.6) {
      return { title: "Snowing", text: withFeels("Light snow. Roads may be slippery.", feels), color: "#bfe3ff" };
    }
    const windy = state.wind > 40;
    return {
      title: windy ? "Blizzard" : "Snowstorm",
      text: withFeels(windy ? "Driving snow in strong wind." : "Heavy snow is falling.", feels),
      color: windy ? "#9fd3ff" : "#bfe3ff",
    };
  }

  if (type === "rain") {
    if (t <= 2) {
      return { title: "Freezing Rain", text: "Rain is freezing on contact. Icy and dangerous.", color: "#c9e8ff" };
    }
    if (amt > 0.6) {
      return { title: "Rainy", text: withFeels("Heavy rain. Take an umbrella.", feels), color: "#7fb3ff" };
    }
    return { title: "Showers", text: withFeels("Light rain now and then.", feels), color: "#9cc2ff" };
  }

  /* dry weather, coldest → hottest (rounded, so it matches what is shown) */
  if (t < -12 && state.wind > 35) {
    return { title: "Extreme Cold", text: withFeels("Bitter wind chill. Limit time outside.", feels), color: "#8fd0ff" };
  }
  if (t < -2) return { title: "Freezing", text: withFeels("Cold and dry. Puddles are ice.", feels), color: "#a8d8ff" };
  if (t < 6) return { title: "Frosty", text: withFeels("Crisp air. Frost may settle tonight.", feels), color: "#bfe6ff" };
  if (t < 12) return { title: "Cold", text: withFeels("Chilly air. Wear a jacket.", feels), color: "#a8d8ff" };

  if (Math.round(feels) > 35) {
    return {
      title: "Heatwave",
      text: `Extreme heat, humidity ${Math.round(state.humidity)} %. Stay in the shade.`,
      color: "#ff8a4c",
    };
  }
  if (Math.round(feels) > 28) {
    return { title: "Hot", text: withFeels("Hot and dry. Drink plenty of water.", feels), color: "#ffb066" };
  }

  if (state.wind > 60) return { title: "Windy", text: withFeels("Strong gusts. Hold onto your hat.", feels), color: "#c8d3e6" };

  if (depth >= 2) {
    return { title: "Snow Day", text: `About ${depth} cm of snow still on the ground.`, color: "#d9ecff" };
  }

  if (isNight()) {
    return { title: "Clear Night", text: withFeels("Quiet and cool under the sky.", feels), color: "#9db4e0" };
  }

  /* a mild day 3,000 m up is not "Fair" down there — it is cool and thin */
  if (high && t < 18) {
    return { title: "Crisp Mountain Air", text: withFeels("Clear and thin up here.", feels), color: "#9fd8ff" };
  }

  return { title: "Fair", text: withFeels("Comfortable conditions.", feels), color: "#7fe0a3" };
}

/* an extra sentence under the title, only when it adds something */
function habitLine() {
  const out = [];
  const t = state.temperature;
  const depth = snowDepthCm();
  const thin = airThinness();
  const metres = elevationOf(state.place);

  if (windChill() < -18) out.push("Exposed skin can freeze in minutes.");
  if (t > 33 && state.humidity > 70) out.push("Very muggy — take it easy.");
  if (t > 30 && state.humidity < 25) out.push("Dry heat: water your plants.");
  if (depth >= 2 && t > 0) out.push(`Snow is melting (${depth} cm left).`);
  if (depth >= 2 && state.wind > 50) out.push("Loose snow is blowing around.");
  if (thin > 0.08) out.push(`Thin air: ${Math.round(thin * 100)} % less than at sea level.`);
  if (metres > TREE_LINE_M) out.push("Above the tree line: rock, scree and snow.");
  if (state.time > 22 || state.time < 4) out.push("Dark hours — use lights.");

  /* the one line that explains the whole place: warm low, cold up here */
  const valley = valleyLine();
  if (valley) out.unshift(valley);

  return out.slice(0, 2).join(" ");
}

function renderReport() {
  const h = headline();

  $("report-title").textContent = h.title;
  $("report-title").style.color = h.color;

  const extra = habitLine();
  $("report-text").textContent = extra ? h.text + " " + extra : h.text;

  $("stat-feels").textContent = Math.round(feelsLike()) + " °C";
  $("stat-sky").textContent = skyName();
  $("stat-wind").textContent = windName();
  $("stat-precip").textContent = precipName();
  $("stat-place").textContent = placeLine();
  $("stat-ground").textContent = snowDepthCm() + " cm";
}
