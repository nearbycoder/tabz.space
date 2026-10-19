# Tabz browser extension

Save pages, whole windows and your browser bookmarks to tabz.space, and (optionally) make tabz your new tab page.

- **Toolbar popup** (or **Alt+Shift+T**): save the current page to any group, or save every tab in the window as a new group (optionally closing them).
- **Right-click** a page or link: "Add page to tabz", "Add link to tabz", "Save all tabs to tabz".
- **Browser bookmark sync**: mirror your browser's bookmarks into a read-only "Browser bookmarks" board, kept up to date as they change. Turn it on in the extension options.
- **Open all**: tabz's "open group/folder as tabs" buttons open every link at once (browsers otherwise allow one per click).
- **Incognito links**: links or folders marked "always incognito" open in a private window. Enable **Allow in Incognito** on the extension's details page.
- **New tab**: opens tabz.space. Turn it off on the options page.

There's nothing to configure: open tabz.space while signed in and the page hands the extension its own API token (shown under Customize → Connect → API tokens as "Browser extension", where you can revoke it).

## Install

Download a zip from Customize → Data → Browser on tabz.space (`/downloads/tabz-chrome.zip` or `/downloads/tabz-firefox.zip`) and unzip it.

- **Chrome / Edge / Brave**: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the unzipped folder.
- **Firefox**: open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** and pick `manifest.json`. Permanent installs need the zip signed through addons.mozilla.org.

`npm run build:extension` rebuilds both zips from this folder; `npm run build` does it automatically.
