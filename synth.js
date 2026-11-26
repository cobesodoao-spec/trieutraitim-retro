// ==========================================================================
// Bộ Phát Nhạc Kép: Hỗ trợ cả File MP3 thật + Hòa Tấu Giai Điệu Hoài Niệm (Web Audio)
// Kèm âm thanh "BUZZ!!!" đặc trưng của Yahoo! Messenger
// ==========================================================================

class RetroMusicEngine {
  constructor(callbacks = {}) {
    this.onTick = callbacks.onTick || (() => {});
    this.onEnded = callbacks.onEnded || (() => {});
    this.onStateChange = callbacks.onStateChange || (() => {});

    this.ctx = null;
    this.masterGain = null;
    this.delayNode = null;

    this.audioEl = new Audio();
    this.audioEl.preload = "metadata";

    this.currentSong = null;
    this.isPlaying = false;
    this.volume = 0.78;
    this.isMuted = false;

    // Trạng thái bộ đếm thời gian cho Synth
    this.currentTime = 85; // Mặc định 01:25 giống ảnh chụp!
    this.duration = 207;   // Mặc định 03:27 giống ảnh chụp!
    this.stepIndex = 0;
    this.schedulerTimer = null;
    this.clockTimer = null;
    this.lastClockMs = 0;

    this._bindAudioElement();
  }

  _bindAudioElement() {
    this.audioEl.addEventListener("timeupdate", () => {
      if (this.currentSong && this.currentSong.audioUrl) {
        this.currentTime = this.audioEl.currentTime || 0;
        if (isFinite(this.audioEl.duration) && this.audioEl.duration > 0) {
          this.duration = this.audioEl.duration;
          this.currentSong.duration = Math.round(this.audioEl.duration);
        }
        this.onTick(this.currentTime, this.duration);
      }
    });

    this.audioEl.addEventListener("loadedmetadata", () => {
      if (this.currentSong && this.currentSong.audioUrl && isFinite(this.audioEl.duration)) {
        this.duration = this.audioEl.duration;
        this.currentSong.duration = Math.round(this.audioEl.duration);
        this.onTick(this.currentTime, this.duration);
      }
    });

    this.audioEl.addEventListener("ended", () => {
      if (this.currentSong && this.currentSong.audioUrl) {
        this.onEnded();
      }
    });
  }

  _ensureAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume * 0.55;

      // Hiệu ứng vang nhẹ kiểu phòng trà / nhạc Flash xưa
      this.delayNode = this.ctx.createDelay();
      this.delayNode.delayTime.value = 0.24;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.25;
      const wetGain = this.ctx.createGain();
      wetGain.gain.value = 0.22;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2800;

      this.delayNode.connect(filter);
      filter.connect(feedback);
      feedback.connect(this.delayNode);
      filter.connect(wetGain);

      this.masterGain.connect(this.ctx.destination);
      wetGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  loadSong(song, startOffsetSec = 0, autoPlay = false) {
    this._stopTimers();
    this.audioEl.pause();

    this.currentSong = song;
    this.duration = song.duration || 210;
    this.currentTime = Math.min(Math.max(0, startOffsetSec), this.duration);
    this.stepIndex = Math.floor(this.currentTime * 2);

    const playableSrc = song.resolvedUrl || song.audioUrl;
    if (playableSrc) {
      this.audioEl.src = playableSrc;
      this.audioEl.volume = this.isMuted ? 0 : this.volume;
      if (startOffsetSec > 0) {
        const applyOffset = () => {
          try { this.audioEl.currentTime = startOffsetSec; } catch (_) {}
          this.audioEl.removeEventListener("loadedmetadata", applyOffset);
        };
        if (this.audioEl.readyState >= 1) {
          applyOffset();
        } else {
          this.audioEl.addEventListener("loadedmetadata", applyOffset);
        }
      }
    } else {
      this.audioEl.removeAttribute("src");
    }

    this.onTick(this.currentTime, this.duration);

    if (autoPlay) {
      this.play();
    } else {
      this.isPlaying = false;
      this.onStateChange(false);
    }
  }

  play() {
    if (!this.currentSong) return;

    if (this.currentSong.audioUrl) {
      this.audioEl.volume = this.isMuted ? 0 : this.volume;
      this.audioEl.play().then(() => {
        this.isPlaying = true;
        this.onStateChange(true);
      }).catch(() => {
        this.isPlaying = false;
        this.onStateChange(false);
      });
      return;
    }

    this._ensureAudioContext();
    this._stopTimers();
    this.isPlaying = true;
    this.onStateChange(true);

    const bpm = this.currentSong.bpm || 86;
    const eighthMs = (60 / bpm / 2) * 1000;

    // Phát nốt đầu ngay khi bấm Play
    this._triggerSynthStep();

    this.schedulerTimer = setInterval(() => {
      if (!this.isPlaying) return;
      this._triggerSynthStep();
    }, eighthMs);

    this.lastClockMs = performance.now();
    this.clockTimer = setInterval(() => {
      if (!this.isPlaying) return;
      const now = performance.now();
      const dt = (now - this.lastClockMs) / 1000;
      this.lastClockMs = now;
      this.currentTime += dt;

      if (this.currentTime >= this.duration) {
        this.currentTime = this.duration;
        this.onTick(this.currentTime, this.duration);
        this.pause();
        this.onEnded();
        return;
      }
      this.onTick(this.currentTime, this.duration);
    }, 200);
  }

  pause() {
    this.isPlaying = false;
    this._stopTimers();
    if (this.currentSong && this.currentSong.audioUrl) {
      this.audioEl.pause();
    }
    this.onStateChange(false);
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      if (this.currentTime >= this.duration - 0.5) {
        this.seek(0);
      }
      this.play();
    }
  }

  seek(targetSeconds) {
    const clamped = Math.max(0, Math.min(this.duration, targetSeconds));
    this.currentTime = clamped;
    this.stepIndex = Math.floor(clamped * 2);

    if (this.currentSong && this.currentSong.audioUrl) {
      try {
        this.audioEl.currentTime = clamped;
      } catch (_) {}
    }
    this.onTick(this.currentTime, this.duration);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.volume > 0 && this.isMuted) {
      this.isMuted = false;
    }
    this._applyGain();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this._applyGain();
    return this.isMuted;
  }

  _applyGain() {
    const effective = this.isMuted ? 0 : this.volume;
    this.audioEl.volume = effective;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(effective * 0.55, this.ctx.currentTime, 0.03);
    }
  }

  _stopTimers() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  _triggerSynthStep() {
    if (!this.ctx || !this.currentSong) return;

    const song = this.currentSong;
    const now = this.ctx.currentTime;
    const step = this.stepIndex++;

    const chords = song.progression || [[60, 64, 67]];
    const melody = song.melody || [72, 74, 76, 72];

    const barIndex = Math.floor(step / 8) % chords.length;
    const stepInBar = step % 8;
    const chord = chords[barIndex];

    // 1. Nốt trầm ấm đầu ô nhịp & phách 5
    if (stepInBar === 0 || stepInBar === 4) {
      const bassNote = chord[0] - 12;
      this._playWarmVoice(this.midiToFreq(bassNote), now, 0.95, 0.22, "triangle");
    }

    // 2. Rải hợp âm Electric Piano nhẹ nhàng
    const arpNote = chord[stepInBar % chord.length];
    this._playWarmVoice(this.midiToFreq(arpNote), now, 0.55, 0.11, "sine");

    // 3. Giai điệu chính kiểu Music Box / Chuông pha lê
    const shouldPlayMelody = stepInBar !== 3 || (step % 16 === 3);
    if (shouldPlayMelody) {
      const melIdx = Math.floor(step / 2) % melody.length;
      const variation = (Math.floor(step / 32) % 2 === 1 && stepInBar === 6) ? 2 : 0;
      const melMidi = melody[melIdx] + variation;
      this._playBellLead(this.midiToFreq(melMidi), now, 0.68, 0.2);
    }
  }

  _playWarmVoice(freq, startTime, duration, peakGain, type = "sine") {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  _playBellLead(freq, startTime, duration, peakGain) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(freq, startTime);

    // Họa âm quãng tám nhẹ tạo tiếng chuông Music Box hoài niệm
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.18;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc1.connect(gain);
    osc2.connect(subGain);
    subGain.connect(gain);

    gain.connect(this.masterGain);
    if (this.delayNode) {
      gain.connect(this.delayNode);
    }

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration + 0.04);
    osc2.stop(startTime + duration + 0.04);
  }

  // Âm thanh BUZZ!!! chuẩn gốc Yahoo! Messenger (phát từ buzz.mp3 / data URI nhúng sẵn)
  playYahooBuzzSound() {
    const src = window.YAHOO_BUZZ_DATA_URI || "buzz.mp3";
    const sfx = new Audio(src);
    sfx.volume = this.isMuted ? 0 : Math.max(0.35, this.volume);
    sfx.play().catch(() => {});
  }
}

window.RetroMusicEngine = RetroMusicEngine;

window.YAHOO_BUZZ_DATA_URI = "data:audio/mpeg;base64,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";
