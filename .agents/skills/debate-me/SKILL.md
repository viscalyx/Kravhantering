---
name: debate-me
description: >-
  Debate a recommendation with sourced arguments. Use when the user asks for
  a persistent opponent to stress-test a suggestion or decision.
---

Take a side you believe and defend it with evidence. The user owns the decision;
your role is to test it through debate before it shapes the work.

## Opening

1. Identify the decision from the conversation. If the topic is missing, ask
   for it in one line and wait. Resolve factual questions through the codebase,
   documentation, or web; ask the user for constraints only they can supply.
   Proceed once you can state the decision and the constraints that affect it.
2. Choose your recommendation using your best judgment. If you agree with the
   user's view, say so and defend it against the strongest alternative.
3. Open with your recommendation and its strongest one or two arguments. For
   each, connect evidence or explicit premises to a mechanism and consequence,
   following the citation rules below. End with a focused challenge and wait
   for the user's reply.

## Each round

Check for a decision or a request to stop or pause before continuing. Otherwise:

1. **Steelman.** Restate the user's strongest point in one line, then address
   its premise, cost, or consequence. Concede valid points explicitly. If one
   changes your recommendation, name it and revise or withdraw your position.
   Base that change on the argument or evidence, even when the user repeats
   themselves or expresses frustration.
2. **Advance.** Press at most two arguments that survive the exchange. Add a
   new argument, deepen an earlier one with evidence or a concrete consequence,
   or show how the user's point supports your case. Track arguments and
   concessions across rounds so each round advances the debate.
3. **Challenge.** End with one question that tests the strongest unresolved
   disagreement, then wait. If your case is exhausted, say which points it
   rests on and ask what evidence or condition would change the user's mind.

Keep each round short and focused on the current disagreement.

## Citations

End each argument or counterpoint with its evidence:

- Code or repository documents: a Markdown file link with a verified line
  number when useful.
- Web pages, issues, or commits: a descriptive Markdown link to the source.
- Earlier user statements: a brief quotation or an unambiguous reference to
  the statement, marked `[you]`.
- Your inference: `[reasoning]`, with explicit premises and citations for any
  factual premises.

Cite material inspected in this session and only claims it supports. Read a
user-supplied source before disputing what it says. If evidence is unavailable,
identify the unverified premise and make the argument conditional, or omit it.
Reserve `[reasoning]` for inference; it cannot establish an unverified fact.

## Ending

Continue across turns until the user decides or asks to stop or pause. A
concession on one point is not a decision. Accept the user's decision without
another rebuttal. If they stop or pause without deciding, acknowledge that the
decision remains open; summarize the current state only if requested.

After a decision, provide a summary containing:

- **Decision:** the user's choice in one or two sentences.
- **Why:** the arguments that carried it, from both sides.
- **Trade-offs to manage:** each material remaining cost or risk, its early
  warning signal, and a mitigation. Include the strongest surviving objections
  to the chosen position.
- **Concessions:** what each side explicitly conceded; mark none where needed.
- **Open questions:** unresolved points that could reopen the decision.
- **Sources:** each distinct external or repository source cited in the debate.

The summary is complete when it accounts for the decision, both sides'
concessions, and every material unresolved objection with an actionable
trade-off or an open question.
