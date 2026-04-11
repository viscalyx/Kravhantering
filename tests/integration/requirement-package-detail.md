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
    A[Start viewport variant] --> B[Open /sv/requirement-packages/ETJANSTPLATT]
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

1. Navigate to `/sv/requirement-packages/ETJANSTPLATT`.
2. Assert the `h1` "Införande av e-tjänstplattform" heading is visible.
3. Click "Redigera kravpaket".
4. Assert the `h2` "Redigera kravpaket" heading is visible.
5. Assert the name text input has value `"Införande av e-tjänstplattform"`.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant F as EditForm

    U->>P: Open /sv/requirement-packages/ETJANSTPLATT
    Note over P: ✓ h1 "Införande av e-tjänstplattform" visible
    U->>P: Click "Redigera kravpaket"
    P->>F: Open edit form
    Note over F: ✓ h2 "Redigera kravpaket" visible
    Note over F: ✓ Name input = "Införande av e-tjänstplattform"
```

## lets the package-detail lists scroll independently and keeps the title bar sticky

### Purpose: Independent Panel Scroll

Confirms that the left and right panels each scroll their own content without
scrolling the page or the other panel, and that the sticky title bar stays
fixed at the same vertical position while the panel scrolls beneath it.

### Step-by-Step Flow: Independent Panel Scroll

1. Navigate to `/sv/requirement-packages/ETJANSTPLATT` at 560 px height.
2. Assert the available-requirements panel, its sticky bar, trigger, title,
   and Krav-ID header are visible, and `scrollY` is 0.
3. Assert the left side shows either the `items` list panel with its own
   sticky controls or the empty-state heading/message when the package has no
   linked requirements.
4. Measure initial overflow, starting with the available-requirements panel.
5. If neither side overflows and the left list panel exists, expand the first
   left row to add content height and re-measure.
6. If still no overflow, skip the scroll assertions.
7. Record initial `scrollTop` values and the visible panel bounding boxes.
8. Assert the right panel ends near the right viewport edge (within 8 px).
9. Assert the visible split-panel cards fit within the viewport height.
10. Programmatically set `scrollTop` to 520 on the overflowing panel.
11. Assert the scrolled panel's `scrollTop` increased.
12. If the left list panel exists and the right panel was scrolled, assert the
    left panel's `scrollTop` is unchanged.
13. Assert `window.scrollY` is still 0.
14. Assert the right sticky top bar, column-picker trigger, title, and
    Krav-ID header are still visible.
15. Assert the right sticky top bar's `y` position is the same before and
    after scrolling.

### Sequence Diagram: Independent Panel Scroll

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant L as LeftSide
    participant R as RightPanel
    participant Bar as RightStickyTitleBar

    U->>P: Open ETJANSTPLATT at height 560px
    P->>L: Render "Krav i paketet" panel or empty state
    P->>R: Render "Tillgängliga krav"
    Note over L,R: ✓ Right panel visible, left side may be empty
    P->>R: Measure overflow
    P->>L: Measure overflow when left list panel exists
    Note over L,R: Expand left row only if a left list panel exists
    P->>Bar: Record Y position
    U->>R: Set scrollTop = 520 when the right panel overflows
    Note over R: ✓ scrollTop increased
    Note over L: ✓ Left scrollTop unchanged when a left list panel exists
    Note over P: ✓ window.scrollY = 0
    Note over Bar: ✓ Y position unchanged
```

### Supplementary Flowchart

```mermaid
flowchart TD
    A[Measure right-panel overflow] --> B{Right overflows?}
    B -- No --> C{Left list panel exists?}
    C -- Yes --> D[Expand first left row]
    C -- No --> E[Skip scroll assertion]
    D --> F{Any panel now overflows?}
    F -- No --> E
    F -- Yes --> G[Scroll overflowing panel]
    B -- Yes --> G
    G --> H[Assert only that panel scrolled]
    H --> I[Assert page Y = 0]
    I --> J[Assert right title bar Y unchanged]
```
