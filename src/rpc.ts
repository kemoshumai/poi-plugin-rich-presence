import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

export interface RichActivity {
  type: 0
  name: string
  details?: string
  state?: string
  timestamps?: { start?: number; end?: number }
  assets?: {
    large_image?: string
    large_text?: string
    small_image?: string
    small_text?: string
  }
  instance?: boolean
}

type RpcPayload = Record<string, unknown>
export type RpcFrame = { opcode: number; payload: RpcPayload }
export type RpcState = 'idle' | 'connecting' | 'ready' | 'retrying' | 'error' | 'closed'

export interface RpcStatus {
  state: RpcState
  lastError: string | null
}

export interface DiscordRpcOptions {
  onStatus?: (status: RpcStatus) => void
}

export const HANDSHAKE = 0
export const FRAME = 1
export const CLOSE = 2
export const PING = 3
export const PONG = 4
export const MAX_FRAME_SIZE = 1024 * 1024
export const MAX_RECEIVE_BUFFER_SIZE = MAX_FRAME_SIZE + 8

export const retryDelay = (attempt: number): number => Math.min(30000, 1000 * 2 ** Math.min(Math.max(attempt, 0), 5))

const closePermanentCodes = new Set([4000, 4001, 4003, 4004, 4005])
const closeRateLimitCode = 4002

export interface RpcErrorInfo {
  code: number | null
  message: string
}

/** Information from an RPC FRAME/ERROR event. Its code is in payload.data. */
export const rpcErrorInfo = (payload: RpcPayload): RpcErrorInfo => {
  const data = isRecord(payload.data) ? payload.data : {}
  const code = typeof data.code === 'number' ? data.code : null
  const message = typeof data.message === 'string' && data.message.trim()
    ? data.message
    : 'Discord RPC がエラーを返しました'
  return { code, message }
}

/** Information from an RPC CLOSE frame. CLOSE codes are not command error codes. */
export const closeErrorInfo = (payload: RpcPayload): RpcErrorInfo => {
  const code = typeof payload.code === 'number' ? payload.code : null
  const message = typeof payload.message === 'string' && payload.message.trim()
    ? payload.message
    : 'Discord RPC 接続が閉じられました'
  return { code, message }
}

export interface RpcErrorDisposition {
  kind: 'close' | 'frame-error'
  info: RpcErrorInfo
  permanent: boolean
  rateLimited: boolean
  destroySocket: boolean
}

/** Classify CLOSE and FRAME/ERROR independently because their code spaces overlap. */
export const rpcErrorDisposition = (frame: RpcFrame): RpcErrorDisposition | null => {
  if (frame.opcode === CLOSE) {
    const info = closeErrorInfo(frame.payload)
    return {
      kind: 'close',
      info,
      permanent: info.code !== null && closePermanentCodes.has(info.code),
      rateLimited: info.code === closeRateLimitCode,
      destroySocket: true,
    }
  }
  if (frame.opcode === FRAME && frame.payload.evt === 'ERROR') {
    return {
      kind: 'frame-error',
      info: rpcErrorInfo(frame.payload),
      permanent: false,
      rateLimited: false,
      destroySocket: false,
    }
  }
  return null
}

const formatRpcError = ({ code, message }: RpcErrorInfo): string => `${message}${code === null ? '' : ` (${code})`}`

export const isValidClientId = (clientId: string): boolean => /^\d{17,20}$/.test(clientId)

/** Candidate socket paths for one Discord IPC pipe number. */
export const pipeNames = (pipeNumber: number): string[] => {
  if (!Number.isInteger(pipeNumber) || pipeNumber < 0 || pipeNumber > 9) return []
  const suffix = `discord-ipc-${pipeNumber}`
  if (process.platform === 'win32') return [`\\\\?\\pipe\\${suffix}`]

  const directories = [
    process.env.XDG_RUNTIME_DIR,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    os.tmpdir(),
    '/tmp',
  ].filter((directory): directory is string => Boolean(directory))
  return [...new Set(directories.map((directory) => path.join(directory, suffix)))]
}

/** All supported pipe paths in pipe-number order, from discord-ipc-0 through -9. */
export const pipeCandidates = (): string[] => Array.from({ length: 10 }, (_, pipeNumber) => pipeNames(pipeNumber)).flat()

export const encodeFrame = (opcode: number, payload: RpcPayload): Buffer => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  if (body.length > MAX_FRAME_SIZE) throw new Error('Discord RPC frame is too large')
  const frame = Buffer.allocUnsafe(8 + body.length)
  frame.writeInt32LE(opcode, 0)
  frame.writeInt32LE(body.length, 4)
  body.copy(frame, 8)
  return frame
}

/** Decode complete frames while retaining a partial trailing frame. */
export const decodeFrames = (buffer: Buffer): { frames: RpcFrame[]; remaining: Buffer; error?: string } => {
  const frames: RpcFrame[] = []
  let offset = 0
  while (buffer.length - offset >= 8) {
    const opcode = buffer.readInt32LE(offset)
    const length = buffer.readInt32LE(offset + 4)
    if (length < 0 || length > MAX_FRAME_SIZE) return { frames, remaining: Buffer.alloc(0), error: 'Invalid Discord RPC frame length' }
    if (buffer.length - offset < 8 + length) break
    const body = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8')
    try {
      const payload: unknown = JSON.parse(body)
      if (!isRecord(payload)) return { frames, remaining: Buffer.alloc(0), error: 'Discord RPC payload must be an object' }
      frames.push({ opcode, payload })
    } catch {
      return { frames, remaining: Buffer.alloc(0), error: 'Invalid Discord RPC JSON payload' }
    }
    offset += 8 + length
  }
  return { frames, remaining: buffer.subarray(offset) }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const responseAction = (frame: RpcFrame): 'pong' | 'ready' | 'close' | 'error' | 'ignore' => {
  if (frame.opcode === PING) return 'pong'
  if (frame.opcode === CLOSE) return 'close'
  if (frame.opcode !== FRAME) return 'ignore'
  if (frame.payload.evt === 'READY') return 'ready'
  if (frame.payload.evt === 'ERROR') return 'error'
  return 'ignore'
}

export class DiscordRpc {
  private readonly clientId: string
  private readonly onStatus?: (status: RpcStatus) => void
  private socket: net.Socket | null = null
  private receiveBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private connecting = false
  private ready = false
  private closed = false
  private permanentFailure = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempt = 0
  private pipeCandidateIndex = 0
  private pendingActivity: RichActivity | null = null
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private retryAfter = 0
  private status: RpcStatus = { state: 'idle', lastError: null }

  constructor(clientId: string, options: DiscordRpcOptions = {}) {
    this.clientId = clientId
    this.onStatus = options.onStatus
    if (!isValidClientId(clientId)) this.setError('Client ID は17〜20桁の数字で指定してください', true)
  }

  getStatus(): RpcStatus {
    return { ...this.status }
  }

  setActivity(activity: RichActivity | null): void {
    this.pendingActivity = activity
    if (!activity) {
      if (this.ready) this.sendActivity(null)
      return
    }
    if (this.closed || this.permanentFailure || !isValidClientId(this.clientId)) return
    if (this.ready) {
      this.sendActivity(activity)
      return
    }
    this.connect()
  }

  disconnect(): void {
    this.closed = true
    this.pendingActivity = null
    this.clearTimers()
    this.ready = false
    this.connecting = false
    const socket = this.socket
    this.socket = null
    socket?.destroy()
    this.setStatus('closed', null)
  }

  private connect(): void {
    if (this.closed || this.permanentFailure || this.ready || this.connecting || this.retryTimer) return
    this.connecting = true
    this.pipeCandidateIndex = 0
    this.setStatus('connecting', this.status.lastError)
    this.tryPipe()
  }

  private tryPipe(): void {
    if (this.closed || this.permanentFailure) return
    const candidates = pipeCandidates()
    if (this.pipeCandidateIndex >= candidates.length) {
      this.connecting = false
      this.scheduleRetry()
      return
    }
    const candidate = candidates[this.pipeCandidateIndex]
    this.pipeCandidateIndex += 1
    const socket = net.createConnection(candidate)
    let connected = false
    let advanced = false
    this.socket = socket
    socket.setNoDelay(true)
    socket.on('connect', () => {
      connected = true
      this.ready = false
      this.receiveBuffer = Buffer.alloc(0)
      this.write(HANDSHAKE, { v: 1, client_id: this.clientId })
      this.handshakeTimer = setTimeout(() => {
        if (this.socket === socket && !this.ready) socket.destroy()
      }, 5000)
    })
    socket.on('data', (chunk: Buffer) => {
      if (this.socket === socket) this.handleData(socket, chunk)
    })
    socket.on('error', (error: Error) => {
      if (!connected && !advanced) {
        advanced = true
        this.setError(`Discord IPC に接続できません: ${error.message || '候補パスが利用できません'}`)
        if (this.socket === socket) this.socket = null
        socket.destroy()
        this.tryPipe()
      } else if (connected) {
        this.setError(error.message || 'Discord IPC socket error')
        socket.destroy()
      }
    })
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.clearHandshakeTimer()
      this.ready = false
      this.connecting = false
      if (!this.closed && !this.permanentFailure && this.pendingActivity) this.scheduleRetry()
    })
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.closed || this.permanentFailure || !this.pendingActivity) return
    const delay = Math.max(retryDelay(this.retryAttempt), Math.max(0, this.retryAfter - Date.now()))
    this.retryAttempt += 1
    this.setStatus('retrying', this.status.lastError)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
  }

  private handleData(socket: net.Socket, chunk: Buffer): void {
    if (this.socket !== socket) return
    if (this.receiveBuffer.length + chunk.length > MAX_RECEIVE_BUFFER_SIZE) {
      this.setError('Discord RPC 受信バッファが上限を超えました', true)
      socket.destroy()
      return
    }
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk])
    const decoded = decodeFrames(this.receiveBuffer)
    this.receiveBuffer = decoded.remaining as Buffer
    if (decoded.error) {
      this.setError(decoded.error, true)
      socket.destroy()
      return
    }
    for (const frame of decoded.frames) {
      const action = responseAction(frame)
      if (action === 'pong') this.write(PONG, frame.payload)
      else if (action === 'close' || action === 'error') {
        const disposition = rpcErrorDisposition(frame)
        if (!disposition) continue
        this.setError(formatRpcError(disposition.info), disposition.permanent)
        this.retryAfter = disposition.rateLimited ? Date.now() + 60000 : 0
        if (disposition.destroySocket) {
          socket.destroy()
          break
        }
      } else if (action === 'ready') {
        this.clearHandshakeTimer()
        this.ready = true
        this.connecting = false
        this.retryAttempt = 0
        this.retryAfter = 0
        this.setStatus('ready', null)
        if (this.pendingActivity) this.sendActivity(this.pendingActivity)
      }
    }
  }

  private sendActivity(activity: RichActivity | null): void {
    this.write(FRAME, {
      cmd: 'SET_ACTIVITY',
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      args: { pid: process.pid, activity },
    })
  }

  private write(opcode: number, payload: RpcPayload): void {
    try {
      if (this.socket) this.socket.write(encodeFrame(opcode, payload))
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Discord RPC 送信エラー')
      this.socket?.destroy()
    }
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer)
    this.handshakeTimer = null
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.clearHandshakeTimer()
  }

  private setError(message: string, permanent = false): void {
    this.permanentFailure ||= permanent
    this.setStatus('error', message)
  }

  private setStatus(state: RpcState, lastError: string | null): void {
    this.status = { state, lastError }
    this.onStatus?.(this.getStatus())
  }
}
