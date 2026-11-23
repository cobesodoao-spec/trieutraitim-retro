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

  // Âm thanh BUZZ!!! kinh điển của Yahoo! Messenger
  playYahooBuzzSound() {
    this._ensureAudioContext();
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      const t = now + i * 0.075;
      osc.frequency.setValueAtTime(155 - i * 10, t);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.005, t + 0.065);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  }
}

window.RetroMusicEngine = RetroMusicEngine;
