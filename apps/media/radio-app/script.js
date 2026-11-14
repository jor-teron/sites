const audioPlayer = document.getElementById('audio-player');
const playPauseButton = document.getElementById('play-pause');
const volumeControl = document.getElementById('volume');
const stationsContainer = document.getElementById('stations');

// Sample radio stations
const stations = [
  { name: 'Lofi Radio', url: 'https://stream.zeno.fm/0r0442x7kwzuv' },
  { name: 'Chillhop Radio', url: 'https://streams.ilovemusic.de/iloveradio15.mp3' },
  { name: 'Jazz Radio', url: 'http://streaming.hotmix-radio.net/hotmixradio-jazz-128.mp3' }
];

let currentStationIndex = null;

// Populate station list
stations.forEach((station, index) => {
  const button = document.createElement('button');
  button.textContent = station.name;
  button.onclick = () => loadStation(index);
  stationsContainer.appendChild(button);
});

// Load selected station
function loadStation(index) {
  if (currentStationIndex === index && !audioPlayer.paused) return;

  const station = stations[index];
  audioPlayer.src = station.url;
  audioPlayer.load();
  audioPlayer.play().then(() => {
    playPauseButton.textContent = '⏸ Pause';
    currentStationIndex = index;
  }).catch(e => console.error("Playback failed:", e));
}

// Play/Pause toggle
playPauseButton.addEventListener('click', () => {
  if (audioPlayer.paused) {
    audioPlayer.play();
    playPauseButton.textContent = '⏸ Pause';
  } else {
    audioPlayer.pause();
    playPauseButton.textContent = '▶️ Play';
  }
});

// Volume control
volumeControl.addEventListener('input', () => {
  audioPlayer.volume = volumeControl.value;
});

// Set initial volume
audioPlayer.volume = volumeControl.value;