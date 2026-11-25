Team 2 — technical summary. Team disbanded 26 Nov 2026. Full original history: git show 4da77905a6b4dcd9170f3d5f4e29fde63a09e513:hub/docs/README_technical_team2.txt

Checked against origin/main @ 8235a610 (build 20261123e / hub-shell-v197 / H178). Times IST. The original file is 7337 lines of week notes and per-release write-ups; this is only a short summary.

================================================================================
 1. RELEASES DONE
================================================================================

Hub
  Early catalog and System work (Oct, with the first handover): R53-R59
  and neighbours — Settings / Files / Viewer and related apps moved to
  apps/system/; Disk; desktop Files pane; Learn category wiring (H9);
  app descriptions in CSVs (H48d).
  While this team later held the Hub (about H65, H104, H121-H157): shell
  and desktop path moves (H129a-e: site root index.html chooses Desktop
  or Phone; hub.html removed; desktop/desktop.html is the desk), Look
  (Glass / XP), boot and lock work of that period, and catch-ups H156
  (Favourites) and H157. Later Hub ids (H158 onward, including H174-H178)
  were not this team's.

Apps, by family
  Office: Spreadsheet (sheets, freeze, formulas, data tools, format,
  charts, themes — through about SH12 in this team's own notes, later
  SH work continued under Hub Office); Base BS3-BS9 (safe start, delete
  safety, undo, field types, links, reports, views, backup); Slides
  SL1-SL10 (present, layouts, ribbon, rich text, shapes, presenter
  tools, themes, export, start-up crash fix); shared Office HO1 (quick
  access / title-bar helper). Writer began here as Draftly; the later
  rename to apps/office/writer/ and .how/.hos/.hot formats are on main
  (see Other misc). PDF Tools P2-P5 (merge/split, images, stamp, fill
  and sign). PDF Viewer OCR PV2.
  Connectivity: SSH; Screen Share SS1; Video Chat VC1-VC2; Whiteboard
  WB1; Shared Clipboard CB1; Intercom IC1-IC2 (video, trusted
  auto-answer); Telephone TP1-TP2b (P2P calls, contacts, missed calls,
  DND, video, 5-digit numbers); Multi-Screen Wall MW1; Live Location
  LL2 (history); Remote RM work also appears later in the file.
  Phone launcher: PH1, then PH14-PH16 and PH19 (Connect on the phone,
  remember mode / Switch to Desktop / Choose mode, shade and dock,
  Recent apps).
  Media: Camera; Sound Recorder; Photo Editor v2 PE5 (sharpen, resize);
  Photo Studio HPS1-HPS2 and HPS5.4-HPS6 (layers, .hps / .ora, title
  bar, close project); Music Player MP1; Video Editor VD1-VD3 (join,
  looks, transform, speed, titles); Video Player VPL1-VPL3; Image
  Converter CI1-CI3; 3D Builder TD1-TD3; Read Aloud RA1-RA2 (PDF, web
  page, sleep timer).
  Tools: Stopwatch (the "Stopwatch style" reference app); Unit
  Converter; Calendar; Astrology AS1-AS3 (Western and Vedic); Numerology
  NU1; Sun Position SP1-SP3; Password Manager PW1-PW2; Invoice Maker
  INV1; Expense Tracker EXT1; My Day MD3 (Auto theme follows the Hub).
  Lab / Agent: Code Lab; MyBookmark; ONNX Runner; Image Gen IG3 (IG2
  skipped); Vision VS1; Agent AG21 (download names, model favourites)
  and later Agent follow-ups recorded in this file.
  Icons and moves: IC1-IC9 (plain / colourful category icons); MV1-MV3
  (Invoice / Expense to Tools; some Lab apps moved to Media, Tools,
  Office and Learn). Nutrition Plate NP2-NP7 is in this file but sits
  under Learn.

  Note: sections 1.95-1.111 in the original (AG42, HO2, NL4, RM7, AG44,
  SH13-SH17, TB1-TB4, DF24, HOW1, HOS1, HOT1) were Team 3's 10-11 Nov
  notes, written into this file by mistake. They are on main, but they
  are not Team 2 releases.

Games
  Catalog and many titles under apps/games/ (Puzzle, Arcade, Runners,
  Strategy, 3D, Lab). Notable shipped work: Neon Raid (ex Contra
  Alpha; old path redirects); Island Conquest; Chess; Desert Road;
  Car Run; Turbo Lap; Snake refactor; AoE RTS (procedural maps,
  villagers, animals, saves); Neon Fist and Neon Fist 3D; Gravity
  Sandbox and Ant Farm (Lab section). Later merges recorded here
  include G-FIX1, Go, Blockade, SHIP-1, Ludo LUDO-1a-c, Orbito ORB-1,
  Pinball PIN-1a, and further titles through mid-November (Sweet Swap,
  Garden Guard, Jigsaw and others). Generation is seeded and
  deterministic. D-Pad Controller left the Games CSV and is a System
  app (R53c).

================================================================================
 2. UNFINISHED STUFF
================================================================================

Still open on origin/main @ 8235a610 (items later shipped — H149, H164,
H166, H169, H173-H178, DS-6-DS-8, Dictionary hub-dict-1 cache — are
omitted).

Parked (only Jor restarts):
  Hub: H170 lighter background work; H172 fingerprint unlock (both
  parked 22 Nov); H130, H131, PIN retry limit, H139b, H98, Connect-link
  gate, Start-up manager; RL1 follow-ups (Web MCP and Remote onto the
  existing hub/relay).
  Apps: WB1-WB4 (Remote Web Browser on relay), WWW1, WP1, MCP3, PV3,
  IV1/IV2, LL3, PH2, PW3; AG41 (duplicate btnPick and related Agent
  bugs) and AG43 leftovers; Agent long chats on 4 GB machines need a
  new id.
  Office (handed on, still listed): HO12a, PN5/BS15, BS13+TB7, PT1,
  SH26, TB6, SH34, DW13a, Sketchbook in-app dialogs.
  Games: SB1b, NTR1a, ARQ1f, HEX 2D, NIX-G4, Hero Builder, Osmos AI,
  DMQ1c, game sounds.
  Learn (handed on): FM-1a..1c Flag Master, CS3.

Waiting or unresolved:
  H158c stronger live wallpapers / high-DPI (offered, no go).
  Hub-wide default apps per file type; Files follow-ups for .txt /
  .hslides / .hbase (those two extensions are not in
  shared/fs/filetypes.js yet).
  Games: SWAP-1b Sweet Swap animations; AoE Ages (discussion);
  Aeroplane review (apps/games/aeroplane, Lab copy at
  apps/lab/aeroplane); more Browser FPS maps; add 'orbital-core' to
  GAME_PREFIXES (Orbital Core 3D is in the CSV, prefix is missing);
  hero-builder (199 committed node_modules files, not in the CSV) and
  leftover contra-alpha; blank line in games-apps.csv (line 54).
  Code Lab is listed in both Lab and Learn (still true).
  Writer formatting in a Hub Office tab: retest was still outstanding
  on 18 Nov (unverified since).
  Real-device checks called out in older notes (Google sign-in, phone
  join, some Hub releases) (unverified).

================================================================================
 3. OTHER MISC
================================================================================

- Ownership now (team disbanded): Hub, desktop/, apps/system/ and
  shared/ (except Office shared) went to Hub Builder / Team 1; Office
  (apps/office/**) to Hub Office; Learn to Hub Teacher; Games stayed
  under a Games builder (scope was already shared after 14 Nov).
  phone/ and phone.html left this team's Apps builder for Phone work
  (do not treat them as Hub-shell files).
- Site entry is index.html (sites-hub.mode, ?os=, ?choose) →
  desktop/desktop.html or phone.html. hub.html is gone; the service
  worker maps old /hub.html to index.html. H129 forwarder shims under
  hub/menu/ and hub/wm/ were removed later (H177).
- Category CSVs (apps/<cat>/<cat>-apps.csv) are the source of truth.
  Regen hub_catalog.js with hub_appindex_gen.py --catalog-only only
  when Jor asks; never pass --help.
- File types on main: .how → Writer (apps/office/writer/; draftly/ is
  a redirect), .hos → Spreadsheet, .hot → Tables
  (shared/fs/filetypes.js). Photo Studio: .hps / .ora. Prefs:
  sites-hub.*.
- Conventions: only Jor's words approve plan / code / push; fresh
  worktree from origin/main; stage by name, never git add -A; merge
  main in, no rebase or force, merge-commit PRs; do not delete old
  code (comment with "(before <id>)"); Hub bumps only with
  hub_bump.py when Jor says so; commit identity for everyone is
  jor-teron <1854500+jor-teron@users.noreply.github.com>; never delete
  /workspace/sites_apps or sites_games; never commit
  apps/games/ar-game/vendor/three/build/three.module.min.js; no port
  8811; lists not wide tables; times in IST.
- Moved apps keep a redirect page at the old path and the same
  saved-data keys (e.g. apps/settings/ → apps/system/settings/).
