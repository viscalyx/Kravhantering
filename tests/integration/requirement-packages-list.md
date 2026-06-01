# Requirement Packages List Integration Tests

> Test flow documentation for
> [`requirement-packages-list.spec.ts`](./requirement-packages-list.spec.ts)

This suite verifies that the requirement packages list supports name or
description filtering, shows the no-results state for unmatched searches, clears
the search back to the full list, and keeps the floating `Nytt kravpaket` create
button anchored to the right side of the package list rather than to the search
field.

## Overview Flowchart

```mermaid
flowchart TD
    A[Start viewport variant] --> B[Open package stewardship list]
    B --> C[Assert page title and Kravpaket heading]
    C --> D[Assert unfiltered package rows]
    D --> E{Desktop?}
    E -- Yes --> F[Assert create button tracks list edge]
    E -- No --> G[Skip placement check]
    F --> H[Filter by Mobil]
    G --> H
    H --> I[Only matching package name remains]
    I --> J[Filter by description text]
    J --> K[Only matching package description remains]
    K --> L[Filter by missing package text]
    L --> M[No-results state appears]
    M --> N[Clear search]
    N --> O[All package rows return]
```

## Test Setup

- The suite runs the same scenario for mobile (`375x812`) and desktop
  (`1280x720`) viewports.
- The standard Playwright global setup provides an authenticated admin session.
- The desktop variant measures the floating create button and package-list
  surface to prevent regressions where the button follows the search field
  instead of the list.
- No fixed waits are used; all assertions rely on Playwright auto-retrying
  locators or direct measurements after visible elements are present.

## filters the table by package name or description and clears the search

### Purpose

Confirms that users can narrow the requirement packages list by package name or
description, recover from an empty result, and clear the filter. The desktop
placement check protects the expected list-edge position of the floating create
action.

### Step-by-Step Flow

1. Navigate to `/sv/requirements/stewardship?tab=packages`.
1. Assert the page title contains `Kravbiblioteksförvaltning`.
1. Assert the page heading is `Kravpaket`.
1. Assert the filter input is empty.
1. Assert both `Mobil användning` and `Single Sign-On` are present.
1. On desktop, assert `Nytt kravpaket` is positioned at the right edge of the
   package list.
1. Type `Mobil` into `Filtrera på namn eller beskrivning`.
1. Assert `Mobil användning` remains and `Single Sign-On` is hidden.
1. Type `gemensamma inloggning`.
1. Assert `Single Sign-On` remains and `Mobil användning` is hidden.
1. Type `paket som saknas`.
1. Assert `Inga resultat hittades` appears and package rows are hidden.
1. Click `Rensa sökning`.
1. Assert the filter is empty and both package rows are visible again.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant F as Filter
    participant R as Floating rail

    U->>P: Open package stewardship list
    Note over P: ✓ Kravpaket heading is shown
    Note over P: ✓ Unfiltered package rows are shown
    P->>R: Position create button from list surface
    Note over R: ✓ Desktop create button tracks list edge
    U->>F: Fill "Mobil"
    F->>P: Apply package-name search
    Note over P: ✓ Matching row remains
    Note over P: ✓ Non-matching row is hidden
    U->>F: Fill "gemensamma inloggning"
    F->>P: Apply package-description search
    Note over P: ✓ Matching row remains
    Note over P: ✓ Non-matching row is hidden
    U->>F: Fill missing package text
    F->>P: Apply empty-result filter
    Note over P: ✓ No-results row appears
    U->>F: Click clear search
    F->>P: Reset filter
    Note over P: ✓ Full list returns
```

### Supplementary Flowchart

```mermaid
flowchart LR
    A[Filter text] --> B{Package name matches?}
    B -- Yes --> C[Show row]
    B -- No --> D{Package description matches?}
    D -- Yes --> C
    D -- No --> E[Hide row]
    E --> F{Any visible rows?}
    F -- No --> G[Show no-results row]
    C --> H[Clear search]
    G --> H
    H --> I[Restore all rows]
```
