/**
 * FocusTube v1.2.1 - Production Content Script
 * Handles DOM manipulation with high performance, robust selectors, and smart filtering.
 *
 * Bug fixes in this version:
 * - Fixed: processedKey cache not cleared on SPA navigation (keyword filter stopped working)
 * - Fixed: Channel name extraction with lazy-loading retry
 * - Fixed: Active video blocker now uses a dedicated MutationObserver on the title element
 * - Fixed: Duplicate event listener registration via _listenersAttached guard
 * - Fixed: Shorts overlay now mutes/stops audio on block
 * - Fixed: Null guard on block overlay button
 * - Fixed: isFocusSessionActive synced on every storage change event
 */

class Logger {
    constructor(enabled) {
        this.enabled = enabled;
        this.prefix = '[FocusTube]';
    }

    log(...args) {
        if (this.enabled) console.log(this.prefix, ...args);
    }

    warn(...args) {
        if (this.enabled) console.warn(this.prefix, ...args);
    }

    error(...args) {
        if (this.enabled) console.error(this.prefix, ...args);
    }
}

class FocusTube {
    constructor() {
        this.settings = {
            blockShorts: true,
            hideHomepage: true,
            filterEntertainment: true,
            hideComments: false,
            hideSidebar: false,
            antiClickbait: false,
            blockEndCards: true,          // NEW: hide end-screen overlay cards
            blockedChannels: '',
            allowedChannels: '',          // NEW: channel whitelist (only show these)
            blockedKeywords: 'prank\nvlog\nroast\nchallenge\ncomedy\ngossip\ndrama',
            allowedKeywords: '',
            autoSpeed: '1',               // NEW: auto playback speed ("1", "1.25", "1.5", "2")
            debugMode: false,
            isFocusSessionActive: false
        };

        this.lists = {
            blockedChannels: [],
            allowedChannels: [],     // NEW
            blockedKeywords: [],
            allowedKeywords: []
        };

        this.logger = new Logger(false);
        this.observer = null;
        this.processTimeout = null;
        this._listenersAttached = false;
        this._videoObserver = null;
        this._pendingBlocks = 0;   // Batched block count sent every 5s

        // Robust selector arrays covering multiple YouTube DOM variants
        this.selectors = {
            videoContainers: [
                'ytd-rich-item-renderer',
                'ytd-video-renderer',
                'ytd-compact-video-renderer',
                'ytd-grid-video-renderer',
                'ytd-reel-item-renderer',
                'ytd-playlist-video-renderer'
            ],
            titleElements: [
                '#video-title',
                '#video-title-link',
                'a#video-title',
                'span#video-title',
                '.title-and-badge yt-formatted-string',
                'h3.ytd-rich-grid-media a#video-title'
            ],
            channelElements: [
                'ytd-channel-name a.yt-simple-endpoint',
                'ytd-channel-name .yt-simple-endpoint',
                'ytd-channel-name yt-formatted-string',
                'a.ytd-video-renderer[href^="/@"]',
                'a.ytd-video-renderer[href^="/channel"]',
                '#channel-name a',
                '#owner-sub-count + div a'
            ],
            thumbnailLinks: [
                'a#thumbnail',
                'a.ytd-thumbnail',
                'a.ytd-reel-item-renderer'
            ],
            watchTitle: [
                'h1.ytd-watch-metadata yt-formatted-string',
                'h1.title yt-formatted-string',
                '#above-the-fold #title h1 yt-formatted-string'
            ],
            watchChannel: [
                'ytd-video-owner-renderer ytd-channel-name a',
                '#owner #upload-info ytd-channel-name a',
                '#owner-name a',
                'ytd-video-owner-renderer .ytd-channel-name a'
            ]
        };
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.applyStaticStyles();
        this.startObserver();
        this.processDOM();
        this.setupWatchPagePoller();
        this.startBlockFlusher();
        this.injectVideoLockUI();   // Inject lock widget if on /watch
        this.checkVideoLock();      // Apply lock state if one is active
        this.logger.log('Initialization complete. v1.2.1');
    }

    async loadSettings() {
        return new Promise(resolve => {
            chrome.storage.sync.get(this.settings, (items) => {
                this.settings = { ...this.settings, ...items };
                this.logger.enabled = items.debugMode;

                // Parse lists
                this.lists.blockedChannels = this.parseList(items.blockedChannels);
                this.lists.allowedChannels = this.parseList(items.allowedChannels); // NEW
                this.lists.blockedKeywords = this.parseList(items.blockedKeywords);
                this.lists.allowedKeywords = this.parseList(items.allowedKeywords);

                resolve();
            });
        });
    }

    parseList(text) {
        if (!text) return [];
        return text.split('\n')
            .map(item => item.trim().toLowerCase())
            .filter(item => item.length > 0);
    }

    /**
     * Flush batched block counts to background every 5s.
     * Only runs once — guarded against multiple init calls.
     */
    startBlockFlusher() {
        if (this._flushInterval) return;
        this._flushInterval = setInterval(() => {
            if (this._pendingBlocks > 0) {
                const count = this._pendingBlocks;
                this._pendingBlocks = 0;
                try {
                    chrome.runtime.sendMessage({ action: 'incrementBlocks', count });
                } catch (e) { /* extension context invalidated — ignore */ }
            }
        }, 5000);
    }

    setupEventListeners() {
        // FIX #8: Guard prevents duplicate listeners on re-init calls
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        // FIX #6 + #1: On any sync storage change, re-load ALL settings and
        // clear processed keys so filtering decisions are re-evaluated fresh.
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                this.logger.log('Settings changed, reloading...');
                this.loadSettings().then(() => {
                    // Clear all cached processing decisions
                    document.querySelectorAll('[data-ft-processed-key]').forEach(el => {
                        delete el.dataset.ftProcessedKey;
                        el.style.display = '';
                    });
                    this.applyStaticStyles();
                    this.processDOM();
                });
            }
        });

        // FIX #1: Clear processed keys on every SPA navigation so new page
        // results are evaluated from scratch
        window.addEventListener('yt-navigate-start', () => {
            document.querySelectorAll('[data-ft-processed-key]').forEach(el => {
                delete el.dataset.ftProcessedKey;
            });
            this.removeFullPageBlock();
            this.applyStaticStyles();
        });

        window.addEventListener('yt-navigate-finish', () => {
            setTimeout(() => {
                this.applyStaticStyles();
                this.processDOM();
                this.setupWatchPagePoller();
                this.checkVideoLock();         // Check lock on every navigation
                this.injectVideoLockUI();      // Re-inject lock widget on watch pages
            }, 300);
        });
    }

    applyStaticStyles() {
        try {
            let styleEl = document.getElementById('focustube-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'focustube-style';
                (document.head || document.documentElement).appendChild(styleEl);
            }

            let css = '';

            if (this.settings.hideComments) {
                css += `ytd-comments { display: none !important; }\n`;
            }

            if (this.settings.hideSidebar) {
                css += `#secondary { display: none !important; }\n`;
                css += `ytd-watch-next-secondary-results-renderer { display: none !important; }\n`;
            }

            if (this.settings.blockShorts) {
                // CSS-level shorts blocking covers shelves and navigation entries
                css += `ytd-rich-shelf-renderer[is-shorts] { display: none !important; }\n`;
                css += `ytd-reel-shelf-renderer { display: none !important; }\n`;
                css += `ytd-mini-guide-entry-renderer[aria-label="Shorts"] { display: none !important; }\n`;
                css += `ytd-guide-entry-renderer:has(a[title="Shorts"]) { display: none !important; }\n`;
                // Also hide shorts chips/tab
                css += `yt-chip-cloud-chip-renderer:has([title="Shorts"]) { display: none !important; }\n`;
            }

            if ((this.settings.hideHomepage || this.settings.isFocusSessionActive) && window.location.pathname === '/') {
                css += `ytd-rich-grid-renderer { display: none !important; }\n`;
                this.injectHomepageMessage();
            } else if (window.location.pathname === '/') {
                this.removeHomepageMessage();
            }

            if (this.settings.antiClickbait) {
                css += `
                    ytd-thumbnail img, .ytd-thumbnail img, .ytd-reel-item-renderer img {
                        filter: grayscale(1) opacity(0.8) !important;
                        transition: filter 0.3s, opacity 0.3s !important;
                    }
                    ytd-thumbnail:hover img, .ytd-thumbnail:hover img, .ytd-reel-item-renderer:hover img {
                        filter: none !important;
                        opacity: 1 !important;
                    }
                `;
            }

            if (this.settings.blockEndCards) {
                // Hide YouTube's end-screen overlay and suggestions card
                css += `.ytp-endscreen-element, ytd-endscreen-renderer { display: none !important; }\n`;
                css += `.ytp-cards-teaser, .ytp-cards-button, .ytp-ce-element { display: none !important; }\n`;
                css += `.ytp-cards-header { display: none !important; }\n`;
            }

            // ── Video Focus Lock: FAB + Panel ────────────────────────────────────
            css += `
                /* ── Floating Action Button (collapsed state) ── */
                #ft-lock-fab {
                    position: fixed;
                    bottom: 80px; right: 20px;
                    z-index: 2147483646;
                    width: 44px; height: 44px;
                    border-radius: 50%;
                    background: linear-gradient(135deg,#7c3aed,#a855f7);
                    box-shadow: 0 4px 20px rgba(124,58,237,0.55);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 22px; cursor: pointer;
                    border: none; color: #fff;
                    transition: transform 0.2s, box-shadow 0.2s;
                    user-select: none;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                #ft-lock-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(124,58,237,0.7); }
                #ft-lock-fab.active-lock { background: linear-gradient(135deg,#ef4444,#f97316); }

                /* ── Expanded Panel ── */
                #ft-lock-panel {
                    position: fixed;
                    bottom: 142px; right: 20px;
                    z-index: 2147483645;
                    background: rgba(12,12,16,0.96);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(124,58,237,0.3);
                    border-radius: 18px;
                    padding: 0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    width: 240px;
                    box-shadow: 0 16px 48px rgba(0,0,0,0.65);
                    user-select: none;
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                }
                #ft-lock-panel.visible { display: flex; animation: ftPanelIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
                @keyframes ftPanelIn {
                    from { opacity:0; transform: scale(0.85) translateY(10px); }
                    to   { opacity:1; transform: scale(1)    translateY(0); }
                }

                /* Panel header (drag handle) */
                #ft-lock-panel .ft-lk-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 12px 14px 10px;
                    cursor: grab;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                #ft-lock-panel .ft-lk-header:active { cursor: grabbing; }
                #ft-lock-panel .ft-lk-title {
                    font-size: 11px; font-weight: 700;
                    text-transform: uppercase; letter-spacing: 0.07em;
                    color: #a78bfa; display: flex; align-items: center; gap: 5px;
                }
                #ft-lock-panel .ft-lk-close {
                    background: none; border: none; color: #52525b;
                    font-size: 16px; cursor: pointer; padding: 0; line-height: 1;
                    transition: color 0.15s;
                }
                #ft-lock-panel .ft-lk-close:hover { color: #a1a1aa; }

                /* Panel body */
                #ft-lock-panel .ft-lk-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }

                /* SVG ring */
                .ft-ring-wrap {
                    display: flex; align-items: center; justify-content: center;
                    position: relative; width: 110px; height: 110px; margin: 0 auto;
                }
                .ft-ring-bg { fill: none; stroke: rgba(124,58,237,0.12); stroke-width: 7; }
                .ft-ring-prog {
                    fill: none; stroke: #a78bfa; stroke-width: 7;
                    stroke-linecap: round;
                    stroke-dasharray: 283;
                    stroke-dashoffset: 0;
                    transform: rotate(-90deg); transform-origin: 50% 50%;
                    transition: stroke-dashoffset 1s linear, stroke 0.5s;
                }
                .ft-ring-prog.ending { stroke: #ef4444; }
                .ft-ring-time {
                    position: absolute; inset: 0;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    font-variant-numeric: tabular-nums;
                }
                .ft-ring-time span {
                    font-size: 22px; font-weight: 800;
                    color: #f4f4f5; letter-spacing: -0.02em;
                    line-height: 1;
                }
                .ft-ring-time small {
                    font-size: 9px; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.08em;
                    color: #52525b; margin-top: 2px;
                }

                /* Preset buttons */
                .ft-lk-presets { display: flex; gap: 5px; }
                .ft-lk-preset {
                    flex: 1; padding: 5px 0;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 7px;
                    background: transparent; color: #9ca3af;
                    font-size: 11px; font-weight: 600;
                    cursor: pointer; transition: all 0.15s;
                    font-family: inherit;
                }
                .ft-lk-preset:hover { color: #f4f4f5; background: rgba(255,255,255,0.05); }
                .ft-lk-preset.active {
                    background: rgba(124,58,237,0.2);
                    border-color: rgba(124,58,237,0.45);
                    color: #a78bfa;
                }

                /* Custom time input */
                .ft-lk-custom {
                    display: flex; align-items: center; gap: 7px;
                }
                .ft-lk-custom label {
                    font-size: 11px; color: #6b7280; font-weight: 500; white-space: nowrap;
                }
                .ft-lk-custom input[type=number] {
                    flex: 1; background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 7px; color: #f4f4f5;
                    padding: 5px 8px; font-size: 13px; font-weight: 600;
                    outline: none; width: 0; font-family: inherit;
                    font-variant-numeric: tabular-nums;
                }
                .ft-lk-custom input[type=number]:focus { border-color: rgba(124,58,237,0.5); }
                .ft-lk-custom input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }

                /* Action buttons */
                .ft-lk-start-btn {
                    background: linear-gradient(135deg,#7c3aed,#a855f7); color: #fff;
                    border: none; border-radius: 9px;
                    padding: 10px 12px;
                    font-size: 12px; font-weight: 700;
                    cursor: pointer; transition: opacity 0.15s;
                    display: flex; align-items: center; justify-content: center; gap: 5px;
                    font-family: inherit; width: 100%;
                }
                .ft-lk-start-btn:hover { opacity: 0.88; }
                .ft-lk-end-btn {
                    background: rgba(239,68,68,0.1);
                    border: 1px solid rgba(239,68,68,0.25);
                    border-radius: 9px; color: #fca5a5;
                    padding: 8px; font-size: 12px; font-weight: 600;
                    cursor: pointer; transition: all 0.15s;
                    font-family: inherit; width: 100%;
                }
                .ft-lk-end-btn:hover { background: rgba(239,68,68,0.18); color: #ef4444; }
            `;

            styleEl.textContent = css;
        } catch (e) {
            this.logger.error('Error applying static styles:', e);
        }
    }

    injectHomepageMessage() {
        // Avoid duplicate injection
        if (document.getElementById('focustube-homepage-msg')) return;

        const msgContainer = document.createElement('div');
        msgContainer.id = 'focustube-homepage-msg';
        msgContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 50vh;
            color: #aaaaaa;
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
            text-align: center;
            margin-top: 50px;
            width: 100%;
            pointer-events: none;
        `;

        const icon = this.settings.isFocusSessionActive ? '🔒' : '🎯';
        const msg = this.settings.isFocusSessionActive
            ? 'Focus Session Active.<br>Only whitelisted content allowed.'
            : 'Stay focused.<br>Use Search to find what you need.';

        msgContainer.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
            <div style="font-size: 18px; line-height: 1.6;">${msg}</div>
        `;

        const tryInsert = () => {
            const primary = document.querySelector(
                '#page-manager > ytd-browse[page-subtype="home"] #primary, ytd-browse[page-subtype="home"] #primary'
            );
            if (primary && !document.getElementById('focustube-homepage-msg')) {
                primary.prepend(msgContainer);
            }
        };

        tryInsert();
        setTimeout(tryInsert, 800);
        setTimeout(tryInsert, 2500);
    }

    removeHomepageMessage() {
        const el = document.getElementById('focustube-homepage-msg');
        if (el) el.remove();
    }

    /**
     * FIX #2: Multi-selector text extractor with title attribute fallback.
     * Returns the first non-empty string found across the selector array.
     */
    extractElementText(parent, selectorArray) {
        for (const selector of selectorArray) {
            try {
                const el = parent.querySelector(selector);
                if (el) {
                    const text = (el.title || el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim();
                    if (text) return text;
                }
            } catch (_) { /* invalid selector — skip */ }
        }
        return '';
    }

    extractLinkHref(parent, selectorArray) {
        for (const selector of selectorArray) {
            try {
                const el = parent.querySelector(selector);
                if (el) {
                    const href = el.getAttribute('href');
                    if (href) return href;
                }
            } catch (_) { /* invalid selector — skip */ }
        }
        return '';
    }

    /**
     * Escape special regex characters in a user-supplied string.
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Word-boundary keyword match.
     * "reaction" matches "reaction video" but NOT "interactions" or "reactions".
     * Uses \b so it works on whole words only.
     */
    matchesKeyword(text, keyword) {
        if (!text || !keyword) return false;
        try {
            const pattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
            return pattern.test(text);
        } catch (_) {
            // Fallback to includes() if regex is somehow invalid
            return text.toLowerCase().includes(keyword.toLowerCase());
        }
    }


    shouldBlockVideo(title, channelName, isShortLink) {
        const lowerTitle   = (title || '').toLowerCase();
        const lowerChannel = (channelName || '').toLowerCase();

        // 1. Channel whitelist (allowedChannels) — if list is non-empty, only
        //    show videos from channels in the list; hide everything else.
        //    Does NOT apply on /watch pages (user is already watching that video).
        if (this.lists.allowedChannels.length > 0 && window.location.pathname !== '/watch') {
            if (!lowerChannel) return false; // Can't decide yet — don't hide prematurely
            let channelAllowed = false;
            for (const ac of this.lists.allowedChannels) {
                if (lowerChannel.includes(ac)) {
                    channelAllowed = true;
                    break;
                }
            }
            if (!channelAllowed) {
                this.logger.log(`Blocked (Channel not in whitelist): "${channelName}"`);
                return true;
            }
        }

        // 2. Keyword whitelist — overrides block rules.
        //    Uses plain includes() so "networking" matches "computer networking tutorial".
        if (this.lists.allowedKeywords.length > 0) {
            for (const keyword of this.lists.allowedKeywords) {
                if (
                    (lowerTitle   && lowerTitle.includes(keyword)) ||
                    (lowerChannel && lowerChannel.includes(keyword))
                ) {
                    this.logger.log(`Allowed (Whitelist): "${title}"`);
                    return false;
                }
            }
        }

        // 3. STRICT MODE (Focus Session active) — block everything not whitelisted
        //    EXCEPTION: never block /watch pages. The user chose a specific video
        //    to watch — Focus Mode prevents BROWSING feeds, not watching a video.
        if (this.settings.isFocusSessionActive && window.location.pathname !== '/watch') {
            this.logger.log(`Blocked (Strict Mode / feed): "${title}"`);
            return true;
        }

        // 3. Shorts check
        if (this.settings.blockShorts && isShortLink) {
            this.logger.log(`Blocked (Short): "${title || isShortLink}"`);
            return true;
        }

        // 4. Channel blocklist — uses plain includes() so partial names work.
        //    e.g. "beast" blocks "MrBeast Gaming".
        if (this.lists.blockedChannels.length > 0 && lowerChannel) {
            for (const bChannel of this.lists.blockedChannels) {
                if (lowerChannel.includes(bChannel)) {
                    this.logger.log(`Blocked (Channel "${bChannel}"): "${channelName}"`);
                    return true;
                }
            }
        }

        // 5. Keyword blocklist — uses WORD BOUNDARY matching to prevent false
        //    positives. "reaction" will NOT match "interactions", "characters",
        //    or "reactions" (plural ends with 's', outside the boundary).
        if (this.settings.filterEntertainment && lowerTitle && this.lists.blockedKeywords.length > 0) {
            for (const keyword of this.lists.blockedKeywords) {
                if (this.matchesKeyword(lowerTitle, keyword)) {
                    this.logger.log(`Blocked (Keyword "${keyword}"): "${title}"`);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * NEW: Apply auto playback speed when a video element is available.
     * Retries for up to 5 seconds to handle YouTube's lazy video injection.
     */
    applyAutoSpeed() {
        const speed = parseFloat(this.settings.autoSpeed || '1');
        if (speed === 1) return; // Default — no action needed

        const trySet = (attemptsLeft) => {
            const video = document.querySelector('video');
            if (video && video.readyState >= 1) {
                video.playbackRate = speed;
                this.logger.log(`Auto speed set to ${speed}x`);

                // Re-apply if YouTube resets it (e.g. on ad skip)
                video.addEventListener('ratechange', () => {
                    if (video.playbackRate !== speed && !video.paused) {
                        video.playbackRate = speed;
                    }
                }, { once: false });
            } else if (attemptsLeft > 0) {
                setTimeout(() => trySet(attemptsLeft - 1), 500);
            }
        };

        trySet(10); // Up to 5s of retries (10 × 500ms)
    }


    /**
     * FIX #3: Dedicated watch-page poller using MutationObserver on the
     * metadata section so we catch the title as soon as YouTube renders it,
     * even if it loads asynchronously after navigation.
     */
    setupWatchPagePoller() {
        // Disconnect any previous watch observer
        if (this._videoObserver) {
            this._videoObserver.disconnect();
            this._videoObserver = null;
        }

        if (window.location.pathname !== '/watch' && !window.location.pathname.startsWith('/shorts/')) {
            this.removeFullPageBlock();
            return;
        }

        // Immediately check shorts
        if (this.settings.blockShorts && window.location.pathname.startsWith('/shorts/')) {
            this.showFullPageBlock('Shorts are disabled. 🛡️');
            return;
        }

        // Apply auto speed on /watch pages
        this.applyAutoSpeed();


        // For /watch pages: observe the metadata area for the title to appear
        const checkNow = () => {
            const title = this.extractElementText(document, this.selectors.watchTitle);
            const channel = this.extractElementText(document, this.selectors.watchChannel);

            if (title) {
                if (this.shouldBlockVideo(title, channel, false)) {
                    this.showFullPageBlock('This video matches your distraction filters.');
                } else {
                    this.removeFullPageBlock();
                }
                // We got a result — disconnect the observer
                if (this._videoObserver) {
                    this._videoObserver.disconnect();
                    this._videoObserver = null;
                }
            }
        };

        // Run immediately in case metadata already loaded
        checkNow();

        // Also observe the document for DOM changes until we get the title
        this._videoObserver = new MutationObserver(checkNow);
        const metaTarget = document.querySelector('#columns, #below, ytd-watch-metadata') || document.body;
        this._videoObserver.observe(metaTarget, { childList: true, subtree: true });

        // Safety: stop the observer after 8 seconds regardless
        setTimeout(() => {
            if (this._videoObserver) {
                this._videoObserver.disconnect();
                this._videoObserver = null;
            }
        }, 8000);
    }

    /**
     * FIX #12: Shorts block now stops all loading and silences audio.
     * FIX #13: Null guard on the button reference.
     */
    showFullPageBlock(message) {
        if (document.getElementById('focustube-video-block')) return;

        // Stop all media playback and network loading
        document.querySelectorAll('video').forEach(v => {
            v.pause();
            v.muted = true;
            v.src = '';
        });

        const overlay = document.createElement('div');
        overlay.id = 'focustube-video-block';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: #111113;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: #ffffff;
            font-family: 'Inter', Roboto, Arial, sans-serif;
            text-align: center;
            padding: 24px;
        `;
        overlay.innerHTML = `
            <div style="font-size: 64px; margin-bottom: 24px;">🛡️</div>
            <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 12px;">Content Blocked</h1>
            <p style="font-size: 16px; color: #9ca3af; margin: 0 0 32px; max-width: 420px; line-height: 1.6;">${message}</p>
            <button id="ft-back-btn" style="
                background: #7c3aed; color: white; border: none;
                padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;
                cursor: pointer; transition: background 0.2s;
            ">← Go to Homepage</button>
        `;

        document.body.appendChild(overlay);

        // FIX #13: Null guard before accessing btn properties
        const btn = document.getElementById('ft-back-btn');
        if (btn) {
            btn.onmouseover = () => { btn.style.background = '#8b5cf6'; };
            btn.onmouseout  = () => { btn.style.background = '#7c3aed'; };
            btn.onclick     = () => { window.location.href = 'https://www.youtube.com/'; };
        }
    }

    removeFullPageBlock() {
        const overlay = document.getElementById('focustube-video-block');
        if (overlay) overlay.remove();
    }

    /**
     * Quick Channel Block — injects a 🚫 button on each video card.
     * Hovering the card reveals the button (via CSS).
     * Clicking it immediately adds the channel to the blockedChannels list.
     *
     * @param {HTMLElement} el          — the video card element
     * @param {string}      channelName — channel name already extracted by processDOM
     */

    // ─────────────────────────────────────────────────────────────────────────
    // VIDEO FOCUS LOCK
    // Users can lock themselves to a single video for N minutes.
    // The widget lives in the bottom-right corner on /watch pages.
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────
    // VIDEO FOCUS LOCK  (FAB + draggable panel + SVG ring countdown)
    // ─────────────────────────────────────────────────────────────────────────

    injectVideoLockUI() {
        if (document.getElementById('ft-lock-fab')) {
            // FAB already exists (SPA nav) — just resume timer if still active
            this._resumeLockFromStorage();
            return;
        }

        /* ── Helpers ── */
        const CIRC = 283;
        this._lockInterval = null;
        this._lockSelectedMins = 25;
        const fmt = (ms) => {
            const s = Math.max(0, Math.floor(ms / 1000));
            return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        };
        this._fmt  = fmt;
        this._CIRC = CIRC;

        /* ── FAB ── */
        const fab = document.createElement('button');
        fab.id = 'ft-lock-fab';
        fab.title = 'Focus Lock · double-click to go mini';
        fab.textContent = '🔒';
        document.body.appendChild(fab);
        this._fab = fab;

        /* ── Double-click FAB to toggle mini (32px) / normal (44px) ── */
        let isMini = false;
        fab.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            isMini = !isMini;
            fab.style.width    = isMini ? '32px' : '';
            fab.style.height   = isMini ? '32px' : '';
            fab.style.fontSize = isMini ? '14px' : '';
        });

        /* ── Panel ── */
        const panel = document.createElement('div');
        panel.id = 'ft-lock-panel';
        panel.innerHTML = `
            <div class="ft-lk-header">
                <span class="ft-lk-title" id="ft-lk-title-text">🔒 Focus Lock</span>
                <button class="ft-lk-close" title="Collapse">✕</button>
            </div>
            <div class="ft-lk-body">
                <div class="ft-ring-wrap">
                    <svg width="110" height="110" viewBox="0 0 110 110">
                        <circle class="ft-ring-bg"   cx="55" cy="55" r="45"/>
                        <circle class="ft-ring-prog" cx="55" cy="55" r="45"/>
                    </svg>
                    <div class="ft-ring-time">
                        <span id="ft-ring-label">25:00</span>
                        <small id="ft-ring-sub">pick time</small>
                    </div>
                </div>
                <div class="ft-lk-presets" id="ft-lk-presets-row">
                    <button class="ft-lk-preset" data-m="10">10m</button>
                    <button class="ft-lk-preset active" data-m="25">25m</button>
                    <button class="ft-lk-preset" data-m="50">50m</button>
                </div>
                <div class="ft-lk-custom" id="ft-lk-custom-row">
                    <label for="ft-custom-mins">Custom:</label>
                    <input id="ft-custom-mins" type="number" min="1" max="240" placeholder="min" />
                </div>
                <button class="ft-lk-start-btn" id="ft-lk-start">🎯 Lock to This Video</button>
                <button class="ft-lk-end-btn"   id="ft-lk-end" style="display:none">✕ End Lock Early</button>
            </div>
        `;
        document.body.appendChild(panel);
        this._panel      = panel;
        this._ring       = panel.querySelector('.ft-ring-prog');
        this._label      = panel.querySelector('#ft-ring-label');
        this._sub        = panel.querySelector('#ft-ring-sub');
        this._titleTxt   = panel.querySelector('#ft-lk-title-text');
        this._presets    = panel.querySelectorAll('.ft-lk-preset');
        this._customIn   = panel.querySelector('#ft-custom-mins');
        this._startBtn   = panel.querySelector('#ft-lk-start');
        this._endBtn     = panel.querySelector('#ft-lk-end');
        this._presetsRow = panel.querySelector('#ft-lk-presets-row');
        this._customRow  = panel.querySelector('#ft-lk-custom-row');

        /* ── Toggle panel (single-click; dblclick handled above) ── */
        fab.addEventListener('click', (e) => {
            if (e.detail > 1) return;
            panel.classList.contains('visible')
                ? panel.classList.remove('visible')
                : panel.classList.add('visible');
        });
        panel.querySelector('.ft-lk-close').addEventListener('click', () => panel.classList.remove('visible'));

        /* ── Preset picker ── */
        this._presets.forEach(b => b.addEventListener('click', () => {
            const m = +b.dataset.m;
            this._lockSelectedMins = m;
            this._customIn.value = '';
            this._presets.forEach(x => x.classList.toggle('active', +x.dataset.m === m));
            if (!this._lockInterval) {
                this._label.textContent = `${String(m).padStart(2,'0')}:00`;
                this._sub.textContent = 'pick time';
                this._ring.style.strokeDashoffset = '0';
            }
        }));

        /* ── Custom input ── */
        this._customIn.addEventListener('input', () => {
            const v = parseInt(this._customIn.value, 10);
            if (v > 0) {
                this._lockSelectedMins = v;
                this._presets.forEach(b => b.classList.remove('active'));
                if (!this._lockInterval) {
                    this._label.textContent = `${String(v).padStart(2,'0')}:00`;
                    this._ring.style.strokeDashoffset = '0';
                }
            }
        });

        /* ── Start lock ── */
        this._startBtn.addEventListener('click', () => {
            if (window.location.pathname !== '/watch') {
                this._label.textContent = '⚠️';
                this._sub.textContent = 'Watch page only';
                return;
            }
            const totalMs = this._lockSelectedMins * 60 * 1000;
            const endTime = Date.now() + totalMs;
            chrome.storage.local.set({
                videoLock: { active: true, url: window.location.href, endTime, totalMs }
            });
            this._startActiveLockUI(endTime, totalMs);
        });

        /* ── End lock ── */
        this._endBtn.addEventListener('click', () => this._stopLock());

        /* ── Draggable ── */
        this._makeDraggable(fab);
        this._makeDraggable(panel, panel.querySelector('.ft-lk-header'));

        /* ── Resume if lock was already active (page reload) ── */
        this._resumeLockFromStorage();
    }

    _startActiveLockUI(endTime, totalMs) {
        if (!this._startBtn) return;
        this._startBtn.style.display  = 'none';
        this._endBtn.style.display    = 'block';
        this._presets.forEach(b => b.disabled = true);
        this._customIn.disabled       = true;
        this._presetsRow.style.display = 'none';
        this._customRow.style.display  = 'none';
        this._fab.classList.add('active-lock');
        this._fab.textContent        = '⏱';           // 🔒 → ⏱ while running
        this._titleTxt.textContent   = '⏱ Focus Lock';
        this._sub.textContent        = 'remaining';

        const tick = () => {
            const rem = endTime - Date.now();
            if (rem <= 0) { this._stopLock(); return; }
            this._label.textContent = this._fmt(rem);
            const pct = rem / totalMs;
            this._ring.style.strokeDashoffset = `${this._CIRC * (1 - pct)}`;
            this._ring.classList.toggle('ending', pct < 0.15);
        };
        if (this._lockInterval) clearInterval(this._lockInterval);
        tick();
        this._lockInterval = setInterval(tick, 1000);
    }

    _stopLock() {
        if (this._lockInterval) { clearInterval(this._lockInterval); this._lockInterval = null; }
        chrome.storage.local.set({ videoLock: { active: false } });
        this._resetLockPanel();
    }

    _resumeLockFromStorage() {
        chrome.storage.local.get({ videoLock: { active: false } }, (data) => {
            const lock = data.videoLock;
            if (!lock || !lock.active || !this._startBtn) return;
            if (Date.now() >= lock.endTime) {
                chrome.storage.local.set({ videoLock: { active: false } });
                return;
            }
            const totalMs = lock.totalMs || (lock.endTime - Date.now() + 1000);
            this._startActiveLockUI(lock.endTime, totalMs);
        });
    }

    _resetLockPanel() {
        if (!this._fab) return;
        this._fab.classList.remove('active-lock');
        this._fab.textContent        = '🔒';          // ⏱ → 🔒 restored
        if (this._titleTxt) this._titleTxt.textContent = '🔒 Focus Lock';
        this._startBtn.style.display  = 'flex';
        this._endBtn.style.display    = 'none';
        this._presets.forEach(b => b.disabled = false);
        this._customIn.disabled        = false;
        this._presetsRow.style.display = '';
        this._customRow.style.display  = '';
        this._ring.style.strokeDashoffset = '0';
        this._ring.classList.remove('ending');
        this._label.textContent = '25:00';
        this._sub.textContent   = 'pick time';
        this._panel.classList.remove('visible');
    }

    _makeDraggable(el, handle) {
        const h = handle || el;
        let startX, startY, startL, startT, isDragging = false;

        const getPos = () => {
            const style = window.getComputedStyle(el);
            return {
                left:   parseInt(style.left)   || (window.innerWidth  - el.offsetWidth  - 20),
                top:    parseInt(style.top)    || (window.innerHeight - el.offsetHeight - 80),
                right:  parseInt(style.right),
                bottom: parseInt(style.bottom)
            };
        };

        h.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const pos = getPos();
            // Convert right/bottom to left/top for drag math
            const left = isNaN(pos.left) ? window.innerWidth  - el.offsetWidth  - pos.right  : pos.left;
            const top  = isNaN(pos.top)  ? window.innerHeight - el.offsetHeight - pos.bottom : pos.top;
            el.style.right  = 'auto';
            el.style.bottom = 'auto';
            el.style.left   = left  + 'px';
            el.style.top    = top   + 'px';
            startX = e.clientX; startY = e.clientY;
            startL = left;      startT = top;
            isDragging = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const nx = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  startL + e.clientX - startX));
            const ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startT + e.clientY - startY));
            el.style.left = nx + 'px';
            el.style.top  = ny + 'px';
        });

        document.addEventListener('mouseup', () => { isDragging = false; });
    }

    checkVideoLock() {
        chrome.storage.local.get({ videoLock: { active: false } }, (data) => {
            const lock = data.videoLock;
            if (!lock || !lock.active) return;
            if (Date.now() > lock.endTime) {
                chrome.storage.local.set({ videoLock: { active: false } });
                return;
            }
            if (window.location.href !== lock.url) {
                this.showVideoLockNudge(lock.url);
            }
        });
    }

    showVideoLockNudge(lockedUrl) {
        if (document.getElementById('ft-lock-nudge')) return;
        const nudge = document.createElement('div');
        nudge.id = 'ft-lock-nudge';
        nudge.style.cssText = `
            position:fixed;inset:0;
            background:rgba(10,10,12,0.92);
            z-index:2147483647;
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            text-align:center;padding:24px;
            backdrop-filter:blur(8px);
        `;
        nudge.innerHTML = `
            <div style="font-size:56px;margin-bottom:20px">🔒</div>
            <h2 style="color:#f4f4f5;font-size:24px;font-weight:700;margin:0 0 10px">Video Lock Active</h2>
            <p style="color:#a1a1aa;font-size:15px;max-width:380px;line-height:1.6;margin:0 0 32px">
                You locked yourself to a video. Stay focused!
            </p>
            <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
                <button id="ft-nudge-back" style="background:#7c3aed;color:#fff;border:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer">← Go Back</button>
                <button id="ft-nudge-break" style="background:transparent;color:#6b7280;border:1px solid rgba(255,255,255,0.1);padding:13px 28px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer">Break Lock</button>
            </div>
        `;
        document.body.appendChild(nudge);
        document.getElementById('ft-nudge-back').onclick  = () => { window.location.href = lockedUrl; };
        document.getElementById('ft-nudge-break').onclick = () => {
            chrome.storage.local.set({ videoLock: { active: false } });
            nudge.remove();
        };
    }

    processDOM() {
        try {
            this.applyStaticStyles();

            const selector = this.selectors.videoContainers.join(', ');
            const videoElements = document.querySelectorAll(selector);

            videoElements.forEach(el => {
                const title = this.extractElementText(el, this.selectors.titleElements);
                const channelName = this.extractElementText(el, this.selectors.channelElements);
                const href = this.extractLinkHref(el, this.selectors.thumbnailLinks);
                const isShortLink = !!(href && href.includes('/shorts/'));

                // Skip elements still loading (no data at all yet)
                if (!title && !channelName && !isShortLink) return;

                // Build a state key — if unchanged, skip re-processing
                const stateKey = `${title}||${channelName}||${this.settings.isFocusSessionActive}||${this.settings.filterEntertainment}`;
                if (el.dataset.ftProcessedKey === stateKey) return;

                // Skip elements inside a completely hidden homepage grid
                if (
                    window.location.pathname === '/' &&
                    (this.settings.hideHomepage || this.settings.isFocusSessionActive) &&
                    el.closest('ytd-rich-grid-renderer')
                ) {
                    el.dataset.ftProcessedKey = stateKey;
                    return;
                }

                if (this.shouldBlockVideo(title, channelName, isShortLink)) {
                    if (el.dataset.ftHidden !== 'true') this._pendingBlocks++;
                    el.style.display = 'none';
                    el.dataset.ftHidden = 'true';
                } else {
                    el.style.display = '';
                    el.dataset.ftHidden = 'false';
                }

                el.dataset.ftProcessedKey = stateKey;
            });
        } catch (e) {
            this.logger.error('processDOM error:', e);
        }
    }

    startObserver() {
        if (this.observer) this.observer.disconnect();

        // FIX #7: Guard for document.body not existing
        const target = document.body || document.documentElement;

        this.observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }
            }
            if (shouldProcess) {
                if (this.processTimeout) cancelAnimationFrame(this.processTimeout);
                this.processTimeout = requestAnimationFrame(() => this.processDOM());
            }
        });

        this.observer.observe(target, { childList: true, subtree: true });
        this.logger.log('MutationObserver started.');
    }
}

// Initialize
const ft = new FocusTube();
ft.init();
