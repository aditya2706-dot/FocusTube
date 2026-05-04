# FocusTube 🎯

> Distraction-free YouTube — Block Shorts, filter clickbait, lock your focus.

[![Version](https://img.shields.io/badge/version-1.1.0-7c3aed?style=flat-square)](https://github.com/YOUR_USERNAME/focustube/releases)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-f59e0b?style=flat-square)](manifest.json)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🚫 **Quick Channel Block** | Hover any video → click 🚫 → channel blocked instantly |
| 🔒 **Video Focus Lock** | Lock to one video for 10/25/50m. Navigation shows redirect overlay |
| ⚡ **Auto Video Speed** | Sets playback rate automatically (1×, 1.25×, 1.5×, 2×) |
| 🎯 **Focus Score + Streak** | Daily score (base 50 + blocks + session bonus). Streak tracked. |
| 🛡️ **Keyword Filter** | Word-boundary matching — no false positives on educational content |
| 📋 **Channel Whitelist** | Only show channels you trust. Everything else disappears. |
| 🎬 **Block Shorts & End Cards** | Removes Shorts everywhere + end-screen clickable overlays |
| ⏱ **Focus Sessions** | Pomodoro-style 15/25/50m timer with strict mode |
| 👁 **Anti-Clickbait UI** | Grayscale thumbnails until hover |

---

## 📦 Installation (Developer Mode)

1. **Download** the latest zip from [Releases](https://github.com/YOUR_USERNAME/focustube/releases)
2. **Unzip** the downloaded file
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** → select the unzipped folder
6. Pin FocusTube to your toolbar 🎉

Works on: **Chrome, Brave, Edge, Arc** (any Chromium-based browser)

---

## 🔢 Focus Score Formula

```
Score = 50 (base)
      + min(blocksToday × 2, 30)   ← max +30 from blocking
      + (usedFocusSession ? 20 : 0) ← +20 one-time daily bonus
```

Maximum: **100** · Resets at **midnight** · Cannot inflate.

---

## 📁 Project Structure

```
focustube/
├── manifest.json    # Manifest V3 config
├── content.js       # DOM filtering engine (MutationObserver)
├── background.js    # Service worker (score, timer, state)
├── popup.html       # Extension popup UI
├── popup.css        # Premium dark theme
├── popup.js         # Popup logic & settings
├── icons/           # 16px, 48px, 128px icons
└── docs/            # GitHub Pages landing site
    └── index.html
```

---

## 🛡️ Privacy

- **Zero telemetry** — no analytics, no tracking, no external requests
- All data stored locally via `chrome.storage.sync` / `chrome.storage.local`
- Permissions used: `storage` only

---

## 📄 License

MIT — free to use, modify, and distribute.
