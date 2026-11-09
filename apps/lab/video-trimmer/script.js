document.addEventListener('DOMContentLoaded', () => {
    const videoInput = document.getElementById('videoInput');
    const uploadSection = document.getElementById('uploadSection');
    const editorSection = document.getElementById('editorSection');
    const videoPreview = document.getElementById('videoPreview');
    
    const startTimeRange = document.getElementById('startTimeRange');
    const endTimeRange = document.getElementById('endTimeRange');
    const startTimeDisplay = document.getElementById('startTimeDisplay');
    const endTimeDisplay = document.getElementById('endTimeDisplay');
    const durationDisplay = document.getElementById('durationDisplay');
    
    const previewTrimBtn = document.getElementById('previewTrimBtn');
    const trimBtn = document.getElementById('trimBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusBanner = document.getElementById('statusBanner');
    const statusText = document.getElementById('statusText');

    let videoDuration = 0;
    let videoFile = null;

    // Handle file selection
    videoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadVideo(file);
        }
    });

    // Drag and drop
    const dropZone = document.querySelector('.drop-zone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) {
            loadVideo(file);
        } else {
            alert('Please drop a valid video file.');
        }
    });

    function loadVideo(file) {
        videoFile = file;
        const fileURL = URL.createObjectURL(file);
        videoPreview.src = fileURL;

        videoPreview.onloadedmetadata = () => {
            videoDuration = videoPreview.duration;
            
            // Setup ranges
            startTimeRange.min = 0;
            startTimeRange.max = videoDuration;
            startTimeRange.step = 0.1;
            startTimeRange.value = 0;

            endTimeRange.min = 0;
            endTimeRange.max = videoDuration;
            endTimeRange.step = 0.1;
            endTimeRange.value = videoDuration;

            updateDisplays();

            uploadSection.classList.add('hidden');
            editorSection.classList.remove('hidden');
        };
    }

    // Time formatting helper
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(1);
        return `${mins > 0 ? mins + 'm ' : ''}${secs}s`;
    }

    function updateDisplays() {
        const start = parseFloat(startTimeRange.value);
        const end = parseFloat(endTimeRange.value);

        if (start >= end) {
            startTimeRange.value = Math.max(0, end - 0.5);
        }

        startTimeDisplay.textContent = formatTime(parseFloat(startTimeRange.value));
        endTimeDisplay.textContent = formatTime(parseFloat(endTimeRange.value));
        durationDisplay.textContent = formatTime(parseFloat(endTimeRange.value) - parseFloat(startTimeRange.value));
    }

    startTimeRange.addEventListener('input', () => {
        updateDisplays();
        videoPreview.currentTime = startTimeRange.value;
    });

    endTimeRange.addEventListener('input', () => {
        updateDisplays();
        videoPreview.currentTime = endTimeRange.value;
    });

    // Preview Trim (play from start to end)
    previewTrimBtn.addEventListener('click', () => {
        const start = parseFloat(startTimeRange.value);
        const end = parseFloat(endTimeRange.value);

        videoPreview.currentTime = start;
        videoPreview.play();

        const timeChecker = () => {
            if (videoPreview.currentTime >= end) {
                videoPreview.pause();
                videoPreview.removeEventListener('timeupdate', timeChecker);
            }
        };
        videoPreview.addEventListener('timeupdate', timeChecker);
    });

    // Real Trimming & Downloading using MediaRecorder
    trimBtn.addEventListener('click', async () => {
        const start = parseFloat(startTimeRange.value);
        const end = parseFloat(endTimeRange.value);

        if (end - start < 0.5) {
            alert('Clip duration must be at least 0.5 seconds.');
            return;
        }

        statusBanner.classList.remove('hidden');
        statusText.textContent = 'Preparing clip... Playback will start automatically.';

        try {
            // Check if MediaRecorder is supported with suitable mime types
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
                ? 'video/webm;codecs=vp9,opus' 
                : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4');

            // Create a stream from the video element
            const stream = videoPreview.captureStream ? videoPreview.captureStream() : videoPreview.mozCaptureStream();
            
            if (!stream) {
                throw new Error('captureStream() not supported on this browser.');
            }

            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `trimmed-clip-${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                statusBanner.classList.add('hidden');
                videoPreview.pause();
                alert('Clip successfully trimmed and downloaded!');
            };

            // Jump to start and start recording
            videoPreview.currentTime = start;
            videoPreview.muted = false; // ensure audio is captured if present

            await videoPreview.play();
            recorder.start();
            statusText.textContent = 'Recording clip... Please wait until end time.';

            const monitorPlayback = () => {
                if (videoPreview.currentTime >= end || videoPreview.paused) {
                    videoPreview.pause();
                    if (recorder.state === 'recording') {
                        recorder.stop();
                    }
                    videoPreview.removeEventListener('timeupdate', monitorPlayback);
                }
            };
            videoPreview.addEventListener('timeupdate', monitorPlayback);

        } catch (err) {
            console.error(err);
            statusBanner.classList.add('hidden');
            alert('Error recording clip: ' + err.message + '\nNote: Some browsers restrict stream recording on certain video codecs.');
        }
    });

    // Reset / Choose another video
    resetBtn.addEventListener('click', () => {
        videoPreview.pause();
        videoPreview.src = '';
        videoInput.value = '';
        editorSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        statusBanner.classList.add('hidden');
    });
});
