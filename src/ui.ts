import type { RpcState } from './rpc'

export const isRichPresenceConfigPath = (path: string): boolean =>
  path === 'plugin.rich-presence' || path.startsWith('plugin.rich-presence.')

export const coerceBoolean = (value: unknown, defaultValue: boolean): boolean =>
  typeof value === 'boolean' ? value : defaultValue

export const statusLabel = (state: RpcState, lastError: string | null): string => {
  if (lastError === '無効') return '無効'
  if (lastError === 'Client ID未設定') return 'Client ID未設定'
  if (state === 'connecting') return '接続中'
  if (state === 'ready') return '接続済み'
  if (state === 'retrying') return '再接続待ち'
  if (state === 'error') return 'エラー'
  return '未接続'
}
