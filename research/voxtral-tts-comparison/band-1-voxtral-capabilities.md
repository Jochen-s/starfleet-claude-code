# Band 1 -- Voxtral TTS Capabilities & Local Deployment

Research date: 2026-03-27

---

## 1. What is Voxtral TTS? Architecture, Release Date, Model Details

Voxtral TTS is Mistral AI's first text-to-speech model, released on **March 26, 2026** ([Mistral blog](https://mistral.ai/news/voxtral-tts)). It is a 4-billion-parameter system designed for fast, natural, multilingual speech synthesis with instant voice cloning from as little as 3 seconds of reference audio.

### Architecture (from ArXiv paper 2603.25551)

The system comprises three distinct components ([ArXiv paper](https://arxiv.org/html/2603.25551v1)):

**1. Voxtral Codec (300M parameters)**
- Convolutional-transformer autoencoder
- Input: 24 kHz mono waveforms, output at 12.5 Hz frame rate
- Produces 37 discrete tokens per frame: 1 semantic token (VQ codebook size 8192) + 36 acoustic tokens (FSQ with 21 levels each)
- Bitrate: 2.14 kbps
- Encoder: 4 blocks with causal self-attention (sliding windows 16, 8, 4, 2), 8x downsampling
- Decoder: mirrors encoder with transposed convolutions

**2. Decoder Backbone (3.4B parameters)**
- Based on Ministral 3B architecture (`mistralai/Ministral-3-3B-Base-2512`)
- Auto-regressive decoder-only transformer
- Cross-entropy loss on semantic codebook (8192 tokens + EOA end-of-audio token)

**3. Flow-Matching Acoustic Transformer (390M parameters)**
- 3-layer bidirectional transformer
- Models continuous acoustic embeddings in 36-dimensional space
- Inference uses 8 function evaluations (NFEs) with Euler method
- Classifier-free guidance (CFG) with alpha=1.2
- Balances speaker adherence with text-driven emotion inference

**Key specifications**:
- Total parameters: ~4.1B (3.4B + 390M + 300M)
- Languages: 9 (English, French, German, Spanish, Dutch, Portuguese, Italian, Hindi, Arabic)
- Voice cloning: adapts from 3-30 seconds of reference audio (optimal: 3-25 seconds)
- 20 preset voices included
- Audio output: 24 kHz in WAV, PCM, FLAC, MP3, AAC, Opus formats
- Maximum native generation: up to 2 minutes of audio per call
- Post-training: DPO (Direct Preference Optimization) with rejection sampling

**Model variants on Hugging Face**:
- `mistralai/Voxtral-4B-TTS-2603` -- the full TTS production model ([HF link](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603))
- `mistralai/Voxtral-Mini-4B-Realtime-2602` -- an earlier realtime/streaming variant from February 2026 ([HF link](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602))

Technical paper: [ArXiv 2603.25551](https://arxiv.org/html/2603.25551v1) / [PDF](https://mistral.ai/static/research/voxtral-tts.pdf)

---

## 2. Local/Self-Hosted Deployment & Hardware Requirements

**Voxtral TTS can run fully locally and self-hosted.** The weights are openly available on Hugging Face and the model runs offline without any API dependency.

### Hardware Requirements

| Specification | Value | Source |
|---|---|---|
| GPU VRAM | >= 16 GB (single GPU) | [HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) |
| Tested GPU | NVIDIA H200 | [HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) |
| Model weights (RAM) | ~3 GB (BF16) | [DEV Community](https://dev.to/mcrolly/mistral-voxtral-tts-what-open-source-on-device-voice-ai-means-for-local-human-ai-interaction-and-omf) |
| vLLM version | >= 0.18.0 | [HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) |
| Weight format | BF16 | [HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) |

The 16 GB VRAM requirement means it fits on consumer GPUs like RTX 4080 (16 GB), RTX 3090/4090 (24 GB), or any datacenter GPU (A100, H100, H200).

### Deployment Methods

**1. vLLM-Omni (recommended, production-grade)**

```bash
# Install
uv pip install -U vllm
uv pip install git+https://github.com/vllm-project/vllm-omni.git --upgrade

# Serve
vllm serve mistralai/Voxtral-4B-TTS-2603 --omni
```

Source: [HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)

**2. voxtral-tts.c (experimental, CPU-capable)**

A pure C implementation by mudler: [GitHub](https://github.com/mudler/voxtral-tts.c). This could enable CPU-only or embedded deployment but is experimental.

**3. Mistral API (hosted)**

Available at $0.016 per 1,000 characters via Mistral Studio for those who prefer not to self-host ([Mistral blog](https://mistral.ai/news/voxtral-tts)).

---

## 3. Licensing

**IMPORTANT: The license situation is nuanced and sources conflict.**

- **Multiple news outlets** (SiliconANGLE, TechCrunch, VentureBeat) initially described Voxtral TTS as "open-source" or "open-weights" with some referencing Apache 2.0.
- **The ArXiv paper** explicitly states: **CC BY-NC license** (Creative Commons Attribution-NonCommercial) ([ArXiv 2603.25551](https://arxiv.org/html/2603.25551v1)).
- **The Hugging Face model card** states: **CC BY-NC 4.0** with the note that this license "inherits from voice references: EARS, CML-TTS, IndicVoices-R, Arabic Natural Audio datasets" ([HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)).

**Conclusion**: The authoritative sources (the paper and HF model card) say **CC BY-NC 4.0**. This means:
- Free to use, share, and adapt for **non-commercial purposes**
- Attribution required
- **Commercial use is NOT permitted** without separate licensing
- This is significantly more restrictive than Apache 2.0
- The CC BY-NC 4.0 restriction appears to come from the training data (voice reference datasets) rather than the model architecture itself

This is a critical distinction for production deployment: while the model weights are freely downloadable, using them in a commercial product would violate the license. News outlets calling it "Apache 2.0" appear to have been incorrect or referring to the base Ministral model rather than the TTS release.

---

## 4. OpenAI-Compatible API (`/v1/audio/speech`)

**Yes, Voxtral TTS exposes a fully OpenAI-compatible `/v1/audio/speech` endpoint** when served via vLLM-Omni ([vLLM-Omni docs](https://docs.vllm.ai/projects/vllm-omni/en/latest/serving/speech_api/)).

### Endpoint Details

**`POST /v1/audio/speech`** -- standard text-to-speech

Request parameters:
- `input` (string, required) -- text to synthesize
- `model` (string) -- e.g. `"mistralai/Voxtral-4B-TTS-2603"`
- `voice` (string, default: model-specific) -- speaker name from 20 preset voices
- `response_format` (string, default: "wav") -- supports wav, mp3, flac, pcm, aac, opus
- `speed` (float, default: 1.0) -- range 0.25-4.0

vLLM-Omni extensions beyond standard OpenAI API:
- `language` (string) -- language selection
- `ref_audio` (string) -- reference audio for voice cloning (URL, base64, or file URI)
- `ref_text` (string) -- transcript of reference audio
- `max_new_tokens` (integer, default: 2048)

Response: binary audio data with appropriate Content-Type header.

### Client Example (from model card)

```python
import io, httpx, soundfile as sf

BASE_URL = "http://<your-server>:8000/v1"
payload = {
    "input": "Paris is a beautiful city!",
    "model": "mistralai/Voxtral-4B-TTS-2603",
    "response_format": "wav",
    "voice": "casual_male",
}
response = httpx.post(f"{BASE_URL}/audio/speech", json=payload, timeout=120.0)
audio_array, sr = sf.read(io.BytesIO(response.content), dtype="float32")
```

Source: [HF model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)

### Additional Endpoints

- **`GET /v1/audio/voices`** -- list available voices
- **`WS /v1/audio/speech/stream`** -- WebSocket streaming with incremental text input and sentence-scoped audio output
- **`POST /v1/audio/speech/batch`** -- batch processing (1-32 items simultaneously)

Source: [vLLM-Omni Speech API docs](https://docs.vllm.ai/projects/vllm-omni/en/latest/serving/speech_api/)

### Compatibility Note

The vLLM-Omni `/v1/audio/speech` endpoint is designed to be a drop-in replacement for the OpenAI TTS API. Clients using the OpenAI SDK can connect by changing the base URL to the vLLM endpoint. This is the same pattern used by Qwen3-TTS and Fish Speech S2 Pro, which are also supported by vLLM-Omni on the same endpoint.

---

## 5. Voice Quality Benchmarks (MOS Scores, Latency, Real-Time Factor)

### Automatic Evaluation Metrics (from ArXiv paper)

Voxtral TTS was evaluated against ElevenLabs v3 and ElevenLabs Flash v2.5 on SEED-TTS benchmarks and 9 MiniMax languages ([ArXiv 2603.25551](https://arxiv.org/html/2603.25551v1)):

| Metric | Voxtral TTS (best) | Notes |
|---|---|---|
| WER (English) | 0.63% | Word error rate; lower is better |
| Speaker Similarity (Hindi) | 0.839 | Cosine similarity; higher is better |
| UTMOS (English) | 4.30 | Naturalness proxy (scale 1-5); higher is better |

Note from the paper: "UTMOS is only a loose proxy, not well calibrated across languages and only weakly correlated with human preference."

### Voxtral Codec Quality (Table 2 -- Expresso Dataset)

Compared against Mimi codec at comparable bitrate:

| Metric | Voxtral Codec | Mimi (16 codebooks) |
|---|---|---|
| Mel Distance | 0.545 | 0.618 |
| STFT Distance | 0.982 | 1.100 |
| PESQ | 3.05 | 2.67 |
| ESTOI | 0.882 | 0.865 |
| ASR-WER | 10.66% | 11.01% |
| Speaker Similarity | 0.843 | 0.829 |

Voxtral's codec outperforms Mimi on all metrics at lower bitrate (2.14 kbps).

### Human Evaluation Results

**Flagship Voices (Table 4 from paper)**:
- Explicit emotion steering vs ElevenLabs v3: **51.0% win rate** (near parity)
- Implicit steering vs ElevenLabs Flash v2.5: **58.3% win rate**
- Implicit steering vs ElevenLabs v3: **55.4% win rate**

**Zero-Shot Voice Cloning (Table 5 from paper)**:

Overall win rate vs ElevenLabs Flash v2.5: **68.4%**

| Language | Win Rate vs Flash v2.5 |
|---|---|
| Spanish | 87.8% |
| Hindi | 79.8% |
| Portuguese | 74.4% |
| Arabic | 72.9% |
| German | 72.0% |
| English | 60.8% |
| Italian | 57.1% |
| French | 54.4% |
| Dutch | 49.4% |

Evaluation methodology: 77 prompts (11 neutral, 66 with expected emotion), blind A/B testing by human annotators.

### DPO Training Improvements (Table 6)

DPO post-training significantly improved multilingual quality:
- German WER: 4.08% improved to 0.83% (-3.25 points)
- French WER: 5.01% improved to 3.22% (-1.79 points)
- UTMOS gains: +0.04 to +0.13 across languages

### Latency and Throughput

**Single-request latency** (with CUDA graphs on H200):

| Mode | Latency (TTFA) | RTF | Improvement |
|---|---|---|---|
| Eager mode | 133 ms | 0.258 | baseline |
| CUDA graphs | **70 ms** | **0.103** | 47% faster |

**Throughput scaling on H200** (Table 8 from paper):

| Concurrency | Latency | RTF | Throughput (char/s/GPU) | Wait Rate |
|---|---|---|---|---|
| 1 | 70 ms | 0.103 | 119 | 0% |
| 16 | 331 ms | 0.237 | 879 | 0% |
| 32 | 552 ms | 0.302 | 1,431 | 0% |

**RTF (Real-Time Factor)**: 0.103 at concurrency 1 means the model generates audio ~9.7x faster than real-time playback speed. At concurrency 32, throughput reaches 1,431 characters per second per GPU.

### Key Benchmark Takeaways

1. **vs ElevenLabs Flash v2.5**: Voxtral clearly wins on naturalness (58-68% human preference) and voice cloning (68.4% overall). Competitive on latency.
2. **vs ElevenLabs v3**: Near parity on flagship voices (51-55% win rate). ElevenLabs v3 is better at explicit emotion steering; Voxtral is competitive on implicit steering.
3. **Latency**: 70 ms TTFA is excellent for real-time applications (conversational agents, voice assistants).
4. **RTF**: 0.103 (9.7x real-time) makes it suitable for streaming applications.
5. **Throughput**: Scales well under load -- 32 concurrent requests achieve 1,431 char/s on a single H200.

---

## Summary Table

| Aspect | Value |
|---|---|
| Release date | March 26, 2026 |
| Developer | Mistral AI |
| Parameters | ~4.1B total (3.4B decoder + 390M flow-matching + 300M codec) |
| Base model | Ministral 3B |
| Languages | 9 |
| Voice cloning | 3-30 seconds reference audio |
| Preset voices | 20 |
| License | **CC BY-NC 4.0** (non-commercial) |
| Self-hosted | Yes, via vLLM-Omni |
| GPU VRAM | >= 16 GB |
| OpenAI-compatible API | Yes (`/v1/audio/speech` via vLLM-Omni) |
| Latency (TTFA) | 70 ms (H200, CUDA graphs) |
| Real-time factor | 0.103 (9.7x faster than real-time) |
| UTMOS (English) | 4.30 |
| Output sample rate | 24 kHz |
| Max generation | 2 minutes per call |
| API price (hosted) | $0.016 / 1K chars |

---

## Sources

- [Mistral Official Blog: Speaking of Voxtral](https://mistral.ai/news/voxtral-tts)
- [ArXiv Paper 2603.25551: Voxtral TTS](https://arxiv.org/html/2603.25551v1)
- [ArXiv Paper PDF](https://mistral.ai/static/research/voxtral-tts.pdf)
- [TechCrunch: Mistral releases a new open source model for speech generation](https://techcrunch.com/2026/03/26/mistral-releases-a-new-open-source-model-for-speech-generation/)
- [VentureBeat: Mistral AI TTS model beats ElevenLabs](https://venturebeat.com/orchestration/mistral-ai-just-released-a-text-to-speech-model-it-says-beats-elevenlabs-and)
- [SiliconANGLE: Mistral releases open-weights speaking AI model](https://siliconangle.com/2026/03/26/mistral-releases-open-weights-speaking-ai-model-voxtral-tts/)
- [The Decoder: Voxtral clones voices from three seconds](https://the-decoder.com/mistrals-first-open-weight-tts-model-voxtral-clones-voices-from-three-seconds-of-audio-across-nine-languages/)
- [Hugging Face: Voxtral-4B-TTS-2603](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)
- [Hugging Face: Voxtral-Mini-4B-Realtime-2602](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602)
- [vLLM-Omni: Speech API docs](https://docs.vllm.ai/projects/vllm-omni/en/latest/serving/speech_api/)
- [GitHub: voxtral-tts.c (pure C implementation)](https://github.com/mudler/voxtral-tts.c)
- [DEV Community: Voxtral on-device voice AI](https://dev.to/mcrolly/mistral-voxtral-tts-what-open-source-on-device-voice-ai-means-for-local-human-ai-interaction-and-omf)
- [DataCamp: Mistral's Voxtral Guide](https://www.datacamp.com/tutorial/voxtral-mistral)
- [Red Hat Developer: Run Voxtral Mini on vLLM](https://developers.redhat.com/articles/2026/02/06/run-voxtral-mini-4b-realtime-vllm-red-hat-ai)

Status: COMPLETE
