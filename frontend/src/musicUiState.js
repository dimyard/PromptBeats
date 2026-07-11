const STEPS_PER_BAR = 16;

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clampStep(value, totalSteps) {
  if (totalSteps <= 0) return 0;
  return Math.min(totalSteps - 1, Math.max(0, Math.floor(Number(value) || 0)));
}

function normalizeError(errorState) {
  if (!errorState) return undefined;
  if (typeof errorState === "string") {
    return {
      scope: "backend",
      message: errorState,
      recoverable: true,
    };
  }
  return {
    scope: errorState.scope ?? "backend",
    message: errorState.message ?? "Ошибка",
    path: errorState.path,
    recoverable: errorState.recoverable !== false,
  };
}

function eventIsActive(event, currentStep) {
  const step = Number(event?.step);
  if (!Number.isInteger(step)) return false;
  const dur = Math.max(1, Math.floor(Number(event?.dur) || 1));
  return currentStep >= step && currentStep < step + dur;
}

function eventEnergy(event) {
  return clamp01(event?.vel ?? 0.8);
}

function valueByTrack(map, trackId) {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(trackId);
  return map[trackId];
}

export function deriveMusicUiState(currentSong, playerState = {}, uiState = {}) {
  const safeSong = currentSong && typeof currentSong === "object" ? currentSong : null;
  const bars = clamp(Math.round(safeSong?.bars ?? 1), 1, 32);
  const bpm = clamp(Math.round(safeSong?.bpm ?? 75), 40, 220);
  const totalSteps = bars * STEPS_PER_BAR;
  const currentStep = clampStep(playerState.currentStep ?? uiState.currentStep ?? 0, totalSteps);
  const currentStepProgress = clamp01(playerState.currentStepProgress ?? uiState.currentStepProgress ?? 0);
  const error = normalizeError(uiState.errorState ?? playerState.errorState);
  const generationState =
    uiState.generationState ?? playerState.generationState ?? (error ? "error" : playerState.isGenerating ? "generating" : "idle");

  const tracks = (safeSong?.tracks ?? []).map((track) => {
    const gain = clamp01(track.gain ?? 0.8);
    const muted = Boolean(track.muted);
    const activeEvents = (track.events ?? []).filter((event) => eventIsActive(event, currentStep));
    const naturalMeter = activeEvents.length
      ? clamp01((activeEvents.reduce((sum, event) => sum + eventEnergy(event), 0) / activeEvents.length) * gain)
      : 0;
    const meterOverride = valueByTrack(uiState.meterLevelByTrack ?? playerState.meterLevelByTrack, track.id);
    const peakOverride = valueByTrack(uiState.peakLevelByTrack ?? playerState.peakLevelByTrack, track.id);
    const meterLevel = muted ? 0 : clamp01(meterOverride ?? (playerState.isPlaying ? naturalMeter : 0));
    const peakLevel = muted ? 0 : clamp01(peakOverride ?? Math.max(meterLevel, naturalMeter));

    return {
      trackId: track.id,
      role: track.role,
      muted,
      gain,
      meterLevel,
      peakLevel,
      activeEventSteps: [...new Set(activeEvents.map((event) => event.step))],
    };
  });

  return {
    playback: {
      isPlaying: Boolean(playerState.isPlaying),
      isLooping: playerState.isLooping !== false,
      bpm,
      bars,
      stepsPerBar: STEPS_PER_BAR,
      totalSteps,
      currentStep,
      currentBar: Math.floor(currentStep / STEPS_PER_BAR),
      currentBeatInBar: Math.floor((currentStep % STEPS_PER_BAR) / 4),
      currentStepProgress,
    },
    tracks,
    mutedTracks: tracks.filter((track) => track.muted).map((track) => track.trackId),
    selectedTrackId: uiState.selectedTrackId,
    selectedEventStep: uiState.selectedEventStep,
    generationState,
    error,
    errorState: error,
  };
}
