# FocusTube 🎯

> **Distraction-free YouTube** — Block Shorts, filter clickbait, quick-block channels with one hover, and lock deep focus sessions.

[![Version](https://img.shields.io/badge/version-1.2.0-7c3aed?style=flat-square)](https://github.com/aditya2706-dot/extention-yt/releases)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-f59e0b?style=flat-square)](manifest.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/aditya2706-dot/extention-yt/pulls)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🚫 **Quick Channel Block** | Hover any video → click 🚫 → channel blocked instantly. No typing needed. |
| 🏷️ **Unblock Chips** | Every blocked channel appears as a removable ✕ pill in the popup |
| 🔒 **Video Focus Lock** | Lock yourself to one video for 10/25/50m with a redirect overlay |
| ⚡ **Auto Video Speed** | Sets playback rate automatically (1×, 1.25×, 1.5×, 2×) |
| 🎯 **Focus Score + Streak** | Daily score (base 50 + blocks + session bonus) with streak tracking |
| 🛡️ **Keyword Filter** | Word-boundary matching — no false positives on educational content |
| 📋 **Channel Whitelist** | Only show channels you trust. Everything else disappears. |
| 🎬 **Block Shorts & End Cards** | Removes Shorts everywhere + end-screen clickable overlays |
| ⏱️ **Focus Sessions** | Pomodoro-style 15/25/50m timer with strict content lock |
| 👁️ **Anti-Clickbait UI** | Grayscale thumbnails until hover — resist the bait |
| 💬 **Hide Comments** | Remove the comments section entirely |
| 📺 **Hide Sidebar** | Remove suggested videos next to the player |

---

## 📦 Installation

### Option A — Load Unpacked (Developer Mode)

1. [Download the ZIP](https://github.com/aditya2706-dot/extention-yt/archive/refs/heads/main.zip) or clone the repo:
   ```bash
   git clone https://github.com/aditya2706-dot/extention-yt.git
   ```
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the cloned/unzipped folder
5. Pin FocusTube to your toolbar 🎉

Works on: **Chrome, Brave, Edge, Arc** (any Chromium-based browser)

### Option B — Chrome Web Store
> Coming soon — submission in progress.

---

## 🚀 Quick Start

After installing:

| Action | How |
|--------|-----|
| Block a channel instantly | Hover any video → click **🚫** button (top-right of thumbnail) |
| Unblock a channel | Open popup → Blocked Channels section → click **✕** on the chip |
| Start a Focus Session | Open popup → pick duration (15/25/50m) → click **Start Deep Focus** |
| Set auto speed | Open popup → Playback section → pick your speed |
| Filter keywords | Open popup → Blocklists & Keywords → add one keyword per line |
| Whitelist channels | Open popup → Allowed Channels → add channels you always want to see |

---

## 🔢 Focus Score Formula

```
Score = 50 (base)
      + min(blocksToday × 2, 30)    ← max +30 from blocking
      + (usedFocusSession ? 20 : 0) ← +20 one-time daily bonus
```

- **Maximum:** 100  
- **Resets at:** midnight  
- **Streak:** increments each day your score exceeds 50

---

## 📁 Project Structure

```
focustube/
├── manifest.json    # Manifest V3 config (v1.2.0)
├── content.js       # DOM filtering engine (MutationObserver)
├── background.js    # Service worker (score, timer, onboarding)
├── popup.html       # Extension popup UI
├── popup.css        # Premium dark theme
├── popup.js         # Popup logic, settings, chips
├── icons/           # 16px, 48px, 128px PNG icons
├── docs/            # GitHub Pages landing/welcome page
│   └── index.html
├── PRIVACY.md       # Privacy policy (zero tracking)
├── CHANGELOG.md     # Version history
└── README.md        # This file
```

---

## 🛡️ Privacy

- **Zero telemetry** — no analytics, no tracking, no external requests ever
- All settings stored locally via `chrome.storage.sync` / `chrome.storage.local`
- `chrome.storage.sync` uses your Chrome account's built-in sync — not our servers
- Permissions used: `storage` + `tabs` (only to open the welcome page on install)

[→ Full Privacy Policy](PRIVACY.md)

---

## 🤝 Contributing

Pull requests are welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow the existing code style and add a `CHANGELOG.md` entry for your change.

---

## 📄 License

MIT — free to use, modify, and distribute.

---

## 🙏 Acknowledgements

Built with ❤️ using:
- Chrome Extension Manifest V3
- `MutationObserver` for zero-lag DOM filtering
- `chrome.storage.sync` for cross-device settings
- No dependencies — pure vanilla JS
