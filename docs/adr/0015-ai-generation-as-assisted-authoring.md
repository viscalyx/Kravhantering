# AI-Assisted Authoring

Status: Accepted on 2026-06-05.

Kravhantering treats `AI-assisterat författande` as assisted authoring, not as
a source of truth for requirements. AI output is a proposal that can help a
user draft requirement text, acceptance criteria, verification methods and
classification, but it does not become an authoritative `Krav`, `Kravversion`
or kravunderlagslokalt krav until a permitted actor saves it through the
ordinary application workflow.

Generated suggestions remain subject to the same taxonomy validation,
authorization, lifecycle, review, publication, traceability, reporting,
privacy and retention rules as human-authored content once saved. The AI
provider, prompt, model, images and raw generated response are integration
inputs and transient support data unless a user deliberately turns the result
into persisted requirement content.

The architecture therefore keeps AI-assisted authoring optional and
replaceable: OpenRouter and selected model providers support drafting, while
the requirements library and kravunderlag remain governed by Kravhantering's
human stewardship and lifecycle decisions.

## Considered Options

- Persist AI output automatically as requirements: rejected because generated
  text must be reviewed and governed before it becomes authoritative content.
- Treat generated output as a separate AI-owned requirements store: rejected
  because it would split traceability, lifecycle, reporting and retention from
  ordinary requirements.
- Make the AI provider part of the requirement source of truth: rejected
  because provider configuration can change and the application must remain
  usable without AI-assisted authoring enabled.
