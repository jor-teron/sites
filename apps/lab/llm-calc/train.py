# !pip install -q optimum onnx onnxruntime gguf protobuf
# ^ OPTIONAL. Remove the "# " at the start of the line above to pre-install the
#   export tools. You don't have to: the export section installs anything
#   that's missing by itself. (Kaggle already has torch, transformers,
#   datasets and tokenizers.)

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  TINY LLM TRAINER  v3.5                                                  ║
# ║  Trains a small Llama-style language model from scratch on YOUR text     ║
# ║  (an uploaded .txt file or folder, or a Hugging Face dataset),           ║
# ║  then exports it as: Hugging Face folder, GGUF (+ Ollama Modelfile),     ║
# ║  ONNX and int8 ONNX, and zips everything into one download.              ║
# ║                                                                          ║
# ║  How to use: paste this whole file into ONE Kaggle cell, OR keep it on   ║
# ║  GitHub and run it from a tiny cell (see kaggle_cell.py) with exec().    ║
# ║  Any setting the tiny cell defines WINS over the values below.           ║
# ║  Settings → Accelerator: "GPU T4 x2", Internet: On. Then run the cell.   ║
# ║  The only part you normally edit is the SETTINGS block below.            ║
# ╚══════════════════════════════════════════════════════════════════════════╝


# Remember any settings the Kaggle cell already defined BEFORE running this
# script (with exec). The defaults below would otherwise overwrite them, so right
# after the SETTINGS block we put the cell's values back. Order of priority:
#   script defaults  <  CONFIG_FILE JSON  <  values set in the Kaggle cell.
CELL_VALUES = {k: v for k, v in dict(globals()).items() if k.isupper()}

# ════════════════════════════════════════════════════════════════════════════
#  SETTINGS  (everything you might want to change lives here)
# ════════════════════════════════════════════════════════════════════════════

# ---------- Name and folders ----------
MODEL_NAME   = "tiny-v3.5"          # Name for this run. Used for the output folder,
                                    # the GGUF file, the Ollama model and the zip.
                                    # Change it for every new run so old results
                                    # aren't overwritten (e.g. "tiny-v3.3").
OUTPUT_ROOT  = "/kaggle/working"    # Where results go. On Kaggle, only files under
                                    # /kaggle/working can be downloaded afterwards.
LLAMA_CPP_DIR = "/kaggle/working/llama.cpp"  # Where llama.cpp (the GGUF converter)
                                    # lives. If it isn't there, the script downloads it.
                                    # It is NOT included in the final zip.

# ---------- Data ----------
DATA_PATH    = "/kaggle/input/my-dataset/TinyStories-valid.txt"
                                    # WHERE your training text is. Options:
                                    #  1. A web link (URL) starting with http(s)://.
                                    #     It is downloaded once and cached, so re-runs
                                    #     skip the download. .txt, .zip, .gz and
                                    #     .tar.gz all work (archives are unpacked and
                                    #     every .txt inside is read). Examples:
                                    #     GitHub Pages:
                                    #      "https://jor-teron.github.io/sites/datasets/data.txt"
                                    #     Hugging Face (use /resolve/, not /blob/):
                                    #      "https://huggingface.co/datasets/roneneldan/TinyStories/resolve/main/TinyStories-valid.txt"
                                    #     Raw GitHub:
                                    #      "https://raw.githubusercontent.com/USER/REPO/main/data.txt"
                                    #     HF ".../blob/..." and "github.com/.../blob/..."
                                    #     page links are fixed for you automatically.
                                    #     NOTE: GitHub Pages / GitHub refuse files over
                                    #     ~100 MB. For big files, use Hugging Face.
                                    #  2. One local .txt file, e.g.
                                    #     "/kaggle/input/my-dataset/stories.txt"
                                    #  3. A local folder: every .txt file inside it (and
                                    #     in its sub-folders) is read, in A-Z order.
                                    #  4. A Hugging Face dataset: write "hf:" + its name,
                                    #     e.g. "hf:roneneldan/TinyStories". Uses its
                                    #     "text" column and "train" split (needs Internet).
                                    #  5. A LIST of any of the above, e.g.
                                    #     ["https://.../a.txt", "https://.../b.zip"].
                                    #     They are read in order and combined.
STORY_SEPARATOR = "<|endoftext|>"   # How one long file is cut into samples (pieces of
                                    # text the model learns from, e.g. stories):
                                    #  "<|endoftext|>" = split wherever this marker
                                    #       appears (that's how the TinyStories files
                                    #       are made). Any other text marker works too.
                                    #  "blank_line" = split on empty lines, so each
                                    #       paragraph / block of lines is one sample.
                                    #  "line" = every single line is its own sample
                                    #       (good for lists of sentences or Q&A pairs).
                                    # Ignored for "hf:" datasets (each row = one sample).
MAX_SAMPLES  = None                 # Use at most this many samples (taken from the
                                    # start of the data). None = use everything.
                                    # Handy for a quick test: 2_000 runs in a minute or
                                    # two; then set it back to None for the real run.
VAL_FRACTION = 0.05                 # Share of samples held back for testing (0.05 =
                                    # 5%). The model never learns from these, so its
                                    # score on them shows real learning, not memorising.
                                    # Samples are shuffled (using SEED) before the split,
                                    # and at least 1 sample is always held back.
MIN_CHARS    = 1                    # Drop samples shorter than this many characters
                                    # (after trimming spaces). 1 = only drop empty ones.
                                    # Raise it (e.g. 20) to skip tiny scraps of text.

# ---------- Tokenizer ----------
VOCAB        = 4096                 # Vocabulary size: how many different "tokens"
                                    # (word pieces) the model knows. Bigger = common
                                    # words stay whole, so text is shorter, but the
                                    # model gets bigger (VOCAB x HIDDEN extra weights).
                                    # 4096 suits a small dataset like TinyStories-valid
                                    # (~22k stories). For big data (e.g. 300k+ stories)
                                    # use 8192.

# ---------- Model size (these four decide the parameter count) ----------
SEQ          = 256                  # Context length: how many tokens the model reads
                                    # at once. Longer = it remembers more of the story,
                                    # but training uses more memory and is slower.
                                    # Most TinyStories stories fit in ~200 tokens.
HIDDEN       = 256                  # Model width: the size of each token's internal
                                    # "thought vector". Bigger = smarter, bigger, slower.
LAYERS       = 6                    # Model depth: how many processing blocks are
                                    # stacked. More = smarter and bigger, but slower.
FFN          = 704                  # Width of the "thinking" layer inside each block
                                    # (feed-forward / MLP). Usually ~2.7x HIDDEN.
HEADS        = 8                    # Attention heads: how many separate "spotlights"
                                    # look at earlier tokens. HIDDEN must divide evenly
                                    # by HEADS (256 / 8 = 32 per head).
KV_HEADS     = 8                    # Key/value heads. Same as HEADS = classic
                                    # attention. Smaller (e.g. 2 or 4, must divide HEADS)
                                    # = "grouped-query attention": a bit smaller and
                                    # faster to run, slightly lower quality.
                                    # With these settings: about 5.8M parameters, a good
                                    # size for ~22k stories (a bigger model would mostly
                                    # memorise them). For big data (300k+ stories) go
                                    # back to v3's sizes: HIDDEN 512, LAYERS 7,
                                    # FFN 1376, VOCAB 8192 (about 26M parameters).
TIE_EMBEDDINGS = True               # True = the input word table and the output word
                                    # table share one set of weights. Saves VOCAB x HIDDEN
                                    # parameters (a smaller file) with little quality loss.

# ---------- Training ----------
EPOCHS       = 5                    # Full passes over the training data. Every text
                                    # block is seen exactly once per epoch. More =
                                    # more learning, but too many and the model starts
                                    # memorising instead of learning (watch val loss).
BATCH_PER_GPU = 32                  # Text blocks each GPU handles per step. Total
                                    # batch = this x number of GPUs. Bigger = smoother,
                                    # fewer steps, more GPU memory. If you get an
                                    # "out of memory" error, lower this (e.g. 16).
USE_ALL_GPUS = True                 # True = use every GPU (both on T4 x2) in parallel.
GRAD_ACCUM_STEPS = 4                # Gradient accumulation: run this many smaller batches,
                                    # add up what they learned, then update ONCE. Same
                                    # result as a batch this many times bigger, but needs
                                    # only the memory of one small batch. 1 = off.
                                    # Effective batch = BATCH_PER_GPU x GPUs x GRAD_ACCUM_STEPS.
AUTO_BATCH   = True                 # True = before training, try one step. If the GPU runs
                                    # out of memory, halve BATCH_PER_GPU and double
                                    # GRAD_ACCUM_STEPS (same effective batch) and retry.
GRADIENT_CHECKPOINTING = False      # True = save lots of GPU memory (the model re-computes
                                    # in-between results instead of storing them) at the
                                    # cost of ~30% slower training. Try it if you get
                                    # "out of memory" even with a small batch.
                                    # False = use only one GPU.
LR           = 6e-4                 # Learning rate (0.0006): how big each learning
                                    # step is. Too high = training goes unstable (loss
                                    # jumps or becomes "nan"); too low = slow learning.
MIN_LR_RATIO = 0.1                  # At the end of training the learning rate has
                                    # slowly dropped to LR x this (10%). 0 = all the way
                                    # down to zero.
WARMUP       = 200                  # Steps at the start where the learning rate ramps
                                    # up from 0 to LR, so the fresh model isn't shocked
                                    # by big updates.
WEIGHT_DECAY = 0.1                  # Gently pulls weights toward zero each step, which
                                    # helps the model generalise. 0 = off.
GRAD_CLIP    = 1.0                  # Caps how big a single update can be. Protects
                                    # against rare huge jumps that wreck training.
SEED         = 42                   # Random seed. The same seed and settings give
                                    # (nearly) the same result. Change it for variety.

# ---------- Progress, testing and saving ----------
LOG_EVERY        = 100              # Print a progress line every this many steps.
EVAL_EVERY       = 200              # Test on the validation set every this many steps
                                    # (also always at the end of each epoch).
EVAL_BATCHES     = 50               # How many batches each test uses. More = more
                                    # accurate test score, but each test takes longer.
CHECKPOINT_EVERY = 500              # Save a backup of the model every this many steps,
                                    # into <output>/checkpoint. 0 = no backups.

# ---------- Sample text after training ----------
PROMPTS        = ["Once upon a time", "The little dog"]  # Story openings to try.
TEMPERATURE    = 0.8                # Creativity. Lower (0.3) = safer, more repetitive.
                                    # Higher (1.2) = more surprising, more mistakes.
TOP_K          = 40                 # At each word, only pick from the 40 most likely
                                    # tokens. Lower = safer; higher = more variety.
MAX_NEW_TOKENS = 120                # How many tokens to write per sample.

# ---------- Exports ----------
EXPORT_GGUF      = True             # Make a .gguf file for llama.cpp / Ollama / LM Studio.
GGUF_TYPE        = "q8_0"           # GGUF precision: "q8_0" (about 1 byte per weight,
                                    # near-perfect quality), "f16" (2 bytes) or "f32"
                                    # (4 bytes, exact). Q4 types need llama.cpp's
                                    # separate quantize tool and aren't made here.
EXPORT_ONNX      = True             # Make an ONNX file (for web apps, Android, etc.).
EXPORT_ONNX_INT8 = True             # Also make a smaller int8 copy of the ONNX file
                                    # (~4x smaller, slightly lower quality).
MAKE_ZIP         = True             # Zip the whole output folder into one download.

# ════════════════════════════════════════════════════════════════════════════
#  CONFIG FILE (optional) — load settings from the LLM Calculator
# ════════════════════════════════════════════════════════════════════════════
CONFIG_FILE = None                  # None = use the settings written above.
                                    # Or a path to the calculator's "Download config"
                                    # JSON, e.g. "/kaggle/input/my-configs/tiny.json",
                                    # or a web link, e.g.
                                    # "https://jor-teron.github.io/sites/configs/tiny.json"
                                    # (needs Internet ON in Kaggle). Values in the file
                                    # REPLACE the matching settings above. DATA_PATH,
                                    # STORY_SEPARATOR, MIN_CHARS and the export switches
                                    # always come from this script, not the file.
DRY_RUN     = False                 # True = load settings, build the model on the CPU,
                                    # print its size and memory estimate, then stop
                                    # (no data, no training). Handy for checking a config.

# ════════════════════════════════════════════════════════════════════════════
#  END OF SETTINGS — you don't need to change anything below this line.
# ════════════════════════════════════════════════════════════════════════════

# Put back every setting the Kaggle cell defined (see CELL_VALUES at the top).
# Only names that are real settings count; anything else (like SCRIPT_URL) is ignored.
FROM_CELL = set()
for _k, _v in CELL_VALUES.items():
    if _k in globals() and _k not in ("CELL_VALUES", "FROM_CELL"):
        globals()[_k] = _v
        FROM_CELL.add(_k)


# ════════════════════════════════════════════════════════════════════════════
#  1. IMPORTS AND SETUP
# ════════════════════════════════════════════════════════════════════════════
import os, sys, json, math, time, random, shutil, subprocess, zipfile, warnings
import importlib, importlib.util

# Memory tip for PyTorch: "expandable segments" lets it reuse GPU memory in a
# smarter way (less waste from fragmentation). Must be set BEFORE torch is imported.
if "PYTORCH_CUDA_ALLOC_CONF" not in os.environ:
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import numpy as np
import torch
import gc

# The "out of memory" error type (older torch versions keep it under torch.cuda).
OOM_ERROR = getattr(torch, "OutOfMemoryError", torch.cuda.OutOfMemoryError)
# Hidden TEST switch (not for normal use): pretend the GPU runs out of memory when
# the batch per GPU is bigger than this number. Lets us test AUTO_BATCH on a CPU.
_SIM_OOM = int(os.environ.get("_SIMULATE_OOM_ABOVE_BATCH", "0") or 0)

# Print each line immediately instead of in bursts.
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

# Hide two harmless, noisy warnings: the "gather along dimension 0" one from
# two-GPU training, and tokenizers' fork warning.
warnings.filterwarnings("ignore", message=".*gather along dimension 0.*")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from datasets import load_dataset
from tokenizers import Tokenizer, models, trainers, pre_tokenizers, decoders
import transformers
from transformers import LlamaConfig, LlamaForCausalLM, PreTrainedTokenizerFast

# All output paths, built from the settings.
OUT_DIR   = os.path.join(OUTPUT_ROOT, MODEL_NAME)   # everything for this run
FINAL_DIR = os.path.join(OUT_DIR, "hf_model")       # final Hugging Face model folder
CKPT_DIR  = os.path.join(OUT_DIR, "checkpoint")     # latest backup during training
ONNX_DIR  = os.path.join(OUT_DIR, "onnx")           # ONNX files
os.makedirs(OUT_DIR, exist_ok=True)


def fmt_time(seconds):
    """Turn a number of seconds into a readable '1h 02m 03s' style string."""
    seconds = int(max(0, seconds))
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{h}h {m:02d}m {s:02d}s" if h else f"{m}m {s:02d}s"


def section(title):
    """Print a big header so you can find each stage in the output."""
    print("\n" + "=" * 70 + f"\n  {title}\n" + "=" * 70, flush=True)


# ════════════════════════════════════════════════════════════════════════════
#  1b. LOAD THE CONFIG FILE (only if CONFIG_FILE is set)
# ════════════════════════════════════════════════════════════════════════════
# The settings a config file is allowed to change, and the type each must be.
# "int_or_none" means a whole number or null (null = None = "no limit").
CONFIG_KEYS = {
    "MODEL_NAME": "str", "VOCAB": "int", "SEQ": "int", "HIDDEN": "int",
    "LAYERS": "int", "FFN": "int", "HEADS": "int", "KV_HEADS": "int",
    "TIE_EMBEDDINGS": "bool", "EPOCHS": "int", "BATCH_PER_GPU": "int",
    "USE_ALL_GPUS": "bool", "LR": "float", "WARMUP": "int",
    "WEIGHT_DECAY": "float", "GRAD_CLIP": "float", "SEED": "int",
    "MAX_SAMPLES": "int_or_none", "VAL_FRACTION": "float",
    "GRAD_ACCUM_STEPS": "int", "AUTO_BATCH": "bool", "GRADIENT_CHECKPOINTING": "bool",
}
FROM_CONFIG = set()      # names of settings that the file changed
CALC_ESTIMATES = {}      # the calculator's own predictions (_estimates), for comparing


def read_config_text(source):
    """Return the text of the config file, from a local path or a web link."""
    if source.startswith(("http://", "https://")):
        import urllib.request, urllib.error
        print(f"Downloading config: {source}")
        try:
            req = urllib.request.Request(source, headers={"User-Agent": "tiny-llm-train"})
            with urllib.request.urlopen(req, timeout=30) as r:   # give up after 30 seconds
                text = r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            raise SystemExit(f"ERROR: could not download CONFIG_FILE ({e.code} {e.reason}).\n"
                             f"  Check the link opens in your browser: {source}")
        except Exception as e:
            raise SystemExit(f"ERROR: could not download CONFIG_FILE: {e}\n"
                             "  Is Internet turned ON in the notebook settings?")
        # A web PAGE instead of the plain file (e.g. a github.com/.../blob/... link).
        if text.lstrip()[:1] == "<":
            raise SystemExit("ERROR: the CONFIG_FILE link returned a web page (HTML), not JSON.\n"
                             "  Use the plain-file link instead, e.g.\n"
                             "    https://<user>.github.io/<repo>/path/config.json  or\n"
                             "    https://raw.githubusercontent.com/<user>/<repo>/main/path/config.json\n"
                             "  (not https://github.com/<user>/<repo>/blob/...)")
        return text
    if not os.path.isfile(source):
        raise SystemExit(f"ERROR: CONFIG_FILE not found: {source}")
    with open(source, encoding="utf-8") as f:
        return f.read()


def coerce(name, value, kind):
    """Turn a JSON value into the right Python type (e.g. GRAD_CLIP 1 -> 1.0)."""
    if value is None:
        if kind == "int_or_none":
            return None
        raise SystemExit(f"ERROR: config value {name} is null, but it needs a {kind}.")
    try:
        if kind == "bool":
            if isinstance(value, str):
                return value.strip().lower() in ("true", "1", "yes")
            return bool(value)
        if kind in ("int", "int_or_none"):
            if isinstance(value, float) and not value.is_integer():
                raise ValueError("not a whole number")
            return int(value)
        if kind == "float":
            return float(value)
        return str(value)
    except (TypeError, ValueError) as e:
        raise SystemExit(f"ERROR: config value {name} = {value!r} is not a valid {kind} ({e}).")


if CONFIG_FILE:
    section("LOADING CONFIG FILE")
    try:
        cfg = json.loads(read_config_text(str(CONFIG_FILE)))
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: CONFIG_FILE is not valid JSON: {e}")
    if not isinstance(cfg, dict):
        raise SystemExit("ERROR: CONFIG_FILE must hold one JSON object { ... }.")
    # Format checks: just warnings, so a slightly different file still loads.
    fmt = cfg.get("_format")
    if fmt != "llmcalc-config":
        print(f"WARNING: _format is {fmt!r}, expected 'llmcalc-config'. Loading anyway.")
    ver = cfg.get("_version")
    if isinstance(ver, (int, float)) and ver > 1:
        print(f"WARNING: config _version {ver} is newer than this script knows (1). "
              "Some new fields may be ignored.")
    for k, v in cfg.items():
        if k.startswith("_"):              # info fields: printed, never used as settings
            if k == "_estimates" and isinstance(v, dict):
                CALC_ESTIMATES = v
            else:
                print(f"  {k}: {v}")
        elif k in FROM_CELL:               # the Kaggle cell set this one: the cell wins
            print(f"  {k}: config says {v!r}, but the Kaggle cell set {globals()[k]!r} — keeping the cell's value")
        elif k in CONFIG_KEYS:
            globals()[k] = coerce(k, v, CONFIG_KEYS[k])
            FROM_CONFIG.add(k)
        else:
            print(f"WARNING: unknown setting {k!r} in config — ignored.")
    print(f"\nSettings loaded from CONFIG_FILE: {CONFIG_FILE}")
    print(f"  {len(FROM_CONFIG)} setting(s) taken from the file"
          + (f": {', '.join(sorted(FROM_CONFIG))}" if FROM_CONFIG else ""))
    _kept = sorted(k for k in cfg if k in FROM_CELL)
    if _kept:
        print(f"  {len(_kept)} setting(s) in the file were overridden by the Kaggle cell: {', '.join(_kept)}")
else:
    print("\nNo CONFIG_FILE set: using this script's defaults + the Kaggle cell's settings.")

# Check the shape settings fit together, whether they came from the file or not.
if HIDDEN % HEADS != 0:
    raise SystemExit(f"ERROR: HIDDEN ({HIDDEN}) must divide evenly by HEADS ({HEADS}). "
                     f"Each head gets HIDDEN/HEADS numbers. Try HEADS = "
                     f"{[h for h in (4, 8, 16) if HIDDEN % h == 0] or 'a divisor of HIDDEN'}.")
if KV_HEADS < 1 or HEADS % KV_HEADS != 0:
    raise SystemExit(f"ERROR: HEADS ({HEADS}) must divide evenly by KV_HEADS ({KV_HEADS}). "
                     f"Use KV_HEADS = {HEADS} (classic) or a divisor like {max(1, HEADS // 2)}.")

# Rebuild the output paths, in case MODEL_NAME came from the config.
OUT_DIR   = os.path.join(OUTPUT_ROOT, MODEL_NAME)
FINAL_DIR = os.path.join(OUT_DIR, "hf_model")
CKPT_DIR  = os.path.join(OUT_DIR, "checkpoint")
ONNX_DIR  = os.path.join(OUT_DIR, "onnx")
os.makedirs(OUT_DIR, exist_ok=True)

# Print every setting, with a * on the ones the config file changed.
# Each line shows where the value came from: default (this script), config (the
# JSON file) or cell (set in the Kaggle cell before exec).
section("SETTINGS IN USE  (source: default / config / cell)")
print("Priority: default < config < cell (the cell always wins).")
for k in list(CONFIG_KEYS) + ["DATA_PATH", "STORY_SEPARATOR", "MIN_CHARS",
                              "EXPORT_GGUF", "EXPORT_ONNX", "MAKE_ZIP"]:
    src = "cell" if k in FROM_CELL else "config" if k in FROM_CONFIG else "default"
    print(f"  {src:<7} {k:<16} = {globals()[k]!r}")
if CALC_ESTIMATES:
    print("\nCalculator's estimates (info only):")
    for k, v in CALC_ESTIMATES.items():
        print(f"    {k:<20} {v}")

# ════════════════════════════════════════════════════════════════════════════
#  1c. HARDWARE + MEMORY ESTIMATE
# ════════════════════════════════════════════════════════════════════════════
# Pick the hardware. "cuda" means an NVIDIA GPU; otherwise we fall back to the
# CPU (works, but far too slow for real training — only good for testing).
device = "cuda" if torch.cuda.is_available() else "cpu"
n_gpu = torch.cuda.device_count() if device == "cuda" else 0
gpus_used = (n_gpu if USE_ALL_GPUS else 1) if device == "cuda" else 0
use_amp = device == "cuda"   # fp16 "mixed precision": ~2x faster on T4 GPUs, GPU only
GB = 1024 ** 3               # we show memory in GiB, the same unit PyTorch's errors use


def gpu_info():
    """Print each GPU's name and total / free memory."""
    if device != "cuda":
        print("Memory: CPU, n/a (no GPU found)")
        return
    for i in range(n_gpu):
        free, total = torch.cuda.mem_get_info(i)
        print(f"GPU{i}: {torch.cuda.get_device_name(i)} | total {total / GB:.1f} GB | "
              f"free {free / GB:.1f} GB")


def mem_str():
    """Short memory report for the log: used/total and the peak so far, per GPU."""
    if device != "cuda":
        return "mem CPU, n/a"
    parts = []
    for i in range(gpus_used):
        total = torch.cuda.mem_get_info(i)[1]
        parts.append(f"GPU{i} {torch.cuda.memory_allocated(i) / GB:.1f}/{total / GB:.1f} GB "
                     f"(peak {torch.cuda.max_memory_allocated(i) / GB:.1f})")
    return "mem " + " | ".join(parts)


section("SETUP")
print(f"Python {sys.version.split()[0]} | torch {torch.__version__} | "
      f"transformers {transformers.__version__}")
print(f"Device: {device} | GPUs available: {n_gpu} | GPUs used: {gpus_used}")
gpu_info()
print(f"Output folder: {OUT_DIR}")

# How many parameters (weights) the model will have.
_p_est = (VOCAB * HIDDEN * (1 if TIE_EMBEDDINGS else 2)
          + LAYERS * (2 * HIDDEN * HIDDEN + 2 * HIDDEN * (HIDDEN // HEADS) * KV_HEADS
                      + 3 * HIDDEN * FFN + 2 * HIDDEN) + HIDDEN)


def estimate_mem(bpg, n_gpus):
    """Rough training memory (bytes) on GPU 0, the busiest GPU, for `bpg` blocks per GPU.
    Pieces:
      * weights + gradients + AdamW's two memories: 16 bytes per parameter.
        With DataParallel, GPU 0 keeps this "master" copy; the other GPUs only get
        a temporary copy of the weights (+ their gradients).
      * logits = the model's score for EVERY vocabulary word at EVERY position:
        blocks x SEQ x VOCAB numbers, stored as fp16 (2 B) + an fp32 copy for the
        loss (4 B) + its gradient (4 B). With a big VOCAB this is the largest piece!
        DataParallel also collects every GPU's logits on GPU 0 (2 B each).
      * per-layer "activations": in-between results kept for learning
        (~34 bytes per HIDDEN number + ~10 bytes per FFN number, per token).
        Gradient checkpointing keeps only each layer's input (2 B per number).
      * attention scores: SEQ x SEQ per head. 'sdpa' attention does not store
        them, the older 'eager' attention does (~10 B each).
      * ~0.5 GB for the CUDA system itself."""
    tokens = bpg * SEQ
    weights = _p_est * 16
    logits = tokens * VOCAB * (2 + 4 + 4) + (n_gpus * tokens * VOCAB * 2 if n_gpus > 1 else 0)
    if GRADIENT_CHECKPOINTING:
        layers = tokens * HIDDEN * 2 * LAYERS + tokens * (HIDDEN * 34 + FFN * 10)
    else:
        layers = tokens * (HIDDEN * 34 + FFN * 10) * LAYERS
    attn = 0 if ATTN_IMPL == "sdpa" else bpg * HEADS * SEQ * SEQ * 10 * (1 if GRADIENT_CHECKPOINTING else LAYERS)
    return {"weights+optimizer": weights, "logits": logits, "layers": layers,
            "attention": attn, "cuda system": 0.5 * GB}


ATTN_IMPL = "sdpa"     # what we ask for; build_model falls back to "eager" if needed
_n_est = max(1, gpus_used) if device == "cuda" else 2      # no GPU here: assume Kaggle T4 x2
if device == "cuda":
    _free = min(torch.cuda.mem_get_info(i)[0] for i in range(max(1, gpus_used)))
else:
    _free = 14.56 * GB                                      # a T4's memory, for the estimate
section("MEMORY ESTIMATE  (GPU 0, the busiest one)")
if device != "cuda":
    print("No GPU here, so this assumes Kaggle T4 x2 (14.6 GB each).")
_e = estimate_mem(BATCH_PER_GPU, _n_est)
_total = sum(_e.values())
print(f"Batch per GPU {BATCH_PER_GPU}: ~{_total / GB:.1f} GB  ("
      + ", ".join(f"{k} {v / GB:.1f}" for k, v in _e.items()) + ")")
print("Other batch sizes: " + " | ".join(
    f"{b}: {sum(estimate_mem(b, _n_est).values()) / GB:.1f} GB" for b in (32, 16, 8, 4, 2, 1)))
_fit = next((b for b in (512, 256, 128, 64, 32, 16, 8, 4, 2, 1)
             if b <= max(BATCH_PER_GPU, 1) and sum(estimate_mem(b, _n_est).values()) <= 0.9 * _free), None)
if _total > 0.9 * _free:
    print(f"WARNING: that is more than 90% of the free memory ({_free / GB:.1f} GB). "
          f"Expect 'out of memory'.")
    if _fit:
        print(f"  Suggestion: BATCH_PER_GPU = {_fit} (with GRAD_ACCUM_STEPS = "
              f"{max(1, BATCH_PER_GPU * GRAD_ACCUM_STEPS // _fit)} to keep the same effective batch).")
    else:
        print("  Even batch 1 may not fit: try GRADIENT_CHECKPOINTING = True, a smaller SEQ, "
              "VOCAB or model.")
    if AUTO_BATCH:
        print("  AUTO_BATCH is on, so the script will find a batch that fits by itself.")
print("(This is a rough guess; the real numbers are printed after the first step.)")


def build_model(bos_id, eos_id):
    """Create a fresh (untrained) Llama model from the settings."""
    config = LlamaConfig(
        vocab_size=VOCAB, hidden_size=HIDDEN, intermediate_size=FFN,
        num_hidden_layers=LAYERS, num_attention_heads=HEADS,
        num_key_value_heads=KV_HEADS, max_position_embeddings=SEQ,
        bos_token_id=bos_id, eos_token_id=eos_id, pad_token_id=eos_id,
        tie_word_embeddings=TIE_EMBEDDINGS,   # True = input/output word tables shared
    )
    global ATTN_IMPL
    # 'sdpa' = PyTorch's memory-saving attention. Older versions may not support it,
    # so we fall back to the classic 'eager' attention.
    try:
        config._attn_implementation = "sdpa"
        model = LlamaForCausalLM(config)
        ATTN_IMPL = "sdpa"
    except Exception as e:
        print(f"Note: 'sdpa' attention not available ({e}); using 'eager'.")
        config._attn_implementation = "eager"
        model = LlamaForCausalLM(config)
        ATTN_IMPL = "eager"
    return config, model


def compare_params(n):
    """Print the calculator's parameter guess next to the real count."""
    est = CALC_ESTIMATES.get("params")
    if est:
        print(f"Calculator estimated {int(est):,} params, actual {n:,} "
              f"({(n - est) / est * 100:+.2f}%)")


if DRY_RUN:
    section("DRY RUN: building the model on the CPU, then stopping")
    _, m = build_model(1, 2)
    n = sum(p.numel() for p in m.parameters())
    print(f"Parameters: {n / 1e6:.2f}M | fp32 size ≈ {n * 4 / 1e6:.0f} MB")
    compare_params(n)
    print("DRY_RUN = True, so stopping here. Set DRY_RUN = False to train.")
    sys.exit(0)


# Fix every source of randomness, so the same SEED gives the same run.
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

BATCH = BATCH_PER_GPU * max(1, gpus_used)       # text blocks per small batch (all GPUs)


# ════════════════════════════════════════════════════════════════════════════
#  2. LOAD THE STORIES
# ════════════════════════════════════════════════════════════════════════════
def split_samples(text):
    """Cut one long text into samples, following STORY_SEPARATOR."""
    if STORY_SEPARATOR == "line":
        return text.splitlines()
    if STORY_SEPARATOR == "blank_line":
        import re
        return re.split(r"\n\s*\n", text)          # one or more empty lines
    return text.split(STORY_SEPARATOR)


def show_input_hint():
    """Explain a wrong DATA_PATH and list what's actually under /kaggle/input."""
    print(f"\nERROR: DATA_PATH not found: {DATA_PATH}")
    print("Hint: attach your dataset with 'Add Input' on the right side of the notebook,")
    print("then copy the exact path. Here is everything under /kaggle/input:")
    if os.path.isdir("/kaggle/input"):
        found = False
        for root, dirs, files in os.walk("/kaggle/input"):
            for name in sorted(files):
                print("   ", os.path.join(root, name))
                found = True
        if not found:
            print("    (nothing — no dataset is attached yet)")
    else:
        print("    (/kaggle/input doesn't exist — are you running on Kaggle?)")


def fix_data_url(url):
    """Turn common 'web page' links into direct file links.
    HF:     huggingface.co/datasets/X/blob/main/f.txt -> .../resolve/main/f.txt
    GitHub: github.com/U/R/blob/B/f -> raw.githubusercontent.com/U/R/B/f"""
    import re
    m = re.match(r"^https?://(www\.)?huggingface\.co/(.+?)/blob/(.+)$", url)
    if m:
        return f"https://huggingface.co/{m.group(2)}/resolve/{m.group(3)}"
    m = re.match(r"^https?://(www\.)?github\.com/([^/]+)/([^/]+)/(?:blob|raw)/(.+)$", url)
    if m:
        return f"https://raw.githubusercontent.com/{m.group(2)}/{m.group(3)}/{m.group(4)}"
    return url


def download_data(url):
    """Download a URL once into <OUTPUT_ROOT>/_data_cache/ and return the local path.
    Archives (.zip / .gz / .tar.gz) are unpacked; then a folder path is returned."""
    import re, urllib.request, urllib.error, urllib.parse, zipfile, tarfile, gzip, shutil
    fixed = fix_data_url(url)
    if fixed != url:
        print(f"Link fixed to direct file: {fixed}")
    cache = os.path.join(OUTPUT_ROOT, "_data_cache")       # kept between runs
    os.makedirs(cache, exist_ok=True)
    name = os.path.basename(urllib.parse.urlparse(fixed).path) or "data.txt"
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)           # safe file name
    # Different URLs with the same file name get separate cache entries.
    import hashlib
    name = hashlib.md5(fixed.encode()).hexdigest()[:8] + "_" + name
    path = os.path.join(cache, name)
    if os.path.exists(path):
        print(f"Using cached download: {path} (delete it to download again)")
    else:
        print(f"Downloading {fixed}")
        try:
            resp = urllib.request.urlopen(fixed, timeout=120)  # 120 s = give up if stuck
        except urllib.error.HTTPError as e:
            hint = {404: "File not found. Check spelling, branch name and that the file "
                         "is pushed / GitHub Pages has finished updating (~1 min).",
                    401: "Needs a login: the repo/dataset is private. Make it public.",
                    403: "Access refused: private or blocked. Make it public."}.get(e.code, "")
            raise SystemExit(f"ERROR: download failed ({e.code} {e.reason}) for {fixed}\n{hint}")
        except urllib.error.URLError as e:
            raise SystemExit(f"ERROR: could not reach {fixed} ({e.reason}). "
                             "Is Internet turned ON in the notebook settings?")
        tmp = path + ".part"                               # half-done downloads never count
        done, next_print = 0, 10 * 1024 * 1024             # print every ~10 MB
        with open(tmp, "wb") as f:
            first = True
            while True:
                chunk = resp.read(1024 * 1024)             # read 1 MB at a time
                if not chunk:
                    break
                if first:
                    first = False
                    head = chunk[:500].lstrip().lower()
                    if head.startswith((b"<!doctype", b"<html")):
                        f.close(); os.remove(tmp)
                        raise SystemExit(
                            f"ERROR: {fixed} gave a web page (HTML), not your data.\n"
                            "Hints: on Hugging Face use '/resolve/main/...' not '/blob/main/...';\n"
                            "on GitHub use the raw.githubusercontent.com link (or github.io);\n"
                            "check the file really exists at that address.")
                f.write(chunk)
                done += len(chunk)
                if done >= next_print:
                    print(f"  ... {done / 1e6:.0f} MB")
                    next_print += 10 * 1024 * 1024
        os.replace(tmp, path)
        print(f"Downloaded {done / 1e6:.2f} MB -> {path}")
    # Unpack archives into a folder next to the file (only once).
    low = name.lower()
    if low.endswith((".zip", ".tar.gz", ".tgz", ".tar")):
        folder = path + "_files"
        if not os.path.isdir(folder):
            os.makedirs(folder + ".part", exist_ok=True)
            if low.endswith(".zip"):
                with zipfile.ZipFile(path) as z:
                    z.extractall(folder + ".part")
            else:
                with tarfile.open(path) as t:
                    t.extractall(folder + ".part")
            os.replace(folder + ".part", folder)
            print(f"Unpacked to {folder}")
        return folder
    if low.endswith(".gz"):                                # single gzipped text file
        out = path[:-3]
        if not out.lower().endswith(".txt"):
            out += ".txt"
        if not os.path.exists(out):
            with gzip.open(path, "rb") as src, open(out + ".part", "wb") as dst:
                shutil.copyfileobj(src, dst)
            os.replace(out + ".part", out)
        return out
    return path


def load_one_source(src):
    """Read samples from ONE source: URL, local file/folder or "hf:" dataset."""
    # --- A Hugging Face dataset ---
    if src.startswith("hf:"):
        name = src[3:]
        if MAX_SAMPLES is None:
            ds = load_dataset(name, split="train")          # whole split (cached)
            return [t for t in ds["text"] if t], 0
        # With a limit we *stream*: only the needed rows are downloaded.
        texts = []
        for row in load_dataset(name, split="train", streaming=True):
            if row["text"] and len(row["text"].strip()) >= MIN_CHARS:
                texts.append(row["text"])
                if len(texts) >= MAX_SAMPLES:
                    break
        return texts, 0
    # --- A web link: download (or reuse the cache), then read like a local path ---
    if src.lower().startswith(("http://", "https://")):
        src = download_data(src)
    # --- A local file or a folder of .txt files ---
    if os.path.isfile(src):
        files = [src]
    elif os.path.isdir(src):
        files = sorted(os.path.join(root, n) for root, _, names in os.walk(src)
                       for n in names if n.lower().endswith(".txt"))
        if not files:
            raise SystemExit(f"ERROR: no .txt files inside the folder {src}")
    else:
        if src != DATA_PATH:
            print(f"\nERROR: this DATA_PATH entry was not found: {src}")
        show_input_hint()
        raise SystemExit("Fix DATA_PATH in the SETTINGS block and run again.")
    texts = []
    for path in files:
        with open(path, encoding="utf-8", errors="ignore") as f:
            texts += split_samples(f.read())
        print(f"Read {path} ({os.path.getsize(path) / 1e6:.2f} MB)")
    return texts, len(files)


def load_samples():
    """Read all samples from DATA_PATH. A list of sources is combined in order."""
    sources = DATA_PATH if isinstance(DATA_PATH, (list, tuple)) else [DATA_PATH]
    texts, n_files = [], 0
    for src in sources:
        t, n = load_one_source(str(src))
        texts += t
        n_files += n
    return texts, f"{len(sources)} source(s), {n_files} file(s)"


section("1/6  LOADING DATA")
t_load = time.time()
all_texts, source = load_samples()
# Trim spaces and drop empty / too-short samples.
all_texts = [t.strip() for t in all_texts]
all_texts = [t for t in all_texts if len(t) >= max(1, MIN_CHARS)]
if MAX_SAMPLES is not None:
    all_texts = all_texts[:MAX_SAMPLES]
if len(all_texts) < 2:
    raise SystemExit(f"ERROR: only {len(all_texts)} sample(s) found in {DATA_PATH}. "
                     "Check DATA_PATH and STORY_SEPARATOR.")
# Shuffle (same SEED = same split every run), then hold back VAL_FRACTION for
# testing. At least 1 sample goes to testing, and at least 1 stays for training.
random.Random(SEED).shuffle(all_texts)
n_val = min(len(all_texts) - 1, max(1, round(len(all_texts) * VAL_FRACTION)))
val_texts = all_texts[:n_val]
train_texts = all_texts[n_val:]
del all_texts
words = sum(len(t.split()) for t in train_texts)
print(f"Source: {source} | separator: {STORY_SEPARATOR!r}")
print(f"Training samples: {len(train_texts):,} (~{words:,} words) | "
      f"validation samples: {len(val_texts):,} | took {fmt_time(time.time() - t_load)}")


# ════════════════════════════════════════════════════════════════════════════
#  3. TRAIN THE TOKENIZER
#     A tokenizer chops text into tokens (word pieces) and turns them into
#     numbers. We train our own (BPE, the same kind GPT-2 uses) on our stories.
# ════════════════════════════════════════════════════════════════════════════
section("2/6  TRAINING TOKENIZER")
# Special tokens: <unk> = unknown, <s> = start of a story, </s> = end of a story.
SPECIAL_TOKENS = ["<unk>", "<s>", "</s>"]

tok = Tokenizer(models.BPE(unk_token="<unk>"))
# ByteLevel = works on raw bytes, so any character (even emoji) can be encoded.
tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
tok.decoder = decoders.ByteLevel()
tok.train_from_iterator(
    train_texts,
    trainers.BpeTrainer(vocab_size=VOCAB, special_tokens=SPECIAL_TOKENS,
                        # Start from all 256 byte symbols, so nothing is ever "unknown".
                        initial_alphabet=pre_tokenizers.ByteLevel.alphabet()),
)
BOS_ID = tok.token_to_id("<s>")   # number for "story starts"
EOS_ID = tok.token_to_id("</s>")  # number for "story ends"

# Wrap it in the Hugging Face tokenizer class so it can be saved next to the model.
tokenizer = PreTrainedTokenizerFast(
    tokenizer_object=tok, unk_token="<unk>", bos_token="<s>",
    eos_token="</s>", pad_token="</s>")
print(f"Vocabulary size: {tok.get_vocab_size():,}")


# ════════════════════════════════════════════════════════════════════════════
#  4. TURN STORIES INTO TRAINING BLOCKS
#     All stories are joined into one long stream of numbers
#     (<s> story </s> <s> story </s> ...) and cut into blocks of SEQ tokens.
#     Each block is one training example.
# ════════════════════════════════════════════════════════════════════════════
def make_blocks(texts, is_val=False):
    """Encode texts and pack them into a [num_blocks, SEQ] tensor of token ids."""
    chunks = []
    CHUNK = 10_000                       # encode 10k samples at a time (saves RAM)
    for i in range(0, len(texts), CHUNK):
        for enc in tok.encode_batch(texts[i:i + CHUNK]):
            chunks.append(np.asarray([BOS_ID] + enc.ids + [EOS_ID], dtype=np.int32))
    stream = np.concatenate(chunks)
    n_blocks = len(stream) // SEQ        # leftover tokens at the very end are dropped
    if n_blocks == 0 and is_val:
        # A tiny test set (shorter than one block): repeat it to fill one block.
        stream = np.resize(stream, SEQ)
        n_blocks = 1
    if n_blocks == 0:
        raise ValueError("Not enough text for even one block: use more samples or a smaller SEQ.")
    # int32 halves the memory use; it's converted to int64 one batch at a time.
    return torch.from_numpy(stream[: n_blocks * SEQ].reshape(n_blocks, SEQ).copy())


section("3/6  PREPARING BLOCKS")
train_data = make_blocks(train_texts)
val_data = make_blocks(val_texts, is_val=True)
del train_texts, val_texts                # free RAM; we only need the numbers now

N_BLOCKS = len(train_data)
print(f"Training blocks: {N_BLOCKS:,} ({N_BLOCKS * SEQ / 1e6:.1f}M tokens) | "
      f"validation blocks: {len(val_data):,}")


def steps_math():
    """One 'step' = one weight update = GRAD_ACCUM_STEPS small batches.
    The effective batch (blocks per update) decides the number of steps."""
    global BATCH, EFFECTIVE_BATCH, STEPS_PER_EPOCH, TOTAL_STEPS
    BATCH = BATCH_PER_GPU * max(1, gpus_used)
    EFFECTIVE_BATCH = BATCH * GRAD_ACCUM_STEPS
    STEPS_PER_EPOCH = math.ceil(N_BLOCKS / EFFECTIVE_BATCH)   # last step may be smaller
    TOTAL_STEPS = STEPS_PER_EPOCH * EPOCHS


steps_math()
print(f"Steps per epoch: {STEPS_PER_EPOCH:,} | epochs: {EPOCHS} | total steps: {TOTAL_STEPS:,} "
      f"(effective batch {EFFECTIVE_BATCH} = {BATCH_PER_GPU} per GPU x {max(1, gpus_used)} GPU(s) "
      f"x {GRAD_ACCUM_STEPS} accumulation)")
if CALC_ESTIMATES.get("total_steps"):
    print(f"Calculator estimated {CALC_ESTIMATES.get('steps_per_epoch')} steps/epoch, "
          f"{CALC_ESTIMATES['total_steps']} total | actual {STEPS_PER_EPOCH:,} / {TOTAL_STEPS:,} "
          f"(differs if your data has more/fewer tokens than the calculator assumed, "
          f"or a different GPU count: {gpus_used} used here)")


# ════════════════════════════════════════════════════════════════════════════
#  5. BUILD THE MODEL
# ════════════════════════════════════════════════════════════════════════════
section("4/6  BUILDING MODEL")
config, base_model = build_model(BOS_ID, EOS_ID)
base_model = base_model.to(device)   # the real model
# Tell generate() which tokens mean "end" and "padding" (avoids warnings later).
base_model.generation_config.pad_token_id = EOS_ID
base_model.generation_config.eos_token_id = EOS_ID
print(f"Attention: {ATTN_IMPL}")
if GRADIENT_CHECKPOINTING:
    base_model.config.use_cache = False          # the cache doesn't mix with checkpointing
    base_model.gradient_checkpointing_enable()
    print("Gradient checkpointing: ON (less memory, ~30% slower)")

n_params = sum(p.numel() for p in base_model.parameters())
print(f"Parameters: {n_params / 1e6:.2f}M | fp32 size ≈ {n_params * 4 / 1e6:.0f} MB")
compare_params(n_params)

# DataParallel = multi-GPU. Each batch is split across the GPUs, each GPU works
# on its share, and the results are combined. `model` is what we train with;
# `base_model` is the plain model underneath (used for saving and generating).
if gpus_used > 1:
    model = torch.nn.DataParallel(base_model)
    print(f"Parallel training on {gpus_used} GPUs")
else:
    model = base_model

# The optimizer (AdamW) is the algorithm that adjusts the weights each step.
optimizer = torch.optim.AdamW(base_model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)


def lr_factor(step):
    """Learning-rate schedule, as a fraction of LR.
    Ramp up linearly for WARMUP steps, then glide down along a smooth (cosine)
    curve to MIN_LR_RATIO by the final step."""
    if step < WARMUP:
        return (step + 1) / WARMUP
    progress = (step - WARMUP) / max(1, TOTAL_STEPS - WARMUP)
    return MIN_LR_RATIO + (1 - MIN_LR_RATIO) * 0.5 * (1 + math.cos(math.pi * min(1.0, progress)))


# GradScaler keeps fp16 numbers from getting too small to represent. GPU only.
scaler = torch.amp.GradScaler("cuda", enabled=use_amp)


def compute_loss(batch, net):
    """Run a batch through the network and return the average loss.
    The model predicts every next token; `labels=batch` lets it check itself
    (it shifts by one token internally). `.mean()` merges the losses from
    each GPU when running in parallel."""
    if _SIM_OOM and len(batch) / max(1, gpus_used) > _SIM_OOM and net.training:
        raise OOM_ERROR(f"(simulated for testing) batch {len(batch)} > {_SIM_OOM}")
    with torch.autocast(device_type=device, dtype=torch.float16, enabled=use_amp):
        out = net(input_ids=batch, labels=batch)
    return out.loss.float().mean()


@torch.no_grad()
def evaluate():
    """Measure loss on validation stories the model never trains on.
    Perplexity = e^loss: roughly how many tokens the model is 'torn between'
    at each step. Lower is better. If training loss keeps falling but this
    starts rising, the model is memorising — time to stop or add data."""
    model.eval()
    losses = []
    for i in range(0, min(len(val_data), EVAL_BATCHES * BATCH), BATCH):
        batch = val_data[i:i + BATCH].long().to(device)
        net = model if len(batch) >= max(1, gpus_used) else base_model
        losses.append(compute_loss(batch, net).item())
    model.train()
    loss = sum(losses) / len(losses)
    return loss, math.exp(min(loss, 20))   # cap avoids overflow on a wild early loss


def free_memory():
    """Give back as much GPU memory as possible after an 'out of memory' error."""
    optimizer.zero_grad(set_to_none=True)
    for p in base_model.parameters():
        p.grad = None
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()


def trial_step():
    """One full practice step (forward, backward, optimizer) on the biggest batch,
    with learning rate 0 so the weights do NOT change. It makes the GPU allocate
    everything training needs, so an 'out of memory' shows up now, not mid-run."""
    batch = train_data[:BATCH].long().to(device)
    net = model if len(batch) >= max(1, gpus_used) else base_model
    loss = compute_loss(batch, net)
    loss.backward()
    lrs = [g["lr"] for g in optimizer.param_groups]
    for g in optimizer.param_groups:
        g["lr"] = 0.0
        g["weight_decay_saved"], g["weight_decay"] = g["weight_decay"], 0.0
    optimizer.step()                       # creates AdamW's memories (uses GPU memory)
    for g, lr in zip(optimizer.param_groups, lrs):
        g["lr"] = lr
        g["weight_decay"] = g.pop("weight_decay_saved")
    for st in optimizer.state.values():    # reset AdamW's memories to "fresh"
        for k, v in st.items():
            if torch.is_tensor(v):
                v.zero_()
    optimizer.zero_grad(set_to_none=True)
    del loss, batch


def find_batch_that_fits():
    """Run trial_step(); on 'out of memory', halve the batch and double accumulation."""
    global BATCH_PER_GPU, GRAD_ACCUM_STEPS, BATCH
    while True:
        BATCH = BATCH_PER_GPU * max(1, gpus_used)
        try:
            trial_step()
            print(f"Trial step OK with batch {BATCH_PER_GPU} per GPU "
                  f"(grad accumulation {GRAD_ACCUM_STEPS}) | {mem_str()}")
            return
        except OOM_ERROR as e:
            free_memory()
            if not AUTO_BATCH:
                raise SystemExit(f"ERROR: out of memory with batch {BATCH_PER_GPU} per GPU.\n"
                                 "  Set AUTO_BATCH = True, or lower BATCH_PER_GPU, or set "
                                 "GRADIENT_CHECKPOINTING = True.") from e
            if BATCH_PER_GPU <= 1:
                raise SystemExit(
                    "ERROR: out of memory even with batch 1 per GPU. The model is too big for\n"
                    "  this GPU. Try GRADIENT_CHECKPOINTING = True, a smaller SEQ, a smaller VOCAB,\n"
                    "  or fewer LAYERS / smaller HIDDEN.") from e
            new = max(1, BATCH_PER_GPU // 2)
            GRAD_ACCUM_STEPS *= BATCH_PER_GPU // new
            print(f"Out of memory with batch {BATCH_PER_GPU} -> trying {new} "
                  f"(grad accumulation {GRAD_ACCUM_STEPS}, same effective batch)", flush=True)
            BATCH_PER_GPU = new


section("TRIAL STEP  (checks the batch fits in memory)")
find_batch_that_fits()
steps_math()                                    # steps stay the same: effective batch unchanged
print(f"Training with batch {BATCH_PER_GPU} per GPU x {max(1, gpus_used)} GPU(s) x "
      f"{GRAD_ACCUM_STEPS} accumulation = effective batch {EFFECTIVE_BATCH} | "
      f"{STEPS_PER_EPOCH:,} steps/epoch, {TOTAL_STEPS:,} total")
if device == "cuda":
    for i in range(max(1, gpus_used)):
        torch.cuda.reset_peak_memory_stats(i)  # so 'peak' counts real training only
scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_factor)


def save_model(folder):
    """Save model weights + settings + tokenizer in standard Hugging Face format."""
    os.makedirs(folder, exist_ok=True)
    base_model.save_pretrained(folder)
    tokenizer.save_pretrained(folder)


# ════════════════════════════════════════════════════════════════════════════
#  6. TRAINING LOOP
#     Each epoch: shuffle the block order, then walk through ALL blocks in
#     batches, so every block is used exactly once per epoch.
# ════════════════════════════════════════════════════════════════════════════
section("5/6  TRAINING")
shuffle_gen = torch.Generator().manual_seed(SEED)   # own generator: repeatable shuffles
model.train()
step = 0
t_start = time.time()
history = []                                        # (step, val_loss) after each test
loss_sum, loss_count = 0.0, 0                       # running average for the log

for epoch in range(1, EPOCHS + 1):
    order = torch.randperm(N_BLOCKS, generator=shuffle_gen)   # new random order
    for b in range(STEPS_PER_EPOCH):
        idx_all = order[b * EFFECTIVE_BATCH:(b + 1) * EFFECTIVE_BATCH]
        optimizer.zero_grad(set_to_none=True)
        step_loss = 0.0
        # Gradient accumulation: split this step's blocks into small batches of
        # BATCH, learn from each, and add the results up before ONE weight update.
        for m in range(0, len(idx_all), BATCH):
            idx = idx_all[m:m + BATCH]
            batch = train_data[idx].long().to(device, non_blocking=True)
            # A tiny last batch with fewer blocks than GPUs can't be split; run it on one.
            net = model if len(batch) >= max(1, gpus_used) else base_model
            try:
                loss = compute_loss(batch, net)
                share = len(idx) / len(idx_all)      # this small batch's share of the step
                scaler.scale(loss * share).backward()  # work out how to change each weight
            except OOM_ERROR:
                print(f"\nOut of memory during training at step {step + 1} | {mem_str()}\n"
                      f"Try BATCH_PER_GPU = {max(1, BATCH_PER_GPU // 2)} with GRAD_ACCUM_STEPS = "
                      f"{GRAD_ACCUM_STEPS * 2}, or GRADIENT_CHECKPOINTING = True.")
                raise
            step_loss += loss.item() * share
        loss = torch.tensor(step_loss)
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(base_model.parameters(), GRAD_CLIP)
        scaler.step(optimizer)                   # actually change the weights
        scaler.update()
        scheduler.step()                         # move along the learning-rate curve
        step += 1
        loss_sum += loss.item()
        loss_count += 1
        if step == 1:                            # one-time real memory report
            print("Memory after first step:")
            if device == "cuda":
                for i in range(max(1, gpus_used)):
                    total = torch.cuda.mem_get_info(i)[1]
                    print(f"   GPU{i}: in use {torch.cuda.memory_allocated(i) / GB:.1f} GB, "
                          f"peak {torch.cuda.max_memory_allocated(i) / GB:.1f} GB of "
                          f"{total / GB:.1f} GB")
            else:
                print("   CPU, n/a")

        # --- progress line ---
        if step % LOG_EVERY == 0 or step == TOTAL_STEPS:
            elapsed = time.time() - t_start
            eta = elapsed / step * (TOTAL_STEPS - step)
            print(f"epoch {epoch}/{EPOCHS} | step {step:,}/{TOTAL_STEPS:,} | "
                  f"loss {loss_sum / loss_count:.3f} | lr {scheduler.get_last_lr()[0]:.2e} | "
                  f"elapsed {fmt_time(elapsed)} | ETA {fmt_time(eta)} | {mem_str()}", flush=True)
            loss_sum, loss_count = 0.0, 0

        # --- validation test (also at the end of every epoch) ---
        if (EVAL_EVERY and step % EVAL_EVERY == 0) or b == STEPS_PER_EPOCH - 1:
            vl, ppl = evaluate()
            history.append((step, vl))
            print(f"   >> validation | step {step:,} | val loss {vl:.3f} | perplexity {ppl:.2f}",
                  flush=True)

        # --- backup copy ---
        if CHECKPOINT_EVERY and step % CHECKPOINT_EVERY == 0 and step < TOTAL_STEPS:
            save_model(CKPT_DIR)
            print(f"   >> checkpoint saved at step {step:,} -> {CKPT_DIR}", flush=True)

train_time = time.time() - t_start
if device == "cuda":                             # remember the peaks before exports
    PEAKS = [torch.cuda.max_memory_allocated(i) / GB for i in range(max(1, gpus_used))]
else:
    PEAKS = []
print(f"\nTraining finished in {fmt_time(train_time)}")

# --- Save the finished model FIRST, so a failing export can never lose it ---
save_model(FINAL_DIR)
if os.path.isdir(CKPT_DIR):
    shutil.rmtree(CKPT_DIR)        # the final model replaces the backup
print(f"Final model saved -> {FINAL_DIR}")

# --- Write some sample stories ---
base_model.eval()
print("\nSample stories:")
for prompt in PROMPTS:
    ids = tokenizer(prompt, return_tensors="pt").input_ids.to(device)
    with torch.no_grad():
        out = base_model.generate(ids, attention_mask=torch.ones_like(ids), max_new_tokens=MAX_NEW_TOKENS, do_sample=True,
                                  temperature=TEMPERATURE, top_k=TOP_K)
    print("\n>>", tokenizer.decode(out[0], skip_special_tokens=True))


# ════════════════════════════════════════════════════════════════════════════
#  7. EXPORTS
#     Each export is wrapped in try/except: if one fails, it prints the error
#     and the others still run. Your trained model is already saved above.
# ════════════════════════════════════════════════════════════════════════════
section("6/6  EXPORTS")
results = {}            # export name -> "ok" or the error message
base_model.to("cpu")    # exports run on the CPU
torch.cuda.empty_cache() if device == "cuda" else None


def pip_install(*packages):
    """Install Python packages quietly (only called for things that are missing)."""
    print(f"   installing: {' '.join(packages)}", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *packages], check=True)
    importlib.invalidate_caches()


def has_module(name):
    """True if a Python package can be imported."""
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


# ---------- 7a. GGUF (for llama.cpp, Ollama, LM Studio) ----------
def patch_gguf_converter(lcpp):
    """Fix 2: llama.cpp's converter identifies tokenizers by a fingerprint
    (hash) and refuses ones it hasn't seen, which includes every tokenizer
    trained from scratch like ours. This adds a fallback: if the environment
    variable LLAMA_PRE_FALLBACK is set, unknown fingerprints use that value
    instead of erroring. We set it to "gpt-2", which matches our ByteLevel
    tokenizer. Only patches once; safe to run again."""
    import re
    for rel in ("conversion/base.py", "convert_hf_to_gguf.py"):   # new and old layout
        path = os.path.join(lcpp, rel)
        if not os.path.exists(path):
            continue
        src = open(path, encoding="utf-8").read()
        start = src.find("def get_vocab_base_pre")
        if start < 0:
            continue
        if "LLAMA_PRE_FALLBACK" in src:
            return path                          # already patched
        m = re.compile(r"\n([ \t]+)if res is None:\n").search(src, start)
        if not m:
            raise RuntimeError(f"Couldn't find where to patch in {path}")
        ind = m.group(1)
        fallback = (f"\n{ind}if res is None and os.environ.get('LLAMA_PRE_FALLBACK'):\n"
                    f"{ind}    res = os.environ['LLAMA_PRE_FALLBACK']\n"
                    f"{ind}    logger.warning(f'Unknown BPE pre-tokenizer hash; using fallback {{res!r}}')")
        src = src[:m.start()] + fallback + src[m.start():]
        if not re.search(r"^import os\b", src, re.M):
            src = "import os\n" + src
        open(path, "w", encoding="utf-8").write(src)
        print(f"   patched converter: {path}")
        return path
    raise RuntimeError("get_vocab_base_pre not found in llama.cpp converter (layout changed?)")


def export_gguf():
    """Convert the Hugging Face folder to a single .gguf file."""
    # Converter needs these packages; install any that are missing.
    need = [p for m, p in [("gguf", "gguf"), ("google.protobuf", "protobuf"),
                           ("sentencepiece", "sentencepiece")] if not has_module(m)]
    if need:
        pip_install(*need)
    # Download llama.cpp (only its Python converter is used; nothing is compiled).
    if not os.path.exists(os.path.join(LLAMA_CPP_DIR, "convert_hf_to_gguf.py")):
        print("   downloading llama.cpp ...", flush=True)
        subprocess.run(["git", "clone", "--depth", "1",
                        "https://github.com/ggml-org/llama.cpp", LLAMA_CPP_DIR], check=True)
    patch_gguf_converter(LLAMA_CPP_DIR)

    # Fix 1: newer transformers (5.x) saves tokenizer_class "TokenizersBackend",
    # which the converter may not understand. In a temporary COPY of the model,
    # switch it to the standard "PreTrainedTokenizerFast". The real folder is untouched.
    work = os.path.join(OUT_DIR, "_gguf_work")
    shutil.rmtree(work, ignore_errors=True)
    shutil.copytree(FINAL_DIR, work)
    cfg_path = os.path.join(work, "tokenizer_config.json")
    if os.path.exists(cfg_path):
        tcfg = json.load(open(cfg_path))
        if tcfg.get("tokenizer_class") != "PreTrainedTokenizerFast":
            print(f"   tokenizer_class {tcfg.get('tokenizer_class')!r} -> 'PreTrainedTokenizerFast'")
            tcfg["tokenizer_class"] = "PreTrainedTokenizerFast"
            tcfg.pop("backend", None)
            json.dump(tcfg, open(cfg_path, "w"), indent=2)

    gguf_path = os.path.join(OUT_DIR, f"{MODEL_NAME}-{GGUF_TYPE}.gguf")
    env = dict(os.environ, LLAMA_PRE_FALLBACK="gpt-2")
    proc = subprocess.run([sys.executable, os.path.join(LLAMA_CPP_DIR, "convert_hf_to_gguf.py"),
                           work, "--outtype", GGUF_TYPE, "--outfile", gguf_path],
                          env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout[-3000:], proc.stderr[-3000:])
        raise RuntimeError("convert_hf_to_gguf.py failed (log above)")
    shutil.rmtree(work, ignore_errors=True)

    # Quick check: open the file and count its tensors.
    sys.path.insert(0, os.path.join(LLAMA_CPP_DIR, "gguf-py"))
    from gguf import GGUFReader
    reader = GGUFReader(gguf_path)
    print(f"   GGUF ok: {len(reader.tensors)} tensors, "
          f"{os.path.getsize(gguf_path) / 1e6:.1f} MB -> {gguf_path}")
    return gguf_path


def write_modelfile(gguf_path):
    """Write an Ollama 'Modelfile' (a recipe telling Ollama how to run the GGUF).
    Use it with:  ollama create <name> -f Modelfile   then   ollama run <name>"""
    text = f'''FROM ./{os.path.basename(gguf_path)}
# Plain text in, story out (this model continues text; it doesn't chat).
TEMPLATE """{{{{ .Prompt }}}}"""
PARAMETER temperature {TEMPERATURE}
PARAMETER top_k {TOP_K}
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx {SEQ}
PARAMETER num_predict {MAX_NEW_TOKENS * 2}
PARAMETER stop "</s>"
'''
    path = os.path.join(OUT_DIR, "Modelfile")
    with open(path, "w") as f:
        f.write(text)
    print(f"   Modelfile -> {path}")


gguf_path = None
if EXPORT_GGUF:
    print("\n[GGUF]")
    try:
        gguf_path = export_gguf()
        results["GGUF"] = "ok"
    except Exception as e:
        results["GGUF"] = f"FAILED: {e}"
        print("   GGUF export failed:", e)
    if gguf_path:
        try:
            write_modelfile(gguf_path)
            results["Modelfile"] = "ok"
        except Exception as e:
            results["Modelfile"] = f"FAILED: {e}"
            print("   Modelfile failed:", e)


# ---------- 7b. ONNX (for web apps, Android, onnxruntime) ----------
def export_onnx_optimum():
    """Export with Hugging Face Optimum. Produces model.onnx with a KV cache
    (fast generation). Optimum's ONNX exporter currently needs transformers
    4.x, so on transformers 5.x we skip straight to the PyTorch exporter."""
    if int(transformers.__version__.split(".")[0]) >= 5:
        raise RuntimeError("Optimum's ONNX exporter doesn't support transformers 5.x yet")
    if not has_module("optimum.exporters.onnx"):
        # Pin transformers to the installed version so pip can't swap it mid-run.
        pip_install("optimum-onnx", f"transformers=={transformers.__version__}")
    from optimum.exporters.onnx import main_export
    main_export(FINAL_DIR, output=ONNX_DIR, task="text-generation-with-past",
                device="cpu", no_post_process=False)


class LogitsOnly(torch.nn.Module):
    """Small wrapper: token ids in, next-token scores ('logits') out.
    No KV cache, which keeps the ONNX graph simple and portable."""
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, input_ids):
        return self.m(input_ids=input_ids, use_cache=False).logits


def export_onnx_torch():
    """Fallback: export with PyTorch's built-in ONNX exporter (no Optimum).
    The newer exporter (dynamo=True) needs the 'onnxscript' package."""
    if not has_module("onnxscript"):
        try:
            pip_install("onnxscript")
        except Exception as e:
            print("   couldn't install onnxscript:", e)
    os.makedirs(ONNX_DIR, exist_ok=True)
    path = os.path.join(ONNX_DIR, "model.onnx")
    wrapper = LogitsOnly(base_model.float().eval())
    # Example input: 2 stories x 16 tokens. (Batch 2, not 1, so the exporter
    # doesn't "bake in" a batch size of 1.)
    dummy = torch.randint(0, VOCAB, (2, 16))
    errors = []
    for dynamo in (True, False):   # newer exporter first, then the classic one
        try:
            kw = dict(input_names=["input_ids"], output_names=["logits"], opset_version=18)
            if dynamo:
                kw["dynamic_shapes"] = {"input_ids": {0: torch.export.Dim("batch", max=64),
                                                      1: torch.export.Dim("seq", max=SEQ)}}
            else:
                kw["dynamic_axes"] = {"input_ids": {0: "batch", 1: "seq"},
                                      "logits": {0: "batch", 1: "seq"}}
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                torch.onnx.export(wrapper, (dummy,), path, dynamo=dynamo, **kw)
            return
        except Exception as e:
            errors.append(f"dynamo={dynamo}: {type(e).__name__}: {str(e)[:300]}")
    raise RuntimeError(" | ".join(errors))


def merge_onnx_to_one_file(path):
    """Some exporters write the weights into a second file (model.onnx.data).
    Two files are easy to separate by accident, so if the model is under ONNX's
    2 GB single-file limit, fold everything into model.onnx."""
    import onnx
    folder = os.path.dirname(path)
    extra = [f for f in os.listdir(folder) if f.startswith("model.onnx") and f != "model.onnx"]
    if not extra or sum(os.path.getsize(os.path.join(folder, f)) for f in extra) > 1.8e9:
        return
    m = onnx.load(path)                      # also reads the weights from the .data file
    onnx.save(m, path, save_as_external_data=False)
    for f in extra:
        os.remove(os.path.join(folder, f))
    print("   merged ONNX weights into a single model.onnx")


def check_onnx(path):
    """Load an ONNX file in onnxruntime and, for the simple (no-cache) format,
    compare its answer to the PyTorch model's answer on a short prompt."""
    import onnxruntime as ort
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    names = [i.name for i in sess.get_inputs()]
    if names != ["input_ids"]:
        return f"loads ok (inputs: {len(names)}, KV-cache format)"
    # Two copies of the prompt: also checks the file accepts more than one story at once.
    ids = tokenizer(["Once upon a time"] * 2, return_tensors="pt").input_ids
    onnx_logits = sess.run(None, {"input_ids": ids.numpy().astype(np.int64)})[0]
    with torch.no_grad():
        torch_logits = base_model(input_ids=ids).logits.numpy()
    same_next = int(onnx_logits[0, -1].argmax()) == int(torch_logits[0, -1].argmax())
    diff = float(np.abs(onnx_logits - torch_logits).max())
    return f"loads ok, max diff vs PyTorch {diff:.4f}, same next token: {same_next}"


onnx_path = None
if EXPORT_ONNX:
    print("\n[ONNX]")
    try:
        for m, p in [("onnx", "onnx"), ("onnxruntime", "onnxruntime")]:
            if not has_module(m):
                pip_install(p)
        try:
            export_onnx_optimum()
            print("   exported with Optimum (with KV cache)")
        except Exception as e:
            print(f"   Optimum route not used ({str(e)[:200]}); using PyTorch exporter")
            shutil.rmtree(ONNX_DIR, ignore_errors=True)
            export_onnx_torch()
            print("   exported with PyTorch (logits only, no KV cache)")
        onnx_path = os.path.join(ONNX_DIR, "model.onnx")
        merge_onnx_to_one_file(onnx_path)
        # Put the tokenizer and config next to it, so the folder is self-contained.
        for f in os.listdir(FINAL_DIR):
            if f.endswith(".json") and not os.path.exists(os.path.join(ONNX_DIR, f)):
                shutil.copy(os.path.join(FINAL_DIR, f), ONNX_DIR)
        print("   check:", check_onnx(onnx_path))
        results["ONNX"] = "ok"
    except Exception as e:
        onnx_path = None
        results["ONNX"] = f"FAILED: {e}"
        print("   ONNX export failed:", e)

if EXPORT_ONNX and EXPORT_ONNX_INT8:
    print("\n[ONNX int8]")
    try:
        if not onnx_path:
            raise RuntimeError("skipped: the ONNX export above didn't succeed")
        from onnxruntime.quantization import quantize_dynamic, QuantType
        int8_path = os.path.join(ONNX_DIR, "model_int8.onnx")
        # Dynamic quantization: weights stored as 8-bit integers (~4x smaller).
        quantize_dynamic(onnx_path, int8_path, weight_type=QuantType.QInt8)
        print("   check:", check_onnx(int8_path))
        results["ONNX int8"] = "ok"
    except Exception as e:
        results["ONNX int8"] = f"FAILED: {e}"
        print("   int8 quantization failed:", e)


# ════════════════════════════════════════════════════════════════════════════
#  8. ZIP AND SUMMARY
# ════════════════════════════════════════════════════════════════════════════
zip_path = os.path.join(OUTPUT_ROOT, f"{MODEL_NAME}.zip")
if MAKE_ZIP:
    try:
        # ZIP_STORED = no compression: model weights barely compress, and this is much faster.
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
            for root, _, files in os.walk(OUT_DIR):
                for f in files:
                    full = os.path.join(root, f)
                    z.write(full, os.path.join(MODEL_NAME, os.path.relpath(full, OUT_DIR)))
        results["Zip"] = "ok"
    except Exception as e:
        results["Zip"] = f"FAILED: {e}"

section("SUMMARY")
print(f"Model: {MODEL_NAME} | {n_params / 1e6:.2f}M parameters | {EPOCHS} epochs | "
      f"{TOTAL_STEPS:,} steps | training time {fmt_time(train_time)}")
print(f"Batch: {BATCH_PER_GPU} per GPU x {max(1, gpus_used)} GPU(s) x {GRAD_ACCUM_STEPS} "
      f"accumulation = effective {EFFECTIVE_BATCH} | attention {ATTN_IMPL} | "
      f"checkpointing {'on' if GRADIENT_CHECKPOINTING else 'off'}")
print("Peak GPU memory: " + (" | ".join(f"GPU{i} {p:.1f} GB" for i, p in enumerate(PEAKS))
                             if PEAKS else "CPU, n/a"))
if history:
    print(f"Final validation loss {history[-1][1]:.3f} | perplexity {math.exp(min(history[-1][1], 20)):.2f}")
print()
for name, status in results.items():
    print(f"  {name:<10} {status}")
print(f"\n  {'File':<52}{'Size':>12}")
print("  " + "-" * 64)
for root, _, files in sorted(os.walk(OUT_DIR)):
    for f in sorted(files):
        full = os.path.join(root, f)
        print(f"  {os.path.relpath(full, OUT_DIR):<52}{os.path.getsize(full) / 1e6:>9.2f} MB")
if MAKE_ZIP and os.path.exists(zip_path):
    print("  " + "-" * 64)
    print(f"  {os.path.basename(zip_path) + '  (download this)':<52}"
          f"{os.path.getsize(zip_path) / 1e6:>9.2f} MB")
print(f"\nAll files are in {OUT_DIR}")
