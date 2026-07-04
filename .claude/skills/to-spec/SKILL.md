---
name: to-spec
description: Synthesizes the current conversation into a structured spec file. Invoke via `/to-spec` command only usually after grill-me session.
metadata:
  version: "1.0"
  tags:
    - spec
user-invocable: true
disable-model-invocation: true
---

Always print **BEFORE** using this SKILL:
```md
🛠 Using **to-spec** SKILL
```

# Goal

Turn the current conversation into a concise, decision-focused spec. Capture what was resolved and why — not a restatement of the obvious.

---

# Deterministic Workflow

## Step 1 - Draft the spec

Synthesize the conversation using the template below.
- Capture the **decisions that were resolved, and why** — that is the core value.
- Do **not** include specific file paths or code snippets (they go stale); exception: a small snippet that encodes a decision more precisely than prose can (a type, schema, or state machine), trimmed to the decision-rich part.
- Do **not** interview the user — only synthesize what has already been decided.
- Use the project's domain vocabulary and respect existing conventions.
- **Fidelity rule:** capture the user's stated direction exactly — do not soften, hedge, or introduce your own rationale in place of their answer. If the user said "delete it", the decision is "delete it", not "keep as-is for reference".
- **Scope expansion rule:** decisions that arose mid-interview (not in the original prompt) are first-class decisions. They belong in `Decisions` and in `Scope → In scope`. Never place a mid-interview resolution in `Scope → Out of scope`.

<spec-template>

# <Title>

**Summary:** one or two sentences — what this is and why it matters.

## Problem
The problem being solved, from the user's perspective.

## Approach
The chosen solution at a high level.

## Decisions
The branches resolved during discussion. For each: the decision, the option chosen, and a brief why. This is the core of the spec.

## Scope
What is in scope — then, explicitly, what is out of scope.

## Open questions
Anything deferred or still unresolved.

## Notes
Anything else worth recording.

</spec-template>

## Step 2 - Detect save location

First read `.github/instructions/smart-ts-dev.business.instructions.md` if it exists. If it contains `## Spec paths`, apply those project-specific save rules before generic detection:
- If a matching rule says to save directly, without asking, or always save there → write to that path and skip Step 3's option menu.
- Otherwise, offer the matching configured path as option A.

Then auto-detect additional path options from the conversation context. Build a lettered list — always include `tmp/specs/` as the last option:

| Context detected | Path option to offer |
|---|---|
| A specific **caseType** was discussed | Run `locate-file-or-folder` skill silently → offer `{caseType-folder}/` |
| A specific **Playwright test** was discussed | Folder where the relevant test file lives |
| **Other** (tooling, ecosystem, docs, etc.) | Closest reasonable path to the files or domain discussed |
| **Always** | `tmp/specs/YYYY-MM-DD_<kebab-slug>.md` — for specs that should not be persisted |

**Filename format:** always `YYYY-MM-DD_<kebab-slug>.md` — date prefix first, slug derived from the title.

## Step 3 - Present options and save

Skip this step if Step 2 selected a direct save path from `## Spec paths`; write the file and confirm the written path.

1. Print **title + one-sentence summary only** — never echo the full spec in chat.
2. Present lettered path options:
   ```
   📄 **<Title>** — <one-sentence summary>

   Where should I save the spec?
   A) <most relevant path>/YYYY-MM-DD_<kebab-slug>.md
   B) <second relevant path>/YYYY-MM-DD_<kebab-slug>.md
   ...
   X) tmp/specs/YYYY-MM-DD_<kebab-slug>.md  ← not persisted
   ```
3. Write the file to the path the user selects. Confirm with the written path.

---

## Boundaries

### This skill handles
- Synthesizing any conversation or planning discussion into a structured spec file.

### This skill does NOT handle
- Conducting the interview itself → use [`grill-me`](../grill-me/SKILL.md) first to reach shared understanding, then run this skill.

---

## Related Skills

- [grill-me](../grill-me/SKILL.md) — conducts the design interview that this skill then synthesizes into a spec.
