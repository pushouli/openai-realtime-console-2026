/**
 * Frequency analysis for the two waveform canvases.
 *
 * The original console read levels out of wavtools, which the WebRTC build no
 * longer uses. Here the levels come straight off the MediaStreams: the
 * microphone track going out, and the track arriving on pc.ontrack.
 *
 * The remote stream also has to be attached to an <audio> element - a browser
 * will not pump a remote track that nothing is playing, and the analyser would
 * read silence.
 */

let audioContext = null;

/** One shared context. Browsers cap how many a page may open. */
export function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Autoplay policy leaves it suspended until a user gesture; starting a call
  // is one.
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

export function createAnalyser(mediaStream) {
  const context = getAudioContext();
  const source = context.createMediaStreamSource(mediaStream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  return {
    analyser,
    source,
    dataArray: new Uint8Array(analyser.frequencyBinCount),
  };
}

/** Let the context idle between calls rather than keeping the tap open. */
export function suspendAudioContext() {
  if (audioContext && audioContext.state === "running") {
    audioContext.suspend();
  }
}

export function disconnectAnalyser(entry) {
  if (!entry) return;
  try {
    entry.source.disconnect();
    entry.analyser.disconnect();
  } catch {
    // Already torn down with the stream - nothing to do.
  }
}

/** Draw one frame of spectrum bars. Returns the peak level, 0-1. */
export function drawSpectrum(canvas, entry, color) {
  if (!canvas) return 0;

  // The canvas is sized by CSS; match its backing store once it has a layout.
  if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!entry) return 0;

  const { analyser, dataArray } = entry;
  analyser.getByteFrequencyData(dataArray);

  const bufferLength = analyser.frequencyBinCount;
  const barWidth = (canvas.width / bufferLength) * 2.5;
  let x = 0;
  let peak = 0;

  ctx.fillStyle = color;
  for (let i = 0; i < bufferLength; i++) {
    const value = dataArray[i];
    if (value > peak) peak = value;

    const barHeight = value / 2;
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  }

  return peak / 255;
}
