# Throwaway focus comparison

Question: how do today's keyboard focus indicators compare with a proposed
visible outline, particularly when forced colors removes shadows?

This branch is a visual experiment, not a production fix. The proposal has
not been selected for production. No sample action writes data.

## View

Open `focus-prototype-evidence/comparison.html` directly for side-by-side
browser captures. Save has actual keyboard focus in every image. The captures
use the application's shared button classes, not recreated illustrations.

For the interactive comparison, run `npm run prototype:1677` from the repository
root, then open either URL:

- <http://localhost:3001/en/requirements?variant=today>
- <http://localhost:3001/en/requirements?variant=desired>

Use Tab and Shift+Tab to move focus. Left and right arrows switch variants
while leaving the same control focused. The floating bar also switches them.
Open the form dialog or Delete confirmation to compare their existing controls.
The real navigation remains available for expanded/collapsed comparisons.
Switch to `/sv/requirements` for Swedish labels.

Enable `forced-colors: active` in browser DevTools Rendering, or use native
Windows High Contrast. The state panel reports what the browser is using;
there is no fake high-contrast toggle.

The server uses port 3001 and the existing development environment. In this
preview, sign in with the local development account `ada.admin` / `devpass`.
The launcher selects the existing Keycloak client registered for port 3001,
so login returns to the comparison. It uses the session cookie
`kravhantering_focus_prototype` to keep preview sign-in separate from the
development app; its lifetime and security settings follow the development
configuration. These overrides apply only to the launched process and do not
change environment files or the identity service.

In this
workspace the prototype uses shared dependencies via a node_modules symlink;
its command enables a development-only Turbopack root override to resolve them.
The prototype renders only with the explicit variant parameter in development.

## Observation and limits

Chromium emulation reproduced the missing indicator: Today had no outline and
no shadow in forced colors, despite actual keyboard focus. Desired retained a
2px solid outline with a 3px gap in both light and dark forced palettes.
Regular themes use dark/light outlines; forced colors uses `CanvasText` and
keeps the browser's palette enabled. Form-dialog focus restoration succeeded
in all eight combinations of variant, application theme and forced colors.

The capture script records four shared controls per combination and the
dialog focus-restoration result (40 observations). It also captures the actual
form dialog. These are exploratory observations, not a regression suite.
Type checking and lint passed. No production tests or manual cases were added
because this branch is intentionally throwaway.

Native Windows testing, comprehensive navigation and confirmation coverage,
clipping checks and measured contrast across all adjacent surfaces remain
implementation acceptance work. Do not treat this visual comparison as closing
the implementation issue or establishing application-wide WCAG compliance.

To regenerate screenshots with the preview server running, first run
`node scripts/dev-login.mjs --base http://localhost:3001 --jar /tmp/prototype-1677.cookies`,
then `npm run prototype:1677:capture`. Output goes to `/tmp/focus-prototype-1677`.
