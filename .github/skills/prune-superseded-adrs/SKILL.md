---
name: prune-superseded-adrs
description: Audit every ADR and remove decisions superseded by the current
  model.
disable-model-invocation: true
---

# Prune Superseded ADRs

Use the `domain-modeling` skill throughout this workflow. Let it govern
terminology, glossary changes, conditional model checks against code, and ADR
format.

Keep the active ADR corpus as a current decision index. Git stores chronology.
Give each current decision one authoritative explanation; other ADRs may name
the relationship without restating that decision.

Make the audit idempotent: unchanged decisions written in present tense and
correct domain language produce no diff on a later run.

## Workflow

1. Discover the complete scope.
   - Read applicable repository instructions.
   - Follow `CONTEXT-MAP.md` when present; otherwise read the root
     `CONTEXT.md`.
   - Inventory every Markdown file in every `docs/adr/` directory.
   - Finish when every ADR root, glossary, and ADR convention is accounted for.
2. Build a decision graph in working notes.
   - Read every ADR, including frontmatter, links, and rejected alternatives.
   - Identify each concrete decision claim, its subject, and the ADR that owns
     it.
   - Trace explicit statuses, replacement language, forward references, and
     inbound links.
   - Compare ADRs with overlapping subjects even when they lack explicit
     supersession language.
   - Identify past-tense decision, constraint, consequence, and rationale
     clauses that narrate what applied instead of stating what applies.
   - Classify every claim as current, superseded, relationship context,
     rejected alternative, or uncertain.
3. Resolve contradictory ADRs before editing.
   - Establish the model from the ADR corpus, glossary, and explicit user
     direction.
   - Treat ADR numbering and supersession wording as evidence, not proof.
   - Treat two apparently current ADR claims as contradictory when they
     prescribe mutually incompatible behavior.
   - Complete discovery for each conflicting decision cluster before checking
     the implementation, so every known ADR alternative is compared.
   - Only for a contradictory ADR cluster, inspect the relevant implementation,
     tests, and configuration to establish the observed code behavior. Skip
     code inspection for every consistent ADR cluster.
   - When the code unambiguously matches exactly one conflicting ADR decision,
     treat that decision as authoritative and prune the cluster without asking
     the user.
   - When the code matches none of the conflicting decisions or cannot
     distinguish them, show the observed behavior and every ADR alternative
     with file references. Ask which one defines the intended current model.
   - Leave only that unresolved cluster unchanged while waiting for the answer.
     Continue independent, high-confidence clusters.
   - If the user selects the code in an unresolved cluster, rewrite the ADRs to
     match it. If the user selects an ADR decision, canonicalize that decision
     and report the code mismatch; change code only when the user separately
     authorizes it.
   - Finish when every edited claim has authoritative evidence and every
     contradiction is resolved by a unique code match, the user, or a reported
     blocker.
4. Prune the graph into current-state ADRs.
   - Limit edits to supersession resolution, contradiction resolution, required
     link retargeting, present-tense decision language, and corrections to
     canonical domain language.
   - Preserve existing grammar, wording, tone, headings, section order, list
     structure, and line wrapping everywhere else. Leave style and formatting
     normalization outside this skill's scope.
   - Choose one canonical ADR for each current decision.
   - For partial supersession, rewrite the ADR around its remaining current
     decisions and remove the obsolete model, examples, migration narrative,
     and rationale.
   - For full supersession, delete the ADR and retarget its inbound repository
     links to the canonical ADR.
   - Express every retained decision, constraint, consequence, and rationale in
     present tense. Rewrite a past-tense clause when its meaning remains
     current; remove it when it only narrates history.
   - Limit each rewrite to the affected passage and retain enough current
     rationale to prevent accidental reversal.
   - Keep a rejected alternative only when it remains plausible, its premises
     remain true, and its rejection still explains the current decision.
   - Keep cross-ADR links only when they clarify current boundaries or
     dependencies. State the relationship directly rather than narrating the
     supersession chain.
   - Update `CONTEXT.md` inline when domain modeling resolves a term.
   - Finish when no ADR asks a reader to learn a decision and then disregard
     it elsewhere.
5. Verify the entire corpus again.
   - Re-read every remaining ADR, not only edited files.
   - Search for supersession markers, retired terminology, duplicated decision
     definitions, past-tense architectural narrative, stale examples, and
     dangling links. Inspect every match; search terms are candidates, not
     findings.
   - Confirm every current decision has one canonical owner and every
     relationship points directly to current ADRs.
   - Review the diff line by line and remove edits whose only effect is grammar,
     wording, style, formatting, or wrapping, except the required conversion of
     decision content to present tense.
   - Run repository-provided Markdown, spelling, and link checks without
     automatic fixes, plus `git diff --check`. Correct only failures introduced
     by this audit; report unrelated failures without changing their files.
   - Finish only when all current claims agree with the established model, no
     decision content remains in past tense, all audit-introduced check failures
     are fixed, and a repeat audit against unchanged inputs would produce no
     diff.
6. Report the result.
   - List rewritten and deleted ADRs, their canonical decision owners, and the
     evidence used for material corrections.
   - List unresolved conflicts and reviewed near-misses separately.
   - State explicitly when the audit finds no superseded text.

## Classification Rules

- A superseded claim no longer governs the intended current system.
- A concise current relationship between two live decisions is not
  superseded text.
- A historical implementation detail is removable when it does not constrain
  the current decision.
- A migration or rollback rule is current only while that path remains
  supported.
- A later ADR does not win merely because it is later.
- Grammar, spelling, wording, style, formatting, and wrapping alone are not
  findings. A glossary mismatch confirmed through domain modeling is a
  finding.
- Past-tense decision content is a decision finding, not a cosmetic grammar
  finding. Preserve its current meaning in present tense or remove historical
  narration that no longer constrains the decision.
- Wording that expresses a different architectural decision is decision
  content, not a grammar finding.
- Code, tests, and configuration become evidence only after ADRs contradict
  one another. A unique code match makes that ADR decision authoritative; an
  absent or ambiguous match requires a user decision.
- A full deletion is appropriate only when the ADR owns no unique current
  decision. Preserve its history in Git rather than in the active corpus.
- Continue high-confidence cleanup while grouping absent or ambiguous code
  matches for the user; never guess between those unresolved alternatives.
