import { useCallback, useEffect, useRef, useState } from "react";
import type { ComposerVoiceRecording } from "../../types/conversations";

export const voiceMaximumDurationMs = 5 * 60 * 1000;
export const voiceMaximumFileSize = 15 * 1024 * 1024;
export const voiceMinimumDurationMs = 500;

export type VoiceRecorderMode = "idle" | "recording" | "paused" | "review";

const preferredVoiceMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getVoiceExtension(mimeType: string) {
  const baseMimeType = mimeType.toLowerCase().split(";", 1)[0];
  if (baseMimeType === "audio/ogg") return "ogg";
  if (baseMimeType === "audio/mp4") return "m4a";
  return "webm";
}

function getRecorderError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Microphone access was denied. Allow it in your browser’s site settings to record a voice message.";
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return "No microphone was found on this device.";
    if (error.name === "NotReadableError" || error.name === "TrackStartError") return "The microphone is already in use or unavailable.";
  }
  return "The microphone could not be started. Please try again.";
}

function useVoiceRecorder() {
  const [mode, setMode] = useState<VoiceRecorderMode>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recording, setRecording] = useState<ComposerVoiceRecording | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelFrameRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedBeforeSegmentRef = useRef(0);
  const segmentStartedAtRef = useRef(0);
  const isDiscardingRef = useRef(false);
  const hasReachedLimitRef = useRef(false);
  const isMountedRef = useRef(true);
  const recordingRef = useRef<ComposerVoiceRecording | null>(null);
  const isStartingRef = useRef(false);

  const clearTimersAndAnalysis = useCallback(() => {
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
    if (levelFrameRef.current !== null) window.cancelAnimationFrame(levelFrameRef.current);
    levelFrameRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    if (isMountedRef.current) setAudioLevel(0);
  }, []);

  const releaseMicrophone = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    mediaStreamRef.current = null;
    clearTimersAndAnalysis();
  }, [clearTimersAndAnalysis]);

  const revokeReview = useCallback(() => {
    const currentRecording = recordingRef.current;
    if (currentRecording) URL.revokeObjectURL(currentRecording.objectUrl);
    recordingRef.current = null;
    setRecording(null);
  }, []);

  const calculateElapsed = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return elapsedBeforeSegmentRef.current;
    if (recorder.state === "paused") return elapsedBeforeSegmentRef.current;
    return Math.min(voiceMaximumDurationMs, elapsedBeforeSegmentRef.current + Math.max(0, performance.now() - segmentStartedAtRef.current));
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") elapsedBeforeSegmentRef.current = calculateElapsed();
    setElapsedMs(Math.round(elapsedBeforeSegmentRef.current));
    try {
      recorder.stop();
    } catch {
      isDiscardingRef.current = true;
      setError("The recording could not be finalized. Please record again.");
      setMode("idle");
    }
    releaseMicrophone();
  }, [calculateElapsed, releaseMicrophone]);

  const startLevelMonitoring = useCallback((stream: MediaStream) => {
    if (typeof AudioContext === "undefined") return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let lastStateUpdate = 0;
      const measure = (timestamp: number) => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(samples);
        if (timestamp - lastStateUpdate >= 90) {
          let total = 0;
          for (const sample of samples) total += sample;
          setAudioLevel(Math.min(1, total / samples.length / 96));
          lastStateUpdate = timestamp;
        }
        levelFrameRef.current = window.requestAnimationFrame(measure);
      };
      levelFrameRef.current = window.requestAnimationFrame(measure);
    } catch {
      // Recording remains usable without the optional level visualization.
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isStartingRef.current || mediaRecorderRef.current) return false;
    setError("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported by this browser.");
      return false;
    }
    isStartingRef.current = true;

    const selectedMimeType = typeof MediaRecorder.isTypeSupported === "function" ? preferredVoiceMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "" : "";
    revokeReview();
    isDiscardingRef.current = false;
    hasReachedLimitRef.current = false;
    chunksRef.current = [];
    elapsedBeforeSegmentRef.current = 0;
    segmentStartedAtRef.current = 0;
    setElapsedMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      isStartingRef.current = false;
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const recorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);
      const actualMimeType = recorder.mimeType || selectedMimeType;
      const baseMimeType = actualMimeType.toLowerCase().split(";", 1)[0];
      if (!new Set(["audio/webm", "audio/ogg", "audio/mp4"]).has(baseMimeType)) {
        stream.getTracks().forEach((track) => track.stop());
        setError("This browser records an audio format Nemissive cannot securely send yet.");
        return false;
      }

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        isDiscardingRef.current = true;
        releaseMicrophone();
        if (isMountedRef.current) {
          setError("Recording stopped because the microphone encountered an error.");
          setMode("idle");
        }
      };
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        releaseMicrophone();
        if (!isMountedRef.current || isDiscardingRef.current) return;
        const durationMs = Math.min(voiceMaximumDurationMs, Math.round(elapsedBeforeSegmentRef.current));
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        chunksRef.current = [];
        if (durationMs < voiceMinimumDurationMs || blob.size === 0) {
          setError("Record at least half a second before reviewing your voice message.");
          setMode("idle");
          return;
        }
        if (blob.size > voiceMaximumFileSize) {
          setError("The recording is larger than 15 MB. Please record a shorter voice message.");
          setMode("idle");
          return;
        }
        const extension = getVoiceExtension(actualMimeType);
        const file = new File([blob], `voice-message.${extension}`, { type: actualMimeType, lastModified: Date.now() });
        const nextRecording: ComposerVoiceRecording = { localId: createLocalId(), file, objectUrl: URL.createObjectURL(blob), originalName: file.name, mimeType: actualMimeType, size: blob.size, durationMs };
        recordingRef.current = nextRecording;
        setRecording(nextRecording);
        setElapsedMs(durationMs);
        setMode("review");
        if (hasReachedLimitRef.current) setNotice("The five-minute recording limit was reached.");
      };

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (mediaRecorderRef.current?.state !== "inactive") {
            setNotice("The microphone disconnected, so the recording was stopped for review.");
            stopRecording();
          }
        };
      });

      recorder.start(250);
      segmentStartedAtRef.current = performance.now();
      setMode("recording");
      startLevelMonitoring(stream);
      elapsedTimerRef.current = window.setInterval(() => {
        const nextElapsed = calculateElapsed();
        setElapsedMs(Math.round(nextElapsed));
        if (nextElapsed >= voiceMaximumDurationMs && mediaRecorderRef.current?.state !== "inactive") {
          hasReachedLimitRef.current = true;
          stopRecording();
        }
      }, 200);
      return true;
    } catch (recordingError) {
      isStartingRef.current = false;
      releaseMicrophone();
      setMode("idle");
      setError(getRecorderError(recordingError));
      return false;
    }
  }, [calculateElapsed, releaseMicrophone, revokeReview, startLevelMonitoring, stopRecording]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    elapsedBeforeSegmentRef.current = calculateElapsed();
    try {
      recorder.pause();
      setElapsedMs(Math.round(elapsedBeforeSegmentRef.current));
      setMode("paused");
    } catch {
      setError("This browser could not pause the recording.");
    }
  }, [calculateElapsed]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    try {
      recorder.resume();
      segmentStartedAtRef.current = performance.now();
      setMode("recording");
    } catch {
      setError("This browser could not resume the recording.");
    }
  }, []);

  const cancelRecording = useCallback(() => {
    isDiscardingRef.current = true;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Tracks are still released below.
      }
    }
    releaseMicrophone();
    revokeReview();
    chunksRef.current = [];
    elapsedBeforeSegmentRef.current = 0;
    setElapsedMs(0);
    setMode("idle");
    setError("");
    setNotice("");
  }, [releaseMicrophone, revokeReview]);

  const clearReview = useCallback(() => {
    revokeReview();
    setElapsedMs(0);
    setMode("idle");
    setError("");
    setNotice("");
  }, [revokeReview]);

  const rerecord = useCallback(async () => {
    clearReview();
    return startRecording();
  }, [clearReview, startRecording]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isStartingRef.current = false;
      isDiscardingRef.current = true;
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Cleanup continues through the media tracks.
        }
      }
      releaseMicrophone();
      const currentRecording = recordingRef.current;
      if (currentRecording) URL.revokeObjectURL(currentRecording.objectUrl);
      recordingRef.current = null;
    };
  }, [releaseMicrophone]);

  return { mode, elapsedMs, audioLevel, recording, error, notice, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording, clearReview, rerecord };
}

export type VoiceRecorderController = ReturnType<typeof useVoiceRecorder>;

export default useVoiceRecorder;
