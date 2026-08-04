/* Background music UI + unlock toast (browser chặn autoplay có tiếng) */

(function initBgMusic() {
  const SRC = "/assets/audio/diamond-united-rap.mp3";
  const VOLUME = 0.55;
  const RING_R = 24;
  const RING_C = 2 * Math.PI * RING_R;

  const audio =
    window.__dufcBgAudio instanceof HTMLAudioElement
      ? window.__dufcBgAudio
      : new Audio(SRC);
  window.__dufcBgAudio = audio;
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = VOLUME;
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  if (!audio.src) audio.src = SRC;

  let playing = !audio.paused && !audio.ended;
  let pausedThisVisit = !!window.__dufcBgAudioPaused;
  let waitingForBuffer = false;
  let rafId = 0;
  let progressEl = null;
  let tipEl = null;

  function needsUnlock() {
    return (
      document.documentElement.getAttribute("data-bgm-locked") === "1" ||
      !!window.__dufcBgNeedsUnmute ||
      (!!audio.muted && !audio.paused)
    );
  }

  function ensureTip() {
    if (tipEl || !document.body) return tipEl;
    tipEl = document.createElement("button");
    tipEl.type = "button";
    tipEl.id = "bgMusicUnlockTip";
    tipEl.className = "bgMusicUnlockTip";
    tipEl.hidden = true;
    tipEl.innerHTML =
      '<span class="bgMusicUnlockTipIcon" aria-hidden="true">🎵</span>' +
      "<span>Nghe nhạc Diamond United FC</span>";
    tipEl.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    tipEl.addEventListener("touchstart", (e) => {
      e.stopPropagation();
    }, { passive: true });
    tipEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      unlockNow();
    });
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function syncTip() {
    ensureTip();
    if (!tipEl) return;
    const show = needsUnlock() && !pausedThisVisit;
    tipEl.hidden = !show;
  }

  function syncUi() {
    const btn = document.getElementById("bgMusicToggle");
    const active = playing || (!audio.paused && !audio.ended);
    if (btn) {
      btn.classList.toggle("is-playing", active && !needsUnlock());
      btn.classList.toggle("is-buffering", waitingForBuffer && !active);
      btn.classList.toggle("is-muted-warm", needsUnlock());
      btn.setAttribute("aria-pressed", active && !needsUnlock() ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        needsUnlock()
          ? "Nghe nhạc Diamond United FC"
          : active
            ? "Tạm dừng nhạc nền"
            : "Nghe nhạc Diamond United FC"
      );
      btn.title = needsUnlock() ? "Nghe nhạc Diamond United FC" : active ? "Tạm dừng" : "Nghe nhạc Diamond United FC";
    }
    syncTip();
  }

  function setProgress(ratio) {
    if (!progressEl) return;
    const t = Math.min(1, Math.max(0, ratio || 0));
    progressEl.style.strokeDashoffset = String(RING_C * (1 - t));
  }

  function updateProgress() {
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) {
      setProgress(0);
      return;
    }
    setProgress(audio.currentTime / dur);
  }

  function tick() {
    updateProgress();
    if (playing || !audio.paused) rafId = requestAnimationFrame(tick);
  }

  function startProgressLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function stopProgressLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    updateProgress();
  }

  async function unlockNow() {
    pausedThisVisit = false;
    window.__dufcBgAudioPaused = false;
    if (typeof window.__dufcBgUnlock === "function") {
      const ok = await window.__dufcBgUnlock();
      if (ok) {
        playing = true;
        syncUi();
        startProgressLoop();
        return true;
      }
    }
    try {
      audio.muted = false;
      audio.volume = VOLUME;
      if (audio.currentTime > 0.35) audio.currentTime = 0;
      await audio.play();
      window.__dufcBgNeedsUnmute = false;
      document.documentElement.removeAttribute("data-bgm-locked");
      playing = true;
      syncUi();
      startProgressLoop();
      return true;
    } catch (_) {
      syncUi();
      return false;
    }
  }

  async function play(fromUser) {
    if (fromUser) return unlockNow();

    if (!audio.paused) {
      playing = true;
      syncUi();
      startProgressLoop();
      return { ok: true };
    }

    waitingForBuffer = audio.readyState < 2;
    syncUi();
    try {
      if (needsUnlock()) audio.muted = true;
      else audio.muted = false;
      await audio.play();
      playing = true;
      waitingForBuffer = false;
      syncUi();
      startProgressLoop();
      return { ok: true };
    } catch (err) {
      if (err && err.name === "NotAllowedError") {
        try {
          audio.muted = true;
          await audio.play();
          playing = true;
          window.__dufcBgNeedsUnmute = true;
          document.documentElement.setAttribute("data-bgm-locked", "1");
          syncUi();
          startProgressLoop();
          return { ok: true };
        } catch (_) {
          window.__dufcBgNeedsUnmute = true;
          document.documentElement.setAttribute("data-bgm-locked", "1");
          syncUi();
          return { ok: false, reason: "policy" };
        }
      }
      waitingForBuffer = true;
      syncUi();
      return { ok: false, reason: "buffer" };
    }
  }

  function pause() {
    pausedThisVisit = true;
    window.__dufcBgAudioPaused = true;
    window.__dufcBgNeedsUnmute = false;
    document.documentElement.removeAttribute("data-bgm-locked");
    waitingForBuffer = false;
    audio.pause();
    playing = false;
    syncUi();
    stopProgressLoop();
  }

  function toggle() {
    const btn = document.getElementById("bgMusicToggle");
    const showingPause = !!(btn && btn.classList.contains("is-playing"));

    // Đang hiện ▶ (hoặc còn lock/muted) → lần nhấn đầu luôn PLAY, không pause
    if (!showingPause || needsUnlock() || audio.muted) {
      unlockNow();
      return;
    }
    pause();
  }

  function tryAutoplay() {
    if (pausedThisVisit) return;
    if (!audio.paused) {
      playing = true;
      syncUi();
      startProgressLoop();
      return;
    }
    play(false);
  }

  function mount() {
    if (document.getElementById("bgMusicToggle")) return;
    if (!document.body) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "bgMusicToggle";
    btn.className = "bgMusicToggle";
    btn.innerHTML =
      '<svg class="bgMusicRing" viewBox="0 0 56 56" aria-hidden="true">' +
      '<circle class="bgMusicRingTrack" cx="28" cy="28" r="' +
      RING_R +
      '"></circle>' +
      '<circle class="bgMusicRingProgress" cx="28" cy="28" r="' +
      RING_R +
      '" ' +
      'stroke-dasharray="' +
      RING_C.toFixed(2) +
      '" stroke-dashoffset="' +
      RING_C.toFixed(2) +
      '"></circle>' +
      "</svg>" +
      '<span class="bgMusicCore">' +
      '<span class="bgMusicIcon bgMusicIcon--pause" aria-hidden="true">⏸</span>' +
      '<span class="bgMusicIcon bgMusicIcon--play" aria-hidden="true">▶</span>' +
      "</span>";
    progressEl = btn.querySelector(".bgMusicRingProgress");
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    btn.addEventListener("touchstart", (e) => {
      e.stopPropagation();
    }, { passive: true });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(btn);
    ensureTip();

    playing = !audio.paused && !audio.ended;
    syncUi();
    updateProgress();
    if (playing) startProgressLoop();

    audio.addEventListener("play", () => {
      playing = true;
      waitingForBuffer = false;
      syncUi();
      startProgressLoop();
    });
    audio.addEventListener("pause", () => {
      if (!audio.ended) {
        playing = false;
        syncUi();
        stopProgressLoop();
      }
    });
    audio.addEventListener("volumechange", syncUi);
    audio.addEventListener("waiting", () => {
      if (!pausedThisVisit) {
        waitingForBuffer = true;
        syncUi();
      }
    });
    audio.addEventListener("playing", () => {
      waitingForBuffer = false;
      playing = true;
      syncUi();
    });
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("ended", () => setProgress(0));
    audio.addEventListener("loadeddata", tryAutoplay);
    audio.addEventListener("canplay", tryAutoplay);

    window.addEventListener("dufc-bgm-locked", syncUi);
    window.addEventListener("dufc-bgm-unlocked", syncUi);

    pausedThisVisit = false;
    window.__dufcBgAudioPaused = false;
    tryAutoplay();
    syncTip();

    window.addEventListener("pageshow", () => {
      pausedThisVisit = false;
      window.__dufcBgAudioPaused = false;
      tryAutoplay();
    });
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
