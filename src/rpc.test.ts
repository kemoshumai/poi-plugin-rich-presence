import { describe, expect, it } from 'vitest'

import { CLOSE, FRAME, PING, PONG, closeErrorInfo, decodeFrames, encodeFrame, isValidClientId, pipeCandidates, pipeNames, responseAction, retryDelay, rpcErrorDisposition, rpcErrorInfo } from './rpc'

describe('Discord RPC frames', () => {
  it('encodes and decodes complete and split frames', () => {
    const first = encodeFrame(FRAME, { evt: 'READY' })
    const second = encodeFrame(FRAME, { evt: 'ERROR', code: 4000 })
    const split = Buffer.concat([first, second])
    const partial = decodeFrames(split.subarray(0, first.length - 2))
    expect(partial.frames).toHaveLength(0)
    expect(partial.remaining).toHaveLength(first.length - 2)
    const decoded = decodeFrames(Buffer.concat([partial.remaining, split.subarray(first.length - 2)]))
    expect(decoded.frames).toHaveLength(2)
    expect(decoded.frames[0].payload.evt).toBe('READY')
    expect(decoded.frames[1].payload.code).toBe(4000)
  })

  it('classifies READY, ERROR, CLOSE and PING/PONG', () => {
    expect(responseAction({ opcode: FRAME, payload: { evt: 'READY' } })).toBe('ready')
    expect(responseAction({ opcode: FRAME, payload: { evt: 'ERROR' } })).toBe('error')
    expect(responseAction({ opcode: CLOSE, payload: {} })).toBe('close')
    expect(rpcErrorInfo({ data: { code: 4004, message: 'Invalid client ID' } })).toEqual({ code: 4004, message: 'Invalid client ID' })
    expect(rpcErrorInfo({ code: 4000, message: 'legacy error' })).toEqual({ code: null, message: 'Discord RPC がエラーを返しました' })
    expect(rpcErrorInfo({ data: { code: 4005, message: 'not executable' } })).toEqual({ code: 4005, message: 'not executable' })
    expect(closeErrorInfo({ code: 4000, message: 'invalid client ID' })).toEqual({ code: 4000, message: 'invalid client ID' })
    expect(rpcErrorDisposition({ opcode: CLOSE, payload: { code: 4002, message: 'rate limited' } })).toMatchObject({ kind: 'close', permanent: false, rateLimited: true, destroySocket: true })
    expect(rpcErrorDisposition({ opcode: FRAME, payload: { evt: 'ERROR', data: { code: 4002, message: 'invalid command' } } })).toMatchObject({ kind: 'frame-error', permanent: false, rateLimited: false, destroySocket: false })
    expect(rpcErrorDisposition({ opcode: CLOSE, payload: { code: 4004, message: 'invalid version' } })).toMatchObject({ kind: 'close', permanent: true })
    expect(responseAction({ opcode: PING, payload: { nonce: 'x' } })).toBe('pong')
    expect(PONG).toBe(4)
  })

  it('enumerates every pipe number without confusing candidate and pipe indexes', () => {
    const candidates = pipeCandidates()
    expect(candidates).toHaveLength(new Set(candidates).size)
    for (let pipeNumber = 0; pipeNumber <= 9; pipeNumber += 1) {
      expect(pipeNames(pipeNumber).some((candidate) => candidate.endsWith(`discord-ipc-${pipeNumber}`))).toBe(true)
    }
    expect(candidates.some((candidate) => candidate.endsWith('discord-ipc-9'))).toBe(true)
    expect(pipeNames(-1)).toEqual([])
    expect(pipeNames(10)).toEqual([])
  })

  it('uses bounded exponential retry delays', () => {
    expect(retryDelay(0)).toBe(1000)
    expect(retryDelay(5)).toBe(30000)
    expect(retryDelay(10)).toBe(30000)
  })

  it('rejects malformed or oversized frames', () => {
    const invalid = Buffer.alloc(8)
    invalid.writeInt32LE(-1, 4)
    expect(decodeFrames(invalid).error).toBeTruthy()
    expect(() => encodeFrame(FRAME, { value: 'x'.repeat(1024 * 1024) })).toThrow()
  })
})

describe('Client ID validation', () => {
  it('accepts Discord snowflake-shaped IDs only', () => {
    expect(isValidClientId('12345678901234567')).toBe(true)
    expect(isValidClientId('not-a-client-id')).toBe(false)
    expect(isValidClientId('123')).toBe(false)
  })
})
