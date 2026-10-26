# Terminal (apps/system/terminal/)

System app (T1 + T2 + T3 + T5 + T6): a command line for the Hub that browses your drives like a unix terminal and, since T3, changes files in them. Near-black background, terminal-green monospace text and a blinking block cursor, fixed whatever the Hub theme is. Works in a Desktop window, in Phone mode and standalone.

## The file tree

```
/                      root (ls / shows: drive)
/drive/                holds all drives (ls /drive lists the mounts)
/drive/local/          the Local drive (browser private storage, OPFS)   ~ = /drive/local
/drive/gdrive/         Google Drive (the "hub" folder of My Drive), shown only when the Hub offers it
/drive/<folder>/       each real folder added with "Add folder" (Files / Drives)
/bin/                  T5: every BusyBox applet as /bin/<name> -> busybox (ls /bin)
/etc/                  T5: read-only: hostname (hub), motd, os-release
```

`/bin` and `/etc` are seen by the BusyBox commands (and `cd /etc`, `pwd`); the Terminal's own commands only know `/drive`.

- **Mount names** come from the drive's name in `FsDrives.list()`, made unix-safe (anything but letters, digits, `.` `_` `-` becomes `_`) and unique (`My_Photos`, `My_Photos-2`). `local` and `gdrive` are reserved. The name <-> drive id mapping is kept in localStorage `hub-terminal.mounts`, so a folder keeps its name after a reload even if the order changes.
- **Permission:** a real folder needs one permission click after every browser restart. Until then the mount shows `Permission needed: run \`allow <mount>\``. `allow <mount>` asks from the Enter keypress (the browser needs a user gesture). If the keys arrived some other way (Hub OSK, file:// message) a `[ Allow <mount> ]` button appears to click instead. Google Drive cannot be signed in from here: use the Files app.
- **Where you are:** the prompt is `hub@hub:<cwd>$` with `~` for `/drive/local`. The folder is remembered across a reload (localStorage `hub-terminal.cwd`); if it is gone or its drive is missing, the Terminal starts in `~`.

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
- **Hub:** `help`, `clear`, `echo <text>`, `date`, `history [-c]`, `apps [category]`, `open <app|path>` (an app id or name, e.g. `open 2048`, or a path: a folder opens the Files app there, an image or video opens the Viewer, a text file opens Notely), `build` (hub/build.txt + hub/version.txt; not on file://), `theme [dark|light]` (same key as Settings > Look). `exit` clears the screen and starts a new session. Anything else: `<name>: command not found`.
- **Quotes:** `"My Docs"`, `'My Docs'` and `My\ Docs` keep a space in one word. Errors read like unix: `ls: cannot access 'x': No such file or directory`, `cd: x: Not a directory`.
- **Tab** completes command names, app ids (`open`), categories (`apps`), themes, mount names (`allow`) and paths (case-insensitive; a folder ends with `/`, a file gets a space; dotfiles only when you type the `.`). Up / Down walk the history (localStorage `hub-terminal.history`, last 200); Ctrl+L clears; Ctrl+C cancels the line (copies when text is selected).

## Settings file, aliases, variables, ssh (T6)

- **~/.hubrc** (`/drive/local/.hubrc`) is read when the Terminal starts, if it is there; the Terminal never creates it. Make one with `edit ~/.hubrc`. Only these lines are read (anything else is skipped with a note):

  ```
  # ~/.hubrc: read at Terminal start (source ~/.hubrc or reload to read it again)
  alias ll='ls -l'
  alias la='/bin/ls -la'
  alias gs='grep -n'
  export EDITOR=edit
  export NOTES=~/notes
  export GREETING="hello from the hub"
  ```
- `alias` lists, `alias name='cmd ...'` sets, `unalias name` / `unalias -a` removes. `export` lists, `export VAR=value` sets (the value may use other $VARs). `env` and `printenv [VAR]` show the variables (HOME USER LOGNAME HOSTNAME SHELL PATH TERM LANG PWD + yours). `source <file>` reads a settings file, `reload` clears and reads ~/.hubrc again. What you type at the prompt lasts for this session only; put it in ~/.hubrc to keep it.
- **Expansion**, before every line runs (Terminal commands and BusyBox alike): an unquoted first word that is an alias is replaced by its text (aliases can chain, 10 levels, never looping), then `$VAR` and `${VAR}` are replaced (not inside `'...'`; `\$` keeps a `$`; an unknown variable becomes empty). BusyBox commands also get the variables in their environment (`printenv` in a pipe, `awk 'BEGIN{print ENVIRON["NOTES"]}'`).
- **ssh:** `ssh` opens the SSH app. `ssh user@host`, `ssh user@host:2222` or `ssh -p 2222 user@host` opens it filled in, through the SSH app's own `#host=user@host:port` link (it asks for the password or key there; the Terminal never sees it). Running a remote command (`ssh host ls`) is not supported. On file:// the Hub drops the `#...` part, so the app opens empty and the Terminal prints the target.

## BusyBox (T5)

Real Linux commands: BusyBox 1.36.1 built to WebAssembly (`bin/busybox.wasm`, ~330 KB, 87 applets, see `bin/APPLETS.txt` and how to rebuild in `bin/BUILD.md`). It loads on the first BusyBox command (`(loading BusyBox …)`), then stays in memory.

- **Who wins.** The Terminal's own commands stay as they were for a plain line: `cd pwd history clear exit help apps open build theme drives allow tree edit` always, and `ls cat head tail wc grep find stat mkdir touch cp mv rm rmdir echo date` as long as they are used the T2 / T3 way (they know Drive permissions, ask y/n before overwriting or deleting, refuse big or binary files). BusyBox runs the line when:
  - it has a pipe `|` or an input redirect `<` (inside a pipe BusyBox's `ls cat grep ...` are used, so they read stdin; a Terminal-only command such as `history`, `apps`, `help`, `tree`, `drives` can still feed a pipe: `history | grep ls`);
  - the command is one the Terminal does not have (`sed awk sort uniq cut tr seq diff md5sum base64 tee xxd gzip tar bc ...`);
  - it is written `/bin/<name>` or `busybox <name>` (forces BusyBox: `/bin/ls -R`, `/bin/rm -r x` with **no y/n question**);
  - a shared command gets an option the Terminal's version does not know (`ls -R`, `grep -E`, `wc -m`, `echo -n`, `date +%F`, ...) or a path in `/bin`, `/etc` or `/` (`ls /bin`, `cat /etc/os-release`), or the current folder is `/bin` / `/etc`.
- **Files.** Before a run, the files the command names are copied from the drive into BusyBox's memory (a folder: one level, all levels for `find du tar` and `-r` / `-R`); afterwards changed and new files and folders are written back and files the command removed are deleted from the drive. ls / find / du / stat / test only get names and sizes. Limits per command: 3000 files, 32 MB read, 4 MB output, 20 s. Writes need the same `allow <mount>` as T3. `/etc`, `/bin`, `/tmp`, `/dev` changes are thrown away.
- **Redirects:** `cmd > file`, `cmd >> file` (bytes, so `gzip -c f > f.gz` works), `cmd < file`. One `>` at the end; `<` on the first command.
- **Not there:** no shell (`sh`, `;`, `&&`, `$VAR`, `$(...)`, wildcards `*.txt`: name the files), nothing that starts other programs (xargs, find -exec, tar -z: use `gzip` on the .tar), no sleep. Commands run on the page, so a long one freezes the Terminal until it ends (20 s at most); Ctrl+C stops between pipe stages only.
- **file://:** browsers do not let a page opened as a file read `bin/busybox.wasm`; the command then says so and the Terminal's own commands keep working. Over http(s) (any web server, the Hub site) it works, also offline once the Hub's service worker has cached it (hub/update/hub_sw.js).

## How it works

- **Shared code, no copy:** the page loads `shared/fs/fs_drives.js` (list / handle / access / allow), `fs_ops.js` (list / read), `filetypes.js`, `fs_ref.js` and the three `shared/google` scripts the Viewer loads (so the Drive mount appears when it is set up). `terminal_fs.js` is the file layer (tree, paths, read commands); `terminal_wr.js` (`window.TermWr`) adds the commands that change files and the redirect writer; `terminal_edit.js` (`window.TermEdit`) is the editor; `terminal_bb.js` (`window.TermBB`, T5) runs BusyBox (pipes, staging files in and out); `terminal_etc.js` (`window.TermEtc`) holds the /etc files; `terminal_rc.js` (`window.TermRc`, T6) the aliases, variables and ~/.hubrc; `terminal.js` is the line editor, the y/n question state, the redirect parser and the Hub commands.
- **Typing:** one invisible `<input>` takes the keys, so the native phone keyboard, the Hub OSK and paste all work; tap anywhere to focus it. On file:// the Hub cannot reach the frame, so the Hub OSK keys arrive as `{type:'hub-key'}` messages from the parent window (only then, only from the parent).
- **Hub access:** `parent.__hubOpenApp` when the Hub is the same-origin parent; on file:// a `{type:'hub-open-app'}` message to the parent (hub.js only accepts it from its own frame, and ignores a `#hash`: on file:// `open <folder>` and `open <text file>` open Files / Notely without the path; the Viewer opens in a new tab through FsRef).
- **Safety:** all output is plain text (`textContent`), never HTML; file text in the editor goes through `textarea.value` only. Every path is resolved inside a mounted drive handle (`..` stops at `/`), so nothing outside the drives can be touched. cp / mv / rm / mkdir use the shared `FsOps` (shared/fs is unchanged). On file:// Local (browser storage) is not available, same as T2, so a write there reports it.
- **Apps list:** `hub/core/hub_appindex.js` (generated by `hub/core/hub_appindex_gen.py`).
- **Tests hook:** `window.HubTerminal.run(line)` returns a promise; `HubTerminal.fs` is the file layer, `HubTerminal.asking()` tells whether a y/n question waits.

Files: `index.html`, `terminal.js`, `terminal_fs.js`, `terminal_wr.js`, `terminal_edit.js`, `terminal_bb.js`, `terminal_etc.js`, `terminal_rc.js`, `terminal.css`, `terminal_icon.png`, `README.md`, `bin/` (`busybox.wasm`, `busybox.js`, `APPLETS.txt`, `BUILD.md`).
