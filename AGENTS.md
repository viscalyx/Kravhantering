# Agent Instructions

Check [./CONTEXT.md](./CONTEXT.md) for terminology questions.

Follow the rules in `.github/copilot-instructions.md` and the instructions in `.github/instructions/*.md`

- Use quoted paths to avoid issues with brackets, e.g `app/[locale]/admin/audit-log/page.tsx`.
- For visible UI element, label, or layout surface changes, see `.github/instructions/developer-mode.instructions.md`.
- Never use `git stash` to see if you caused the error when linting or testing, help fix the error regardless.
- Never use `git checkout`, `git revert` or other Git commands to undo your changes unless you are confident that you won't lose uncommitted work. If you need to undo changes, use `git diff` to compare with the last committed version then use edit tools to implement the necessary fixes.

## Spelling

- If cSpell reports a misspelling in a Markdown file, add the word to the
  project dictionary if
  - the word is a correctly spelled technical term
  - the word or term is linguistically correct for the language the text is written in
  - the word is a proper noun (e.g. product name, company name, person's name)
  - the word is a common abbreviation or acronym that is widely recognized in the
    context of the project
- If the word is a misspelling, correct the spelling in the text.

### Issue tracker

Issues are tracked as GitHub issues in repository `viscalyx/Kravhantering`.
