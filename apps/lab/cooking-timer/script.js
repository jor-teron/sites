// Presets data
const PRESETS = [
    { name: 'Soft-Boiled Egg', minutes: 6, seconds: 0 },
    { name: 'Hard-Boiled Egg', minutes: 10, seconds: 0 },
    { name: 'Pasta al dente', minutes: 9, seconds: 0 },
    { name: 'Steamed Broccoli', minutes: 4, seconds: 0 },
    { name: 'Espresso Shot', minutes: 0, seconds: 30 },
    { name: 'Green Tea', minutes: 3, seconds: 0 }
];

let activeTimers = [];
let audioCtx = null;

// DOM Elements
const presetsGrid = document.getElementById('presets-grid');
const customForm = document.getElementById('custom-timer-form');
const timerLabelInput = document.getElementById('timer-label');
const timerMinsInput = document.getElementById('timer-mins');
const timerSecsInput = document.getElementById('timer-secs');
const activeTimersList = document.getElementById('active-timers-list');
const emptyState = document.getElementById('empty-state');

// Initialize audio context on first user interaction
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Play beep sound using Web Audio API
function playAlarm() {
    try {
        const ctx = getAudioContext();
        
        // Play 3 gentle beeps
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime + (i * 0.25)); // A5 note
            
            gain.gain.setValueAtTime(0.2, ctx.currentTime + (i * 0.25));
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (i * 0.25) + 0.15);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(ctx.currentTime + (i * 0.25));
            osc.stop(ctx.currentTime + (i * 0.25) + 0.15);
        }
    } catch (e) {
        console.error('Audio playback failed', e);
    }
}

// Render Presets
function renderPresets() {
    presetsGrid.innerHTML = PRESETS.map((p, index) => `
        <button class="preset-btn" data-index="${index}">
            <span class="preset-name">${p.name}</span>
            <span class="preset-time">${p.minutes > 0 ? p.minutes + 'm ' : ''}${p.seconds > 0 ? p.seconds + 's' : ''}</span>
        </button>
    `).join('');

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = PRESETS[btn.dataset.index];
            createTimer(preset.name, preset.minutes, preset.seconds);
        });
    });
}

// Create a new timer
function createTimer(label, minutes, seconds) {
    const totalSeconds = (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0);
    if (totalSeconds <= 0) return;

    const timer = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        label: label || 'Timer',
        totalSeconds: totalSeconds,
        remainingSeconds: totalSeconds,
        isRunning: true,
        isFinished: false
    };

    activeTimers.push(timer);
    renderTimers();
}

// Format seconds into MM:SS
function formatTime(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Render active timers
function renderTimers() {
    if (activeTimers.length === 0) {
        emptyState.style.display = 'block';
        activeTimersList.innerHTML = '';
        activeTimersList.appendChild(emptyState);
        return;
    }

    emptyState.style.display = 'none';
    activeTimersList.innerHTML = activeTimers.map(t => `
        <div class="timer-card ${t.isFinished ? 'finished' : ''}" id="timer-${t.id}">
            <div class="timer-info">
                <span class="timer-card-title">${escapeHtml(t.label)}</span>
                <span class="timer-card-time">${formatTime(t.remainingSeconds)}</span>
            </div>
            <div class="timer-actions">
                ${!t.isFinished ? `
                    <button class="btn-sm" onclick="toggleTimer('${t.id}')">
                        ${t.isRunning ? 'Pause' : 'Resume'}
                    </button>
                ` : ''}
                <button class="btn-sm btn-danger-sm" onclick="deleteTimer('${t.id}')">
                    ${t.isFinished ? 'Dismiss' : 'Cancel'}
                </button>
            </div>
        </div>
    `).join('');
}

// Toggle Timer (Pause / Resume)
window.toggleTimer = function(id) {
    const timer = activeTimers.find(t => t.id === id);
    if (timer && !timer.isFinished) {
        timer.isRunning = !timer.isRunning;
        renderTimers();
    }
};

// Delete Timer
window.deleteTimer = function(id) {
    activeTimers = activeTimers.filter(t => t.id !== id);
    renderTimers();
};

// Escape HTML to prevent XSS
function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Custom Timer Form Submission
customForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = timerLabelInput.value.trim() || 'Timer';
    const mins = timerMinsInput.value;
    const secs = timerSecsInput.value;
    createTimer(label, mins, secs);
    timerLabelInput.value = 'Timer';
});

// Main Timer Tick Loop (every 1 second)
setInterval(() => {
    let updated = false;
    activeTimers.forEach(t => {
        if (t.isRunning && !t.isFinished) {
            t.remainingSeconds--;
            updated = true;
            if (t.remainingSeconds <= 0) {
                t.remainingSeconds = 0;
                t.isRunning = false;
                t.isFinished = true;
                playAlarm();
            }
        }
    });

    if (updated || activeTimers.some(t => t.isFinished)) {
        renderTimers();
    }
}, 1000);

// Initial render
renderPresets();
renderTimers();
