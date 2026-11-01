#!/usr/bin/env python3
"""
AI Sandbox Experiment
Let an AI roam freely inside an offline BusyBox cage for a fixed time,
and record everything it does.

Usage:
    python3 agent.py <experiment-name> "<prompt>"
    python3 agent.py exp-001 "You're alone on a tiny Linux machine. Do whatever you like."

API key (first one found wins):
    1. GEMINI_API_KEY or GOOGLE_API_KEY environment variable
    2. A file named .env next to this script containing:  GEMINI_API_KEY=your_key
    3. Typed in at the prompt when the script starts (hidden input)

Needs on the host: Python 3.8+, busybox (static build), unshare and chroot (util-linux).
"""

import getpass
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

# ---------------------------------------------------------------- settings
TIME_LIMIT   = 150   # seconds for the whole run
REQUEST_GAP  = 5     # minimum seconds between API requests (15 RPM limit -> 12 RPM)
CMD_TIMEOUT  = 15    # seconds before a single command is killed
MAX_OUTPUT   = 4000  # characters of command output sent back to the AI
MODEL        = os.environ.get("AI_MODEL", "gemini-3.1-flash-lite")
API_URL      = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- helpers
def clock():
    return datetime.now().strftime("%H:%M:%S")


def fail(message):
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def load_api_key():
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value

    env_file = os.path.join(SCRIPT_DIR, ".env")
    if os.path.isfile(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    line = line[len("export "):]
                if "=" in line and not line.startswith("#"):
                    name, value = line.split("=", 1)
                    if name.strip() in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                        value = value.strip().strip('"').strip("'")
                        if value:
                            return value

    if sys.stdin.isatty():
        value = getpass.getpass("Gemini API key (input hidden): ").strip()
        if value:
            return value

    fail("No API key found. Set GEMINI_API_KEY, put it in .env next to the script, "
         "or type it when asked.")


# ---------------------------------------------------------------- the cage
def build_cage(cage):
    busybox = shutil.which("busybox")
    if not busybox:
        fail("busybox not found. Install it with: sudo apt install busybox-static")
    for tool in ("unshare", "chroot"):
        if not shutil.which(tool):
            fail(f"{tool} not found. Install util-linux / coreutils.")

    for folder in ("bin", "home", "tmp"):
        os.makedirs(os.path.join(cage, folder), exist_ok=True)

    cage_busybox = os.path.join(cage, "bin", "busybox")
    shutil.copy2(busybox, cage_busybox)

    # One symlink per applet (ls, cat, vi, ...), all pointing at the cage's busybox.
    applets = subprocess.run([cage_busybox, "--list"], capture_output=True, text=True).stdout.split()
    for applet in applets:
        link = os.path.join(cage, "bin", applet)
        if not os.path.exists(link):
            os.symlink("busybox", link)


def run_in_cage(cage, command, timeout):
    # Fresh namespaces for every command: own user (mapped root), no network,
    # own process tree, own mounts, own hostname. Root of the filesystem = the cage.
    argv = ["unshare", "--user", "--map-root-user", "--net", "--pid", "--fork",
            "--mount", "--uts", "chroot", cage, "/bin/sh", "-c", f"cd /home; {command}"]
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                                env={"PATH": "/bin", "HOME": "/home", "TERM": "dumb"})
    except subprocess.TimeoutExpired:
        return f"(command killed after {timeout}s)"
    output = (result.stdout + result.stderr).strip() or "(no output)"
    if len(output) > MAX_OUTPUT:
        output = output[:MAX_OUTPUT] + "\n...(output cut)"
    return f"{output}\n[exit code {result.returncode}]"


def check_cage(cage):
    test = run_in_cage(cage, "echo cage-ok", 5)
    if "cage-ok" not in test:
        fail("The sandbox couldn't start. This usually means unprivileged user namespaces "
             "are turned off. Try: sudo sysctl -w kernel.unprivileged_userns_clone=1\n"
             f"Details: {test}")


# ---------------------------------------------------------------- the AI
TOOLS = [{
    "type": "function",
    "function": {
        "name": "run_shell",
        "description": "Run a shell command inside the sandbox and get its output.",
        "parameters": {
            "type": "object",
            "properties": {"command": {"type": "string", "description": "The shell command to run"}},
            "required": ["command"],
        },
    },
}]


def ask_ai(api_key, messages, timeout):
    body = json.dumps({"model": MODEL, "messages": messages, "tools": TOOLS}).encode()
    request = urllib.request.Request(API_URL, data=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)["choices"][0]["message"]
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise RuntimeError(f"HTTP {e.code}: {detail}")


# ---------------------------------------------------------------- main run
def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    name, prompt = sys.argv[1], sys.argv[2]
    api_key = load_api_key()

    exp_dir = os.path.abspath(name)
    cage = os.path.join(exp_dir, "cage")
    if os.path.exists(exp_dir):
        fail(f"'{name}' already exists. Pick a new experiment name.")
    os.makedirs(exp_dir)
    build_cage(cage)
    check_cage(cage)

    log_file = open(os.path.join(exp_dir, "log.md"), "w")

    def record(text):
        print(text, flush=True)
        log_file.write(text + "\n")
        log_file.flush()

    start = time.time()
    end = start + TIME_LIMIT
    end_text = datetime.fromtimestamp(end).strftime("%H:%M:%S")

    def seconds_left():
        return max(0, int(end - time.time()))

    record(f"# Experiment {name}")
    record(f"Model: {MODEL}")
    record(f"Started: {datetime.now():%Y-%m-%d %H:%M:%S}, ends {end_text} ({TIME_LIMIT}s)\n")
    record(f"## Prompt\n{prompt}\n")
    record("## Steps")

    system_prompt = (
        f"You are an AI alone inside a tiny offline Linux sandbox. Only BusyBox commands exist "
        f"and there is no network. You have exactly {TIME_LIMIT} seconds: you started at {clock()} "
        f"and must finish by {end_text}. You get one turn every {REQUEST_GAP} seconds "
        f"(about {TIME_LIMIT // REQUEST_GAP} turns), so you may chain commands with ; or && in one call. "
        f"The time left is shown after every command. Act only by calling the run_shell tool. "
        f"Your home folder is /home. Keep a journal at /home/journal.md: append a line with the "
        f"time (use the date command) and what you are doing and why. Before time runs out, "
        f"append a short final summary to the journal."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    last_request = 0.0
    turn = 0
    while True:
        wait = REQUEST_GAP - (time.time() - last_request)
        if wait > 0:
            if wait >= seconds_left():
                break
            time.sleep(wait)
        if seconds_left() <= 0:
            break

        last_request = time.time()
        turn += 1
        try:
            reply = ask_ai(api_key, messages, timeout=max(5, seconds_left()))
        except Exception as e:
            record(f"- {clock()} API error: {e}")
            continue

        messages.append(reply)
        thought = (reply.get("content") or "").strip()
        if thought:
            record(f"- {clock()} [turn {turn}] thought: {thought}")

        calls = reply.get("tool_calls") or []
        if not calls:
            messages.append({"role": "user",
                             "content": f"[{seconds_left()}s left] Carry on, or do anything else you like."})
            continue

        for call in calls:
            try:
                command = json.loads(call["function"].get("arguments") or "{}").get("command", "")
            except json.JSONDecodeError:
                command = ""
            if not command:
                output = "(no command given)"
            else:
                record(f"- {clock()} [turn {turn}] $ {command}")
                output = run_in_cage(cage, command, min(CMD_TIMEOUT, max(1, seconds_left())))
                record("```\n" + output + "\n```")
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""),
                             "content": f"{output}\n[{seconds_left()}s left]"})

    record(f"\n## Time's up at {clock()} after {turn} turns")
    record(f"Experiment folder: {exp_dir}")
    record(f"AI journal: {os.path.join(cage, 'home', 'journal.md')}")
    log_file.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by you.")
