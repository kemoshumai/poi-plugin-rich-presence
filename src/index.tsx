import React, { useEffect, useState } from 'react'
import { getStore, store } from 'views/create-store'
import { config } from 'views/env'

import { DiscordRpc, isRecord, isValidClientId, type RichActivity, type RpcStatus } from './rpc'
import { coerceBoolean, isRichPresenceConfigPath, statusLabel } from './ui'
import { buildActivity, initialPresenceState, reduceResponse, type PresenceState } from './presence'

const configPath = {
  enabled: 'plugin.rich-presence.discord.enabled',
  clientId: 'plugin.rich-presence.discord.clientId',
  largeImage: 'plugin.rich-presence.discord.largeImage',
  smallImage: 'plugin.rich-presence.discord.smallImage',
  showMap: 'plugin.rich-presence.discord.showMap',
} as const

const legacyConfigPath: Record<string, string> = {
  [configPath.enabled]: 'plugin.rich-presence.enabled',
  [configPath.clientId]: 'plugin.rich-presence.clientId',
  [configPath.largeImage]: 'plugin.rich-presence.largeImage',
  [configPath.smallImage]: 'plugin.rich-presence.smallImage',
  [configPath.showMap]: 'plugin.rich-presence.showMap',
}

const getConfig = <T,>(path: string, defaultValue: T): T => {
  const value = config.get<T | undefined>(path, undefined)
  if (value !== undefined) return value
  const legacyPath = legacyConfigPath[path]
  return legacyPath ? config.get(legacyPath, defaultValue) : defaultValue
}

let current: PresenceState = { ...initialPresenceState }
let sessionStartedAt = 0
let lastRpcStatus: RpcStatus = { state: 'idle', lastError: null }
let rpc: DiscordRpc | null = null
let rpcClientId = ''
let unsubscribeStore: (() => void) | null = null
let responseListener: ((event: Event) => void) | null = null
let configListener: ((changedPath: unknown) => void) | null = null
let updateTimer: ReturnType<typeof setTimeout> | null = null
let lastActivity = ''
let migrationDone = false

const isAssetKey = (value: string): boolean => value === '' || /^[A-Za-z0-9_-]{1,128}$/.test(value)

const statusWithError = (state: RpcStatus['state'], lastError: string | null): void => {
  lastRpcStatus = { state, lastError }
  window.dispatchEvent(new CustomEvent('plugin.rich-presence.rpc-status', { detail: lastRpcStatus }))
}

const getConfigError = (): string | null => {
  const clientId = getText(configPath.clientId)
  if (!clientId) return 'Client ID未設定'
  if (!isValidClientId(clientId)) return 'Client IDは17〜20桁の数字で指定してください'
  for (const [path, label] of [[configPath.largeImage, '大きい画像'], [configPath.smallImage, '小さい画像']] as const) {
    const value = getText(path)
    if (!isAssetKey(value)) return `${label}のasset keyは英数字、_、-を128文字以内で指定してください`
  }
  return null
}

const getText = (path: string, defaultValue = ''): string => {
  const value = getConfig<unknown>(path, defaultValue)
  return typeof value === 'string' ? value.trim() : defaultValue
}

const scheduleUpdate = (): void => {
  if (updateTimer) return
  updateTimer = setTimeout(updatePresence, 500)
}

const readState = (): void => {
  const state: unknown = getStore()
  const sortieStatus = isRecord(state) && isRecord(state.sortie) && Array.isArray(state.sortie.sortieStatus)
    ? state.sortie.sortieStatus
    : []
  const sortie = sortieStatus.some(Boolean)
  const normalSortie = sortie && !current.practice
  current = { ...current, sortie: normalSortie, battle: normalSortie ? current.battle : false, map: normalSortie ? current.map : null }
  scheduleUpdate()
}

const activityForCurrentState = (): RichActivity | null => {
  if (!getConfig(configPath.enabled, true)) return null
  if (getConfigError()) return null
  return buildActivity(current, sessionStartedAt, {
    showMap: getConfig(configPath.showMap, true),
    largeImage: getText(configPath.largeImage),
    smallImage: getText(configPath.smallImage),
  })
}

const updatePresence = (): void => {
  updateTimer = null
  const clientId = getText(configPath.clientId)
  const configError = getConfigError()
  const activity = activityForCurrentState()
  if (!getConfig(configPath.enabled, true)) {
    rpc?.disconnect()
    rpc = null
    rpcClientId = ''
    lastActivity = ''
    statusWithError('closed', '無効')
    return
  }
  if (configError || !clientId || !activity) {
    rpc?.disconnect()
    rpc = null
    rpcClientId = ''
    lastActivity = ''
    statusWithError('error', configError)
    return
  }
  if (!rpc || rpcClientId !== clientId) {
    rpc?.disconnect()
    rpc = new DiscordRpc(clientId, {
      onStatus: (status) => {
        lastRpcStatus = status
        window.dispatchEvent(new CustomEvent('plugin.rich-presence.rpc-status', { detail: status }))
      },
    })
    rpcClientId = clientId
    lastRpcStatus = rpc.getStatus()
    lastActivity = ''
  }
  const serialized = JSON.stringify(activity)
  if (serialized === lastActivity) return
  lastActivity = serialized
  rpc.setActivity(activity)
}

const handleResponse = (event: Event): void => {
  const detail: unknown = (event as CustomEvent<unknown>).detail
  if (!isRecord(detail) || typeof detail.path !== 'string') return
  const path = detail.path
  const body = isRecord(detail.body) ? detail.body : {}
  const postBody = isRecord(detail.postBody) ? detail.postBody : {}
  const wasReset = path === '/kcsapi/api_port/port' || path === '/kcsapi/api_start2/getData'
  current = reduceResponse(current, path, body, postBody)
  if (wasReset) {
    scheduleUpdate()
    return
  }
  readState()
}

export const pluginDidLoad = (): void => {
  if (responseListener) return
  if (!migrationDone) {
    for (const path of Object.keys(configPath)) {
      const currentPath = configPath[path as keyof typeof configPath]
      const legacyPath = legacyConfigPath[currentPath]
      if (config.get(currentPath, undefined) === undefined && legacyPath) {
        const legacyValue = config.get(legacyPath, undefined)
        if (legacyValue !== undefined) config.set(currentPath, legacyValue)
      }
    }
    migrationDone = true
  }
  sessionStartedAt = Date.now()
  responseListener = handleResponse
  window.addEventListener('game.response', responseListener)
  unsubscribeStore = store.subscribe(readState)
  configListener = (changedPath: unknown): void => {
    if (typeof changedPath !== 'string' || !isRichPresenceConfigPath(changedPath)) return
    rpc?.disconnect()
    rpc = null
    rpcClientId = ''
    lastActivity = ''
    scheduleUpdate()
    window.dispatchEvent(new CustomEvent('plugin.rich-presence.config-changed', { detail: changedPath }))
  }
  config.addListener('config.set', configListener)
  readState()
}

export const pluginWillUnload = (): void => {
  if (responseListener) window.removeEventListener('game.response', responseListener)
  if (unsubscribeStore) unsubscribeStore()
  if (configListener) config.removeListener('config.set', configListener)
  if (updateTimer) clearTimeout(updateTimer)
  rpc?.disconnect()
  responseListener = null
  unsubscribeStore = null
  configListener = null
  updateTimer = null
  rpc = null
  rpcClientId = ''
  lastActivity = ''
  lastRpcStatus = { state: 'closed', lastError: null }
  sessionStartedAt = 0
  current = { ...initialPresenceState }
}

const TextSetting = ({ path, label }: { path: string; label: string }): React.ReactElement => {
  const [value, setValue] = useState(getConfig(path, ''))
  useEffect(() => {
    const listener = (): void => setValue(getConfig(path, ''))
    window.addEventListener('plugin.rich-presence.config-changed', listener)
    return () => window.removeEventListener('plugin.rich-presence.config-changed', listener)
  }, [path])
  const invalidClientId = path === configPath.clientId && value.trim() !== '' && !isValidClientId(value.trim())
  const invalidAsset = path !== configPath.clientId && value.trim() !== '' && !isAssetKey(value.trim())
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label}<br />
      <input type="text" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => config.set(path, value.trim())} style={{ width: '100%' }} />
      {invalidClientId && <span style={{ color: 'crimson' }}>Client ID は17〜20桁の数字で入力してください。</span>}
      {invalidAsset && <span style={{ color: 'crimson' }}>asset key は英数字、_、-を128文字以内で入力してください。</span>}
    </label>
  )
}

const Checkbox = ({ path, label, defaultValue }: { path: string; label: string; defaultValue: boolean }): React.ReactElement => {
  const [value, setValue] = useState(coerceBoolean(getConfig<unknown>(path, defaultValue), defaultValue))
  useEffect(() => {
    const listener = (): void => setValue(coerceBoolean(getConfig<unknown>(path, defaultValue), defaultValue))
    window.addEventListener('plugin.rich-presence.config-changed', listener)
    return () => window.removeEventListener('plugin.rich-presence.config-changed', listener)
  }, [defaultValue, path])
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <input type="checkbox" checked={value} onChange={() => { const next = !value; setValue(next); config.set(path, next) }} />{' '}
      {label}
    </label>
  )
}

const RpcDiagnostic = (): React.ReactElement => {
  const [status, setStatus] = useState(lastRpcStatus)
  useEffect(() => {
    const listener = (event: Event): void => {
      const detail: unknown = (event as CustomEvent<unknown>).detail
      if (isRecord(detail) && typeof detail.state === 'string') setStatus(detail as unknown as RpcStatus)
    }
    window.addEventListener('plugin.rich-presence.rpc-status', listener)
    return () => window.removeEventListener('plugin.rich-presence.rpc-status', listener)
  }, [])
  return <p aria-live="polite" style={{ marginTop: 12 }}>{`状態: ${statusLabel(status.state, status.lastError)}`}{status.lastError && !['無効', 'Client ID未設定'].includes(status.lastError) ? `（${status.lastError}）` : ''}</p>
}

export const settingsClass = (): React.ReactElement => (
  <div>
    <Checkbox path={configPath.enabled} label="Discord Rich Presence を有効化" defaultValue={true} />
    <TextSetting path={configPath.clientId} label="Application ID / Client ID（17〜20桁の数字）" />
    <TextSetting path={configPath.largeImage} label="大きい画像の asset key（任意）" />
    <TextSetting path={configPath.smallImage} label="小さい画像の asset key（任意）" />
    <Checkbox path={configPath.showMap} label="海域名を表示する" defaultValue={true} />
    <p style={{ marginTop: 12 }}>Discord Developer Portal の Application 名が Discord 上の表示名になります。このプラグインは details/state に母港・出撃・戦闘・海域を設定します。Discord デスクトップ版が必要です。Client Secret は入力しません。</p>
    <RpcDiagnostic />
  </div>
)
