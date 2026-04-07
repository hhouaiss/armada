'use client';

import { useState, useRef, useCallback } from 'react';

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking' | 'error';

interface UseVoiceMajorReturn {
  voiceState: VoiceState;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  transcript: string;
  response: string;
  error: string | null;
}

export function useVoiceMajor(onResponse?: (text: string) => void): UseVoiceMajorReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.pitch = 0.95;

    // Prefer a French voice if available
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;

    utterance.onstart = () => setVoiceState('speaking');
    utterance.onend = () => setVoiceState('idle');
    utterance.onerror = () => setVoiceState('idle');

    window.speechSynthesis.speak(utterance);
  }, []);

  const sendAudio = useCallback(async (blob: Blob) => {
    setVoiceState('processing');
    setError(null);

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const res = await fetch('/api/major/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
        }),
      });

      if (!res.ok) throw new Error(`Erreur ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResponse(data.text);
      onResponse?.(data.text);
      speak(data.text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 2000);
    }
  }, [speak, onResponse]);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setResponse('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        sendAudio(blob);
      };

      recorder.start();
      setVoiceState('recording');
    } catch (err) {
      setError('Accès micro refusé');
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 2000);
    }
  }, [sendAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { voiceState, startRecording, stopRecording, transcript, response, error };
}
