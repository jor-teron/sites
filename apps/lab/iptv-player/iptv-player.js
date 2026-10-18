        (function() {
            // ---------- DOM elements ----------
            const dropZone = document.getElementById('dropZone');
            const fileInput = document.getElementById('fileInput');
            const dropError = document.getElementById('dropError');
            const playerContainer = document.getElementById('playerContainer');
            const videoPlayer = document.getElementById('videoPlayer');
            const channelGrid = document.getElementById('channelGrid');
            const nowPlayingLabel = document.getElementById('nowPlayingLabel');
            const channelCountSpan = document.getElementById('channelCount');

            // ---------- state ----------
            let channels = [];          // array of { name, url, logo }
            let activeIndex = -1;       // currently playing
            let focusedIndex = -1;      // currently keyboard-focused tile

            // ---------- helper: hide error ----------
            function hideError() {
                dropError.classList.add('hidden');
                dropError.textContent = '';
            }

            function showError(msg) {
                dropError.textContent = msg;
                dropError.classList.remove('hidden');
            }

            // ---------- escape HTML ----------
            function escapeHtml(unsafe) {
                if (!unsafe) return '';
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            }

            // ---------- parse M3U ----------
            function parseM3U(text) {
                const lines = text.split(/\r?\n/);
                const result = [];
                let currentInfo = null;

                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i].trim();
                    if (!line) continue;

                    if (line.startsWith('#EXTINF:')) {
                        const commaIndex = line.lastIndexOf(',');
                        let name = 'Unnamed channel';
                        if (commaIndex !== -1 && commaIndex < line.length - 1) {
                            name = line.substring(commaIndex + 1).trim();
                        } else {
                            name = line.replace('#EXTINF:', '').trim();
                        }

                        let logo = null;
                        const logoMatch = line.match(/tvg-logo=["']([^"']+)["']/i);
                        if (logoMatch) logo = logoMatch[1];

                        currentInfo = { name, logo };
                    } else if (line.startsWith('#')) {
                        continue;
                    } else {
                        if (currentInfo) {
                            result.push({
                                name: currentInfo.name,
                                url: line,
                                logo: currentInfo.logo || null
                            });
                            currentInfo = null;
                        } else {
                            const shortName = line.length > 40 ? line.slice(0, 37) + '...' : line;
                            result.push({ name: shortName, url: line, logo: null });
                        }
                    }
                }

                if (result.length === 0) {
                    for (let line of lines) {
                        line = line.trim();
                        if (line && !line.startsWith('#')) {
                            const shortName = line.length > 40 ? line.slice(0, 37) + '...' : line;
                            result.push({ name: shortName, url: line, logo: null });
                        }
                    }
                }

                return result;
            }

            // ---------- render grid ----------
            function renderChannelGrid() {
                if (!channels.length) {
                    channelGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#7a8ba8; padding:2rem;">No channels found</div>';
                    channelCountSpan.textContent = '0 channels';
                    return;
                }

                channelCountSpan.textContent = `${channels.length} channel${channels.length > 1 ? 's' : ''}`;
                let html = '';

                channels.forEach((ch, idx) => {
                    const activeClass = (idx === activeIndex) ? 'active' : '';
                    const initial = ch.name ? ch.name.charAt(0).toUpperCase() : '?';
                    const iconHtml = ch.logo
                        ? `<img src="${escapeHtml(ch.logo)}" alt="" onerror="this.style.display='none'; this.parentNode.innerText='${escapeHtml(initial)}';">`
                        : escapeHtml(initial);

                    // tabindex="-1" → focusable via JS, but not in Tab order
                    html += `
                        <div class="channel-card ${activeClass}" data-index="${idx}" tabindex="-1">
                            <div class="channel-icon">${iconHtml}</div>
                            <div class="channel-name">${escapeHtml(ch.name)}</div>
                        </div>
                    `;
                });

                channelGrid.innerHTML = html;

                document.querySelectorAll('.channel-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const index = parseInt(card.getAttribute('data-index'), 10);
                        focusedIndex = index;
                        playChannel(index);
                    });
                });
            }

            // ---------- play channel ----------
            function playChannel(index) {
                if (index < 0 || index >= channels.length) return;
                const channel = channels[index];
                activeIndex = index;

                videoPlayer.src = channel.url;
                videoPlayer.load();
                videoPlayer.play().catch(err => {
                    console.warn('Playback error:', err);
                });

                nowPlayingLabel.textContent = channel.name;

                document.querySelectorAll('.channel-card').forEach((card, i) => {
                    card.classList.toggle('active', i === index);
                });
            }

            // ---------- focus helpers ----------
            function focusCard(index) {
                const cards = document.querySelectorAll('.channel-card');
                if (!cards.length) return;
                index = Math.max(0, Math.min(index, cards.length - 1));
                focusedIndex = index;
                cards[index].focus();
            }

            function getColumnCount() {
                const style = getComputedStyle(channelGrid);
                const cols = style.gridTemplateColumns;
                if (!cols || cols === 'none') return 1;
                return cols.split(' ').length;
            }

            // ---------- arrow / enter / esc inside the grid ----------
            channelGrid.addEventListener('keydown', (e) => {
                const cards = Array.from(document.querySelectorAll('.channel-card'));
                if (!cards.length) return;

                let current = cards.indexOf(document.activeElement);
                if (current === -1) current = focusedIndex >= 0 ? focusedIndex : 0;

                const cols = getColumnCount();
                let next = current;

                switch (e.key) {
                    case 'ArrowRight':
                        next = Math.min(current + 1, cards.length - 1);
                        break;
                    case 'ArrowLeft':
                        next = Math.max(current - 1, 0);
                        break;
                    case 'ArrowDown':
                        next = Math.min(current + cols, cards.length - 1);
                        break;
                    case 'ArrowUp':
                        next = Math.max(current - cols, 0);
                        break;
                    case 'Enter':
                    case ' ':
                        e.preventDefault();
                        focusedIndex = current;
                        playChannel(current);
                        return;
                    case 'Escape':
                        e.preventDefault();
                        videoPlayer.focus();
                        return;
                    default:
                        return;
                }

                e.preventDefault();
                focusCard(next);
            });

            // ---------- global shortcut: G focuses the grid ----------
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                if (e.metaKey || e.ctrlKey || e.altKey) return;
                if (!channels.length) return; // player not loaded yet

                if (e.key === 'g' || e.key === 'G') {
                    e.preventDefault();
                    if (focusedIndex < 0) focusedIndex = activeIndex >= 0 ? activeIndex : 0;
                    focusCard(focusedIndex);
                }
            });

            // ---------- process M3U file ----------
            async function processM3UFile(file) {
                hideError();
                if (!file) {
                    showError('No file selected.');
                    return;
                }

                try {
                    const text = await file.text();
                    const parsed = parseM3U(text);

                    if (!parsed.length) {
                        showError('No playable channels found in the M3U file.');
                        return;
                    }

                    channels = parsed;
                    activeIndex = -1;
                    focusedIndex = -1;

                    dropZone.style.display = 'none';
                    playerContainer.style.display = 'flex';

                    renderChannelGrid();
                    playChannel(0);
                } catch (err) {
                    console.error('Error reading file:', err);
                    showError('Could not read the file. Is it a valid M3U?');
                }
            }

            // ---------- drag & drop handlers ----------
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('drag-over');

                const files = e.dataTransfer?.files;
                if (files && files.length > 0) {
                    processM3UFile(files[0]);
                } else {
                    showError('No file detected in drop.');
                }
            });

            dropZone.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') fileInput.click();
            });

            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    processM3UFile(fileInput.files[0]);
                }
                fileInput.value = '';
            });

            // Prevent browser from opening dropped files outside the drop zone
            window.addEventListener('dragover', (e) => e.preventDefault());
            window.addEventListener('drop', (e) => e.preventDefault());

            // Playback error feedback
            videoPlayer.addEventListener('error', () => {
                nowPlayingLabel.textContent = '⚠️ Playback error — try another channel';
            });
        })();
