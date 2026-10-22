/**
 * Barge-in detector, used only while an answer is spoken in hands-free mode
 * (which the user turned on by tapping). It opens the mic with the browser's
 * echo cancellation so our own TTS is suppressed, and fires on ~0.3 s of
 * speech-level energy. Audio is analysed in memory and never recorded,
 * stored, or sent anywhere; the mic is released as soon as it fires or stops.
 */
export async function startBargeIn(onSpeech: () => void): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return () => {};
  }
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let floor = 0.02;
  let run = 0;
  const stop = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  };
  const timer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
    run = isSpeech(rms, floor) ? run + 50 : 0;
    if (!run) floor = floor * 0.95 + rms * 0.05; // track the residual noise floor
    if (run >= 300) { stop(); onSpeech(); }
  }, 50);
  return stop;
}

/** Speech-level energy relative to the tracked noise floor. */
export const isSpeech = (rms: number, floor: number) => rms > Math.max(floor * 3, 0.03);
