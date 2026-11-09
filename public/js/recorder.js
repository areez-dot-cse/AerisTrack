// Voice notes with MediaRecorder: Opus in WebM where supported, otherwise
// whatever the browser offers. Hard stop at 60 seconds.
export const MAX_SECONDS = 60;

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) ?? '';
}

export function isRecordingSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

// Returns { stop } ; onTick(seconds) runs every second, onDone(blob) when finished.
export async function startRecording({ onTick, onDone }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  let seconds = 0;
  const ticker = setInterval(() => {
    seconds += 1;
    onTick(seconds);
    if (seconds >= MAX_SECONDS) stop();
  }, 1000);

  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  recorder.onstop = () => {
    clearInterval(ticker);
    stream.getTracks().forEach((track) => track.stop());
    onDone(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
  };
  recorder.start();

  function stop() {
    if (recorder.state !== 'inactive') recorder.stop();
  }
  return { stop };
}
