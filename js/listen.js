/* ============================================================
   Audio-only player. Chapter 14 test.
   Same speed / position keys as the chapter Listen bar.
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('player');
  if (!root) return;

  var src = root.getAttribute('data-src');
  var spokenSrc = root.getAttribute('data-spoken');
  var title = root.getAttribute('data-title') || 'This chapter';
  var kicker = root.getAttribute('data-kicker') || '';
  var artist = root.getAttribute('data-artist') || 'Zeeshan Sabri';
  var artwork = root.getAttribute('data-artwork') || '';
  if (!src) return;

  var SPEEDS = [0.75, 1, 1.25, 1.5, 2];
  var SPEED_KEY = 'memoir-audio-speed';
  var POS_PREFIX = 'memoir-audio-pos:';

  var speed = 1;
  try {
    var savedSpeed = parseFloat(localStorage.getItem(SPEED_KEY));
    if (SPEEDS.indexOf(savedSpeed) !== -1) speed = savedSpeed;
  } catch (e) { /* ignore */ }

  var audio = new Audio(src);
  audio.preload = 'metadata';
  audio.playbackRate = speed;

  var playBtn = document.getElementById('play');
  var playIcon = document.getElementById('play-icon');
  var wrap = document.getElementById('progress');
  var fill = document.getElementById('fill');
  var elapsedEl = document.getElementById('elapsed');
  var remainEl = document.getElementById('remain');
  var lineEl = document.getElementById('line');
  var segments = [];
  var wakeLock = null;

  paintSpeed();

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function posKey() {
    return POS_PREFIX + src;
  }

  function setPlaying(on) {
    playIcon.textContent = on ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    document.body.classList.toggle('is-playing', on);
    if (on) requestWake();
    else releaseWake();
  }

  function paintSpeed() {
    var chips = document.querySelectorAll('.listen-speed');
    for (var i = 0; i < chips.length; i++) {
      var v = parseFloat(chips[i].getAttribute('data-speed'));
      chips[i].classList.toggle('is-active', v === speed);
    }
  }

  function applySpeed(next) {
    speed = next;
    audio.playbackRate = speed;
    paintSpeed();
    try { localStorage.setItem(SPEED_KEY, String(speed)); } catch (e) { /* ignore */ }
  }

  function toggle() {
    if (audio.paused) {
      audio.play().then(function () {
        setPlaying(true);
        bindMediaSession();
      }).catch(function () {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function skip(delta) {
    if (!audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
    syncLine();
  }

  function seekFromEvent(e) {
    if (!audio.duration) return;
    var r = wrap.getBoundingClientRect();
    var x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - r.left;
    audio.currentTime = Math.max(0, Math.min(1, x / r.width)) * audio.duration;
    syncLine();
  }

  function restorePosition() {
    if (!audio.duration) return;
    try {
      var saved = parseFloat(localStorage.getItem(posKey()));
      if (isFinite(saved) && saved > 3 && saved < audio.duration - 4) {
        audio.currentTime = saved;
        paintTime();
      }
    } catch (e) { /* ignore */ }
  }

  function persistPosition() {
    if (!audio.duration) return;
    try {
      if (audio.currentTime < 3 || audio.currentTime > audio.duration - 4) {
        localStorage.removeItem(posKey());
      } else {
        localStorage.setItem(posKey(), String(audio.currentTime));
      }
    } catch (e) { /* ignore */ }
  }

  function paintTime() {
    if (!audio.duration) {
      elapsedEl.textContent = '0:00';
      remainEl.textContent = '0:00';
      return;
    }
    elapsedEl.textContent = formatTime(audio.currentTime);
    remainEl.textContent = formatTime(Math.max(0, audio.duration - audio.currentTime));
    fill.style.width = ((audio.currentTime / audio.duration) * 100).toFixed(2) + '%';
  }

  function stampTimes(nodes) {
    var total = 0;
    for (var t = 0; t < nodes.length; t++) total += nodes[t].words;
    var acc = 0;
    for (var n = 0; n < nodes.length; n++) {
      nodes[n].start = total ? acc / total : 0;
      acc += nodes[n].words;
      nodes[n].end = total ? acc / total : 1;
    }
    return nodes;
  }

  function loadSpoken() {
    if (!spokenSrc) return;
    window.__MEMOIR_SPOKEN__ = null;
    var s = document.createElement('script');
    s.src = spokenSrc;
    s.onload = function () {
      var data = window.__MEMOIR_SPOKEN__;
      if (s.parentNode) s.parentNode.removeChild(s);
      if (!data || !data.segments) return;
      segments = stampTimes(data.segments.map(function (spec) {
        return { words: spec.words || 1, text: spec.text || '', kind: spec.kind };
      }));
      syncLine();
    };
    s.onerror = function () {
      if (s.parentNode) s.parentNode.removeChild(s);
    };
    document.head.appendChild(s);
  }

  function syncLine() {
    if (!audio.duration || !segments.length) return;
    var frac = Math.max(0, Math.min(0.999, audio.currentTime / audio.duration));
    var seg = segments[segments.length - 1];
    for (var i = 0; i < segments.length; i++) {
      if (frac >= segments[i].start && frac < segments[i].end) {
        seg = segments[i];
        break;
      }
    }
    if (seg && seg.text) lineEl.textContent = seg.text.replace(/\s+/g, ' ').trim();
  }

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        album: 'From Exile to Transformation',
        artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', function () {
        audio.play().then(function () { setPlaying(true); }).catch(function () {});
      });
      navigator.mediaSession.setActionHandler('pause', function () {
        audio.pause();
        setPlaying(false);
      });
      navigator.mediaSession.setActionHandler('seekbackward', function () { skip(-15); });
      navigator.mediaSession.setActionHandler('seekforward', function () { skip(15); });
    } catch (e) { /* ignore */ }
  }

  function requestWake() {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
    }).catch(function () {});
  }

  function releaseWake() {
    if (!wakeLock) return;
    wakeLock.release().catch(function () {});
    wakeLock = null;
  }

  playBtn.addEventListener('click', toggle);

  var skips = document.querySelectorAll('.listen-skip');
  for (var i = 0; i < skips.length; i++) {
    skips[i].addEventListener('click', function () {
      skip(parseFloat(this.getAttribute('data-skip')));
    });
  }

  var chips = document.querySelectorAll('.listen-speed');
  for (var c = 0; c < chips.length; c++) {
    chips[c].addEventListener('click', function () {
      applySpeed(parseFloat(this.getAttribute('data-speed')));
    });
  }

  wrap.addEventListener('click', seekFromEvent);
  wrap.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft') { e.preventDefault(); skip(-15); }
    if (e.code === 'ArrowRight') { e.preventDefault(); skip(15); }
  });

  audio.addEventListener('timeupdate', function () {
    paintTime();
    persistPosition();
    syncLine();
  });
  audio.addEventListener('loadedmetadata', function () {
    restorePosition();
    paintTime();
  });
  audio.addEventListener('playing', function () { setPlaying(true); });
  audio.addEventListener('pause', function () { setPlaying(false); });
  audio.addEventListener('ended', function () {
    setPlaying(false);
    audio.currentTime = 0;
    paintTime();
    try { localStorage.removeItem(posKey()); } catch (e) { /* ignore */ }
    if (segments[0] && segments[0].text) lineEl.textContent = segments[0].text;
  });
  audio.addEventListener('error', function () {
    lineEl.textContent = 'Audio could not load. Open this page from a server, not as a raw file.';
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowLeft') skip(-15);
    if (e.code === 'ArrowRight') skip(15);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !audio.paused) requestWake();
  });

  loadSpoken();
  bindMediaSession();
})();
