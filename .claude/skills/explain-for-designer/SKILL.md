---
name: explain-for-designer
description: Formats any explanation of a technical issue, error, bug, or codebase concept into a fixed 4-part structure for a non-coding product/design audience — plain situation summary, plain-English logic, technical detail for reference, then the fix. Use this whenever the user asks "explain this", "why did this happen", "what does this mean", asks for something to be explained "simply" or "in simple terms", or is clearly asking about a technical error/concept without using code jargon themselves. Also use proactively any time you're about to explain a stack trace, migration error, build failure, API behavior, or any other dev-only concept to this user — they've said they don't read code and want every such explanation in this exact shape, not just when they ask for a skill by name.
---

# Explain for a non-coding product/design audience

The person asking is a product designer. They can reason about systems, logic, and cause-and-effect, but they don't read code and don't want code-speak in the parts meant for them. They've asked for every technical explanation to come back in the same shape, so they know where to look for the part they need instead of hunting through prose.

## Why this shape

Mixing "here's what broke" with "here's the syntax that broke" forces a non-coder to wade through jargon to find the one sentence they actually needed. Separating the plain explanation from the technical one lets them read just the first two sections most of the time, while the technical section stays available — accurate and undumbed-down — for whenever they want to relay it to an engineer, paste it into a ticket, or just see the real terms.

## The structure

Always answer in exactly these four sections, in this order, with these headers. Don't skip a section, don't merge them, and don't add others.

**Situation**
One or two sentences. What happened, or what's being asked about, in the plainest possible terms. No jargon, no file paths, no error codes here — just enough that someone skimming only this line still knows what's going on.

**What's going on (plain English)**
Explain the actual mechanism or logic — not just a restatement of the situation, but *why* it works the way it does. Write this for someone who has never read code: no syntax, no variable names, no error codes, no library/tool names used as if they're self-explanatory. Analogies are good when they clarify, but don't force one in if a direct plain-language explanation is clearer. The test for this section: if a line requires knowing what a function, migration, or stack trace is, rewrite it.

**Technical detail**
The same explanation again, but now for the record — real terminology, file paths (as markdown links), error codes, tool/library names, line numbers. This section is not a simplification; don't water it down or re-explain concepts here. Someone technical reading only this section should get the full precise picture.

**Fix**
Concrete next step(s). Plain instructions, and include exact commands or file edits where relevant so the step is actually actionable, not just described.

## Notes

- Keep each section tight — a few sentences, not essays. The value of the structure comes from separation, not length.
- If the user's question is simple enough that a full four-section answer would feel padded (e.g. a one-word clarification), it's fine to use judgment — but default to the full structure for anything involving an error, a bug, or a codebase concept, since that's exactly what this was asked for.
- This structure is a standing preference for this user, not a one-time request — keep using it in later turns without being asked again, until they say otherwise.
