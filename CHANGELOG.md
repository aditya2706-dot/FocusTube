# Changelog

All notable changes to FocusTube are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.0] — 2026-05-05

### Added
- **Quick Channel Block** — hover any video card, click 🚫 to instantly block the channel. No typing required.
- Blocked channel **chip tags** in popup — each blocked channel shown as a removable pill. Click ✕ to unblock instantly.
- First-run **onboarding** — welcome tab opens on first install so new users know what FocusTube does.
- 💡 **Hover hint** in popup — reminds users of the hover-to-block gesture.
- `PRIVACY.md` — zero-tracking privacy policy for Chrome Web Store submission.
- `CHANGELOG.md` — this file.
- `manifest.json` now includes `short_name`, `author`, `homepage_url`, and improved store `description`.

### Changed
- All files unified to version `1.2.0`.
- `manifest.json` version was `1.1.1` — now `1.2.0`.

### Fixed
- Version number was inconsistent across `popup.html`, `popup.js`, `popup.css`, `background.js`, and `manifest.json`.

---

## [1.1.1] — 2026-05-04

### Added
- **Video Focus Lock widget** — lock to one video for 10/25/50 minutes.
- **Auto playback speed** — set 1×, 1.25×, 1.5×, 2× globally; persists across page loads.
- **Channel whitelist** (`allowedChannels`) — only show channels you explicitly allow.
- **Allowed keywords** list — overrides blocked keywords for educational content.
- **Block end cards & info cards** — hides clickable overlays at video end.
- **Anti-clickbait mode** — grayscale thumbnails until hover.
- **Focus Score + daily streak** — base 50 + block bonus + session bonus, tracked daily.

### Fixed
- `processedKey` cache not cleared on SPA navigation (keyword filter stopped working after navigating).
- Channel name extraction with lazy-loading retry.
- Active video blocker now uses a dedicated `MutationObserver` on the title element.
- Duplicate event listener registration via `_listenersAttached` guard.
- Shorts overlay now mutes/stops audio when blocked.
- Null guard on block overlay button.
- `isFocusSessionActive` synced on every storage change event.

---

## [1.0.2] — 2026-05-03

### Added
- Animated Focus Score ring with color-coded score (red/amber/green).
- Pomodoro-style Focus Session with 15/25/50m duration picker.
- Daily blocks counter ("X videos blocked today").
- Streak tracking badge.
- Motivational messages based on score.

---

## [1.0.0] — Initial Release

### Added
- Block YouTube Shorts (homepage, sidebar, search, navigation).
- Hide homepage recommendation feed with a custom "Stay Focused" message.
- Filter videos by entertainment keywords using word-boundary matching.
- Channel blocklist support.
- Hide comments section.
- Hide sidebar recommended videos.
- Block end cards.
- `MutationObserver`-based DOM filtering (no `setInterval`).
- Full-page block overlay for `/shorts/` URLs.
- Chrome `storage.sync` settings with instant save.
- Premium dark popup UI with toggle switches.
