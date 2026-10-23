# Terminal (apps/system/terminal/)

System app (T1 + T2 + T3): a command line for the Hub that browses your drives like a unix terminal and, since T3, changes files in them. Near-black background, terminal-green monospace text and a blinking block cursor, fixed whatever the Hub theme is. Works in a Desktop window, in Phone mode and standalone.

## The file tree

```
/                      root (ls / shows: drive)
/drive/                holds all drives (ls /drive lists the mounts)
/drive/local/          the Local drive (browser private storage, OPFS)   ~ = /drive/local
/drive/gdrive/         Google Drive (the "hub" folder of My Drive), shown only when the Hub offers it
/drive/<folder>/       each real folder added with "Add folder" (Files / Drives)
```

- **Mount names** come from the drive's name in `FsDrives.list()`, made unix-safe (anything but letters, digits, `.` `_` `-` becomes `_`) and unique (`My_Photos`, `My_Photos-2`). `local` and `gdrive` are reserved. The name <-> drive id mapping is kept in localStorage `hub-terminal.mounts`, so a folder keeps its name after a reload even if the order changes.
- **Permission:** a real folder needs one permission click after every browser restart. Until then the mount shows `Permission needed: run \`allow <mount>\``. `allow <mount>` asks from the Enter keypress (the browser needs a user gesture). If the keys arrived some other way (Hub OSK, file:// message) a `[ Allow <mount> ]` button appears to click instead. Google Drive cannot be signed in from here: use the Files app.
- **Where you are:** the prompt is `jor@hub:<cwd>$` with `~` for `/drive/local`. The folder is remembered across a reload (localStorage `hub-terminal.cwd`); if it is gone or its drive is missing, the Terminal starts in `~`.

## Commands

- **Files (look around):** `pwd`; `cd [path]` (no argument = `~`, `cd -`, `..`, `.`, absolute, relative, `~/x`); `ls [-l] [-a] [-h] [path...]` (folders first, `/` after a folder; `-l` size in bytes and modified time, `-h` human sizes, `-a` dotfiles); `cat <file...>` (text only, refuses over 1 MB or binary); `head [-n N] <file...>`, `tail [-n N] <file...>` (also `-N`); `wc [-l|-w|-c] <file...>`; `tree [path] [-L depth] [-a]` (depth 2 by default, 1500 entries at most); `stat <path>`; `drives` (mounts, kind and access); `allow <mount>`.
- **Files (change, need write access: `allow <mount>`):**
  - `mkdir [-p] <dir...>`; `touch <file...>` (creates an empty file, does nothing if it exists); `rmdir <dir>` (empty directories only).
  - `cp [-r] [-f] <src...> <dest>` and `mv [-f] <src...> <dest>`: rename or move, inside a drive and between drives (Local, a real folder, Drive). `cp -r` recurses; a directory is never copied or moved into itself. A target that exists is never replaced silently: the Terminal asks `(y/n)` (a directory copied onto an existing one asks to merge; `mv` onto a non-empty directory says `Directory not empty`). `-f` skips the question. No wildcards: name the files.
  - `rm [-r] [-f] <path...>`: a file goes at once; a directory needs `-r` and asks `(y/n)` with the number of files, folders and bytes (`-f` skips the question). **Real host folders have no trash: a removed file is gone.** Refused: `/`, `/drive`, a drive root (`~` too), `.` and `..`, and the current directory or any directory above it.
  - Redirects: `echo text > file`, `echo text >> file`, `cat a > b`. Works for the plain output commands (help, echo, date, history, apps, build, theme, pwd, ls, cat, head, tail, wc, tree, stat, drives, find, grep); `>` replaces the file, `>>` appends. Only an unquoted `>` counts (`echo "a > b"` prints it). With a redirect `echo` drops the quotes. Errors still print on the screen. The target must be in a drive and its folder must exist.
  - `edit <file>`: a full-screen editor in the same green-on-dark look (textarea; text files under 1 MB; a missing file in an existing folder is created on the first save). **Ctrl+S** saves, **Ctrl+X** or **Esc** exits and asks `Unsaved changes, exit anyway? (y/n)` when something changed; Tab inserts a tab. The bar shows the path and `[modified]`; Save and Exit buttons are there for the phone. Saved with LF line endings, no line ending is added.
  - `find [path...] [-name pat | -iname pat] [-type f|d]` (`*` and `?`, shows paths as you typed them) and `grep [-i] [-n] [-r] <text> <file|dir>...` (plain text, not a pattern; `-r` walks folders and skips binary or big files with a note). Both stop at 200 lines and say so; Ctrl+C stops a long search.
  - A drive without write permission: `Permission needed: run \`allow <mount>\``. This also covers a write the browser refuses.
  - The y/n question: the next Enter answers it; only `y` / `yes` is yes, an empty Enter is no, anything else asks again, Ctrl+C is no. Tab and Up / Down are off while it waits.
- **Hub:** `help`, `clear`, `echo <text>`, `date`, `history [-c]`, `apps [category]`, `open <app|path>` (an app id or name, e.g. `open 2048`, or a path: a folder opens the Files app there, an image or video opens the Viewer, a text file opens Notely), `build` (hub/build.txt + hub/version.txt; not on file://), `theme [dark|light]` (same key as Settings > Look). Anything else: `<name>: command not found`.
- **Quotes:** `"My Docs"`, `'My Docs'` and `My\ Docs` keep a space in one word. Errors read like unix: `ls: cannot access 'x': No such file or directory`, `cd: x: Not a directory`.
- **Tab** completes command names, app ids (`open`), categories (`apps`), themes, mount names (`allow`) and paths (case-insensitive; a folder ends with `/`, a file gets a space; dotfiles only when you type the `.`). Up / Down walk the history (localStorage `hub-terminal.history`, last 200); Ctrl+L clears; Ctrl+C cancels the line (copies when text is selected).

## How it works

- **Shared code, no copy:** the page loads `shared/fs/fs_drives.js` (list / handle / access / allow), `fs_ops.js` (list / read), `filetypes.js`, `fs_ref.js` and the three `shared/google` scripts the Viewer loads (so the Drive mount appears when it is set up). `terminal_fs.js` is the file layer (tree, paths, read commands); `terminal_wr.js` (`window.TermWr`) adds the commands that change files and the redirect writer; `terminal_edit.js` (`window.TermEdit`) is the editor; `terminal.js` is the line editor, the y/n question state, the redirect parser and the Hub commands.
- **Typing:** one invisible `<input>` takes the keys, so the native phone keyboard, the Hub OSK and paste all work; tap anywhere to focus it. On file:// the Hub cannot reach the frame, so the Hub OSK keys arrive as `{type:'hub-key'}` messages from the parent window (only then, only from the parent).
- **Hub access:** `parent.__hubOpenApp` when the Hub is the same-origin parent; on file:// a `{type:'hub-open-app'}` message to the parent (hub.js only accepts it from its own frame, and ignores a `#hash`: on file:// `open <folder>` and `open <text file>` open Files / Notely without the path; the Viewer opens in a new tab through FsRef).
- **Safety:** all output is plain text (`textContent`), never HTML; file text in the editor goes through `textarea.value` only. Every path is resolved inside a mounted drive handle (`..` stops at `/`), so nothing outside the drives can be touched. cp / mv / rm / mkdir use the shared `FsOps` (shared/fs is unchanged). On file:// Local (browser storage) is not available, same as T2, so a write there reports it.
- **Apps list:** `hub/core/hub_appindex.js` (generated by `hub/core/hub_appindex_gen.py`).
- **Tests hook:** `window.HubTerminal.run(line)` returns a promise; `HubTerminal.fs` is the file layer, `HubTerminal.asking()` tells whether a y/n question waits.

Files: `index.html`, `terminal.js`, `terminal_fs.js`, `terminal_wr.js`, `terminal_edit.js`, `terminal.css`, `terminal_icon.png`, `README.md`.
