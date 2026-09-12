import { describe, expect, it } from 'vitest'

import { coerceBoolean, isRichPresenceConfigPath, statusLabel } from './ui'

describe('settings diagnostics', () => {
  it('filters config events by the plugin namespace', () => {
    expect(isRichPresenceConfigPath('plugin.rich-presence.discord.clientId')).toBe(true)
    expect(isRichPresenceConfigPath('plugin.rich-presence')).toBe(true)
    expect(isRichPresenceConfigPath('poi.theme')).toBe(false)
    expect(isRichPresenceConfigPath('plugin.rich-presenceful.value')).toBe(false)
  })

  it('coerces only boolean configuration values', () => {
    expect(coerceBoolean(true, false)).toBe(true)
    expect(coerceBoolean(false, true)).toBe(false)
    expect(coerceBoolean('false', true)).toBe(true)
    expect(coerceBoolean(undefined, false)).toBe(false)
  })

  it('uses Japanese status labels', () => {
    expect(statusLabel('closed', '無効')).toBe('無効')
    expect(statusLabel('error', 'Client ID未設定')).toBe('Client ID未設定')
    expect(statusLabel('connecting', null)).toBe('接続中')
    expect(statusLabel('ready', null)).toBe('接続済み')
    expect(statusLabel('retrying', 'pipe error')).toBe('再接続待ち')
    expect(statusLabel('error', 'pipe error')).toBe('エラー')
  })
})
