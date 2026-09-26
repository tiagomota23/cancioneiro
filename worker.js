// Transcrição no próprio telemóvel com Whisper (deteção automática da língua)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

env.allowLocalModels = false;
const MODEL = 'onnx-community/whisper-base';
let asrPromise = null;

function load() {
  if (!asrPromise) {
    asrPromise = pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: p => {
        if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
      },
    });
    asrPromise.catch(() => { asrPromise = null; });
  }
  return asrPromise;
}

self.onmessage = async e => {
  const { type, audio, id, language } = e.data;
  try {
    if (type === 'load') {
      await load();
      self.postMessage({ type: 'ready' });
    } else if (type === 'transcribe') {
      const asr = await load();
      // sem "language" o Whisper tenta detetar a língua; a app também experimenta línguas concretas
      const opts = { task: 'transcribe', chunk_length_s: 30 };
      if (language) opts.language = language;
      const out = await asr(audio, opts);
      self.postMessage({ type: 'text', id, language, text: (out && out.text) || '' });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
