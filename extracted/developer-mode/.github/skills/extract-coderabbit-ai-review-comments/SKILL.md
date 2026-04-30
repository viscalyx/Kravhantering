---
name: extract-coderabbit-ai-review-comments
description: Extract CodeRabbit AI review comment code-block text that follows `Prompt for AI Agents` sections in markdown/text files or prompt-provided content, remove the repeated lead-in sentence, and write the findings to a markdown file with a blank line between entries.
---

# Extract CodeRabbit AI Review Comments

Extract only the fenced code-block bodies that appear after each `Prompt for AI Agents` summary.

## Workflow

1. Determine the source content:
   If the user gives a file path, read that file directly.
   If the user pastes content in the prompt, save it to a temporary working file and process that file.
2. For each matching summary, locate the next fenced code block (```) and capture only its inner text.
3. Remove the exact line `Verify each finding against the current code and only fix it if needed.` from each captured block.
4. Remove the immediate blank line that follows that removed lead-in sentence.
5. Concatenate all captured blocks into a new markdown file.
6. Insert exactly one blank line between captured blocks.
7. Do not add headers, bullets, labels, or any other surrounding text.

## Script

Use `scripts/extract_prompt_blocks.sh` for deterministic extraction:

```bash
bash .github/skills/extract-coderabbit-ai-review-comments/scripts/extract_prompt_blocks.sh <input-file|-> <output-file>
```

Example:

```bash
bash .github/skills/extract-coderabbit-ai-review-comments/scripts/extract_prompt_blocks.sh \
  "app/[locale]/__tests__/Actionable-comments-posted.txt" \
  "app/[locale]/__tests__/Prompt-for-AI-Agents-findings.md"
```

Use stdin when content is provided directly in the prompt:

```bash
cat prompt-content.txt | bash .github/skills/extract-coderabbit-ai-review-comments/scripts/extract_prompt_blocks.sh - "output.md"
```

## Validation

1. Confirm output contains only extracted prompt text (without markdown fences).
2. Confirm blocks are separated by one blank line.
3. Confirm no markdown wrappers were copied (` ``` ` lines must not appear in output).
4. Confirm the lead-in sentence is removed from every finding.
