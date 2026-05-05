/**
 * FocusTube v1.2.0 — Popup Script
 * Premium UI with animated score ring, duration picker, live blocks counter,
 * removable blocked-channel chips, and first-run welcome hint.
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── DOM References ────────────────────────────────────────────────────
  const elements = {
    blockShorts:          document.getElementById('blockShorts'),
    hideHomepage:         document.getElementById('hideHomepage'),
    filterEntertainment:  document.getElementById('filterEntertainment'),
    hideComments:         document.getElementById('hideComments'),
    hideSidebar:          document.getElementById('hideSidebar'),
    antiClickbait:        document.getElementById('antiClickbait'),
    blockEndCards:        document.getElementById('blockEndCards'),
    debugMode:            document.getElementById('debugMode'),
    blockedChannels:      document.getElementById('blockedChannels'),
    allowedChannels:      document.getElementById('allowedChannels'),
    blockedKeywords:      document.getElementById('blockedKeywords'),
    allowedKeywords:      document.getElementById('allowedKeywords')
  };

  const statusMsg          = document.getElementById('statusMsg');
  const focusScoreEl       = document.getElementById('focusScore');
  const scoreRingEl        = document.getElementById('scoreRing');
  const streakBadgeEl      = document.getElementById('streakBadge');
  const scoreMsgEl         = document.getElementById('scoreMsg');
  const blocksCountEl      = document.getElementById('blocksCount');
  const focusPanel         = document.getElementById('focusPanel');
  const focusTimerDisplay  = document.getElementById('focusTimerDisplay');
  const focusMessage       = document.getElementById('focusMessage');
  const sessionActiveBadge = document.getElementById('sessionActiveBadge');
  const startFocusBtn      = document.getElementById('startFocusBtn');
  const settingsContainer  = document.getElementById('settingsContainer');
  const durationPicker     = document.getElementById('durationPicker');

  // ── State ────────────────────────────────────────────────────────────
  let timerInterval  = null;
  let selectedMins   = 25;

  // ── Settings Load ────────────────────────────────────────────────────
  const defaultSettings = {
    blockShorts:         true,
    hideHomepage:        true,
    filterEntertainment: true,
    hideComments:        false,
    hideSidebar:         false,
    antiClickbait:       false,
    blockEndCards:       true,
    debugMode:           false,
    blockedChannels:     '',
    allowedChannels:     '',
    blockedKeywords:     'prank\nvlog\nroast\nchallenge\ncomedy\ngossip\ndrama',
    allowedKeywords:     '',
    autoSpeed:           '1'
  };

  chrome.storage.sync.get(defaultSettings, (items) => {
    elements.blockShorts.checked         = items.blockShorts;
    elements.hideHomepage.checked        = items.hideHomepage;
    elements.filterEntertainment.checked = items.filterEntertainment;
    elements.hideComments.checked        = items.hideComments;
    elements.hideSidebar.checked         = items.hideSidebar;
    elements.antiClickbait.checked       = items.antiClickbait;
    elements.blockEndCards.checked       = items.blockEndCards;
    elements.debugMode.checked           = items.debugMode;
    elements.blockedChannels.value       = items.blockedChannels;
    elements.allowedChannels.value       = items.allowedChannels;
    elements.blockedKeywords.value       = items.blockedKeywords;
    elements.allowedKeywords.value       = items.allowedKeywords;

    // Restore speed picker active state
    const savedSpeed = items.autoSpeed || '1';
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === savedSpeed);
    });
  });

  // ── Score Ring Animation ─────────────────────────────────────────────
  // SVG circle r=32, circumference = 2π×32 ≈ 201.06
  const CIRC = 201.06;

  function animateRing(targetScore) {
    if (!scoreRingEl) return;
    const offset = CIRC * (1 - targetScore / 100);
    scoreRingEl.style.strokeDashoffset = offset;

    // Colour class
    scoreRingEl.className = 'ring-fill';
    if (targetScore >= 75) scoreRingEl.classList.add('high');
    else if (targetScore >= 50) scoreRingEl.classList.add('med');
    else scoreRingEl.classList.add('low');
  }

  // ── Score Number Count-Up ────────────────────────────────────────────
  function animateNumber(el, from, to, duration = 600) {
    if (!el) return;
    const start = performance.now();
    const range = to - from;

    function step(now) {
      const elapsed = Math.min(now - start, duration);
      const progress = elapsed / duration;
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + range * eased);
      if (elapsed < duration) requestAnimationFrame(step);
      else el.textContent = to;
    }
    requestAnimationFrame(step);
  }

  // ── Score Rendering ───────────────────────────────────────────────────
  let lastRenderedScore = 50;

  function renderScore(score, streakDays, blocksToday) {
    const s = Math.round(score ?? 50);

    // Animate ring
    animateRing(s);

    // Animate number
    animateNumber(focusScoreEl, lastRenderedScore, s);
    lastRenderedScore = s;

    // Colour class on score number
    if (focusScoreEl) {
      focusScoreEl.className = 'score-number';
      if (s >= 75) focusScoreEl.classList.add('high');
      else if (s >= 50) focusScoreEl.classList.add('med');
      else focusScoreEl.classList.add('low');
    }

    // Motivational message
    if (scoreMsgEl) {
      if (s >= 80)       scoreMsgEl.textContent = 'Excellent focus! 🎯';
      else if (s >= 65)  scoreMsgEl.textContent = 'Great discipline!';
      else if (s >= 50)  scoreMsgEl.textContent = 'Doing well. Keep going.';
      else if (s >= 30)  scoreMsgEl.textContent = 'Stay focused today.';
      else               scoreMsgEl.textContent = "Let's refocus. 🔄";
    }

    // Streak badge
    const days = streakDays ?? 0;
    if (streakBadgeEl) {
      streakBadgeEl.textContent = `🔥 ${days} day${days !== 1 ? 's' : ''}`;
    }

    // Blocks counter
    const blocks = blocksToday ?? 0;
    if (blocksCountEl) blocksCountEl.textContent = blocks;
  }

  // ── Timer Formatting ─────────────────────────────────────────────────
  function formatTimer(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── Timer UI ──────────────────────────────────────────────────────────
  function updateTimerUI(focusSession) {
    if (!focusSession) return;
    if (focusSession.active) {
      const remaining = focusSession.endTime - Date.now();
      if (remaining > 0) {
        focusPanel.classList.add('active');
        startFocusBtn.style.display = 'none';
        durationPicker.style.display = 'none';
        focusTimerDisplay.style.display = 'block';
        focusTimerDisplay.textContent = formatTimer(remaining);
        focusMessage.textContent = 'Strict Mode Active — stay focused 🔒';
        if (sessionActiveBadge) sessionActiveBadge.style.display = 'inline-flex';
        settingsContainer.classList.add('disabled');
        return;
      }
    }
    resetTimerUI();
  }

  function resetTimerUI() {
    clearInterval(timerInterval);
    timerInterval = null;
    focusPanel.classList.remove('active');
    startFocusBtn.style.display = 'flex';
    startFocusBtn.disabled = false;
    startFocusBtn.innerHTML = `<span class="btn-icon">🎯</span> Start Deep Focus (${selectedMins}m)`;
    durationPicker.style.display = 'flex';
    focusTimerDisplay.style.display = 'none';
    focusMessage.textContent = 'Lock settings & block all non-whitelisted videos';
    if (sessionActiveBadge) sessionActiveBadge.style.display = 'none';
    settingsContainer.classList.remove('disabled');
  }

  // ── State Fetch ───────────────────────────────────────────────────────
  function fetchState() {
    clearInterval(timerInterval);
    timerInterval = null;

    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      renderScore(response.score, response.streak, response.blocksToday);

      if (response.focusSession) {
        updateTimerUI(response.focusSession);

        if (response.focusSession.active) {
          timerInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: 'checkFocusSession' }, (res) => {
              if (chrome.runtime.lastError || !res) return;
              renderScore(res.score, res.streak, res.blocksToday);
              updateTimerUI(res.focusSession);
              if (!res.focusSession.active) {
                clearInterval(timerInterval);
                timerInterval = null;
              }
            });
          }, 1000);
        }
      }
    });
  }

  fetchState();

  // ── Duration Picker ───────────────────────────────────────────────────
  durationPicker.querySelectorAll('.dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      durationPicker.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMins = parseInt(btn.dataset.mins, 10);
      startFocusBtn.innerHTML = `<span class="btn-icon">🎯</span> Start Deep Focus (${selectedMins}m)`;
    });
  });

  // ── Focus Session Button ──────────────────────────────────────────────
  startFocusBtn.addEventListener('click', () => {
    startFocusBtn.disabled = true;
    startFocusBtn.innerHTML = `<span class="btn-icon">⏳</span> Starting…`;

    chrome.runtime.sendMessage({ action: 'startFocusSession', minutes: selectedMins }, (response) => {
      if (chrome.runtime.lastError) {
        startFocusBtn.disabled = false;
        startFocusBtn.innerHTML = `<span class="btn-icon">🎯</span> Start Deep Focus (${selectedMins}m)`;
        return;
      }
      if (response && response.focusSession) fetchState();
    });
  });

  // ── Save Settings ─────────────────────────────────────────────────────
  function saveSettings() {
    if (settingsContainer.classList.contains('disabled')) return;

    const activeSpeedBtn = document.querySelector('.speed-btn.active');

    chrome.storage.sync.set({
      blockShorts:         elements.blockShorts.checked,
      hideHomepage:        elements.hideHomepage.checked,
      filterEntertainment: elements.filterEntertainment.checked,
      hideComments:        elements.hideComments.checked,
      hideSidebar:         elements.hideSidebar.checked,
      antiClickbait:       elements.antiClickbait.checked,
      blockEndCards:       elements.blockEndCards.checked,
      debugMode:           elements.debugMode.checked,
      blockedChannels:     elements.blockedChannels.value,
      allowedChannels:     elements.allowedChannels.value,
      blockedKeywords:     elements.blockedKeywords.value,
      allowedKeywords:     elements.allowedKeywords.value,
      autoSpeed:           activeSpeedBtn ? activeSpeedBtn.dataset.speed : '1'
    }, () => {
      if (chrome.runtime.lastError) return;
      statusMsg.classList.add('show');

      setTimeout(() => statusMsg.classList.remove('show'), 2000);
    });
  }

  // ── Event Listeners ───────────────────────────────────────────────────
  Object.keys(elements).forEach(key => {
    const el = elements[key];
    if (!el) return;
    const tag  = el.tagName.toLowerCase();
    const type = el.type;

    if (tag === 'textarea' || (tag === 'input' && type === 'text') || (tag === 'input' && type === 'number')) {
      let debounce = null;
      el.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(saveSettings, 500);
      });
    } else {
      el.addEventListener('change', saveSettings);
    }
  });

  // ── Speed Picker ──────────────────────────────────────────────────────
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveSettings();
    });
  });

  // ── Blocked Channel Chips ─────────────────────────────────────────────
  // Renders a removable chip for each blocked channel below the textarea.
  // Syncs with storage on every remove click.

  const blockedChipsEl = document.getElementById('blockedChips');

  function renderBlockedChips(raw) {
    if (!blockedChipsEl) return;
    const channels = raw
      ? raw.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    blockedChipsEl.innerHTML = '';

    if (channels.length === 0) {
      blockedChipsEl.style.display = 'none';
      return;
    }

    blockedChipsEl.style.display = 'flex';

    channels.forEach(ch => {
      const chip = document.createElement('span');
      chip.className = 'ft-chip';
      chip.innerHTML = `${ch} <button class="ft-chip-remove" title="Unblock ${ch}">✕</button>`;

      chip.querySelector('.ft-chip-remove').addEventListener('click', () => {
        const updated = channels.filter(c => c !== ch).join('\n');
        elements.blockedChannels.value = updated;
        chrome.storage.sync.set({ blockedChannels: updated }, () => {
          renderBlockedChips(updated);
          statusMsg.classList.add('show');
          setTimeout(() => statusMsg.classList.remove('show'), 2000);
        });
      });

      blockedChipsEl.appendChild(chip);
    });
  }

  // Initial render from loaded settings
  chrome.storage.sync.get({ blockedChannels: '' }, data => {
    renderBlockedChips(data.blockedChannels);
  });

  // Re-render whenever the textarea changes
  elements.blockedChannels.addEventListener('input', () => {
    renderBlockedChips(elements.blockedChannels.value);
  });

  // Re-render when storage changes externally (e.g. quick-block from content.js)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockedChannels) {
      const newVal = changes.blockedChannels.newValue || '';
      elements.blockedChannels.value = newVal;
      renderBlockedChips(newVal);
    }
  });

  // ── First-Run Welcome Banner ──────────────────────────────────────────
  // Shows once after install, then never again.

  const welcomeBanner = document.getElementById('welcomeBanner');
  const welcomeDismiss = document.getElementById('welcomeDismiss');

  chrome.storage.local.get({ firstRun: false }, data => {
    if (data.firstRun && welcomeBanner) {
      welcomeBanner.style.display = 'flex';
    }
  });

  if (welcomeDismiss) {
    welcomeDismiss.addEventListener('click', () => {
      if (welcomeBanner) welcomeBanner.style.display = 'none';
      chrome.storage.local.set({ firstRun: false });
    });
  }
});

