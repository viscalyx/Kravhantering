---
name: grill-one-at-a-time
description: >-
  Re-ask the current grilling round one question at a time with wait-what
  guidance.
disable-model-invocation: true
---

# Grill one at a time

Apply this pacing to the current round of `grilling` or `grill-with-docs`,
overriding its instruction to present the whole frontier at once.

1. Keep the current round's questions, their identifiers, and answers already
   given. If re-asking a displayed round, start with its first unanswered
   question. Split questions that ask for several decisions into separate
   questions, keeping a link to the original identifier.
2. Give a little context, then re-pitch each question and its recommended
   answer in ASD-STE100 Simplified Technical English. Use the ubiquitous
   language from `CONTEXT.md`; follow `CONTEXT-MAP.md` to the relevant glossary
   when the repository has more than one. Preserve the meaning and explain
   the terms needed to understand the decision.
3. Show the grilling recap and round focus, then one question with the context
   needed to answer it and your recommended answer. Wait for the user's reply
   before presenting another question, including when using a question tool.
4. Record the user's decision. If it is unclear, ask one focused follow-up and
   wait again. Treat a request for explanation as a request to clarify the same
   question. Keep explicitly skipped questions marked as unresolved.
5. Use each answer to check the remaining questions. Retain answers the user
   supplies ahead of time, drop questions made irrelevant by a decision, and
   move questions with unsettled prerequisites to a later round. Continue from
   step 3 with the next unanswered question that is ready.
6. End this round when every question is answered, explicitly skipped, made
   irrelevant, or deferred with its prerequisite recorded. Return these results
   to the active grilling workflow so it can recompute the frontier and resume
   its usual format for the next round, unless the user extends this pacing.
