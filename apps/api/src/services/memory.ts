import v8 from 'node:v8'
import { env } from '../env'
import { logger } from './logger'

type MemorySnapshot = {
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  externalMb: number
  arrayBuffersMb: number
  heapLimitMb: number
  peakRssMb: number
  uptimeSec: number
}

let interval: NodeJS.Timeout | null = null
let peakRssMb = 0

function toMb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

export function getMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage()
  const heap = v8.getHeapStatistics()
  const rssMb = toMb(usage.rss)
  peakRssMb = Math.max(peakRssMb, rssMb)

  return {
    rssMb,
    heapUsedMb: toMb(usage.heapUsed),
    heapTotalMb: toMb(usage.heapTotal),
    externalMb: toMb(usage.external),
    arrayBuffersMb: toMb(usage.arrayBuffers),
    heapLimitMb: toMb(heap.heap_size_limit),
    peakRssMb,
    uptimeSec: Math.round(process.uptime()),
  }
}

function logMemorySnapshot(reason: 'startup' | 'interval' | 'shutdown') {
  const snapshot = getMemorySnapshot()
  const log = snapshot.rssMb >= env.memoryWarnRssMb ? logger.warn.bind(logger) : logger.info.bind(logger)
  log({ reason, memory: snapshot }, 'Process memory snapshot')
}

export function startMemoryMonitoring() {
  if (!env.memoryLogEnabled || interval) return

  logMemorySnapshot('startup')
  interval = setInterval(() => {
    logMemorySnapshot('interval')
  }, env.memoryLogIntervalMs)
  interval.unref?.()
}

export function stopMemoryMonitoring() {
  if (interval) {
    clearInterval(interval)
    interval = null
  }

  if (env.memoryLogEnabled) {
    logMemorySnapshot('shutdown')
  }
}
