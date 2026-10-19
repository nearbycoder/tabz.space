# Tabz browser extension

Adds the current page to your tabz.space in one click and (optionally) makes tabz your new tab page.

- **Toolbar button** or **Alt+Shift+T**: opens a small "Add to tabz" window prefilled with the page.
- **Right-click** a page or link: "Add page to tabz" / "Add link to tabz".
- **New tab**: opens tabz.space. Turn it off on the options page.
- **Incognito links**: links or folders marked "always incognito" in tabz open in a private window. To enable this, go to `chrome://extensions` → Tabz → Details and switch on **Allow in Incognito**.

It reuses your normal tabz.space login, so there are no API tokens to set up.

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**, click **Load unpacked**, and choose this `extension/` folder.
