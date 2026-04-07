'use client';

import { useState, useRef, useCallback } from 'react';

export type LiveState = 'idle' | 'connecting' | 'ready' | 'recording' | 'speaking' | 'error';

interface UseGeminiLiveOptions {
  onMessage?: (text: string) => void;
  onTranscript?: (text: string) => void;
}

const BRIDGE_URL = 'ws://localhost:18795';

export function useGeminiLive(
  storeId: string | null,
  agentId: string | null,
  { onMessage, onTranscript }: UseGeminiLiveOptions = {}
) {
  const [state, setState] = useState<LiveState>('idle');
  const [transcript, setTranscript] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playQueueRef = useRef<Promise<void>>(Promise.resolve());

  // ── PCM16 24kHz audio playback ───────────────────────────────────────
  const playAudioTurn = useCallback((chunks: string[]) => {
    playQueueRef.current = playQueueRef.current.then(async () => {
      setState('speaking');
      try {
        const parts = chunks.map(b64 => {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr;
        });
        const total = parts.reduce((s, p) => s + p.length, 0);
        const buf = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { buf.set(p, off); off += p.length; }

        const pcm16 = new Int16Array(buf.buffer);
        const f32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) f32[i] = pcm16[i] / 32768;

        const ctx = new AudioContext({ sampleRate: 24000 });
        const audioBuf = ctx.createBuffer(1, f32.length, 24000);
        audioBuf.getChannelData(0).set(f32);

        await new Promise<void>(resolve => {
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          src.onended = () => { ctx.close(); resolve(); };
          src.start();
        });
      } catch (e) {
        console.error('[GeminiLive] playback error', e);
      } finally {
        setState('ready');
      }
    });
  }, []);

  // ── Connect to bridge ────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!storeId || !agentId) {
      console.warn('[GeminiLive] connect() called without storeId/agentId');
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('[GeminiLive] connecting to bridge...');
    setState('connecting');

    const ws = new WebSocket(BRIDGE_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[GeminiLive] bridge WS open, sending init');
      ws.send(JSON.stringify({ type: 'init', storeId, agentId }));
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }

      console.log('[GeminiLive] ←', msg.type, msg.text || '');

      if (msg.type === 'ready') setState('ready');
      if (msg.type === 'audio_turn') playAudioTurn(msg.chunks);
      if (msg.type === 'transcript') { setTranscript(msg.text); onTranscript?.(msg.text); }
      if (msg.type === 'response_text' && msg.text) onMessage?.(msg.text);
      if (msg.type === 'disconnected') setState('idle');
      if (msg.type === 'error') {
        console.error('[GeminiLive] bridge error:', msg.message);
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      }
    };

    ws.onclose = (ev) => {
      console.log('[GeminiLive] bridge WS closed', ev.code, ev.reason);
      setState('idle');
    };
    ws.onerror = (ev) => {
      console.error('[GeminiLive] bridge WS error', ev);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    };
  }, [storeId, agentId, playAudioTurn, onMessage, onTranscript]);

  // ── Start mic recording ──────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[GeminiLive] startRecording: WS not open');
      return;
    }

    try {
      // Don't force sampleRate in getUserMedia — let browser use native rate
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Use device native sample rate — we'll resample to 16kHz manually
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const nativeRate = audioCtx.sampleRate; // typically 44100 or 48000
      console.log('[GeminiLive] AudioContext sampleRate:', nativeRate);

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const float32 = e.inputBuffer.getChannelData(0);

        // Resample nativeRate → 16000 (linear interpolation)
        const ratio = nativeRate / 16000;
        const outLen = Math.floor(float32.length / ratio);
        const resampled = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const srcIdx = i * ratio;
          const lo = Math.floor(srcIdx);
          const hi = Math.min(lo + 1, float32.length - 1);
          const t = srcIdx - lo;
          resampled[i] = float32[lo] * (1 - t) + float32[hi] * t;
        }

        // Float32 → PCM16
        const pcm16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, resampled[i] * 32768));
        }

        // Chunked base64 encode
        const bytes = new Uint8Array(pcm16.buffer);
        let b64 = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          b64 += btoa(String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192))));
        }

        ws.send(JSON.stringify({ type: 'audio', data: b64 }));
      };

      source.connect(processor);
      // Must connect to destination for ScriptProcessorNode to fire in Chrome
      // Use gain=0 to avoid mic playback/echo
      const silencer = audioCtx.createGain();
      silencer.gain.value = 0;
      processor.connect(silencer);
      silencer.connect(audioCtx.destination);

      setState('recording');
      console.log('[GeminiLive] recording started');
    } catch (err) {
      console.error('[GeminiLive] mic error:', err);
      setState('error');
      setTimeout(() => setState('ready'), 2000);
    }
  }, []);

  // ── Stop mic ─────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setState('ready');
    console.log('[GeminiLive] recording stopped');
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    stopRecording();
    wsRef.current?.close();
    wsRef.current = null;
    setState('idle');
  }, [stopRecording]);

  return { state, transcript, connect, startRecording, stopRecording, disconnect };
}
