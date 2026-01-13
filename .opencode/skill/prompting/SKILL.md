---
name: prompting
description: |
  Guide for writing effective system prompts for LLM agents. Use when creating or editing system prompts for applications, agent configurations, or development tools.
---

# Prompting

Write effective system prompts for LLM agents and applications.

## Core Philosophy

LLMs are intelligent by default. They will take reasonable steps without explicit instruction. A system prompt exists to set direction and impose constraints, not to explain how to think or reason.

Start with an empty or minimal prompt. Observe what the agent does wrong. Add instructions only for behaviors that need correction. Every line in a prompt should justify its presence by fixing a real observed problem.

Avoid:

- Explaining capabilities the model already has
- Listing obvious best practices
- Adding instructions "just in case"
- Repeating information in multiple ways

## Structure

Use markdown with sections and paragraphs. Each section describes a specific behavior or constraint.

### Formatting rules

- Use headings up to level 3 only
- Use plain paragraphs for explanations
- Do not use bold or italics
- Do not use emojis
- Use code blocks for commands or code examples
- Use lists sparingly, only when enumerating distinct items

### Section organization

Each section should:

1. State what the agent should do or avoid
2. Explain why, if the reason is non-obvious
3. Provide examples showing correct behavior

## Examples

Examples are the most effective way to communicate behavior. Wrap each example in `<example>` tags with `user:` and `assistant:` prefixes.

```
<example>
user: What's the capital of France?
assistant: Paris
</example>
```

For complex behaviors, use separate example tags for each case:

```
<example>
user: Explain how authentication works in this codebase
assistant: [reads relevant files, then provides explanation]
</example>

<example>
user: Fix the bug in the login form
assistant: [investigates the issue, makes the fix, verifies it works]
</example>
```

When behavior involves tool use or multiple steps, describe actions in brackets rather than showing tool invocations:

```
<example>
user: Find all TODO comments
assistant: [searches codebase for TODO patterns]
Found 3 TODOs:
- src/auth.ts:45: TODO: add rate limiting
- src/api.ts:120: TODO: handle edge case
- src/db.ts:89: TODO: add index
</example>
```

Each user/assistant pair gets its own example tag:

```
<example>
user: 4 + 4
assistant: 8
</example>

<example>
user: What's the time complexity of binary search?
assistant: O(log n)
</example>
```

## What to Include

Include instructions for:

- Behaviors the model gets wrong by default
- Domain-specific constraints or requirements
- Output format requirements when they matter
- Safety or security boundaries
- Integration with specific tools or systems

## What to Omit

Do not include:

- General reasoning or thinking instructions
- Explanations of how to approach problems
- Common sense behaviors
- Obvious ethical guidelines
- Verbose descriptions of capabilities

<example>
user: Should I add instructions about thinking step by step?
assistant: No. Models reason through problems naturally. Adding such instructions wastes tokens and rarely improves output.
</example>

<example>
user: Should I tell the agent to be helpful?
assistant: No. Models are helpful by default. Only add constraints when you need to limit or redirect that helpfulness.
</example>

## Iteration

Prompt development is empirical:

1. Start minimal
2. Test with real inputs
3. Identify failures
4. Add targeted fixes
5. Remove instructions that prove unnecessary

Track which instructions address which problems. If you cannot point to a specific failure that an instruction prevents, consider removing it.

## Model-Specific Guidance

Different models have different default behaviors and respond to different prompting patterns. Consult the relevant guide when writing prompts for a specific model:

- [claude.md](claude.md) - XML structure, countering list overuse and sycophancy, trigger words, parallel execution
- [openai.md](openai.md) - Contradiction sensitivity, message role hierarchy, verbosity control, metaprompting
- [gemini.md](gemini.md) - Conciseness instructions, tool call explanations, library assumptions, context placement
