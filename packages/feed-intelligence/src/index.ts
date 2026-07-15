export { FeedIntelligence, type FeedIntelligenceOptions } from './intelligence.js'
export { computeSuggestions, buildAlreadyCapturedSet, computeConfidence, type ComputeSuggestionsOptions } from './compute.js'
export { extractSignals } from './extract.js'
export { extractNgrams, extractUnigrams, extractBigrams, extractTrigrams, tokenize } from './ngrams.js'
export { SignalCounter, PoolCounterSet, type CounterSnapshot } from './counters.js'
export {
  ensureIntelligenceTables,
  flushPoolSignals,
  flushFirehoseBaseline,
  loadPoolSignals,
  loadFirehoseBaseline,
  pruneOldSignals,
  getDismissedSignals,
  dismissSignal,
  undismissSignal,
  getIntelligenceSettings,
  saveIntelligenceSettings,
  getProjectIntelligenceDisabled,
  saveProjectIntelligenceDisabled,
} from './storage.js'
export {
  type SignalType,
  type SignalEntry,
  type PoolSignalRow,
  type FirehoseBaselineRow,
  type Suggestion,
  type IntelligenceConfig,
  DEFAULT_INTELLIGENCE_CONFIG,
} from './types.js'
export { getStopWords, isStopWord } from './stop-words/index.js'
export { backfillIntelligence, type BackfillResult } from './backfill.js'
