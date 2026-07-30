# Voice System Setup Guide

> "The spoken word carries conviction that text alone cannot."

This guide walks you through setting up the full voice pipeline for Claude Code: text-to-speech (TTS) so Claude speaks its responses aloud, and speech-to-text (STT) push-to-talk so you can speak commands instead of typing.

---

## Architecture Overview

The voice system has two independent pipelines:

```
TTS (Claude speaks to you):
  Claude response --> «tts» markers --> Stop hook --> TTS engine --> audio playback

STT (You speak to Claude):
  Hotkey (Ctrl+F12) --> microphone --> faster-whisper --> text injection into terminal
```

Three GPU-accelerated services run locally:

| Service | Port | Role | VRAM |
|---------|------|------|------|
| Qwen3-TTS | 8880 | Default text-to-speech | ~4-8 GB |
| Chatterbox | 8890 | Voice-cloning TTS (optional) | ~4-7 GB |
| faster-whisper | 2022 | Speech-to-text | ~6 GB |

You can run just one TTS engine (Qwen3-TTS alone is fine) and skip voice cloning if you don't need custom voices. The STT service is independent of TTS.

---

## Prerequisites

### Hardware

- **GPU**: NVIDIA with 6+ GB VRAM (minimum: RTX 3060 for Qwen3-TTS + whisper)
  - For voice cloning (Chatterbox): add ~4-7 GB VRAM
  - Recommended: RTX 4070 or better (16+ GB total)
- **Microphone**: Any USB or built-in mic for push-to-talk

### Software

- **Python 3.11-3.13** (3.12 recommended). Check with `python --version`
- **Node.js 18+**. Check with `node --version`
- **Git**
- **NVIDIA CUDA 12.8+** driver (the setup scripts install PyTorch cu128 wheels)
  - Verify: `nvidia-smi` should show CUDA Version 12.8 or higher
  - Older CUDA 12.x drivers (12.1-12.7) will NOT work with cu128 wheels
  - PyTorch installs its own CUDA runtime, but the GPU driver must already support 12.8+
- **ffmpeg** (recommended, not strictly required on Windows)
  - Windows: `winget install ffmpeg` or download from https://ffmpeg.org
  - Linux: `sudo apt install ffmpeg`
- **sox** (optional, used by Qwen3-TTS for some audio processing)
  - Windows: `winget install sox` or `conda install -c conda-forge sox`
  - Linux: `sudo apt install sox`
- **Claude Code** installed and working
- **Starfleet Claude Code** installed per [INSTALL.md](../INSTALL.md)

### Platform Notes

This guide covers **Windows (Git Bash / MINGW64)** and **Linux**. macOS is untested but should work with minor path adjustments.

On Windows, all bash commands should be run in **Git Bash** (MINGW64), not PowerShell or CMD.

---

## Part 0: Get the Voice Scripts

The voice system scripts are **not** inside the `starfleet-claude-code` repository. They live in a separate directory (`src/voice/`) that you need to obtain separately.

Ask the repository owner for the voice scripts bundle, or if you have access to the parent repository:

```bash
# Clone the parent repo (contains src/voice/ with all scripts)
# Ask the repo owner for the URL, then:
VOICE_DIR="/path/to/repo/src/voice"
```

Set `VOICE_DIR` in your shell and keep it set for the remainder of this guide. Every command that references setup or start scripts uses this variable.

**Required files in `$VOICE_DIR`** (verify these exist before proceeding):

```bash
ls "$VOICE_DIR"/{setup-qwen3-tts.sh,setup-chatterbox.sh,setup-voice-services.sh}
ls "$VOICE_DIR"/{start-all.sh,start-qwen3-tts-server.sh,start-chatterbox-server.sh,start-whisper-server.sh}
ls "$VOICE_DIR"/{tts-marker-hook.js,voice-profiles.json,whisper_server.py}
ls "$VOICE_DIR"/patches/claude-stt/{keyboard.py,daemon.py}
```

Note: `whisper_server.py` must be in the same directory as `start-whisper-server.sh`. The start script depends on it.

**Full-stack shortcut**: To install all three services (Qwen3-TTS + Chatterbox + whisper) in one command:

```bash
bash "$VOICE_DIR/setup-voice-services.sh" --all
```

Or install them individually as described below.

---

## Part 1: Install TTS Services

### Step 1.1: Create the services directory

All voice services live under `~/.voicemode/`:

```bash
mkdir -p ~/.voicemode/services
mkdir -p ~/.voicemode/logs
mkdir -p ~/.voicemode/pids
mkdir -p ~/.voicemode/models
```

### Step 1.2: Verify voice scripts location

Confirm `$VOICE_DIR` is set correctly from Part 0:

```bash
echo "$VOICE_DIR"
ls "$VOICE_DIR/setup-qwen3-tts.sh"  # should exist
```

### Step 1.3: Install Qwen3-TTS (primary TTS engine)

Qwen3-TTS is the recommended default TTS engine. It produces natural multilingual speech with multiple built-in voices.

```bash
bash "$VOICE_DIR/setup-qwen3-tts.sh"
```

This script:
1. Clones the [Qwen3-TTS-Openai-Fastapi](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi) server
2. Creates a Python venv at `~/.voicemode/services/qwen3-tts/.venv`
3. Installs PyTorch with CUDA support
4. Downloads the Qwen3-TTS model (~3-4 GB on first run)

**Available voices** (built into Qwen3-TTS):

| Voice | Description |
|-------|-------------|
| `vivian` | Natural female (default) |
| `eric` | Deep male |
| `sohee` | Precise female |
| `aiden` | Male |
| `dylan` | Male |
| `ryan` | Male |
| `serena` | Female |
| `ono_anna` | Female |
| `uncle_fu` | Male |

**Test it** (after setup completes):

```bash
bash "$VOICE_DIR/start-qwen3-tts-server.sh" &
sleep 30  # wait for model loading (increase to 60+ on first run or slow disk)

# Test the endpoint
curl -X POST http://127.0.0.1:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-tts","input":"Hello, this is a test.","voice":"vivian","response_format":"wav"}' \
  --output /tmp/test.wav

# Play it
# Windows:
python -c "import winsound; winsound.PlaySound('/tmp/test.wav', winsound.SND_FILENAME)"
# Linux:
ffplay -nodisp -autoexit /tmp/test.wav
```

### Step 1.4: Install Chatterbox (optional, voice cloning)

Chatterbox lets you clone any voice from a short WAV sample. This powers custom voices like Picard, KITT, or Scotty. Skip this if you only want built-in voices.

```bash
bash "$VOICE_DIR/setup-chatterbox.sh"
```

This script:
1. Clones the [Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server)
2. Creates a venv at `~/.voicemode/services/chatterbox/.venv`
3. Installs PyTorch with CUDA and the Chatterbox model

**Voice cloning samples**: Chatterbox needs a short WAV file (10-30 seconds of natural speech) as a reference. Place WAV files in `~/.claude/voices/`:

```bash
mkdir -p ~/.claude/voices
# Copy your WAV samples here, e.g.:
# cp picard-stewart.wav ~/.claude/voices/
# cp my-custom-voice.wav ~/.claude/voices/
```

The setup script automatically copies any WAV files from `~/.claude/voices/` into the Chatterbox server's `voices/` directory.

**Chatterbox-specific parameters**:

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| `exaggeration` | 0.0-2.0 | 0.5 | Emotional intensity of the voice |
| `cfg_weight` | 0.0-1.0 | 0.5 | Fidelity vs naturalness balance |
| `temperature` | 0.05-5.0 | 0.8 | Prosody randomness |

For natural speech, keep `exaggeration` between 0.3-0.6.

---

## Part 2: Install STT Service (Push-to-Talk)

### Step 2.1: Install faster-whisper

```bash
bash "$VOICE_DIR/setup-voice-services.sh" --whisper
```

This installs:
1. faster-whisper with CUDA support in `~/.voicemode/services/whisper-venv`
2. The `large-v3` model (best accuracy, ~6 GB VRAM) or `medium` (faster, less VRAM)
3. FastAPI + uvicorn for the OpenAI-compatible transcription endpoint
4. NVIDIA cuBLAS DLLs (Windows, for GPU inference)

**Important**: The start script (`start-whisper-server.sh`) expects `whisper_server.py` to be in the same directory. This is a custom FastAPI server included in `$VOICE_DIR`. If you copied scripts individually rather than using the whole directory, make sure `whisper_server.py` is present.

**Test it**:

```bash
bash "$VOICE_DIR/start-whisper-server.sh" &
sleep 10

# Check health
curl http://127.0.0.1:2022/health
```

### Step 2.2: Install the claude-stt plugin

The [claude-stt plugin](https://github.com/jarrodwatts/claude-stt) provides the push-to-talk hotkey listener. Install it as a Claude Code plugin:

```bash
claude plugin add jarrodwatts/claude-stt
```

After installation, the plugin lives at:
```
~/.claude/plugins/cache/jarrodwatts-claude-stt/claude-stt/0.1.0/
```

### Step 2.3: Configure claude-stt

Create the config file at `~/.claude/plugins/claude-stt/config.toml`:

```bash
mkdir -p ~/.claude/plugins/claude-stt
```

Write this content to `~/.claude/plugins/claude-stt/config.toml`:

```toml
[claude-stt]
hotkey = "ctrl+f12"
mode = "push-to-talk"
engine = "server"
server_url = "http://127.0.0.1:2022/v1/audio/transcriptions"
whisper_model = "medium"
sample_rate = 16000
max_recording_seconds = 300
output_mode = "auto"
sound_effects = false
```

**Configuration options**:

| Setting | Values | Description |
|---------|--------|-------------|
| `hotkey` | Any key combo | The push-to-talk trigger key |
| `mode` | `push-to-talk` | Only records while holding the hotkey |
| `engine` | `server` | Use the local faster-whisper server |
| `server_url` | URL | Points to the whisper server |
| `whisper_model` | `medium`, `large-v3` | Ignored when engine=server (server decides) |
| `output_mode` | `auto`, `clipboard`, `injection` | How transcribed text reaches Claude Code |
| `sound_effects` | `true`/`false` | Audio feedback on recording start/stop |

### Step 2.4: Apply Windows patches (Windows only)

On Windows, the stock claude-stt plugin has two bugs that cause text duplication. Apply these patches:

```bash
# Find the actual plugin package path (version may differ after updates)
PLUGIN_PKG=$(find ~/.claude/plugins/cache -path "*/claude_stt" -type d 2>/dev/null | head -1)

# Verify it was found
echo "Plugin at: $PLUGIN_PKG"
ls "$PLUGIN_PKG/keyboard.py"  # should exist

# Patch 1: Clipboard paste injection (fixes 2-3x text duplication)
cp "$VOICE_DIR/patches/claude-stt/keyboard.py" "$PLUGIN_PKG/keyboard.py"

# Patch 2: Singleton mutex guard (fixes duplicate daemons)
cp "$VOICE_DIR/patches/claude-stt/daemon.py" "$PLUGIN_PKG/daemon.py"
```

**Note**: The path above uses `find` to auto-discover the installed version. If `find` fails (e.g., spaces in your Windows username), use the explicit path with your actual version number:
```bash
PLUGIN_PKG="$HOME/.claude/plugins/cache/jarrodwatts-claude-stt/claude-stt/0.1.0/.venv/Lib/site-packages/claude_stt"
```

**What the patches fix**:

- **keyboard.py**: Replaces per-character `SendInput` (which triggers Windows keyboard hook feedback loops) with clipboard copy + Ctrl+V paste. Eliminates the 2-3x text duplication problem.
- **daemon.py**: Adds a Windows mutex (`Global\claude-stt-daemon-singleton`) to prevent multiple daemons from spawning when multiple Claude Code sessions start simultaneously.

If you update the claude-stt plugin, the version number in the path may change. Re-run the `find` command above and re-apply the patches.

---

## Part 3: Configure the TTS Hook

The TTS hook is a Stop hook that fires after every Claude response. It extracts text wrapped in `«tts»...«/tts»` markers (Unicode guillemet characters, U+00AB/U+00BB) and sends it to the TTS engine for audio playback.

### Step 3.1: Copy the hook script

```bash
# Option A: Symlink from repo (stays updated)
ln -s "$VOICE_DIR/tts-marker-hook.js" ~/.claude/hooks/tts-marker-hook.js

# Option B: Copy
cp "$VOICE_DIR/tts-marker-hook.js" ~/.claude/hooks/tts-marker-hook.js
```

### Step 3.2: Copy the voice profiles configuration

```bash
cp "$VOICE_DIR/voice-profiles.json" ~/.claude/hooks/voice-profiles.json
```

Or, if you placed the hook elsewhere, set the environment variable:

```bash
export VOICEMODE_PROFILES="/path/to/voice-profiles.json"
```

The hook looks for `voice-profiles.json` in the same directory as itself, or at the path in `VOICEMODE_PROFILES`.

### Step 3.3: Register the hook in settings.json

Add the TTS hook to the `Stop` section of `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/tts-marker-hook.js"
          }
        ]
      }
    ]
  }
}
```

If you already have a `Stop` section (e.g., from the Starfleet install), add the TTS hook entry to the existing hooks array:

```json
"Stop": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "node ~/.claude/hooks/captain-log.js"
      },
      {
        "type": "command",
        "command": "node ~/.claude/hooks/tts-marker-hook.js"
      }
    ]
  }
]
```

**Important**: After editing `settings.json`, restart Claude Code. Hook configuration is read once at session start.

### Step 3.4: Install the voice-output rule

The `voice-output.md` rule tells Claude to wrap its conversational prose in TTS markers. Without this rule, Claude won't produce any speech output.

```bash
cp rules/voice-output.md ~/.claude/rules/voice-output.md
```

This rule is already included in the Starfleet Claude Code installation (Step 6 of INSTALL.md). If you've already installed the rules, you're set.

---

## Part 4: Configure Voice Profiles

### Step 4.1: Edit voice-profiles.json

The voice profiles file controls which voice Claude uses. The repo ships a full set of profiles. Rather than writing your own from scratch, copy the shipped file (Step 3.2) and edit it. Here's the key structure:

**Important**: The shipped `voice-profiles.json` sets `"active": "picard"`, which uses Chatterbox voice cloning and requires a `picard-stewart.wav` file you must provide. If you don't have voice samples, change `"active"` to `"default"` for immediate use with the built-in Qwen3-TTS voices.

```json
{
  "profiles": {
    "default": {
      "engine": "qwen3-tts",
      "voice": "vivian",
      "description": "Default voice (natural female, fast)"
    },
    "jarvis": {
      "engine": "qwen3-tts",
      "voice": "eric",
      "description": "Deep male voice",
      "speed": 1.0
    },
    "picard": {
      "engine": "chatterbox",
      "voice": "picard-stewart.wav",
      "description": "Captain Picard voice clone",
      "exaggeration": 0.4,
      "speed": 1.0,
      "persona": {
        "name": "Jean-Luc",
        "title": "Captain",
        "user_name": "Number One",
        "style": "Measured, thoughtful, diplomatic."
      }
    }
  },
  "active": "default",
  "engines": {
    "qwen3-tts": {
      "endpoint": "http://127.0.0.1:8880/v1",
      "type": "openai-compatible",
      "model": "qwen3-tts",
      "gpu": true
    },
    "chatterbox": {
      "endpoint": "http://127.0.0.1:8890/v1",
      "type": "openai-compatible",
      "model": "chatterbox-turbo",
      "gpu": true,
      "parameters": {
        "exaggeration": 0.5,
        "cfg_weight": 0.5,
        "temperature": 0.8
      }
    }
  },
  "stt": {
    "engine": "faster-whisper-server",
    "endpoint": "http://127.0.0.1:2022/v1/audio/transcriptions",
    "model": "large-v3",
    "language": "en",
    "gpu": true,
    "plugin": "claude-stt",
    "hotkey": "ctrl+f12",
    "mode": "push-to-talk"
  }
}
```

**Key fields**:

- `active`: Set to the profile name you want to use. Change this to switch voices.
- `profiles.<name>.engine`: Either `qwen3-tts` or `chatterbox`
- `profiles.<name>.voice`: For Qwen3-TTS, use a built-in voice name. For Chatterbox, use a WAV filename.
- `profiles.<name>.persona` (optional): When present, `voice-output.md` tells Claude to adopt this character's speaking style in all TTS-wrapped text. The persona object supports `name`, `title`, `user_name` (how Claude addresses you), and `style` (tone description).

### Step 4.2: Switch the active voice

Change the `"active"` field in `voice-profiles.json`:

```json
"active": "jarvis"
```

Or override per-session via environment variable:

```bash
CLAUDE_VOICE=jarvis claude
```

**Note**: `CLAUDE_VOICE` must be a **profile name** (a key in the `profiles` object), not a raw voice name. Setting `CLAUDE_VOICE=eric` will not work because there is no profile called `eric`; you would use `CLAUDE_VOICE=jarvis` which maps to the `eric` voice internally.

The TTS hook reads the profile on each invocation, so changes take effect on the next Claude response (no restart needed).

### Step 4.3: Create a custom Chatterbox voice profile

1. Record or obtain a WAV sample (10-30 seconds of clear speech, 16kHz or higher)
2. Place it in `~/.claude/voices/` (and copy to the Chatterbox `voices/` directory)
3. Add a profile entry:

```json
"my-friend": {
  "engine": "chatterbox",
  "voice": "my-friend.wav",
  "description": "My friend's voice",
  "exaggeration": 0.4,
  "speed": 1.0
}
```

4. Set `"active": "my-friend"` to use it.

---

## Part 5: Start and Stop Services

### Starting everything

```bash
bash "$VOICE_DIR/start-all.sh"
```

This starts (in order):
1. **Qwen3-TTS** on port 8880 (or Kokoro as fallback)
2. **Chatterbox** on port 8890 (or XTTS-v2 as fallback, if Chatterbox not installed)
3. **faster-whisper** on port 2022
4. **claude-stt daemon** (push-to-talk hotkey listener)

Each service gets a health check (30 seconds timeout). Output looks like:

```
Starting voice services...
  qwen3-tts starting (PID 12345, port 8880)...
  chatterbox starting (PID 12346, port 8890)...
  whisper starting (PID 12347, port 2022)...
Waiting for services...
  TTS (8880) ready
  Clone TTS (8890) ready
  STT (2022) ready
  claude-stt daemon started (push-to-talk: ctrl+f12)
Done. Logs in ~/.voicemode/logs/
```

### Checking status

```bash
bash "$VOICE_DIR/start-all.sh" status
```

### Stopping everything

```bash
bash "$VOICE_DIR/start-all.sh" stop
```

This kills all voice service processes (including the claude-stt daemon), cleans up PID files (`~/.voicemode/pids/`), and scans for orphaned processes on the expected ports. The daemon's PID is read from `~/.claude/plugins/claude-stt/daemon.pid` (separate from its config file `config.toml` in the same directory).

### Running individual services

Each service has its own start script if you only need one:

```bash
bash "$VOICE_DIR/start-qwen3-tts-server.sh"    # TTS only
bash "$VOICE_DIR/start-chatterbox-server.sh"    # Voice cloning only
bash "$VOICE_DIR/start-whisper-server.sh"       # STT only
```

---

## Part 6: Usage

### TTS (Claude speaks)

Once everything is set up:

1. Start voice services: `bash "$VOICE_DIR/start-all.sh"`
2. Start Claude Code: `claude`
3. Ask Claude anything

Claude's responses will contain `«tts»...«/tts»` markers (Unicode guillemets, not ASCII angle brackets) around conversational prose. The Stop hook extracts these, sends the text to the active TTS engine, and plays the audio through your speakers. These markers are invisible to you in normal usage; they appear only in the raw transcript.

**What gets spoken**: Greetings, status updates, reactions, summaries, transitions. Code blocks, file paths, error messages, and technical lists are NOT spoken.

**What it sounds like**: Depends on your active voice profile. With `default`, you hear a natural female voice. With `picard` (Chatterbox), you hear a voice-cloned Patrick Stewart.

### STT (Push-to-Talk)

1. Ensure the claude-stt daemon is running (started by `start-all.sh`)
2. In Claude Code, **hold Ctrl+F12** and speak
3. Release the key when done
4. Your speech is transcribed and injected into the terminal as text

The transcription takes roughly 1x real-time (10 seconds of speech takes about 10 seconds to transcribe with `large-v3`). The `medium` model is faster but less accurate.

### Switching voices mid-session

Edit `voice-profiles.json` and change the `"active"` field. The change takes effect on the next Claude response (no restart needed).

### Disabling TTS temporarily

Remove or comment out the TTS hook in `settings.json` and restart Claude Code. Or simply stop the TTS services:

```bash
# Stop just TTS (keep STT running)
kill $(cat ~/.voicemode/pids/qwen3-tts.pid)
```

When the TTS engine is unreachable, the hook silently skips playback. No errors appear in Claude Code.

---

## Part 7: Troubleshooting

### No audio plays after Claude responds

1. **Check services are running**:
   ```bash
   bash "$VOICE_DIR/start-all.sh" status
   ```
2. **Check the hook is registered**: Look for `tts-marker-hook.js` in `~/.claude/settings.json` under the `Stop` section.
3. **Check the hook log**: Look at `$TEMP/claude-tts-hook.log` (Windows: `%TEMP%\claude-tts-hook.log`). Common messages:
   - `BAIL: no TTS markers in message`: Claude didn't wrap text in markers. Check `voice-output.md` is in `~/.claude/rules/`.
   - `BAIL: no assistant message found`: Transcript parsing issue. Usually resolves on next response.
4. **Check the worker log**: Look at `$TEMP/claude-tts-worker.log`. Connection errors here mean the TTS engine isn't running.
5. **Test the TTS endpoint directly**:
   ```bash
   curl -s -o /tmp/test.wav -X POST http://127.0.0.1:8880/v1/audio/speech \
     -H "Content-Type: application/json" \
     -d '{"model":"qwen3-tts","input":"Test","voice":"vivian","response_format":"wav"}'
   ```

### Audio overlaps or garbles

The hook uses a file-based lock (`$TEMP/claude-tts-playback.lock`) to serialize playback. If audio overlaps:

1. **Delete the stale lock**: `rm -f "$TEMP/claude-tts-playback.lock"`
2. Check for multiple concurrent sessions. The lock handles this automatically, but stale locks from crashed processes can persist.

### Push-to-talk doesn't work

1. **Check the daemon is running**:
   ```bash
   bash "$VOICE_DIR/start-all.sh" status
   # Should show: claude-stt    running (PID XXXX, hotkey: ctrl+f12)
   ```
2. **Check the whisper server**:
   ```bash
   curl http://127.0.0.1:2022/health
   ```
3. **Check config.toml exists**: `cat ~/.claude/plugins/claude-stt/config.toml`
4. **Check for duplicate daemons** (Windows): If you're seeing duplicated text, apply the daemon.py patch from Step 2.4.
5. **Try a different hotkey**: Some key combinations may be captured by other software. Edit `config.toml` and restart the daemon.

### "Qwen3-TTS not installed" or "Chatterbox not installed"

The setup scripts install each service into `~/.voicemode/services/<name>/.venv`. If this directory is missing, the service wasn't installed. Re-run the setup:

```bash
bash "$VOICE_DIR/setup-qwen3-tts.sh"            # for Qwen3-TTS
bash "$VOICE_DIR/setup-chatterbox.sh"            # for Chatterbox
bash "$VOICE_DIR/setup-voice-services.sh" --whisper  # for faster-whisper
```

### CUDA / GPU errors

1. **Check NVIDIA driver**: `nvidia-smi` should show your GPU and CUDA Version 12.8+
2. **Check PyTorch sees CUDA** (activate the venv for the failing service):
   ```bash
   # For Qwen3-TTS:
   source ~/.voicemode/services/qwen3-tts/.venv/Scripts/activate  # or bin/activate on Linux
   # For Chatterbox:
   source ~/.voicemode/services/chatterbox/.venv/Scripts/activate
   # For whisper:
   source ~/.voicemode/services/whisper-venv/Scripts/activate

   python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
   deactivate
   ```
3. **VRAM exhaustion**: If running all three services, you need 14-21 GB VRAM. Check with `nvidia-smi`. If VRAM is tight, use `medium` instead of `large-v3` for whisper, or skip Chatterbox.

### Windows: Python not found

The scripts look for `python.exe`, then `python3`, then `python`. If none are found:

```bash
# Check where Python is
where python.exe
py --list

# Override the Python path
VOICEMODE_PYTHON="C:/Python312/python.exe" bash "$VOICE_DIR/setup-qwen3-tts.sh"
```

### Windows: DLL errors (cublas64_12.dll not found)

The whisper setup script copies cuBLAS DLLs next to ctranslate2. If this step failed:

```bash
source ~/.voicemode/services/whisper-venv/Scripts/activate
python -c "
import ctranslate2, os, importlib.util, shutil, glob
ct2_dir = os.path.dirname(ctranslate2.__file__)
spec = importlib.util.find_spec('nvidia.cublas')
if spec:
    d = list(spec.submodule_search_locations)[0]
    b = os.path.join(d, 'bin')
    for dll in glob.glob(os.path.join(b, '*.dll')):
        shutil.copy(dll, ct2_dir)
        print(f'Copied {os.path.basename(dll)}')
"
```

### Service logs

All service logs are in `~/.voicemode/logs/`:

```bash
ls ~/.voicemode/logs/
# qwen3-tts.log  chatterbox.log  whisper.log  claude-stt.log
```

Check these for startup errors, CUDA issues, or model loading failures.

---

## Part 8: File Reference

### Scripts (in repo `src/voice/`)

| File | Purpose |
|------|---------|
| `start-all.sh` | Start/stop/status all services |
| `start-qwen3-tts-server.sh` | Start Qwen3-TTS on port 8880 |
| `start-chatterbox-server.sh` | Start Chatterbox on port 8890 |
| `start-whisper-server.sh` | Start faster-whisper on port 2022 |
| `setup-qwen3-tts.sh` | Install Qwen3-TTS |
| `setup-chatterbox.sh` | Install Chatterbox |
| `setup-voice-services.sh` | Install Kokoro and/or whisper |
| `tts-marker-hook.js` | Stop hook: extract markers and play TTS |
| `voice-profiles.json` | Voice profile configuration |
| `whisper_server.py` | Custom FastAPI whisper server |
| `patches/claude-stt/` | Windows fixes for claude-stt plugin |

### Runtime directories

| Path | Contents |
|------|----------|
| `~/.voicemode/services/` | Service installations (venvs, repos) |
| `~/.voicemode/logs/` | Service log files |
| `~/.voicemode/pids/` | PID files for running services |
| `~/.voicemode/models/` | Downloaded model files |
| `~/.claude/voices/` | Voice sample WAV files (for Chatterbox) |
| `~/.claude/plugins/claude-stt/` | STT plugin config and daemon PID |
| `~/.claude/hooks/` | Hook scripts (including TTS hook) |
| `~/.claude/rules/` | Rules (including voice-output.md) |

### Configuration files

| File | What it controls |
|------|-----------------|
| `~/.claude/hooks/voice-profiles.json` | Active voice, engine endpoints, profiles |
| `~/.claude/plugins/claude-stt/config.toml` | Push-to-talk hotkey, recording settings |
| `~/.claude/settings.json` | Hook registration (Stop hook for TTS) |
| `~/.claude/rules/voice-output.md` | TTS marker generation rules for Claude |

---

## Quick Start Checklist

All commands assume `$VOICE_DIR` is set (see Part 0). Alternatively, `cd` into the voice scripts directory first.

For a minimal setup (TTS only, built-in voices):

- [ ] Install Qwen3-TTS: `bash "$VOICE_DIR/setup-qwen3-tts.sh"`
- [ ] Install whisper: `bash "$VOICE_DIR/setup-voice-services.sh" --whisper`
- [ ] Copy `tts-marker-hook.js` to `~/.claude/hooks/`
- [ ] Copy `voice-profiles.json` next to the hook (set `"active": "default"`)
- [ ] Register the TTS Stop hook in `~/.claude/settings.json`
- [ ] Ensure `voice-output.md` is in `~/.claude/rules/`
- [ ] Start services: `bash "$VOICE_DIR/start-all.sh"`
- [ ] Start Claude Code: `claude`

For push-to-talk (add to the above):

- [ ] Install claude-stt plugin: `claude plugin add jarrodwatts/claude-stt`
- [ ] Create `~/.claude/plugins/claude-stt/config.toml`
- [ ] Apply Windows patches (if on Windows)
- [ ] Start services: `bash "$VOICE_DIR/start-all.sh"` (starts daemon automatically)
- [ ] Hold Ctrl+F12 and speak

For voice cloning (add to the above):

- [ ] Install Chatterbox: `bash "$VOICE_DIR/setup-chatterbox.sh"`
- [ ] Place WAV samples in `~/.claude/voices/`
- [ ] Add a Chatterbox profile to `voice-profiles.json`
- [ ] Set `"active"` to your cloned voice profile

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VOICEMODE_PROFILES` | (same dir as hook) | Path to voice-profiles.json |
| `CLAUDE_VOICE` | (from profiles) | Override active voice profile (must be a profile name like `jarvis`, not a voice name like `eric`) |
| `TTS_HOOK_DEBUG` | `0` | Set to `1` for verbose hook logging |
| `VOICEMODE_PYTHON` | `python.exe` | Override Python binary path |
| `VOICEMODE_QWEN3_PORT` | `8880` | Override Qwen3-TTS port |
| `VOICEMODE_CHATTERBOX_PORT` | `8890` | Override Chatterbox port |
| `VOICEMODE_WHISPER_PORT` | `2022` | Override whisper port |
| `VOICEMODE_WHISPER_MODEL` | `large-v3` | Override whisper model |
| `VOICEMODE_WHISPER_DEVICE` | `cuda` | Override whisper device (cpu/cuda) |
| `VOICEMODE_WHISPER_LANGUAGE` | `en` | Override whisper language |
| `CLAUDE_STT_PYTHON` | (auto-detected) | Override Python for claude-stt daemon |
