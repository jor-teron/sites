# ai-exp: AI sandbox experiments

Gemini "companions" in offline BusyBox cages (unprivileged Linux
namespaces). Every command they run is logged. One script, flags and
presets choose the setup. **Full guide: [MANUAL.md](MANUAL.md).**

```
export GEMINI_API_KEY=...                       # or ai/ai-exp/.env
./agent.sh exp1 "Explore and keep notes"        # one companion (preset v2, the default)
./agent.sh -c exp1                              # next session, same saved flags
./agent.sh pair1 --ai2ai                        # two companions, separate cages, shared /srv + localhost
./agent.sh ctl1 --ai2ai --solo                  # control run: one companion, same pace
./agent.sh duo --companions 2 --time 120        # two companions in one shared cage
./agent.sh --help                               # one screen;  --help all  for every flag
```

Presets: `v1` (no memory), `v2` (default), `v3` (2 in one cage), `v4`
(exact old v4), `ai2ai` (v4 setup, "no internet access" wording). Flags
after a preset override it. Settings are saved in `<exp>/.run/flags` and
reused by `--continue`; experiments made before v5 are recognized.

Layout: `agent.sh` (launcher), `module/flags.sh` (flags, presets, help),
`module/*.sh` (cage, API, sessions, companions, turns, discovery),
`misc/agent.py` (old Python version), `experiments/` (gitignored).

Needs: bash, curl, jq, static busybox, util-linux (unshare, nsenter), chroot.
