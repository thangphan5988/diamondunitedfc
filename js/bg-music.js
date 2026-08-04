/* Background music UI — sync với boot muted/unmute ở <head> */

(function initBgMusic() {
  const SRC = "assets/audio/diamond-united-rap.mp3";
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
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  if (!audio.getAttribute("src") && !audio.src) audio.src = SRC;

  let playing = !audio.paused && !audio.ended;
  let pausedThisVisit = !!window.__dufcBgAudioPaused;
  let unlockBound = false;
  let waitingForBuffer = false;
  let rafId = 0;
  let progressEl = null;

  function needsUnmute() {
    return !!window.__dufcBgNeedsUnmute || !!audio.muted;
  }

  function syncUi() {
    const btn = document.getElementById("bgMusicToggle");
    if (!btn) return;
    const active = playing || (!audio.paused && !audio.ended);
    btn.classList.toggle("is-playing", active);
    btn.classList.toggle("is-buffering", waitingForBuffer && !active);
    btn.classList.toggle("is-muted-warm", needsUnmute() && active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    let label = "Phát nhạc nền Diamond United RAP";
    if (active && needsUnmute()) label = "Chạm để bật tiếng nhạc";
    else if (active) label = "Tạm dừng nhạc nền";
    btn.setAttribute("aria-label", label);
    btn.title = active && needsUnmute() ? "Chạm để bật tiếng" : active ? "Pause" : "Play";
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

  function hasPlayableBuffer() {
    return audio.readyState >= 2;
  }

  function clearUnmuteFlag() {
    window.__dufcBgNeedsUnmute = false;
    audio.muted = false;
    audio.volume = VOLUME;
  }

  async function play(fromUser) {
    if (fromUser) {
      pausedThisVisit = false;
      window.__dufcBgAudioPaused = false;
      clearUnmuteFlag();
    }

    // Đang warm muted từ <head> → giữ nguyên, đừng gọi play() unmuted (bị chặn / abort)
    if (!fromUser && !audio.paused) {
      playing = true;
      waitingForBuffer = false;
      syncUi();
      startProgressLoop();
      return { ok: true };
    }

    waitingForBuffer = !hasPlayableBuffer();
    syncUi();
    try {
      if (!fromUser && window.__dufcBgNeedsUnmute) audio.muted = true;
      else audio.muted = false;
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      playing = true;
      pausedThisVisit = false;
      window.__dufcBgAudioPaused = false;
      waitingForBuffer = false;
      syncUi();
      startProgressLoop();
      return { ok: true };
    } catch (err) {
      playing = false;
      const name = err && err.name;
      if (name === "NotAllowedError") {
        // Fallback: muted warm + unmute ở gesture (giống boot <head>)
        try {
          audio.muted = true;
          await audio.play();
          playing = true;
          window.__dufcBgNeedsUnmute = true;
          bindUnmuteOnce();
          syncUi();
          startProgressLoop();
          return { ok: true };
        } catch (_) {
          syncUi();
          bindUnmuteOnce();
          return { ok: false, reason: "policy" };
        }
      }
      if (name === "AbortError" || !hasPlayableBuffer()) {
        waitingForBuffer = true;
        syncUi();
        return { ok: false, reason: "buffer" };
      }
      waitingForBuffer = false;
      syncUi();
      stopProgressLoop();
      return { ok: false, reason: "policy" };
    }
  }

  function pause() {
    pausedThisVisit = true;
    window.__dufcBgAudioPaused = true;
    window.__dufcBgNeedsUnmute = false;
    waitingForBuffer = false;
    audio.pause();
    playing = false;
    syncUi();
    stopProgressLoop();
  }

  function toggle() {
    if (playing || !audio.paused) {
      // Nếu đang muted warm → lần bấm đầu = unmute, chưa pause
      if (needsUnmute()) {
        clearUnmuteFlag();
        play(true);
        return;
      }
      pause();
    } else {
      play(true);
    }
  }

  function bindUnmuteOnce() {
    if (unlockBound) return;
    unlockBound = true;
    const unmute = () => {
      if (pausedThisVisit) return;
      clearUnmuteFlag();
      if (audio.paused) {
        play(true).then(() => {
          teardown();
        });
      } else {
        syncUi();
        teardown();
      }
    };
    function teardown() {
      document.removeEventListener("pointerdown", unmute, true);
      document.removeEventListener("touchstart", unmute, true);
      document.removeEventListener("keydown", unmute, true);
      unlockBound = false;
    }
    document.addEventListener("pointerdown", unmute, true);
    document.addEventListener("touchstart", unmute, true);
    document.addEventListener("keydown", unmute, true);
  }

  function tryAutoplay() {
    if (pausedThisVisit) return;
    if (!audio.paused) {
      playing = true;
      syncUi();
      startProgressLoop();
      if (needsUnmute()) bindUnmuteOnce();
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
      '<circle class="bgMusicRingTrack" cx="28" cy="28" r="' + RING_R + '"></circle>' +
      '<circle class="bgMusicRingProgress" cx="28" cy="28" r="' + RING_R + '" ' +
      'stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + RING_C.toFixed(2) + '"></circle>' +
      "</svg>" +
      '<span class="bgMusicCore">' +
      '<span class="bgMusicIcon bgMusicIcon--pause" aria-hidden="true">⏸</span>' +
      '<span class="bgMusicIcon bgMusicIcon--play" aria-hidden="true">▶</span>' +
      "</span>";
    progressEl = btn.querySelector(".bgMusicRingProgress");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(btn);

    playing = !audio.paused && !audio.ended;
    syncUi();
    updateProgress();
    if (playing) startProgressLoop();
    if (needsUnmute()) bindUnmuteOnce();

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

    pausedThisVisit = false;
    window.__dufcBgAudioPaused = false;
    tryAutoplay();

    window.addEventListener("pageshow", () => {
      pausedThisVisit = false;
      window.__dufcBgAudioPaused = false;
      tryAutoplay();
    });
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
