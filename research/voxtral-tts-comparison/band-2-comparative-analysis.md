# Band 2: Comparative Analysis with Current Stack

**Research question**: Voxtral TTS by Mistral AI: comprehensive comparison with Qwen3-TTS, Chatterbox TTS, Kokoro TTS, and XTTS v2 for local self-hosted deployment
**Focus questions**:
1. How does Voxtral compare to Qwen3-TTS on quality, speed, and VRAM?
2. How does Voxtral compare to Chatterbox on voice cloning capabilities?
3. What are the multilingual capabilities vs our current engines?
4. Latency comparison for real-time conversational TTS use cases?
5. Community adoption, ecosystem maturity, and integration options?

---

## 1. Voxtral vs Qwen3-TTS: Quality, Speed, and VRAM

### Architecture

Voxtral TTS (released 2026-03-26) is a 4B-parameter model built on three components: a 3.4B transformer decoder backbone (based on Ministral 3B), a 390M flow-matching acoustic transformer, and a 300M in-house neural audio codec ([Mistral blog](https://mistral.ai/news/voxtral-tts)). Its codec operates at 12.5Hz frame rate with a semantic VQ of 8192 entries and 36-dimension acoustic FSQ at 21 levels, achieving 2.14 kbps bitrate ([arXiv paper](https://arxiv.org/html/2603.25551v1)).

Qwen3-TTS (open-sourced by Alibaba's Qwen team) is available in a 1.7B CustomVoice variant and was trained on over 5 million hours of speech data ([Qwen blog](https://qwen.ai/blog?id=qwen3tts-0115)). It uses a 12Hz token rate and supports streaming generation natively ([GitHub](https://github.com/QwenLM/Qwen3-TTS)).

### VRAM Requirements

| Model | VRAM (measured) | Minimum GPU |
|-------|-----------------|-------------|
| Voxtral 4B TTS | ~8 GB weights, 16GB recommended envelope | RTX 4060 Ti 16GB or better ([HuggingFace](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)) |
| Voxtral (pure C port) | ~7.8 GB peak, ~10 GB RAM total | Any CUDA GPU ([GitHub voxtral-tts.c](https://github.com/mudler/voxtral-tts.c)) |
| Qwen3-TTS 1.7B | ~3.89 GB (bfloat16) | 6GB+ VRAM; RTX 3060 workable ([benchmark](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md)) |
| Qwen3-TTS 0.6B | ~4 GB with overhead | 4GB+ VRAM ([DeepWiki](https://deepwiki.com/mu-zi-lee/qwen3-tts-skill/8.2-memory-and-hardware-requirements)) |

**Verdict**: Qwen3-TTS requires roughly half the VRAM of Voxtral (3.9 GB vs 8-16 GB), making it more accessible on consumer hardware. However, Voxtral's "~3 GB RAM" marketing claim refers to minimum model weight size, not practical deployment.

### Speed and Quality

**Voxtral TTS** (on H200 GPU, from the technical paper):
- Time-to-first-audio: 70ms at concurrency 1
- Real-time factor (RTF): 0.103 at concurrency 1 (i.e., ~9.7x real-time)
- Throughput: 119 chars/s (concurrency 1), scales to 1,431 chars/s at concurrency 32
- UTMOS-v2 naturalness: 4.11 (vs ElevenLabs v3 at 3.92)
- Speaker similarity (ECAPA-TDNN, English): 0.786 (vs ElevenLabs v3 at 0.484)
([arXiv paper](https://arxiv.org/html/2603.25551v1))

**Qwen3-TTS 1.7B** (on RTX 3090, community benchmark):
- Average latency: 8.49s for mixed-length texts (official PyTorch backend)
- RTF: 0.97 average (barely real-time) on RTX 3090; 0.83 with vLLM-Omni
- With Flash Attention 2: RTF 0.87
- Short texts (2 words): 1.01s warm start
- Long texts (36 words): 21.16s warm start
([Community benchmark](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md))

**Verdict**: Voxtral is dramatically faster. On datacenter hardware (H200), it achieves RTF 0.103 compared to Qwen3-TTS's RTF 0.83-0.97 on an RTX 3090. Even accounting for hardware differences, Voxtral's architecture appears significantly more efficient for inference. Qwen3-TTS struggles to maintain real-time performance on consumer GPUs, while Voxtral should comfortably exceed real-time even on an RTX 3090/4090. Quality metrics also favor Voxtral, with notably higher naturalness (UTMOS 4.11 vs benchmarks showing Qwen3 at comparable levels) and substantially better speaker similarity scores.

---

## 2. Voxtral vs Chatterbox: Voice Cloning Capabilities

### Voice Cloning Quality

**Voxtral TTS** achieves a 68.4% win rate over ElevenLabs Flash v2.5 in human evaluation for multilingual zero-shot voice cloning, rising to 87.7% for Spanish and 79.8% for Hindi. It captures "accent, inflections, intonations and even disfluencies" from reference audio as short as 3 seconds. Speaker similarity (ECAPA-TDNN) reaches 0.786 for English, dramatically above ElevenLabs v3's 0.484 ([arXiv paper](https://arxiv.org/html/2603.25551v1)). However, against flagship voices with explicit emotion steering (rather than zero-shot cloning), Voxtral's advantage narrows to 58.3% vs ElevenLabs Flash v2.5, and it loses to Gemini 2.5 Flash TTS at only 37.1% win rate ([Mistral blog](https://mistral.ai/news/voxtral-tts)).

**Chatterbox** achieves a 63.75% preference rate vs ElevenLabs in blind testing using 7-20 second audio clips. Independent benchmarks score Chatterbox at 95/100 vs ElevenLabs Turbo at 90/100 ([GenMediaLab](https://www.genmedialab.com/news/chatterbox-open-source-tts-elevenlabs-alternative/)). Chatterbox includes an "exaggeration" parameter for emotion control and requires no seed fixing or language-specific prompt engineering ([Resemble AI](https://www.resemble.ai/chatterbox/)).

### Practical Voice Cloning Comparison

A real-world user report comparing Qwen3-TTS and Chatterbox for French voice cloning found Chatterbox dramatically easier to use: it accepts longer reference audio (41 seconds vs Qwen3's 10-second limit), requires no seed management or instruct prompts, and produced validated results on first listen. Qwen3-TTS produced "a French speaker with a heavy German accent" while Chatterbox Multilingual handled it correctly ([archy.net](https://www.archy.net/from-qwen3-tts-to-chatterbox-finally-getting-voice-cloning-right/)).

### Key Differences

| Capability | Voxtral TTS | Chatterbox |
|-----------|-------------|------------|
| Minimum reference audio | 3 seconds | 5-7 seconds (zero-shot) |
| Win rate vs ElevenLabs | 68.4% (zero-shot multilingual) | 63.75% (blind test) |
| Speaker similarity (ECAPA) | 0.786 (English) | Not directly comparable |
| Emotion control | Captured from reference (no explicit steering) | Exaggeration parameter |
| Ease of use | Python API, vLLM serving | Drop-in, no tuning needed |
| Multilingual cloning | Strong across 9 languages | 23 languages (Multilingual variant) |

**Verdict**: Voxtral appears to have an edge in pure voice similarity metrics and multilingual zero-shot cloning, while Chatterbox offers superior ease of use and explicit emotion control. Both significantly outperform ElevenLabs in community evaluations. For practical voice cloning without parameter tuning, Chatterbox has a proven track record; Voxtral's results are lab-measured and not yet validated in the field (released 1 day ago).

---

## 3. Multilingual Capabilities vs Current Engines

### Comprehensive Language Support Matrix

| Engine | Languages | Count | Notable Strengths |
|--------|-----------|-------|-------------------|
| **Voxtral TTS** | EN, FR, DE, ES, NL, PT, IT, HI, AR | 9 | Dutch, Hindi, Arabic; zero-shot cross-lingual transfer (e.g., French accent in English from French prompt) ([Mistral blog](https://mistral.ai/news/voxtral-tts)) |
| **Qwen3-TTS** | ZH, EN, JA, KO, DE, FR, RU, PT, ES, IT + dialects | 10+ | CJK languages, dialectal voice profiles; trained on 5M+ hours ([Qwen blog](https://qwen.ai/blog?id=qwen3tts-0115)) |
| **Chatterbox Turbo** | English primarily | 1 | Optimized for English; no Chinese support ([Resemble AI](https://www.resemble.ai/chatterbox-turbo/)) |
| **Chatterbox Multilingual** | 23 languages incl. Chinese | 23 | Broadest coverage; 500M params ([community reports](https://www.communeify.com/en/blog/resemble-ai-chatterbox-turbo-opensource-tts-realism-performance/)) |
| **Kokoro** | EN (US/UK), FR, HI, ES, JA, ZH, IT, PT | ~8 | Primarily English-optimized; other languages functional but secondary ([kokorottsai.com](https://kokorottsai.com/)) |
| **XTTS v2** | 17 languages | 17 | Broadest single-model coverage until Chatterbox Multilingual; consistent quality across all languages ([Inferless comparison](https://www.inferless.com/learn/comparing-different-text-to-speech---tts--models-part-2)) |

### Cross-Lingual Analysis

For our stack (Dutch/German/English are primary needs):
- **Dutch (NL)**: Only Voxtral and XTTS v2 explicitly support Dutch. Chatterbox Multilingual likely supports it (23 languages). Qwen3-TTS does not list Dutch.
- **German (DE)**: Supported by Voxtral (WER 0.83%), Qwen3-TTS, XTTS v2, and likely Chatterbox Multilingual.
- **English (EN)**: All engines support English well. Voxtral WER 0.63%, with strong naturalness scores.

Voxtral's zero-shot cross-lingual capability is notable: it can produce accented speech in one language using a voice prompt from another language, despite not being explicitly trained for this ([arXiv paper](https://arxiv.org/html/2603.25551v1)). This is useful for multilingual voice assistants that need consistent identity across languages.

**Verdict**: For Dutch support specifically, Voxtral is the strongest new contender alongside XTTS v2. Qwen3-TTS excels in CJK languages but lacks Dutch. Chatterbox Multilingual offers the broadest coverage at 23 languages but is a larger model (500M). For a trilingual Dutch/German/English use case, Voxtral offers the best combination of quality and targeted language support.

---

## 4. Latency Comparison for Real-Time Conversational TTS

### Detailed Latency Benchmarks

| Engine | TTFA (time-to-first-audio) | RTF (real-time factor) | Hardware | Source |
|--------|---------------------------|------------------------|----------|--------|
| **Voxtral TTS** | 70ms (concurrency 1) | 0.103 (~9.7x RT) | H200 | [arXiv](https://arxiv.org/html/2603.25551v1) |
| **Voxtral TTS** | ~90ms typical | ~6x RT (claimed) | Consumer GPU | [Mistral blog](https://mistral.ai/news/voxtral-tts) |
| **Voxtral (pure C)** | ~0.4s/frame (CUDA) | 7.3-28x RT | GB10 Blackwell | [GitHub](https://github.com/mudler/voxtral-tts.c) |
| **Kokoro (82M)** | 100-300ms | 35-100x RT (GPU) | Consumer GPU | [Spheron](https://www.spheron.network/blog/voice-ai-gpu-infrastructure/) |
| **Kokoro (82M)** | <300ms all lengths | N/A | Various | [Inferless](https://www.inferless.com/learn/comparing-different-text-to-speech---tts--models-part-2) |
| **Chatterbox Turbo** | 472ms (first chunk) | 0.499 (streaming) | RTX 4090 | [GitHub streaming](https://github.com/davidbrowne17/chatterbox-streaming) |
| **Chatterbox Turbo** | <150ms TTFB | <200ms inference | Production GPU | [Resemble AI](https://www.resemble.ai/chatterbox/) |
| **Qwen3-TTS 1.7B** | 1.01s (short, warm) | 0.97 (avg, official) | RTX 3090 | [Benchmark](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md) |
| **Qwen3-TTS 1.7B** | N/A | 0.83 (vLLM-Omni) | RTX 3090 | [Benchmark](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md) |
| **XTTS v2** | <150ms (streaming) | ~0.3 (~3x RT) | Mid-tier GPU | [Deepgram guide](https://deepgram.com/learn/open-source-text-to-speech-production-guide) |

### Conversational TTS Suitability (target: <500ms TTFA for natural conversation)

1. **Kokoro** -- Best latency profile at 100-300ms; achieves 35-100x real-time. The 82M parameter count means it fits anywhere and responds near-instantly. However, quality is lower than frontier models.

2. **Voxtral** -- 70-90ms TTFA is outstanding, with 9.7x real-time on datacenter hardware. On consumer GPU (RTX 3090/4090), likely achieves similar sub-200ms TTFA based on architecture efficiency. The 3-component pipeline adds some overhead but the flow-matching decoder is fast.

3. **Chatterbox Turbo** -- Mixed signals: Resemble AI claims <150ms TTFB, but community streaming benchmarks show 472ms first-chunk latency on RTX 4090. The distilled single-step decoder helps, but overall pipeline latency is higher than Voxtral.

4. **XTTS v2** -- Decent at <150ms streaming latency and RTF 0.3, but an older architecture with less headroom.

5. **Qwen3-TTS** -- The weakest for conversational use. At 1+ second for even short utterances and RTF near 1.0, it barely keeps up with real-time on RTX 3090. Not suitable for sub-500ms conversational applications without significant hardware investment.

**Verdict**: For real-time conversational TTS, the ranking is: Kokoro (fastest, lowest quality) > Voxtral (very fast, highest quality) > Chatterbox Turbo (moderate, good quality) > XTTS v2 (adequate) > Qwen3-TTS (too slow). Voxtral offers the best quality-to-latency ratio.

---

## 5. Community Adoption, Ecosystem Maturity, and Integration

### TTS Arena V2 Rankings (Hugging Face, as of 2026-03-27)

| Model | ELO | Win Rate | Total Votes | Rank |
|-------|-----|----------|-------------|------|
| Chatterbox | 1506 | 47% | 1,640 | #15 |
| Kokoro v1.0 | 1500 | 45% | 3,276 | #17 |
| Voxtral TTS | Not yet listed | N/A | N/A | N/A (released 1 day ago) |
| Qwen3-TTS | Not yet listed | N/A | N/A | N/A |
| XTTS v2 | Not listed | N/A | N/A | Likely dropped |

For context, the top model (Vocu V3.0) has ELO 1583, and ElevenLabs Flash v2.5 sits at ELO 1541 (#8) ([TTS Arena V2](https://tts-agi-tts-arena-v2.hf.space/leaderboard)).

### Ecosystem Maturity

| Engine | Age | License | HF Downloads | GitHub Stars | OpenAI-Compatible API | Key Risk |
|--------|-----|---------|-------------|-------------|----------------------|----------|
| **Voxtral TTS** | 1 day | **CC BY-NC 4.0** (non-commercial) | New | New | Not yet (vLLM only) | Non-commercial license; no llama.cpp support; immature ecosystem ([HuggingFace](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)) |
| **Qwen3-TTS** | ~3 months | Apache 2.0 | Growing | Active repo | Community wrappers exist | Slow inference; Chinese ecosystem docs |
| **Chatterbox** | ~9 months | MIT | Trending #1 | Active | Yes (multiple) | English-only for Turbo; Multilingual is larger |
| **Kokoro** | ~15 months | Apache 2.0 | 2.2M+ | Active | Yes (Kokoro-FastAPI) | Limited languages; quality ceiling |
| **XTTS v2** | ~2 years | MPL 2.0 | Established | 44k (Coqui TTS) | Yes (openedai-speech) | Coqui shut down Dec 2024; community-maintained only |

### Integration Ecosystem

**Chatterbox** has the richest integration story as of March 2026:
- OpenAI-compatible API servers: multiple community projects ([chatterbox-tts-api](https://github.com/travisvn/chatterbox-tts-api), [Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server))
- Docker support with CUDA, ROCm, and CPU backends
- OpenWebUI, AnythingLLM, and Home Assistant integrations
- Streaming support via community fork

**Kokoro** has strong lightweight deployment:
- Kokoro-FastAPI with Docker support ([GitHub](https://github.com/remsky/Kokoro-FastAPI))
- ONNX runtime for CPU inference
- Intel iGPU acceleration via OpenVINO
- Home Assistant voice assistant integration

**Voxtral TTS** is brand new with limited integration:
- vLLM is the only supported inference backend (day-0 support via realtime streaming API) ([Red Hat Developer](https://developers.redhat.com/articles/2026/02/06/run-voxtral-mini-4b-realtime-vllm-red-hat-ai))
- No llama.cpp support yet (feature request filed: [GitHub issue](https://github.com/ggml-org/llama.cpp/issues/19696))
- Experimental pure C implementation exists but is not production-ready ([voxtral-tts.c](https://github.com/mudler/voxtral-tts.c))
- No OpenAI-compatible API wrapper yet

**XTTS v2** has the most mature ecosystem despite project abandonment:
- openedai-speech provides OpenAI-compatible API ([GitHub](https://github.com/matatonic/openedai-speech))
- TTS-WebUI supports it alongside many other models ([GitHub](https://github.com/rsxdalv/TTS-WebUI))
- Integrated into Coqui TTS library (44k stars)
- But Coqui AI shut down in December 2024; no official updates

### CRITICAL: License Warning

**Voxtral TTS is licensed CC BY-NC 4.0, which prohibits commercial use.** This is a significant limitation compared to Chatterbox (MIT), Kokoro (Apache 2.0), and Qwen3-TTS (Apache 2.0). Only the Voxtral Realtime/Transcribe (ASR) model uses Apache 2.0. For any commercial voice assistant deployment, Voxtral TTS cannot be used without a separate commercial license from Mistral ([HuggingFace model card](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)).

**Verdict**: Chatterbox has the most mature and accessible ecosystem for self-hosted deployment today, with Kokoro as the best ultralight option. Voxtral TTS shows exceptional quality metrics but its ecosystem is non-existent (1 day old), its license is non-commercial, and it only runs on vLLM. For production self-hosted deployment in the next 3-6 months, Chatterbox remains the safest choice. Voxtral is worth monitoring as the ecosystem develops, particularly if Mistral offers commercial licensing or community adapters emerge.

---

## Summary: Consolidated Comparison Matrix

| Dimension | Voxtral TTS | Qwen3-TTS | Chatterbox Turbo | Kokoro | XTTS v2 |
|-----------|-------------|-----------|------------------|--------|---------|
| **Parameters** | 4B (3 components) | 1.7B | 350M | 82M | 467M |
| **VRAM** | 8-16 GB | 3.9-6 GB | 4.5 GB | <2 GB | ~6 GB |
| **TTFA** | 70-90ms | 1,000ms+ | 150-472ms | 100-300ms | <150ms |
| **RTF** | 0.10 (H200) | 0.83-0.97 | 0.50 (4090) | 0.01-0.03 | 0.30 |
| **Quality (vs ElevenLabs)** | 68.4% win (zero-shot) | Comparable | 63.75% win | Lower tier | Lower tier |
| **Languages** | 9 | 10+ | 1 (Turbo) / 23 (Multi) | ~8 | 17 |
| **Dutch support** | Yes | No | Multilingual only | No | Yes |
| **Voice clone min** | 3s | 10s | 5-7s | N/A (preset) | 6s |
| **License** | CC BY-NC 4.0 | Apache 2.0 | MIT | Apache 2.0 | MPL 2.0 |
| **Commercial use** | NO | Yes | Yes | Yes | Yes |
| **OpenAI API compat** | No (vLLM only) | Community | Yes (multiple) | Yes | Yes |
| **Ecosystem age** | 1 day | ~3 months | ~9 months | ~15 months | ~2 years (abandoned) |
| **TTS Arena ELO** | Not listed | Not listed | 1506 (#15) | 1500 (#17) | Not listed |

---

## Sources

- [Mistral AI: Speaking of Voxtral (blog)](https://mistral.ai/news/voxtral-tts)
- [Voxtral TTS arXiv paper](https://arxiv.org/html/2603.25551v1)
- [VentureBeat: Mistral releases TTS model](https://venturebeat.com/orchestration/mistral-ai-just-released-a-text-to-speech-model-it-says-beats-elevenlabs-and)
- [TechCrunch: Mistral open source speech model](https://techcrunch.com/2026/03/26/mistral-releases-a-new-open-source-model-for-speech-generation/)
- [SiliconANGLE: Voxtral TTS](https://siliconangle.com/2026/03/26/mistral-releases-open-weights-speaking-ai-model-voxtral-tts/)
- [Voxtral-4B-TTS HuggingFace](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)
- [Voxtral-Mini-4B-Realtime HuggingFace](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602)
- [voxtral-tts.c pure C implementation](https://github.com/mudler/voxtral-tts.c)
- [Qwen3-TTS blog](https://qwen.ai/blog?id=qwen3tts-0115)
- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS)
- [Qwen3-TTS-Openai-Fastapi benchmarks](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md)
- [Qwen3-TTS hardware requirements (DeepWiki)](https://deepwiki.com/mu-zi-lee/qwen3-tts-skill/8.2-memory-and-hardware-requirements)
- [Resemble AI Chatterbox](https://www.resemble.ai/chatterbox/)
- [Resemble AI Chatterbox Turbo](https://www.resemble.ai/chatterbox-turbo/)
- [Chatterbox vs ElevenLabs blind test (GenMediaLab)](https://www.genmedialab.com/news/chatterbox-open-source-tts-elevenlabs-alternative/)
- [Chatterbox streaming fork (GitHub)](https://github.com/davidbrowne17/chatterbox-streaming)
- [Chatterbox-TTS-Server (GitHub)](https://github.com/devnen/Chatterbox-TTS-Server)
- [From Qwen3-TTS to Chatterbox (archy.net)](https://www.archy.net/from-qwen3-tts-to-chatterbox-finally-getting-voice-cloning-right/)
- [Kokoro TTS official](https://kokorottsai.com/)
- [Kokoro-FastAPI (GitHub)](https://github.com/remsky/Kokoro-FastAPI)
- [Kokoro-82M HuggingFace](https://huggingface.co/hexgrad/Kokoro-82M)
- [BentoML: Best Open-Source TTS 2026](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models)
- [Inferless: TTS Model Comparison](https://www.inferless.com/learn/comparing-different-text-to-speech---tts--models-part-2)
- [Spheron: Voice AI GPU Infrastructure](https://www.spheron.network/blog/voice-ai-gpu-infrastructure/)
- [Deepgram: Open Source TTS Production Guide](https://deepgram.com/learn/open-source-text-to-speech-production-guide)
- [TTS Arena V2 Leaderboard](https://tts-agi-tts-arena-v2.hf.space/leaderboard)
- [Artificial Analysis TTS Models](https://artificialanalysis.ai/text-to-speech/models)
- [Red Hat: Voxtral on vLLM](https://developers.redhat.com/articles/2026/02/06/run-voxtral-mini-4b-realtime-vllm-red-hat-ai)
- [llama.cpp Voxtral feature request](https://github.com/ggml-org/llama.cpp/issues/19696)
- [openedai-speech (GitHub)](https://github.com/matatonic/openedai-speech)
- [TTS-WebUI (GitHub)](https://github.com/rsxdalv/TTS-WebUI)
- [Communeify: Chatterbox Turbo analysis](https://www.communeify.com/en/blog/resemble-ai-chatterbox-turbo-opensource-tts-realism-performance/)

Status: COMPLETE
