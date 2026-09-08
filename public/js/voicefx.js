(function () {
  'use strict';

  const PRESETS = [
    { id: 'none', name: 'No effect', emoji: '🎙️', params: [] },
    { id: 'helium', name: 'Helium', emoji: '🎈', params: [
      { key: 'pitch', label: 'Pitch', min: 1, max: 12, step: 1, def: 6, unit: 'st' }
    ] },
    { id: 'deep', name: 'Deep voice', emoji: '🔊', params: [
      { key: 'pitch', label: 'Pitch', min: -12, max: -1, step: 1, def: -5, unit: 'st' },
      { key: 'bass', label: 'Bass', min: 0, max: 12, step: 1, def: 5, unit: 'dB' }
    ] },
    { id: 'robot', name: 'Robot', emoji: '🤖', params: [
      { key: 'rate', label: 'Carrier', min: 20, max: 90, step: 1, def: 40, unit: 'Hz' },
      { key: 'comb', label: 'Metal', min: 0, max: 0.8, step: 0.05, def: 0.35, unit: '' }
    ] },
    { id: 'alien', name: 'Alien', emoji: '👽', params: [
      { key: 'rate', label: 'Carrier', min: 70, max: 180, step: 1, def: 115, unit: 'Hz' },
      { key: 'vibrato', label: 'Vibrato', min: 1, max: 6, step: 0.5, def: 3, unit: 'st' }
    ] },
    { id: 'radio', name: 'Old radio', emoji: '📻', params: [
      { key: 'drive', label: 'Drive', min: 1, max: 8, step: 0.5, def: 3, unit: 'x' },
      { key: 'noise', label: 'Static', min: 0, max: 0.08, step: 0.01, def: 0.025, unit: '' }
    ] },
    { id: 'megaphone', name: 'Megaphone', emoji: '📢', params: [
      { key: 'drive', label: 'Drive', min: 2, max: 12, step: 1, def: 6, unit: 'x' },
      { key: 'slap', label: 'Slapback', min: 30, max: 120, step: 5, def: 65, unit: 'ms' }
    ] },
    { id: 'cave', name: 'Cave', emoji: '🕳️', params: [
      { key: 'size', label: 'Size', min: 0.6, max: 3, step: 0.2, def: 1.8, unit: 's' },
      { key: 'echo', label: 'Echo', min: 0.15, max: 0.75, step: 0.05, def: 0.45, unit: '' },
      { key: 'mix', label: 'Wet', min: 0.15, max: 0.8, step: 0.05, def: 0.5, unit: '' }
    ] },
    { id: 'underwater', name: 'Underwater', emoji: '🌊', params: [
      { key: 'cutoff', label: 'Muffle', min: 250, max: 900, step: 25, def: 500, unit: 'Hz' },
      { key: 'motion', label: 'Motion', min: 0.1, max: 1.5, step: 0.1, def: 0.55, unit: 'Hz' }
    ] },
    { id: 'demon', name: 'Demon', emoji: '😈', params: [
      { key: 'pitch', label: 'Pitch', min: -18, max: -6, step: 1, def: -10, unit: 'st' },
      { key: 'drive', label: 'Drive', min: 1, max: 6, step: 0.5, def: 2.5, unit: 'x' },
      { key: 'double', label: 'Double', min: 0, max: 0.7, step: 0.05, def: 0.35, unit: '' }
    ] },
    { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', params: [
      { key: 'pitch', label: 'Pitch', min: 7, max: 14, step: 1, def: 10, unit: 'st' },
      { key: 'presence', label: 'Presence', min: 0, max: 10, step: 1, def: 4, unit: 'dB' }
    ] },
    { id: 'whisper', name: 'Whisper', emoji: '🤫', params: [
      { key: 'air', label: 'Air', min: 3, max: 18, step: 1, def: 11, unit: 'dB' },
      { key: 'noise', label: 'Breath', min: 0.02, max: 0.18, step: 0.01, def: 0.08, unit: '' }
    ] }
  ];

  let ctx = null;
  let sourceNode = null;
  let destination = null;
  let outputBus = null;
  let gateNode = null;
  let gateAnalyser = null;
  let gateTimer = null;
  let gateQuietSince = 0;
  let effectNodes = [];
  let cleanup = [];
  let preset = 'none';
  let workletOk = false;
  let monitorGain = null;
  let monitoring = false;
  let gateOn = false;
  let gateThreshold = -50;
  let resumeTimer = null;
  let attachSerial = 0;
  const values = Object.create(null);

  PRESETS.forEach((item) => {
    values[item.id] = Object.create(null);
    item.params.forEach((param) => {
      values[item.id][param.key] = param.def;
    });
  });

  function report(message) {
    if (typeof VoiceFX.onerror === 'function') VoiceFX.onerror(String(message));
  }

  function presetInfo(id) {
    return PRESETS.find((item) => item.id === id);
  }

  function clampParam(id, key, value) {
    const info = presetInfo(id);
    const spec = info && info.params.find((item) => item.key === key);
    if (!spec) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return spec.def;
    return Math.max(spec.min, Math.min(spec.max, number));
  }

  function audioParam(param, value, seconds) {
    if (!ctx || !param) return;
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, seconds || 0.015);
  }

  function remember(node) {
    effectNodes.push(node);
    return node;
  }

  function connectChain(nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  }

  function gain(value) {
    const node = remember(ctx.createGain());
    node.gain.value = value;
    return node;
  }

  function filter(type, frequency, q, gainValue) {
    const node = remember(ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    if (q !== undefined) node.Q.value = q;
    if (gainValue !== undefined) node.gain.value = gainValue;
    return node;
  }

  function delay(seconds) {
    const node = remember(ctx.createDelay(1));
    node.delayTime.value = seconds;
    return node;
  }

  function oscillator(frequency) {
    const node = remember(ctx.createOscillator());
    node.frequency.value = frequency;
    node.start();
    cleanup.push(() => {
      try { node.stop(); } catch (error) { /* It may already have stopped during teardown. */ }
    });
    return node;
  }

  function makeCurve(drive, hard) {
    const curve = new Float32Array(512);
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = hard ?
        Math.max(-0.72, Math.min(0.72, x * drive)) :
        Math.tanh(x * drive) / Math.tanh(drive);
    }
    return curve;
  }

  function shaper(drive, hard) {
    const node = remember(ctx.createWaveShaper());
    node.curve = makeCurve(drive, hard);
    node.oversample = '2x';
    return node;
  }

  function noiseSource(level, highpass) {
    const seconds = 2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = remember(ctx.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    const noiseGain = gain(level);
    if (highpass) {
      const high = filter('highpass', highpass, 0.6);
      connectChain([source, high, noiseGain]);
    } else {
      source.connect(noiseGain);
    }
    source.start();
    cleanup.push(() => {
      try { source.stop(); } catch (error) { /* It may already have stopped during teardown. */ }
    });
    return noiseGain;
  }

  function pitchNode(semitones, grainMs) {
    if (workletOk) {
      const node = remember(new AudioWorkletNode(ctx, 'vfx-pitch', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit'
      }));
      node.parameters.get('semitones').value = semitones;
      node.port.postMessage({ type: 'grain', ms: grainMs || 60 });
      return node;
    }

    // A short modulated delay preserves a distinct cartoonish character on WebViews
    // which cannot load worklets, though it cannot preserve duration while shifting pitch.
    const input = gain(1);
    const modDelay = delay(semitones >= 0 ? 0.012 : 0.026);
    const lfo = oscillator(semitones >= 0 ? 7.5 : 3.5);
    const depth = gain((semitones >= 0 ? 0.003 : 0.007) * Math.min(1, Math.abs(semitones) / 8));
    lfo.connect(depth);
    depth.connect(modDelay.delayTime);
    input.connect(modDelay);
    input._vfxOutput = modDelay;
    return input;
  }

  function outputOf(node) {
    return node._vfxOutput || node;
  }

  function pitchChain(input, semitones) {
    const pitch = pitchNode(semitones);
    input.connect(pitch);
    return outputOf(pitch);
  }

  function ringMod(input, rate, wetAmount) {
    const dry = gain(1 - wetAmount * 0.35);
    const wet = gain(0);
    const mix = gain(0.82);
    const carrier = oscillator(rate);
    const carrierDepth = gain(wetAmount);
    carrier.connect(carrierDepth);
    carrierDepth.connect(wet.gain);
    input.connect(dry);
    input.connect(wet);
    dry.connect(mix);
    wet.connect(mix);
    return { output: mix, carrier: carrier };
  }

  function impulse(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.7);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    return buffer;
  }

  // ─── Preset graph ─────────────────────────────────────────

  function buildPreset(id) {
    const input = gateNode;
    const p = values[id];
    let output;

    if (id === 'none') {
      output = input;
    } else if (id === 'helium') {
      output = pitchChain(input, p.pitch);
    } else if (id === 'deep') {
      output = pitchChain(input, p.pitch);
      const bass = filter('lowshelf', 180, 0.7, p.bass);
      output.connect(bass);
      output = bass;
    } else if (id === 'robot') {
      const ring = ringMod(input, p.rate, 0.92);
      const comb = delay(0.011);
      const feedback = gain(p.comb);
      ring.output.connect(comb);
      comb.connect(feedback);
      feedback.connect(comb);
      const mix = gain(0.78);
      ring.output.connect(mix);
      comb.connect(mix);
      output = mix;
    } else if (id === 'alien') {
      const pitch = pitchNode(workletOk ? 0 : p.vibrato, 45);
      input.connect(pitch);
      if (workletOk) {
        const lfo = oscillator(5.2);
        const depth = gain(p.vibrato);
        lfo.connect(depth);
        depth.connect(pitch.parameters.get('semitones'));
      }
      const shifted = outputOf(pitch);
      const ring = ringMod(shifted, p.rate, 0.72);
      output = ring.output;
    } else if (id === 'radio') {
      const high = filter('highpass', 400, 0.7);
      const low = filter('lowpass', 3000, 0.8);
      const distort = shaper(p.drive, false);
      const mix = gain(0.8);
      connectChain([input, high, low, distort, mix]);
      noiseSource(p.noise, 900).connect(mix);
      output = mix;
    } else if (id === 'megaphone') {
      const high = filter('highpass', 650, 1);
      const low = filter('lowpass', 2600, 1.2);
      const distort = shaper(p.drive, true);
      const slap = delay(p.slap / 1000);
      const slapGain = gain(0.22);
      const mix = gain(0.72);
      connectChain([input, high, low, distort]);
      distort.connect(mix);
      connectChain([distort, slap, slapGain, mix]);
      output = mix;
    } else if (id === 'cave') {
      const convolver = remember(ctx.createConvolver());
      convolver.buffer = impulse(p.size);
      const echo = delay(0.24);
      const feedback = gain(p.echo);
      const dry = gain(1 - p.mix * 0.35);
      const wet = gain(p.mix);
      const mix = gain(0.82);
      input.connect(dry);
      connectChain([input, echo, feedback, echo]);
      echo.connect(convolver);
      convolver.connect(wet);
      dry.connect(mix);
      wet.connect(mix);
      output = mix;
    } else if (id === 'underwater') {
      const low = filter('lowpass', p.cutoff, 1.2);
      const chorus = delay(0.018);
      const chorusGain = gain(0.42);
      const mix = gain(0.88);
      const lfo = oscillator(p.motion);
      const depth = gain(0.006);
      lfo.connect(depth);
      depth.connect(chorus.delayTime);
      input.connect(low);
      low.connect(mix);
      connectChain([low, chorus, chorusGain, mix]);
      output = mix;
    } else if (id === 'demon') {
      const shifted = pitchChain(input, p.pitch);
      const detuned = pitchChain(input, p.pitch + 1.2);
      const distort = shaper(p.drive, false);
      const doubleGain = gain(p.double);
      const mix = gain(0.75);
      shifted.connect(distort);
      distort.connect(mix);
      connectChain([detuned, doubleGain, mix]);
      output = mix;
    } else if (id === 'chipmunk') {
      output = pitchChain(input, p.pitch);
      const presence = filter('peaking', 3400, 0.8, p.presence);
      output.connect(presence);
      output = presence;
    } else if (id === 'whisper') {
      const high = filter('highshelf', 2600, 0.7, p.air);
      const voice = gain(0.48);
      const mix = gain(0.8);
      connectChain([input, high, voice, mix]);
      noiseSource(p.noise, 1800).connect(mix);
      output = mix;
    }

    output.connect(outputBus);
  }

  function clearPreset() {
    if (gateNode) {
      try { gateNode.disconnect(); } catch (error) { /* A detached graph is already clean. */ }
    }
    cleanup.forEach((stop) => stop());
    cleanup = [];
    effectNodes.forEach((node) => {
      try { node.disconnect(); } catch (error) { /* A detached graph is already clean. */ }
    });
    effectNodes = [];
  }

  function rebuild() {
    if (!ctx || !gateNode || !destination) return;
    clearPreset();
    buildPreset(preset);
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async function attach(rawStream, opts) {
    await detach();
    const serial = ++attachSerial;
    if (!rawStream || !rawStream.getAudioTracks || rawStream.getAudioTracks().length === 0) {
      throw new Error('VoiceFX.attach requires a MediaStream with an audio track');
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is not supported');

    const contextOptions = { latencyHint: 'interactive' };
    if (opts && Number.isFinite(Number(opts.sampleRate))) {
      contextOptions.sampleRate = Number(opts.sampleRate);
    }
    ctx = new AudioContextClass(contextOptions);
    destination = ctx.createMediaStreamDestination();
    destination.channelCount = 1;
    outputBus = ctx.createGain();
    outputBus.channelCount = 1;
    outputBus.channelCountMode = 'explicit';
    outputBus.connect(destination);
    sourceNode = ctx.createMediaStreamSource(rawStream);
    sourceNode.channelCount = 1;
    sourceNode.channelCountMode = 'explicit';

    workletOk = false;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        await ctx.audioWorklet.addModule('/js/voicefx-worklet.js');
        workletOk = true;
      } catch (error) {
        console.warn('VoiceFX worklet failed to load; using native-node fallbacks.', error);
        report('Voice effects are running in compatibility mode.');
      }
    } else {
      report('Voice effects are running in compatibility mode.');
    }

    if (serial !== attachSerial || !ctx) throw new Error('VoiceFX attachment was superseded');

    if (workletOk) {
      gateNode = new AudioWorkletNode(ctx, 'vfx-gate', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit'
      });
      gateNode.parameters.get('enabled').value = gateOn ? 1 : 0;
      gateNode.parameters.get('threshold').value = gateThreshold;
    } else {
      gateNode = ctx.createGain();
      gateAnalyser = ctx.createAnalyser();
      gateAnalyser.fftSize = 256;
      const samples = new Float32Array(gateAnalyser.fftSize);
      gateTimer = window.setInterval(() => {
        if (!ctx || !gateAnalyser || !gateNode) return;
        gateAnalyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const db = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-7);
        if (db < gateThreshold) {
          if (!gateQuietSince) gateQuietSince = ctx.currentTime;
        } else {
          gateQuietSince = 0;
        }
        const quiet = gateQuietSince && ctx.currentTime - gateQuietSince > 0.05;
        audioParam(gateNode.gain, gateOn && quiet ? 0.08 : 1, quiet ? 0.005 : 0.12);
      }, 30);
    }
    sourceNode.connect(gateNode);
    if (gateAnalyser) sourceNode.connect(gateAnalyser);
    buildPreset(preset);

    // An AudioContext created after getUserMedia's async gap commonly starts suspended.
    // A short re-check catches WebViews which ignore the first resume until audio is routed.
    // A failed resume must not reject attach() — the caller would then fall back
    // to an unprocessed mic, which is worse than a context that resumes a tick
    // later once the user gesture lands.
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    resumeTimer = window.setInterval(() => {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }, 1000);

    return destination.stream;
  }

  function setSource(rawStream) {
    if (!ctx || !gateNode) throw new Error('VoiceFX is not attached');
    if (!rawStream || !rawStream.getAudioTracks || rawStream.getAudioTracks().length === 0) {
      throw new Error('VoiceFX.setSource requires a MediaStream with an audio track');
    }
    const replacement = ctx.createMediaStreamSource(rawStream);
    replacement.channelCount = 1;
    replacement.channelCountMode = 'explicit';
    replacement.connect(gateNode);
    if (gateAnalyser) replacement.connect(gateAnalyser);
    if (sourceNode) sourceNode.disconnect();
    sourceNode = replacement;
  }

  async function detach() {
    attachSerial++;
    if (resumeTimer !== null) {
      window.clearInterval(resumeTimer);
      resumeTimer = null;
    }
    if (gateTimer !== null) {
      window.clearInterval(gateTimer);
      gateTimer = null;
    }
    monitoring = false;
    if (monitorGain) {
      try { monitorGain.disconnect(); } catch (error) { /* It may be detached already. */ }
      monitorGain = null;
    }
    clearPreset();
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (error) { /* It may be detached already. */ }
    }
    if (gateNode) {
      try { gateNode.disconnect(); } catch (error) { /* It may be detached already. */ }
    }
    const oldContext = ctx;
    ctx = null;
    sourceNode = null;
    gateNode = null;
    gateAnalyser = null;
    gateQuietSince = 0;
    destination = null;
    outputBus = null;
    workletOk = false;
    if (oldContext && oldContext.state !== 'closed') {
      try { await oldContext.close(); } catch (error) { report('Could not close the audio engine.'); }
    }
  }

  // ─── Controls ─────────────────────────────────────────────

  function setPreset(id) {
    if (!presetInfo(id)) {
      report('Unknown voice preset: ' + id);
      return;
    }
    preset = id;
    rebuild();
  }

  function setParam(id, key, value) {
    const next = clampParam(id, key, value);
    if (next === null) {
      report('Unknown voice parameter: ' + id + '.' + key);
      return;
    }
    values[id][key] = next;
    if (preset === id) rebuild();
  }

  function getParams(id) {
    if (!presetInfo(id)) return {};
    return Object.assign({}, values[id]);
  }

  function resetParams(id) {
    const info = presetInfo(id);
    if (!info) return;
    info.params.forEach((param) => {
      values[id][param.key] = param.def;
    });
    if (preset === id) rebuild();
  }

  function setMonitor(on) {
    monitoring = Boolean(on);
    if (!ctx || !outputBus) return;
    if (!monitorGain) {
      monitorGain = ctx.createGain();
      monitorGain.gain.value = 0;
      outputBus.connect(monitorGain);
      monitorGain.connect(ctx.destination);
    }
    // Preview monitoring can feed a phone speaker back into its microphone. The UI keeps
    // it brief; the attenuation and slow fade merely make that risk less abrupt.
    monitorGain.gain.cancelScheduledValues(ctx.currentTime);
    monitorGain.gain.setValueAtTime(monitorGain.gain.value, ctx.currentTime);
    monitorGain.gain.linearRampToValueAtTime(monitoring ? 0.501 : 0, ctx.currentTime + 0.08);
  }

  function setNoiseGate(on, opts) {
    gateOn = Boolean(on);
    if (opts && Number.isFinite(Number(opts.threshold))) {
      gateThreshold = Math.max(-80, Math.min(-10, Number(opts.threshold)));
    }
    if (workletOk && gateNode) {
      audioParam(gateNode.parameters.get('enabled'), gateOn ? 1 : 0);
      audioParam(gateNode.parameters.get('threshold'), gateThreshold);
    }
  }

  const VoiceFX = {
    PRESETS: PRESETS,
    isSupported: () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      return Boolean(AudioContextClass && AudioContextClass.prototype &&
        'audioWorklet' in AudioContextClass.prototype);
    },
    isActive: () => Boolean(ctx && preset !== 'none'),
    attach: attach,
    setSource: setSource,
    detach: detach,
    setPreset: setPreset,
    getPreset: () => preset,
    setParam: setParam,
    getParams: getParams,
    resetParams: resetParams,
    setMonitor: setMonitor,
    isMonitoring: () => monitoring,
    setNoiseGate: setNoiseGate,
    noiseGateOn: () => gateOn,
    onerror: null
  };

  window.VoiceFX = VoiceFX;
}());
