/**
 * FocusTube v1.0.2 - Background Service Worker
 * Manages Focus Session timer + lightweight daily score/streak tracking.
 *
 * Score formula (simple & reliable):
 *   base 50 + (blocksToday * 2, max +30) + (focusSessionUsed ? +20 : 0)
 *   Capped [0, 100].
 *
 * Streak: increments each day where score > 50, resets otherwise.
 */

// ── State ────────────────────────────────────────────────────────────────────

let focusSession = {
  active: false,
  endTime: 0
};

let dailyStats = {
  date: '',          // e.g. "Mon May 05 2025"
  blocksCount: 0,    // number of individual videos hidden today
  focusSessionUsed: false
};

let streak = 0;

// ── Persistence helpers ───────────────────────────────────────────────────────

function saveSession() {
  chrome.storage.local.set({ focusSession });
}

function saveStats() {
  chrome.storage.local.set({ dailyStats, streak });
}

// ── Score computation ─────────────────────────────────────────────────────────

function computeScore() {
  const blockBonus = Math.min(dailyStats.blocksCount * 2, 30); // max +30
  const sessionBonus = dailyStats.focusSessionUsed ? 20 : 0;
  return Math.max(0, Math.min(100, 50 + blockBonus + sessionBonus));
}

// ── Daily reset ───────────────────────────────────────────────────────────────

function checkDailyReset() {
  const today = new Date().toDateString();
  if (dailyStats.date && dailyStats.date !== today) {
    // New day — evaluate yesterday and update streak
    const yesterdayScore = computeScore();
    if (yesterdayScore > 50) {
      streak += 1;
    } else {
      streak = 0;
    }
    // Reset daily counters
    dailyStats = { date: today, blocksCount: 0, focusSessionUsed: false };
    saveStats();
  } else if (!dailyStats.date) {
    // First ever run
    dailyStats.date = today;
    saveStats();
  }
}

// ── Initialise from storage ───────────────────────────────────────────────────

chrome.storage.local.get(['focusSession', 'dailyStats', 'streak'], (result) => {
  if (result.focusSession) {
    focusSession = Object.assign(focusSession, result.focusSession);
    if (focusSession.active && Date.now() > focusSession.endTime) {
      focusSession.active = false;
      saveSession();
      chrome.storage.sync.set({ isFocusSessionActive: false });
    }
  }
  if (result.dailyStats) {
    dailyStats = Object.assign(dailyStats, result.dailyStats);
  }
  if (typeof result.streak === 'number') {
    streak = result.streak;
  }
  checkDailyReset();
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Popup fetching state (score, streak, session)
  if (request.action === 'getStats') {
    checkDailyReset();
    sendResponse({
      focusSession,
      score: computeScore(),
      streak,
      blocksToday: dailyStats.blocksCount
    });
    return true;
  }

  // Content script reporting hidden videos (batched)
  if (request.action === 'incrementBlocks') {
    checkDailyReset();
    dailyStats.blocksCount += (request.count || 1);
    saveStats();
    sendResponse({ ok: true });
    return true;
  }

  // Start 25-minute focus session
  if (request.action === 'startFocusSession') {
    if (!focusSession.active) {
      const minutes = request.minutes || 25;
      focusSession.active = true;
      focusSession.endTime = Date.now() + minutes * 60 * 1000;
      dailyStats.focusSessionUsed = true; // Score bonus!
      saveSession();
      saveStats();
      chrome.storage.sync.set({ isFocusSessionActive: true });
    }
    sendResponse({ focusSession, score: computeScore(), streak });
    return true;
  }

  // Popup polling for remaining time
  if (request.action === 'checkFocusSession') {
    if (focusSession.active && Date.now() > focusSession.endTime) {
      focusSession.active = false;
      saveSession();
      chrome.storage.sync.set({ isFocusSessionActive: false });
    }
    sendResponse({ focusSession, score: computeScore(), streak });
    return true;
  }

  return true; // keep channel open for async responses
});

// ── Background session expiry watcher ────────────────────────────────────────

setInterval(() => {
  if (focusSession.active && Date.now() > focusSession.endTime) {
    focusSession.active = false;
    saveSession();
    chrome.storage.sync.set({ isFocusSessionActive: false });
  }
}, 10000);
