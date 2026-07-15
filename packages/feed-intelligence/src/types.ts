export type SignalType = 'hashtag' | 'mention' | 'domain' | 'ngram' | 'engaged_account'

export interface SignalEntry {
  type: SignalType
  value: string
}

export interface PoolSignalRow {
  projectId: string
  signalType: SignalType
  value: string
  count: number
  windowStart: Date
}

export interface FirehoseBaselineRow {
  signalType: SignalType
  value: string
  count: number
  sampleSize: number
  windowStart: Date
}

export interface Suggestion {
  signalType: SignalType
  value: string
  poolCount: number
  poolFrequency: number
  firehoseFrequency: number
  lift: number
  confidence: number
}

export interface IntelligenceConfig {
  /** Master switch — disables all firehose sampling + pool recording. Default true. */
  enabled: boolean
  /** Sample 1-in-N firehose posts. Default 100. */
  sampleRate: number
  /** Minimum times signal must appear in pool. Default 5. */
  minPoolCount: number
  /** Minimum lift ratio to surface. Default 3.0. */
  minLift: number
  /** Rolling window in days. Default 7. */
  windowDays: number
  /** Flush interval in ms. Default 3600000 (1 hour). */
  flushIntervalMs: number
  /** Language for n-gram stop words. Default 'en'. */
  language: string
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  enabled: true,
  sampleRate: 100,
  minPoolCount: 5,
  minLift: 3.0,
  windowDays: 7,
  flushIntervalMs: 3_600_000,
  language: 'en',
}
