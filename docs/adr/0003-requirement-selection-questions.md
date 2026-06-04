# Requirement Selection Questions as Library Stewardship Filters

Status: Accepted on 2026-05-31.

Requirement selection questions are requirement-area-owned content in
Requirements Library stewardship, not Admin Center reference data and not a new
requirement-adding workflow. The target permission model is that requirement
area owners, requirement area co-authors and Admin users maintain the
questions, while specification leads and specification co-authors answer them
inside a requirements specification. The first implementation deliberately
requires only authentication for these new writes until the assignment-based
RBAC work is available; this is a temporary implementation constraint, not the
domain authorization model.
Selected requirement selection answers preserve selection context for the
requirements specification and can form a requirement selection filter over the
existing `Available requirements` list when the user explicitly activates that
filter in the detail view. A fresh visit starts from the complete set of
published library requirements that are not already in the specification, and
users still review, select and add requirements through the existing table flow.

This deliberately reuses the published-library-requirement picker instead of
creating a separate suggested-requirements view or automatically adding
requirements. It keeps version locking at the existing requirement application
step: answers point to requirement packages and explicit published requirements,
then the requirements specification records the published requirement versions
only when the user adds them.

Requirement packages are also Requirements Library stewardship content rather
than Admin reference data. A requirements package has its own requirements
package lead, but package membership remains part of requirement version
metadata and is changed through the requirement lifecycle, not directly from the
package management surface. Requirements packages are authored content in the
stewardship surface, so their name and description use one authored language
rather than paired locale columns.

Requirement selection answers may point to requirement packages and explicit
published requirements, or be marked as intentionally having no requirement
selection. Package links and explicit requirement links are independent source
decisions: the same requirement may match an answer both directly and through a
package, is counted once, and keeps both source labels visible to stewards.
This lets a question owner require a specific requirement regardless of later
package membership changes, while the explicit requirement link must still
reference a requirement with a published version. Archived packages and
requirements that no longer have a published version are automatically removed
from answers and are not restored
automatically if they become usable again; affected answers that are not
intentionally empty are shown as missing a requirement selection. Questions
are always optional in the first implementation: there is no required-question
state, no required-answer validation, and progress only shows answered/total
status for active questions.

Saved answers preserve selection context, but they do not automatically regain
filter effect when an archived or inactive question or answer is later
reactivated. Taking a question or answer out of active use marks affected saved
answers as historical; users must choose the answer again for it to affect the
requirement selection filter.

Changing answers inside a requirements specification does not automatically
activate the requirement selection filter. If the filter is already active in
the current detail view, changed answers immediately update the filtered
available requirements; otherwise the answers remain saved context until the
user opts in to filtering.

## Considered Options

- Put questions in Admin Center reference data: rejected because questions are
  content stewardship owned by requirement areas, not system configuration.
- Create a separate suggested-requirements list: rejected because it duplicates
  selection, filtering and add behavior already present in `Available
  requirements`.
- Automatically add requirements from answers: rejected because answering a
  question should narrow the working set, while adding requirements to a
  specification remains an explicit user action.
- Automatically filter available requirements on every saved answer: rejected
  because a fresh visit to a requirements specification should keep `Available
  requirements` complete until the user opts in to the requirement selection
  filter.
- Snapshot question and answer text in each specification: rejected for the
  first version; saved answers keep identity while showing the current
  maintained question and answer text.
- Add a full draft/review/published lifecycle for questions: rejected for the
  first version in favor of active/archived plus health indicators.
- Required selection questions: rejected for the first version because
  answering requirement selection questions should guide filtering, not become
  a completion gate.
- Locale-paired requirement package text: rejected when packages moved from
  reference data into authored library stewardship content.
