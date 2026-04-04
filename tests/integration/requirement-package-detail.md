# Requirement Package Detail Integration Tests

> Test flow documentation for
> [`requirement-package-detail.spec.ts`](tests/integration/requirement-package-detail.spec.ts)

This suite verifies the requirement package detail page: that the edit form
opens from the title action and that the two side-by-side requirement lists
("Krav i paketet" and "Tillgängliga krav") scroll independently without moving
the page, while keeping the sticky title bar fixed at the top of each panel.

## Data Model

<!-- markdownlint-disable MD013 -->
| Locator | Description |
| --- | --- |
| `[data-package-detail-list-panel="items"]` | Left panel — requirements already in the package. |
| `[data-package-detail-list-panel="available"]` | Right panel — requirements available to add. |
| `[data-requirements-sticky-top-bar="true"]` | Sticky title bar inside each panel. |
| `[data-column-picker-trigger="true"]` | Column-picker pill inside each panel. |
| `[data-requirement-header-label="uniqueId"]` | Krav-ID column header label. |
| `[data-expanded-detail-cell="true"]` | Inline detail pane expanded inside a row. |
<!-- markdownlint-enable MD013 -->

## Overview Flowchart

```mermaid
flowchart TD
    A[Start viewport variant] --> B[Open /sv/requirement-packages/BEHORIGHET-IAM]
    B --> C[Assert heading visible]
    C --> D[Click Redigera kravpaket]
    D --> E[Assert edit form visible with prefilled name]
    B --> F{Desktop?}
    F -- Yes --> G[Set viewport to 560 px height]
    G --> H[Assert both panels fill the viewport]
    H --> I{Either panel overflows?}
    I -- No --> J[Expand first left row to add height]
    J --> K{Now overflows?}
    K -- No --> L[Skip scroll assertion]
    K -- Yes --> M[Scroll overflowing panel to 520 px]
    I -- Yes --> M
    M --> N[Assert only scrolled panel moved]
    N --> O[Assert page scrollY stays at 0]
    O --> P[Assert sticky title bar Y unchanged]
    P --> Q[Test passes]
```

## Test Setup

- No `beforeEach` hooks. Each test navigates independently.
- The suite iterates over `mobile` (`375×812`) and `desktop` (`1280×720`)
  viewports.
- The independent-scroll test is desktop-only and reduces the viewport height
  to 560 px after navigation to create overflow conditions.
- Overflow is detected by comparing `scrollHeight` with `clientHeight + 50`.
  If neither panel overflows even after expanding a row, the scroll-sync
  assertion is skipped (see inline comment in the spec).

## opens the package edit view from the title action

### Purpose

Verifies that clicking "Redigera kravpaket" opens the edit form and pre-fills
the package name, confirming the edit action is correctly wired to the detail
page title.

### Step-by-Step Flow

1. Navigate to `/sv/requirement-packages/BEHORIGHET-IAM`.
2. Assert the `h1` "Behörighet och IAM" heading is visible.
3. Click "Redigera kravpaket".
4. Assert the `h2` "Redigera kravpaket" heading is visible.
5. Assert the name text input has value `"Behörighet och IAM"`.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant F as EditForm

    U->>P: Open /sv/requirement-packages/BEHORIGHET-IAM
    Note over P: ✓ h1 "Behörighet och IAM" visible
    U->>P: Click "Redigera kravpaket"
    P->>F: Open edit form
    Note over F: ✓ h2 "Redigera kravpaket" visible
    Note over F: ✓ Name input = "Behörighet och IAM"
```

## lets the package-detail lists scroll independently and keeps the title bar sticky

### Purpose: Independent Panel Scroll

Confirms that the left and right panels each scroll their own content without
scrolling the page or the other panel, and that the sticky title bar stays
fixed at the same vertical position while the panel scrolls beneath it.

### Step-by-Step Flow: Independent Panel Scroll

1. Navigate to `/sv/requirement-packages/BEHORIGHET-IAM` at 560 px height.
2. Assert both panels, their sticky bars, triggers, titles, and Krav-ID
   headers are visible, and `scrollY` is 0.
3. Measure initial overflow: if neither panel overflows, expand the first left
   row to add content height and re-measure.
4. If still no overflow, skip the scroll assertions.
5. Record initial `scrollTop` for both panels and bounding boxes.
6. Assert left panel starts near the left viewport edge (≤ 8 px).
7. Assert right panel ends near the right viewport edge (within 8 px).
8. Assert both panels fit within the viewport height.
9. Programmatically set `scrollTop` to 520 on the overflowing panel.
10. Assert the scrolled panel's `scrollTop` increased.
11. Assert the stationary panel's `scrollTop` is unchanged.
12. Assert `window.scrollY` is still 0.
13. Assert the sticky top bar, column-picker trigger, title, and Krav-ID
    header are still visible.
14. Assert the sticky top bar's `y` position is the same before and after
    scrolling.

### Sequence Diagram: Independent Panel Scroll

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant L as LeftPanel
    participant R as RightPanel
    participant Bar as StickyTitleBar

    U->>P: Open BEHORIGHET-IAM at height 560px
    P->>L: Render "Krav i paketet"
    P->>R: Render "Tillgängliga krav"
    Note over L,R: ✓ Both panels visible within viewport
    P->>L: Measure overflow
    P->>R: Measure overflow
    Note over L,R: Expand row if needed to create overflow
    P->>Bar: Record Y position
    U->>L: Set scrollTop = 520 (or R if R overflows)
    Note over L: ✓ scrollTop increased
    Note over R: ✓ scrollTop unchanged
    Note over P: ✓ window.scrollY = 0
    Note over Bar: ✓ Y position unchanged
```

### Supplementary Flowchart

```mermaid
flowchart TD
    A[Measure overflow] --> B{Left or right overflows?}
    B -- Neither --> C[Expand first row]
    C --> D{Now overflows?}
    D -- No --> E[Skip scroll assertion]
    D -- Yes --> F[Scroll overflowing panel]
    B -- Yes --> F
    F --> G[Assert only that panel scrolled]
    G --> H[Assert page Y = 0]
    H --> I[Assert title bar Y unchanged]
```
