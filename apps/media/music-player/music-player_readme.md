# Music Player (Media → Audio) — release MP1

Play music from a folder or files on this device. Static, no build step. Built to stay light on a Celeron / 4 GB laptop:
one `Audio` element, one object URL at a time (revoked on change), the library is never decoded, tags are read from the
first 64 KB of each file (two at a time), and the song list is virtual (52 px rows).

## Use
- **Folder**: `showDirectoryPicker` where supported (Chromium desktop); the handle is kept in IndexedDB so the folder reopens
  by itself after a reload (or with one "Open again" tap when the browser asks for permission). Otherwise `<input webkitdirectory>`
  (Android, Firefox, Safari). **Files** opens one or more audio files. Drag-and-drop works too. Subfolders up to 6 deep, up to 20 000 files.
- Formats: whatever the browser plays (mp3, m4a/aac, ogg/opus, wav, flac, webm audio).
- Tags: light ID3v2.2/2.3/2.4 reader (title, artist, album, track; big frames such as cover art are skipped) with ID3v1 fallback.
  Without tags: "Artist - Title" or "NN Title" from the file name, album = parent folder. Tags are cached in `music-player-tags-v1` (3000 max).
- Songs: sort Title / Artist / Album, search (title, artist, album, file name; Esc clears, Enter plays the first hit).
  Tap a song to play the current list from it; ⋯ or long-press = Play, Play next, Add to playlist….
- Player (right side; bottom bar on phones, tap the song for volume and queue info): play/pause, previous (restarts after 3 s), next,
  shuffle (current song stays first), repeat off / all / one, seek with times, volume and mute.
- Playlists: create, rename, delete (in-app confirm), add (from the song menu or "Add playing song"), remove ✕, reorder ▲▼, Play, Shuffle.
  Saved by path + file name + size, so they still match when files are picked again without folder paths.
  Songs that aren't open are shown as needing the folder again.
- Resume: the last song, position, queue (list or playlist) and shuffle order are restored on load, paused, with a "Ready to resume" toast.
  Songs of 10 minutes or more also remember their own position (shared module, `music-player` namespace).
- Media Session: title / artist / album / artwork, play, pause, previous, next, seek backward/forward, seek to; position state.
  Lock-screen and headset keys work, and playback keeps going in the background.
- Level bar (Settings, off by default): 24 segments from a Web Audio analyser, drawn only while visible and playing.
- Keys: Space/K play, N next, P previous, ←/→ ±5 s (Shift ±30 s), ↑/↓ volume, S shuffle, R repeat, M mute, V level bar,
  / search, O open folder, 1/2/3 screens.
- Screens: Songs, Playlists, Settings (Theme System/Light/Dark following `sites-hub.theme`, Level bar, Forget folder, Keyboard, About).
  Dark default, dots, 75 px swipes. In-app dialogs only.

## Files
- `music-player.html/.css`, `index.html` (redirect)
- `music-player_app.js`: screens, library, list, search, playlists, resume, keys and swipes
- `music-player_player.js` (`MPPlayer`): the one Audio element, queue/order, shuffle/repeat, Media Session, level bar
- `music-player_tags.js` (`MPTags`): ID3 reader + file-name guess
- `music-player_save.js` (`MPSave`): the one save module: `music-player-settings-v1`, `music-player-state-v1`,
  `music-player-playlists-v1`, `music-player-tags-v1`
- `../shared-media/media_files.js` (`MediaFiles`): shared with VP1 / Gallery. It handles folder/file opening, remembered handles
  (IndexedDB `shared-media-v1`) and playback positions (`shared-media-pos-v1`).

## Limits
- Without `showDirectoryPicker` (most phones) the folder must be picked again after a reload; until then playlists show as needing it.
- Tags are only read from MP3 (ID3); Ogg/FLAC/M4A use the file name. Durations appear once a song's metadata has loaded.
- Reordering uses ▲▼, not drag. Once the level bar is turned on, the audio stays routed through Web Audio until reload.
- Queues larger than 5000 songs are restored from sort + search instead of a saved path list.
