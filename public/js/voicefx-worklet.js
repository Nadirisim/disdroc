'use strict';

class VfxPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'semitones',
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automationRate: 'k-rate'
    }];
  }

  constructor() {
    super();
    this.buffer = new Float32Array(Math.ceil(sampleRate * 0.12));
    this.writeIndex = 0;
    this.phase = 0;
    this.grainSamples = Math.round(sampleRate * 0.06);
    this.port.onmessage = (event) => {
      if (!event.data || event.data.type !== 'grain') return;
      const ms = Math.max(20, Math.min(90, Number(event.data.ms) || 60));
      this.grainSamples = Math.round(sampleRate * ms / 1000);
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const source = input[0];
    const target = output[0];
    if (!target) return true;

    const ratio = Math.pow(2, parameters.semitones[0] / 12);
    const grain = this.grainSamples;
    const length = this.buffer.length;
    const phaseStep = (1 - ratio) / grain;

    for (let i = 0; i < target.length; i++) {
      const sample = source ? source[i] || 0 : 0;
      this.buffer[this.writeIndex] = sample;

      let phaseA = this.phase;
      let phaseB = phaseA + 0.5;
      if (phaseB >= 1) phaseB -= 1;

      // The half-cycle Hann pair sums to one. Each read-head discontinuity therefore
      // occurs at its zero crossing while the other head carries the full signal.
      const windowA = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseA);
      const windowB = 1 - windowA;
      const delayA = 2 + phaseA * grain;
      const delayB = 2 + phaseB * grain;
      target[i] = this.read(delayA, length) * windowA +
        this.read(delayB, length) * windowB;

      this.writeIndex++;
      if (this.writeIndex === length) this.writeIndex = 0;
      this.phase += phaseStep;
      this.phase -= Math.floor(this.phase);
    }

    for (let channel = 1; channel < output.length; channel++) {
      output[channel].set(target);
    }
    return true;
  }

  read(delay, length) {
    let position = this.writeIndex - delay;
    while (position < 0) position += length;
    const first = Math.floor(position);
    const next = first + 1 === length ? 0 : first + 1;
    const mix = position - first;
    return this.buffer[first] + (this.buffer[next] - this.buffer[first]) * mix;
  }
}

class VfxGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'threshold',
        defaultValue: -50,
        minValue: -80,
        maxValue: -10,
        automationRate: 'k-rate'
      },
      {
        name: 'enabled',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
    this.gain = 1;
    this.belowSamples = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const source = input[0];
    const target = output[0];
    if (!target) return true;

    const enabled = parameters.enabled[0] >= 0.5;
    const threshold = Math.pow(10, parameters.threshold[0] / 20);
    const envelopeRelease = Math.exp(-1 / (sampleRate * 0.03));
    // Open fast, close slow. A gate that opens slowly eats the attack of every
    // word — you hear "…ello" instead of "hello" — while a gate that closes fast
    // chops the tail off and pumps between syllables.
    const openStep = 1 - Math.exp(-1 / (sampleRate * 0.005));
    const closeStep = 1 - Math.exp(-1 / (sampleRate * 0.12));
    const holdSamples = sampleRate * 0.05;

    for (let i = 0; i < target.length; i++) {
      const sample = source ? source[i] || 0 : 0;
      const level = Math.abs(sample);
      this.envelope = level > this.envelope ?
        level : level + (this.envelope - level) * envelopeRelease;

      if (this.envelope < threshold) {
        this.belowSamples++;
      } else {
        this.belowSamples = 0;
      }

      const wanted = enabled && this.belowSamples > holdSamples ? 0.08 : 1;
      const step = wanted < this.gain ? closeStep : openStep;
      this.gain += (wanted - this.gain) * step;
      target[i] = sample * (enabled ? this.gain : 1);
    }

    for (let channel = 1; channel < output.length; channel++) {
      output[channel].set(target);
    }
    return true;
  }
}

registerProcessor('vfx-pitch', VfxPitchProcessor);
registerProcessor('vfx-gate', VfxGateProcessor);
