Team 3 — technical summary. Team disbanded 26 Nov 2026. Full original history: git show aadccda86f1584edbd904b3e3337c8d3331dc382:hub/docs/README_technical_team3.txt (and f3622f86f5a83639d6ed18afa0add109669ed465:hub/docs/README_technical_team3_draft.txt)

Checked against origin/main @ 8235a610 (build 20261123e / hub-shell-v197 / H178). Times IST. Original team3 file 3054 lines; draft 453 lines (10-11 Nov notes, also present as Team 2 sections 1.95-1.111 by mistake). Both are folded in here.

================================================================================
 1. RELEASES DONE
================================================================================

Hub
  Week 1: System / Files / Disk path work (R53-R54b, shared with that
  period); H7 "Show Files on the desktop"; Learn category wiring H9;
  App Hub AH1-AH5 (favourites, #cat=, breadcrumb, 40 px top row);
  Terminal T1-T4 (shell on shared/fs, write/edit; prompt hub@hub);
  docs D / D2 / D3; file:// / SW (FS, SW); ?v= clean-ups NV-S1, NV-S2.
  31 Oct-1 Nov, H72-H86: Home tiles switch; public mesh at startup; SW
  caches bare URLs; shared Hub dialogs; lobby holder; redirect pages;
  /phone.html on the Hub link stack (theme, dialogs, notices); Hub-wide
  DND and attention pop-up; 5-digit codes and public lobby 00000; Mesh
  group chat; phone.html offline cache; Pooh Chat send from a desktop
  window. Also H108a/H108b, H134g, H136 (number-in-use / lease), H137
  (break timing). Later Hub ids H150-H178 were other teams.

Learn
  Category scaffold (learn-apps.csv, learn.html, apps/learn/common,
  First Aid, English Basic). Later: Assamese Letters AL-1; CampCraft
  School CFS-1 (moved into Learn); Driving School DS-2a-DS-8 (traffic,
  trees, buildings); English Letters EL-1; Physics Lab PS1a-PS1g;
  Dictionary DC-1, DC-1a (common meanings first), DC-1b (data rebuild),
  DC-4 (word families and phrases); Blood Group BG-1-BG-6a (ABO/Rh,
  donation, family, myths, health). Nutrition Plate NP work sits here.
  Lab & Scan Report (LAB-1) landed after the last Team 3 doc.

Apps, by family (includes the 10-11 Nov draft, sections 1.95-1.111)
  Agent: confirm dialogs AG42 (HR.confirm, no browser confirm); MCP
  AG44; plus earlier AG-F fixes, AG23-AG27 (HubAPI, providers, image
  gen, Gemini key). Robot icon AG45 is on main (after the draft).
  Office / Writer (10-11 Nov draft plus follow-ons on main): HO2
  (save-problem cards, OfficeDialog, Auto theme follows the Hub, some
  vendors lazy-loaded); Notely window bar NL4 (later word count NL5);
  Writer visible name DF24 (was Draftly) and folder rename to
  apps/office/writer/ (DF25); .how HOW1, .hos HOS1, writing helpers and
  Mail Merge to .hos (DF21, MM8). Tables TB1/TB2/TB4 (card view, linked
  tables, dates) and .hot HOT1 (TB5 ribbon later). Spreadsheet SH13-SH17
  (spill/SEQUENCE, SORT/FILTER/UNIQUE, TEXTSPLIT, ROW/COLUMN/INDIRECT,
  borders). Mid-November suite work on main (much of it under Hub Office
  after 17 Nov): Presentation .hop / Base .hob, OpenDocument, Start Page,
  SPELLNUMBER, File menus, close/save, SH18-SH49 (grid to A-FZ x 1000,
  lazy xlsx, render cache, 1000-row cap) and later SH58 / DW22-DW26.
  Other apps: Code Maker QR1; Shared Clipboard CB2; Compass CP1-CP2;
  Image Gen IG4; Vision VS2; Intercom IC3; Zip ZP1; Relay RY1; Web
  Browser WWW1 and WWW2b-d; Weather Forecast WX1a-f; Remote RM7; Lab
  cleanup LB3; Netlify imports NI1-NI2; tv/ reorganised. SSH S3-S4 and
  Code Lab CL2-CL5 in week 1.

Games
  Week 1 content and restructures: Aquarium, Solar System, Gravity
  Sandbox, Ant Farm, Neon Fist 3D / Hero Builder, LandCraft, Turbo Lap,
  Car Run, Dino Run, Snake, Desert Road, Chess, AoE RTS maps 00-99,
  Neon Fist fighters 00-99, Sling Birds and Demolisher levels, Ping Pong
  themes; pong → ping-pong; Contra → Neon Raid. Later NIX-G1/NIX-G2
  (Island Alpha) and other mid-November per-game ids. From 14 Nov a new
  Games owner took the area; Orbital Core 3D is not this team's.

AI experiment
  v3-v5 (cages, agent.sh flags, MANUAL), v6.0 logs, v6.1 provider/model
  selection (#726). Project path later moved to ai-exp/ai-exp/.

================================================================================
 2. UNFINISHED STUFF
================================================================================

Still open on origin/main @ 8235a610. Omitted because they later shipped:
H166, H169, H173 (Dictionary data now in hub-dict-1), H174-H178, SH58,
DW22-DW26, HO16, LAB-1, Photo Collage. The old "runtime cache keeps
stale Dictionary data" issue was fixed in H173.

Parked (only Jor restarts):
  Hub: H170 lighter background work; H172 fingerprint unlock (both
  parked 22 Nov); H130, H131, PIN retry limit, H139b, H98, Connect-link
  gate, Start-up manager; RL1 follow-ups (Web MCP and Remote onto the
  existing hub/relay).
  Learn: DC-6 self-updating Dictionary data; BG-4 Blood Group quiz;
  FM-1a..1c Flag Master; CS3 (Python); older topic ideas (First Aid
  visuals, Ocean Floor, Flags and Countries, Technology).
  Office: SH50 (grid starts at 500 rows and grows); SH51-SH54 merge
  follow-ups (merge/unmerge itself has been in since SH11).
  Apps: AG41 (duplicate btnPick, Enter-during-reply, mid-stream
  disconnect); AG43 leftovers; Agent long chats on 4 GB PCs (needs a
  new id); MCP2.3, MCP3, PH18, PH3, PH2, VNC2, VNC3, AG22, PW3,
  IV1/IV2, LL3, PV3, WB1-WB4, NVIDIA NIM / saved providers; leftover
  tiled icons (Draw, Paint, Phone in Media). PE1 was cancelled.
  Games: SB1b, NTR1a, ARQ1f, HEX 2D, NIX-G4, Hero Builder, Osmos AI,
  DMQ1c, game sounds.
  AI experiment: browser version (v86 / terminal wasm BusyBox), parked
  indefinitely (no server). v6.1 was mock-tested only, not live-tested
  with real keys (last noted 22 Nov) (unverified since).

Planned or waiting on a go:
  H158c; Learn DC-2, DC-3, DC-5, LRN4 (merge learn/shared into common/),
  LRN3a, NP8; Office SH55 (xlsx cached values), SH56, SH48, SH57 (DW20
  may have been partly overtaken by DW26 — not assumed closed); list
  Transcribe, PhoneKey and vDesktop in Lab/Hub (folders exist under
  tools/ but are not in the Tools or Lab CSV); Games SWAP-1b, AoE Ages,
  Aeroplane review, more Browser FPS maps, 'orbital-core' prefix and a
  shorter CSV blurb.

Open questions for Jor (22 Nov; 1 and 6-9 still match the tree):
  Code Lab listed in both Lab and Learn — which keeps it? Rename
  "Blood Groups"? India Rh-negative figure (app says about 1.5%; some
  surveys 5-7%)? DS-8 shop awning size? DC-4 hide rare words in the
  family list? List pdf-viewer-old or keep it hidden? hero-builder
  (199 committed node_modules files, not in the CSV) and leftover
  contra-alpha: keep, move or remove? Blank line in games-apps.csv
  (line 54)? Should Hero Builder be listed? Add 'orbital-core' to
  GAME_PREFIXES and shorten its CSV blurb? Clean up merged branches
  (needs Jor's OK)? DC-1b: should Dictionary About keep "derived from
  Princeton WordNet 3.0"?

================================================================================
 3. OTHER MISC
================================================================================

- How we work fast (keep): one owner per area; small named releases
  (one commit, one PR, letter follow-ups); discuss first, then build
  only on Jor's word (plain id / "plan" → wait; "Code" → commit
  locally; "Push" → PR and merge; "Code n push" → both; "Park X" →
  stop); fresh worktree from origin/main; read only what you touch;
  pure logic plus tiny node tests; static, phone-first, file://.
- Git: stage by name, never git add -A; merge origin/main in, no
  rebase or force, merge-commit PRs; never delete /workspace/sites_apps
  or sites_games; never commit
  apps/games/ar-game/vendor/three/build/three.module.min.js;
  no port 8811. Commit identity for everyone is
  jor-teron <1854500+jor-teron@users.noreply.github.com>.
- Hub bump only with hub_bump.py, only for Hub runtime changes, only
  when Jor says so (Learn / Office / Games / Apps / docs do not bump).
  Comment replaced code with "(before <id>)". Never pass --help to
  hub_appindex_gen.py; after a Learn CSV edit, regen hub_catalog.js
  and drop stray non-Learn rows from that diff by hand.
- Decisions still useful: category CSVs are the source of truth (do
  not reorder hub_config.js); moved apps keep a redirect at the old
  path and the same storage keys; SSH stays in apps/connectivity/ssh
  (Terminal must load those modules, not copy them); Weather Simulator
  belongs to Apps, not Learn; Games generation is seeded.
- Care: Dictionary data files are huge single lines — regenerate with
  apps/learn/dictionary/tools/build_data.py and check sha256 over
  sorted files (LC_ALL=C sort). Shards use cache hub-dict-1 (H173).
  Driving School 3D: under 400 meshes, Lambert/basic, no shadows or
  textures, InstancedMesh for repeats. Spreadsheet cap 1000 rows; load
  lazy sheets before save/export/find. OfficeDialog / HubTitleBar are
  the shared UI patterns. File types: .how → Writer (draftly/
  redirects), .hos → Spreadsheet, .hot → Tables.
- From 14-17 Nov: Games had a new owner; Learn went to Hub Teacher;
  Office to Hub Office. All of it is now with Team 1.
