export function createAudio() {
  let ctx = null;
  let master;
  let engineGain;
  let cryGain;
  let rumbleGain;
  let fireGain;
  let started = false;

  function ensure() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);

    engineGain = ctx.createGain();
    engineGain.gain.value = 0.22;
    engineGain.connect(master);
    drone(90, 0.18);
    drone(180, 0.08);
    noise(engineGain, 0.04, 800);

    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleGain.connect(master);
    noise(rumbleGain, 1, 200);

    cryGain = ctx.createGain();
    cryGain.gain.value = 0;
    cryGain.connect(master);
    const cryOsc = ctx.createOscillator();
    cryOsc.type = "sawtooth";
    cryOsc.frequency.value = 620;
    const cryFilt = ctx.createBiquadFilter();
    cryFilt.type = "bandpass";
    cryFilt.frequency.value = 900;
    cryOsc.connect(cryFilt);
    cryFilt.connect(cryGain);
    cryOsc.start();
    lfo(cryOsc.frequency, 620, 80, 3.2);

    fireGain = ctx.createGain();
    fireGain.gain.value = 0;
    fireGain.connect(master);
    noise(fireGain, 1, 1200);

    started = true;
  }

  function drone(freq, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    o.connect(g);
    g.connect(engineGain);
    o.start();
  }

  function noise(dest, vol, cutoff) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
  }

  function lfo(param, base, depth, rate) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    param.value = base;
  }

  function beep(freq, dur, type = "sine", vol = 0.2) {
    if (!started) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  return {
    resume() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
    },
    setTurbulence(on) {
      if (!started) return;
      rumbleGain.gain.linearRampToValueAtTime(on ? 0.45 : 0, ctx.currentTime + 0.2);
    },
    setCry(on) {
      if (!started) return;
      cryGain.gain.linearRampToValueAtTime(on ? 0.08 : 0, ctx.currentTime + 0.3);
    },
    setFire(on) {
      if (!started) return;
      fireGain.gain.linearRampToValueAtTime(on ? 0.22 : 0, ctx.currentTime + 0.2);
    },
    ding() {
      beep(880, 0.12, "square", 0.12);
      setTimeout(() => beep(1320, 0.14, "square", 0.1), 90);
    },
    pa() {
      beep(420, 0.2, "square", 0.1);
      setTimeout(() => beep(420, 0.2, "square", 0.1), 260);
    },
    serve() {
      beep(523, 0.08);
      setTimeout(() => beep(784, 0.12), 80);
    },
    spill() {
      noiseBurst();
    },
    shove() {
      beep(90, 0.15, "sawtooth", 0.18);
    },
    land(win) {
      if (win) {
        beep(523, 0.15);
        setTimeout(() => beep(659, 0.15), 140);
        setTimeout(() => beep(784, 0.3), 280);
      } else beep(160, 0.5, "sawtooth", 0.2);
    },
  };

  function noiseBurst() {
    if (!started) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    src.connect(g);
    g.connect(master);
    src.start();
  }
}
