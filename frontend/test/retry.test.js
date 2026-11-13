// Aufruf: npm test (im Ordner frontend)
import test from 'node:test'
import assert from 'node:assert'
import { withRetry, isTransientError } from '../src/api/retry.js'

const httpError = status => Object.assign(new Error(`HTTP ${status}`), { status })

test('isTransientError: nur 404/502/503/504 und Netzwerkfehler', () => {
  for (const s of [404, 502, 503, 504]) assert.strictEqual(isTransientError(httpError(s)), true)
  for (const s of [400, 401, 403, 500]) assert.strictEqual(isTransientError(httpError(s)), false)
  assert.strictEqual(isTransientError(new TypeError('Failed to fetch')), true)
  assert.strictEqual(isTransientError(Object.assign(new Error('x'), { name: 'AbortError' })), false)
  assert.strictEqual(isTransientError(null), false)
})

test('withRetry: 404 zweimal, dann Erfolg -> liefert Daten', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    calls++
    if (calls <= 2) throw httpError(404)
    return 'daten'
  }, { baseDelayMs: 1 })
  assert.strictEqual(result, 'daten')
  assert.strictEqual(calls, 3)
})

test('withRetry: gibt nach retries auf und wirft den letzten Fehler', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => { calls++; throw httpError(502) }, { retries: 2, baseDelayMs: 1 }),
    /HTTP 502/
  )
  assert.strictEqual(calls, 3)
})

test('withRetry: 401 wird nicht wiederholt', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw httpError(401) }, { baseDelayMs: 1 }))
  assert.strictEqual(calls, 1)
})

test('withRetry: Abbruch während der Wartezeit beendet sofort mit AbortError', async () => {
  const ctrl = new AbortController()
  let calls = 0
  const p = withRetry(async () => { calls++; throw httpError(404) }, { baseDelayMs: 10_000, signal: ctrl.signal })
  setTimeout(() => ctrl.abort(), 5)
  await assert.rejects(p, err => err.name === 'AbortError')
  assert.strictEqual(calls, 1)
})
