/* ============================================================
   Audio-only player.
   Extra demo controls (length, sections, sleep, end card)
   activate only when those elements exist on the page.
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
  var lengthEl = document.getElementById('length');
  var sectionsEl = document.getElementById('sections');
  var endCard = document.getElementById('endcard');
  var nowEl = document.getElementById('now');
  var sleepLabel = document.getElementById('sleep-left');
  var segments = [];
  var activeSeg = null;
  var sleepUntil = 0;
  var sleepMins = 0;

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
    if (on && endCard) endCard.hidden = true;
    if (on && nowEl) nowEl.hidden = false;
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

  function paintLength() {
    if (!lengthEl || !audio.duration) return;
    var mins = Math.max(1, Math.round(audio.duration / 60));
    lengthEl.textContent = mins === 1 ? 'About 1 minute' : 'About ' + mins + ' minutes';
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

  function spokenLine(seg) {
    if (seg.quote) return seg.quote.replace(/\s+/g, ' ').trim().replace(/^"|"$/g, '');
    var t = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (seg.kind === 'title' || seg.kind === 'h2') return t.replace(/\.$/, '');
    var m = t.match(/^(.{12,}?[.!?])(?:\s|$)/);
    var line = m ? m[1] : t;
    if (line.length > 160) {
      var cut = line.slice(0, 157);
      var sp = cut.lastIndexOf(' ');
      line = (sp > 80 ? cut.slice(0, sp) : cut) + '…';
    }
    return line;
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
        return {
          words: spec.words || 1,
          text: spec.text || '',
          kind: spec.kind,
          quote: spec.highlights && spec.highlights[0] ? spec.highlights[0].text : ''
        };
      }));
      paintSections();
      syncLine();
    };
    s.onerror = function () {
      if (s.parentNode) s.parentNode.removeChild(s);
    };
    document.head.appendChild(s);
  }

  function paintSections() {
    if (!sectionsEl) return;
    sectionsEl.innerHTML = '';
    var marks = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].kind === 'title' || segments[i].kind === 'h2') marks.push(segments[i]);
    }
    if (!marks.length) {
      sectionsEl.hidden = true;
      return;
    }
    sectionsEl.hidden = false;
    for (var m = 0; m < marks.length; m++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-mark';
      btn.textContent = (marks[m].text || '').replace(/\.$/, '');
      btn.setAttribute('data-start', String(marks[m].start));
      btn.addEventListener('click', seekToMark);
      sectionsEl.appendChild(btn);
    }
  }

  function seekToMark() {
    if (!audio.duration) return;
    var start = parseFloat(this.getAttribute('data-start'));
    if (!isFinite(start)) return;
    audio.currentTime = Math.max(0, start * audio.duration + 0.05);
    if (audio.paused) {
      audio.play().then(function () { setPlaying(true); }).catch(function () {});
    }
    syncLine();
  }

  function paintActiveMark(seg) {
    if (!sectionsEl) return;
    var marks = sectionsEl.querySelectorAll('.listen-mark');
    var current = null;
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].kind === 'title' || segments[i].kind === 'h2') {
        if (seg.start >= segments[i].start) current = segments[i];
      }
    }
    for (var b = 0; b < marks.length; b++) {
      var start = parseFloat(marks[b].getAttribute('data-start'));
      marks[b].classList.toggle('is-active', current && start === current.start);
    }
  }

  function syncLine() {
    if (!audio.duration || !segments.length || !lineEl) return;
    var frac = Math.max(0, Math.min(0.999, audio.currentTime / audio.duration));
    var seg = segments[segments.length - 1];
    for (var i = 0; i < segments.length; i++) {
      if (frac >= segments[i].start && frac < segments[i].end) {
        seg = segments[i];
        break;
      }
    }
    if (seg !== activeSeg) {
      activeSeg = seg;
      lineEl.textContent = spokenLine(seg);
    }
    paintActiveMark(seg);
  }

  function setSleep(mins) {
    if (sleepMins === mins) {
      sleepMins = 0;
      sleepUntil = 0;
    } else {
      sleepMins = mins;
      sleepUntil = Date.now() + mins * 60 * 1000;
    }
    var chips = document.querySelectorAll('.listen-sleep');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle(
        'is-active',
        sleepMins > 0 && parseFloat(chips[i].getAttribute('data-sleep')) === sleepMins
      );
    }
    paintSleep();
  }

  function paintSleep() {
    if (!sleepLabel) return;
    if (!sleepUntil || sleepUntil <= Date.now()) {
      sleepLabel.textContent = '';
      sleepLabel.hidden = true;
      return;
    }
    sleepLabel.hidden = false;
    sleepLabel.textContent = 'Sleep in ' + formatTime((sleepUntil - Date.now()) / 1000);
  }

  function checkSleep() {
    if (!sleepUntil) return;
    if (Date.now() >= sleepUntil) {
      sleepUntil = 0;
      sleepMins = 0;
      if (!audio.paused) {
        audio.pause();
        setPlaying(false);
      }
      var chips = document.querySelectorAll('.listen-sleep');
      for (var i = 0; i < chips.length; i++) chips[i].classList.remove('is-active');
      paintSleep();
    } else {
      paintSleep();
    }
  }

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      var absArt = artwork;
      if (artwork && artwork.indexOf('http') !== 0) {
        absArt = new URL(artwork, window.location.href).href;
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: kicker ? kicker + ' · ' + title : title,
        artist: artist,
        album: 'From Exile to Transformation',
        artwork: absArt ? [{ src: absArt, sizes: '512x512', type: 'image/jpeg' }] : []
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

  var sleepChips = document.querySelectorAll('.listen-sleep');
  for (var sl = 0; sl < sleepChips.length; sl++) {
    sleepChips[sl].addEventListener('click', function () {
      setSleep(parseFloat(this.getAttribute('data-sleep')));
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
    checkSleep();
  });
  audio.addEventListener('loadedmetadata', function () {
    restorePosition();
    paintTime();
    paintLength();
  });
  audio.addEventListener('playing', function () { setPlaying(true); });
  audio.addEventListener('pause', function () { setPlaying(false); });
  audio.addEventListener('ended', function () {
    setPlaying(false);
    audio.currentTime = 0;
    paintTime();
    sleepUntil = 0;
    sleepMins = 0;
    var sleepOff = document.querySelectorAll('.listen-sleep');
    for (var so = 0; so < sleepOff.length; so++) sleepOff[so].classList.remove('is-active');
    paintSleep();
    try { localStorage.removeItem(posKey()); } catch (e) { /* ignore */ }
    if (endCard) {
      endCard.hidden = false;
      if (nowEl) nowEl.hidden = true;
      if (lineEl) lineEl.textContent = '';
    } else if (segments[0] && lineEl) {
      lineEl.textContent = spokenLine(segments[0]);
    }
  });
  audio.addEventListener('error', function () {
    if (lineEl) lineEl.textContent = 'Audio could not load. Open this page from a server, not as a raw file.';
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowLeft') skip(-15);
    if (e.code === 'ArrowRight') skip(15);
  });

  loadSpoken();
  bindMediaSession();
})();
