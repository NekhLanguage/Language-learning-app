// audioEngine.js
// Centralized TTS handler – UI reads only

export function speak(item) {
  if (!item?.listenable) return;

  if (!item?.tts?.lang) {
    console.warn("TTS requested but no language set:", item);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(item.text);
  utterance.lang = item.tts.lang;
  utterance.rate = 0.9; // learner-friendly pace
  utterance.pitch = 1.0;

  speechSynthesis.cancel(); // prevents overlap
  speechSynthesis.speak(utterance);
}
