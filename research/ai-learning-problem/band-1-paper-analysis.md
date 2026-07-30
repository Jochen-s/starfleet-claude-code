# Research Analysis: The Learning Problem of Deep Learning

Research date: 2026-03-28
Researcher: Claude Opus 4.6 (1M context)

---

## 1. Primary Paper

**Title**: "Why AI systems don't learn and what to do about it: Lessons on autonomous learning from cognitive science"
**Authors**: Emmanuel Dupoux (FAIR at META / EHESS), Yann LeCun (FAIR at META), Jitendra Malik (UC Berkeley)
**Published**: March 16, 2026
**arXiv**: [2603.15381](https://arxiv.org/abs/2603.15381)
**Full HTML**: [arxiv.org/html/2603.15381v1](https://arxiv.org/html/2603.15381v1)

### Paper Structure

1. What is Autonomous Learning?
2. Integrating Observation and Action (Systems A & B)
3. Meta-control for Autonomous Learning (System M)
4. Bootstrapping via Evolutionary-Developmental Framework
5. Conclusions
6. The Path Forward
7. Appendices A-C (System 1/2 distinction, advanced learning modes, meta-control signals)

### Core Thesis

Current AI systems do not autonomously learn after deployment. Learning is entirely outsourced to human expert pipelines (data collection, curation, training recipe design, loss function engineering). The paper proposes a tripartite architecture inspired by biological cognition to enable genuine autonomous learning.

### The System A / B / M Framework

**System A (Learning from Observation)**:
- Passive statistical learning from sensory stimuli
- Includes self-supervised learning (SSL), language modeling, perceptual learning
- Mathematically: given distribution D, a task generator produces input-target pairs; learning minimizes loss
- Examples: GPT, BERT, SimCLR, MoCo, DINO, CLIP, Flamingo
- Strengths: scales with large datasets, discovers hierarchical representations, supports transfer
- Limitations: requires human-curated distributions, no mechanism to decide what data to acquire, cannot distinguish correlation from causation, disconnected from agent action

**System B (Learning from Action)**:
- Optimization through environmental interaction
- Maximizes expected cumulative discounted reward J(pi) via policy pi, world model M, reward function r
- Paradigms: control theory, adaptive control, model-free RL, model-based RL, planning
- Strengths: grounded in control, learns from sparse/delayed outcomes, discovers novel solutions via search (cites Silver2017AlphaGoZero)
- Limitations: sample-inefficient, struggles in high-dimensional action spaces, depends on well-specified rewards

**Bidirectional Interactions**:
- A helps B: abstract state/action representations (SSL compresses inputs), predictive world models (enable planning), intrinsic reward signals (curiosity, prediction error, novelty)
- B helps A: active self-supervised learning (B selects informative portions via uncertainty), goal-directed SSL (B generates task-relevant trajectories)
- Integration example: imitation learning requires toggling between observing peer actions (A world modeling) and reproducing them (B policy learning)

**System M (Meta-Control Orchestrator)**:
- Hardwired autonomous orchestrator automating traditional MLOps pipeline functions
- Monitors low-dimensional meta-states, outputs meta-actions controlling data routing and pipeline assembly
- Meta-state categories:
  1. Epistemic signals: confidence, prediction error, learning gain, novelty
  2. Species-specific signals: faces, vocalizations, gaze, pedagogical cues, threats
  3. Somatic signals: energy, pain, arousal, stress levels
- Meta-actions: dynamically connect/disconnect input-output streams, toggle systems on/off, provide targets and internal rewards, access episodic memory for replay
- Biological precedents: infant face/speech preference, critical periods regulating plasticity, sleep-triggered memory consolidation, exploration/exploitation arbitration

**Episodic Memory**:
- System M integrates episodic memory for: raw/processed data storage, memory replay for offline learning, randomized batch learning, learning from imagination (memory-based simulation)
- Functions: replay during rest (decision-making, value updates), consolidation during sleep (schema formation, generalization), internal simulation for planning and counterfactual reasoning

### The Data Wall Argument

The paper identifies four concerns with the current scaling paradigm:

1. **Data wall**: exhaustion of quality internet text for training LLMs
2. **No environment interaction**: prevents learning beyond current human knowledge
3. **Language-centrism**: neglects spatial, embodied, grounded physical reasoning
4. **No continual learning**: systems are frozen post-deployment

The paper references Ilya Sutskever and Andrei Karpathy acknowledging diminishing returns. The specific citation for the data wall claim is "silver2025welcome" -- David Silver and Richard Sutton's "Welcome to the Era of Experience" paper (see Section 3 below).

**Assessment**: The data wall claim is well-supported. LeCun himself has argued repeatedly that text data alone will never create human-level AI. Sutskever told Reuters that pre-training results have plateaued, stating "we have but one internet." This is a widely accepted concern in the field, though some dispute its severity (e.g., synthetic data generation, multimodal training as potential mitigations).

### Evo/Devo (Evolutionary-Developmental) Framework

Bilevel optimization inspired by biological development:

**Outer Loop (Evolutionary Scale)**:
- Meta-parameters phi specify initial architecture (Systems A0, B0, M0)
- Fitness function L computed at lifecycle end
- Optimize: phi_{t+1} = argmin L(A0:Ak, B0:Bk)

**Inner Loop (Developmental Scale)**:
- Fixed System M controls A and B parameter updates through environment interaction
- A_{i+1}, B_{i+1} = Update(M, A_i, B_i, Env)

**Challenges acknowledged**:
1. Only one lifecycle = one data point; requires millions of simulated lifecycles
2. Bilevel optimization scales poorly with large architectures
3. Dynamic learner-environment system complicates optimization

**Mitigation**: evolutionary curriculum gradually increasing environment diversity/unpredictability.

### Ethical Considerations Raised

1. Adaptability vs. controllability tension (greater autonomy complicates alignment)
2. Alignment hacking (proxy objective mismatches)
3. Anthropomorphization risk (human-like behavior triggers misplaced trust)
4. Moral status (somatic signal processing raises questions about functional pain/fear)

### Authors' Own Assessment

The paper is explicitly framed as a "tentative blueprint" and "high-level roadmap" rather than a solved specification. The authors estimate fully autonomous, broad-scope learning is "probably decades away."

---

## 2. The LinkedIn Article by Dr. Gabriel Seiberth

**Title**: "The Learning Problem of Deep Learning -- And What That Means for the Direction of AI"
**Author**: Dr. Gabriel Seiberth (President Europe & Member of the Executive Board, KPIT)
**Platform**: LinkedIn
**Date**: Referenced as March 28, 2026

**Search result**: The specific article was NOT found in web search results. LinkedIn posts are notoriously difficult to index and retrieve via search engines, especially very recent ones. Multiple search variations were attempted:
- Direct title searches
- Author + keyword combinations
- Site-restricted LinkedIn searches

**What we know about Seiberth**:
- Co-author of "Driving Intelligence - The Green Book: Routes to Autonomy" (2025) with J. Mark Bishop
- Active LinkedIn commentator on autonomous driving and AI limitations
- Has previously argued that AI systems in autonomous vehicles "cannot continually learn" post-deployment, causing "catastrophic forgetting"
- Has criticized tech industry overconfidence about solving the "real world AI" problem through scaling
- URL of a related but different post: https://www.linkedin.com/posts/dr-gabriel-seiberth-09245b12_the-deep-learning-revolution-made-autonomous-activity-7368666428436099072-kPS5

**Likely content based on context**: Given Seiberth's published work on autonomous driving and AI limitations, his article likely applies the Dupoux/LeCun/Malik framework to the autonomous vehicle domain, where post-deployment learning failure is a concrete, safety-critical problem. The "Silver & Sutton" image caption likely refers to their "Welcome to the Era of Experience" paper.

---

## 3. The Silver & Sutton Reference

**Title**: "Welcome to the Era of Experience"
**Authors**: David Silver (Google DeepMind / UCL), Richard S. Sutton
**Published**: April 26, 2025
**PDF**: [storage.googleapis.com/.../The Era of Experience Paper.pdf](https://storage.googleapis.com/deepmind-media/Era-of-Experience%20/The%20Era%20of%20Experience%20Paper.pdf)
**Richard Sutton's endorsement**: [x.com/RichardSSutton/status/1910761446637719588](https://x.com/RichardSSutton/status/1910761446637719588)

### Three Eras of AI

1. **Simulation Era**: early RL tested in controlled environments
2. **Human Data Era**: current paradigm relying on scraped text from books, websites, forums
3. **Experience Era**: proposed shift toward continuous learning through real-world interaction

### Core Argument

Language models face an inherent ceiling because "the industry eventually runs out of high-quality human data, and some breakthroughs are simply beyond what humans have figured out so far." Systems trained solely through imitation cannot achieve genuine creativity beyond existing human knowledge.

**Proposal**: agents that operate in "a never-ending stream of experiences, adjusting to their environment over months or years -- much like people or animals." Technical features include continuous feedback loops, world models enabling action prediction, and autonomous exploration generating unlimited training data.

**Example**: AlphaProof merges a pre-trained language model with the AlphaZero RL algorithm, generating over 100 million proof steps through autonomous exploration -- outperforming systems trained solely on human data.

### Relationship to Dupoux/LeCun/Malik Paper

The Dupoux et al. paper explicitly cites Silver & Sutton (silver2025welcome) as the source for the data wall concern. Both papers share the diagnosis (current AI does not genuinely learn post-deployment) but differ in emphasis:
- **Silver & Sutton**: emphasize RL and experience-based learning; "reward is enough" lineage
- **Dupoux et al.**: emphasize cognitive science integration, meta-control orchestration, and the observation/action duality with a biological developmental framework

The Silver & Sutton paper can be viewed as a precursor that the Dupoux et al. paper extends significantly, especially by adding System M (meta-control) and the Evo/Devo bootstrapping framework.

### Critiques of Silver & Sutton

- **Alignment concern**: the approach could be an existential threat at sufficient capability levels ([Alignment Forum](https://www.alignmentforum.org/posts/TCGgiJAinGgcMEByt/the-era-of-experience-has-an-unsolved-technical-alignment))
- **Reward bottleneck**: merely shifts the bottleneck from curating training data to curating reward functions ([4m4.it commentary](https://4m4.it/posts/welcome-to-era-of-experience-commentary/index.html))
- **Active Inference alternative**: proposes replacing external reward engineering with intrinsic free energy minimization ([arxiv.org/html/2508.05619v1](https://arxiv.org/html/2508.05619v1))
- **Ground truth problem**: generalizing from games/math/coding to real-world domains remains unsolved

---

## 4. Drew McDermott's "Wishful Mnemonics" (1976)

**Title**: "Artificial Intelligence Meets Natural Stupidity"
**Author**: Drew McDermott (Yale University)
**Published**: SIGART Newsletter, No. 57, April 1976
**Summary**: [levon003.github.io/2023/10/17/wishful-mnemonics.html](https://levon003.github.io/2023/10/17/wishful-mnemonics.html)
**Full text**: [j-paine.org/dobbs/artificial_intelligence_meets_natural_stupidity.html](https://www.j-paine.org/dobbs/artificial_intelligence_meets_natural_stupidity.html)

### The Concept

A "wishful mnemonic" occurs when researchers name program elements with human-intelligence-related terms (UNDERSTAND, GOAL, LEARN) without substantiating their connection to actual intelligence. McDermott argued:

> "If a researcher calls the main loop of his program 'UNDERSTAND,' he is (until proven innocent) merely begging the question. He should refer to this main loop as 'G0034' and see if he can convince himself or anyone else that G0034 implements some part of understanding."

### Relevance to the Dupoux et al. Paper

**NOTE**: McDermott is NOT actually cited in the Dupoux/LeCun/Malik paper based on full-text search of the HTML version. The concept is relevant to the paper's thesis (systems called "learning" models that don't actually learn post-deployment), but the paper does not explicitly invoke McDermott's terminology.

If Seiberth's LinkedIn article references McDermott, it is likely his own addition connecting the dots between the 1976 critique and current AI terminology. This is a valid intellectual connection: calling systems "learning" models when they only learn during a fixed training phase and are frozen at deployment is arguably a modern instance of wishful mnemonics.

### Broader Context

Melanie Mitchell (Santa Fe Institute) revived the concept in her 2021 paper "Why AI is Harder Than We Think" ([arxiv-vanity.com/papers/2104.12871](https://www.arxiv-vanity.com/papers/2104.12871/)), noting that "wishful mnemonics" now extends to benchmark names that imply capabilities they don't actually test. McDermott passed away in 2022; an obituary appeared in AI Magazine.

---

## 5. Counter-Arguments and Critiques of the Dupoux et al. Paper

### From Hacker News Discussion ([news.ycombinator.com/item?id=47418722](https://news.ycombinator.com/item?id=47418722))

**In favor**:
- "Paper correctly identifies issues with 'padded room architecture' where models remain isolated from reality" (beernet)
- Current models with locked-down weights provide consistency but at the cost of genuine adaptability (Animats)

**Against**:
- **In-context learning as learning**: "LeCun overlooks in-context learning as a form of autonomous learning; the paper presents a 'strawman' by focusing solely on training rather than how systems operate practically" (theptip)
- **System-level learning**: "Restricting discussion to isolated LLMs misses the point; LLMs + harnesses can actually learn as complete systems" (Garlef)
- **External memory suffices**: Memory systems using file storage represent learning mechanisms; agentic systems persist knowledge across sessions (reverius42)
- **Counter-counter**: "The system never learns beyond training data; information is forgotten once the session is over" (troupo)
- **Weight changes unnecessary?**: Context-based learning without parameter modification might suffice (jvanderbot)
- **Safety concern**: Online learning poses control challenges; treating AI "more like a software product with defined versions" is preferable (armoredkitten)

### From Academic/Technical Analysis ([bemiagent.com](https://bemiagent.com/agents/why-ai-systems-dont-learn))

- System M lacks concrete specification; bridging from framework to deployable code remains steep
- Reward specification challenges persist despite architectural redesign
- Cognitive science analogies may oversimplify translation to ML systems
- No benchmark results, ablation studies, or training curves validate the framework

### Assessment of Key Controversies

| Claim | Status | Evidence |
|-------|--------|----------|
| Current AI doesn't learn post-deployment | **Contested** | Largely true for weight updates, but in-context learning, RAG, and agentic memory provide forms of runtime adaptation. The paper acknowledges these as "minor variations" compared to children's learning. |
| Data wall on quality text | **Broadly accepted** | Supported by Sutskever, Karpathy, LeCun. Mitigations exist (synthetic data, multimodal) but consensus is that pure text scaling faces diminishing returns. |
| System A/B/M is the right decomposition | **Speculative** | Intellectually coherent framework inspired by cognitive science, but no empirical validation. Similar decompositions exist (e.g., Kahneman's System 1/2, which the paper discusses in Appendix A). |
| Evo/Devo can bootstrap System M | **Highly speculative** | Authors themselves acknowledge "millions of simulated lifecycles" needed and bilevel optimization scaling poorly. No demonstrated path to tractability. |
| Autonomous learning is "decades away" | **Controversial** | Some argue in-context learning + tool use + memory already constitutes rudimentary autonomous learning. Others agree the full vision is far off. |

---

## 6. Related Work and Context

### What is Genuinely Novel vs. Known Positions

**Novel contributions of the Dupoux et al. paper**:
1. The specific System A/B/M tripartite decomposition with formal mathematical treatment
2. The meta-state taxonomy (epistemic, species-specific, somatic signals)
3. The Evo/Devo bilevel optimization formalization for bootstrapping autonomous learning
4. The explicit framing of current AI's learning deficit as an MLOps outsourcing problem

**Restatements of known positions**:
1. "Current AI doesn't really learn" -- a common critique from Dreyfus (1972) through Marcus (2020)
2. The data wall -- widely discussed since 2024 (Sutskever, LeCun, Villalobos et al.)
3. Need for world models -- LeCun has advocated this since at least 2022 (JEPA architecture paper)
4. Need for intrinsic motivation/curiosity -- Schmidhuber (1991), Oudeyer et al. (2007)
5. Combining observation and action learning -- a standard robotics/RL theme

### Related Paradigms

**Continual Learning**:
- ATLAS: dual-agent architecture with persistent learning memory achieving gradient-free continual learning ([arxiv.org/abs/2511.01093](https://arxiv.org/abs/2511.01093))
- Meta FAIR's "Continual Learning via Sparse Memory Finetuning" (October 2025): sparse slot-based memory updates
- Google's "Nested Learning" paradigm for continual learning ([research.google/blog](https://research.google/blog/introducing-nested-learning-a-new-ml-paradigm-for-continual-learning/))
- Relationship to A/B/M: these address parts of the problem (catastrophic forgetting) but lack the unified meta-control orchestration of System M

**Self-Play and Curriculum Learning**:
- SWE-RL: self-play for software agent training with progressive bug complexity ([arxiv.org/abs/2512.18552](https://arxiv.org/abs/2512.18552))
- WebRL: self-evolving online curriculum RL for web agents ([arxiv.org/html/2411.02337v1](https://arxiv.org/html/2411.02337v1))
- Relationship to A/B/M: implements aspects of System B (action-based learning) with rudimentary curriculum (proto-System M), but without the cognitive science-informed meta-control layer

**Meta-Learning / Self-Improvement**:
- ALAS (Autonomous Learning Agent System): modular pipeline for continuous LLM knowledge updates
- "Truly Self-Improving Agents Require Intrinsic Metacognitive Learning" (ICLR 2026 position paper, [openreview.net](https://openreview.net/forum?id=4KhDd0Ozqe))
- Relationship to A/B/M: metacognitive self-improvement aligns closely with System M's role; the ICLR position paper independently argues for a similar meta-control necessity

**LeCun's JEPA Architecture**:
- V-JEPA / V-JEPA 2: self-supervised video models enabling understanding, prediction, and planning ([ai.meta.com/blog/v-jepa](https://ai.meta.com/blog/v-jepa-yann-lecun-ai-model-video-joint-embedding-predictive-architecture/))
- V-JEPA 2-AC: deployed zero-shot on robotic arms for pick-and-place via planning
- Relationship to A/B/M: JEPA is a concrete System A implementation; V-JEPA 2-AC begins integrating System B (action). The Dupoux et al. paper provides the theoretical umbrella under which JEPA fits.

**Active Inference**:
- "The Missing Reward: Active Inference in the Era of Experience" ([arxiv.org/html/2508.05619v1](https://arxiv.org/html/2508.05619v1))
- Proposes replacing external reward engineering with intrinsic free energy minimization
- Relationship to A/B/M: offers an alternative meta-control mechanism that could implement System M without explicit reward specification

### The "Reward is Enough" Debate

The Dupoux et al. paper sits at a specific position in an ongoing debate:

1. **Silver et al. (2021)**: "Reward is Enough" -- intelligence can be understood as reward maximization ([sciencedirect.com](https://www.sciencedirect.com/science/article/pii/S0004370221000862))
2. **Vamplew et al. (2022)**: "Scalar Reward is Not Enough" -- multi-objective models needed ([springer.com](https://link.springer.com/article/10.1007/s10458-022-09575-5))
3. **Silver & Sutton (2025)**: "Welcome to the Era of Experience" -- the data wall demands experience-based learning
4. **Dupoux, LeCun, Malik (2026)**: current paper -- experience alone isn't enough either; meta-control orchestration (System M) is needed to coordinate observation and action learning

This represents an escalating refinement: reward alone is insufficient; experience alone is insufficient; what's needed is an autonomous meta-controller that flexibly combines both.

---

## 7. Key Takeaways

1. **The paper is a manifesto, not an algorithm.** It provides no benchmark results, no ablation studies, no training curves. Its value is in the intellectual framework and cross-disciplinary synthesis.

2. **System M is the genuinely novel (and underspecified) contribution.** Systems A and B map to well-known paradigms (SSL and RL). The meta-controller that dynamically orchestrates between them, informed by epistemic/somatic signals, is the paper's distinctive proposal.

3. **The data wall argument is consensus, not controversial.** The controversial claim is the specific architecture proposed to address it.

4. **In-context learning is the elephant in the room.** Critics correctly note that modern LLMs with tool use, memory, and retrieval already exhibit rudimentary autonomous learning. The paper's authors dismiss this as "minor variations" but this is debatable.

5. **The Evo/Devo framework is the most speculative component.** Requiring millions of simulated lifecycles with bilevel optimization that scales poorly is a significant practical obstacle the paper acknowledges but cannot resolve.

6. **The McDermott connection (if made by Seiberth) is apt but not in the paper itself.** Calling systems "learning" models when they don't learn post-deployment is a textbook instance of wishful mnemonics.

7. **The paper unifies several research threads** (LeCun's JEPA, Silver's RL advocacy, cognitive science of development) into a coherent framework that could guide long-term research direction, even if near-term implementation remains unclear.

---

## Sources

### Primary Paper
- [arXiv:2603.15381](https://arxiv.org/abs/2603.15381) -- Dupoux, LeCun, Malik (2026)
- [Full HTML version](https://arxiv.org/html/2603.15381v1)

### Silver & Sutton
- [Welcome to the Era of Experience (PDF)](https://storage.googleapis.com/deepmind-media/Era-of-Experience%20/The%20Era%20of%20Experience%20Paper.pdf) -- Silver & Sutton (2025)
- [The Decoder coverage](https://the-decoder.com/the-next-leap-in-ai-depends-on-agents-that-learn-by-doing-not-just-by-reading-what-humans-wrote/)
- [Sutton's X endorsement](https://x.com/RichardSSutton/status/1910761446637719588)

### Reward is Enough Debate
- [Reward is Enough (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0004370221000862) -- Silver, Singh, Precup, Sutton (2021)
- [Scalar Reward is Not Enough (Springer)](https://link.springer.com/article/10.1007/s10458-022-09575-5) -- Vamplew et al. (2022)

### McDermott
- [Original paper summary](https://www.j-paine.org/dobbs/artificial_intelligence_meets_natural_stupidity.html)
- [Wishful Mnemonics in ML Research](https://levon003.github.io/2023/10/17/wishful-mnemonics.html)
- [Mitchell (2021) "Why AI is Harder Than We Think"](https://www.arxiv-vanity.com/papers/2104.12871/)

### Gabriel Seiberth
- [LinkedIn profile](https://www.linkedin.com/in/dr-gabriel-seiberth-09245b12/)
- [Related LinkedIn post on autonomous driving and deep learning](https://www.linkedin.com/posts/dr-gabriel-seiberth-09245b12_the-deep-learning-revolution-made-autonomous-activity-7368666428436099072-kPS5)
- [Driving Intelligence book (Amazon)](https://www.amazon.com/Driving-Intelligence-J-Mark-Bishop/dp/1032911220)

### Data Wall
- [SuperAnnotate: AI Data Wall](https://www.superannotate.com/blog/ai-data-wall)
- [LeCun on text data limitations](https://officechai.com/ai/yann-lecun-explains-why-text-data-alone-will-never-create-human-level-ai/)
- [Sutskever on scaling plateau](https://dianawolftorres.substack.com/p/ai-hits-a-wall-ilya-sutskever-on)

### Counter-Arguments
- [Hacker News discussion](https://news.ycombinator.com/item?id=47418722)
- [BemiAgent analysis](https://bemiagent.com/agents/why-ai-systems-dont-learn)
- [Alignment Forum on Era of Experience](https://www.alignmentforum.org/posts/TCGgiJAinGgcMEByt/the-era-of-experience-has-an-unsolved-technical-alignment)
- [4m4.it critical commentary](https://4m4.it/posts/welcome-to-era-of-experience-commentary/index.html)
- [Active Inference alternative](https://arxiv.org/html/2508.05619v1)

### Related Work
- [Continual Learning for Agents (arXiv)](https://arxiv.org/abs/2511.01093)
- [Metacognitive Self-Improvement (ICLR 2026)](https://openreview.net/forum?id=4KhDd0Ozqe)
- [Self-Evolving Agents survey](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- [V-JEPA (Meta AI)](https://ai.meta.com/blog/v-jepa-yann-lecun-ai-model-video-joint-embedding-predictive-architecture/)
- [SWE-RL self-play training](https://arxiv.org/abs/2512.18552)
- [Google Nested Learning](https://research.google/blog/introducing-nested-learning-a-new-ml-paradigm-for-continual-learning/)

Status: COMPLETE
