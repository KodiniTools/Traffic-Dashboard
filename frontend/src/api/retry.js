// Wiederholung für vorübergehende API-Fehler.
//
// Hintergrund: Beim Wechsel auf grosse Zeiträume (14/30 Tage) war das Backend
// kurzzeitig nicht erreichbar (Neustart durch PM2). Der Reverse-Proxy liefert
// dann statt der Daten einen Fehlerstatus (beobachtet: 404, sonst 502/503/504).
// Diese Stati werden hier kurz wiederholt, statt sofort die Fehlerseite zu zeigen.

/** HTTP-Stati, die als vorübergehend gelten und wiederholt werden. */
export const TRANSIENT_STATUSES = new Set([404, 502, 503, 504])

/**
 * Ist der Fehler vorübergehend (Wiederholung sinnvoll)?
 * - Abbruch (AbortError) und 401 nie.
 * - Netzwerkfehler (fetch wirft TypeError) und TRANSIENT_STATUSES ja.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientError(err) {
  if (!err || typeof err !== 'object') return false
  if (err.name === 'AbortError') return false
  if (typeof err.status === 'number') return TRANSIENT_STATUSES.has(err.status)
  return err instanceof TypeError
}

/** Wartet ms Millisekunden; bricht mit AbortError ab, wenn signal abgebrochen wird. */
export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError() {
  const err = new Error('Aborted')
  err.name = 'AbortError'
  return err
}

/**
 * Führt fn aus und wiederholt bei vorübergehenden Fehlern.
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{ retries?: number, baseDelayMs?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { retries = 3, baseDelayMs = 1000, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      if (attempt >= retries || signal?.aborted || !isTransientError(err)) throw err
      await delay(baseDelayMs * (attempt + 1), signal)
    }
  }
}
