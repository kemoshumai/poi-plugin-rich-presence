import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageMetadata {
  version: string
  poiPlugin: Record<string, unknown>
}

const readJson = <T,>(filename: string): T => JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8')) as T

describe('package metadata', () => {
  it('keeps package versions aligned without rollback metadata', () => {
    const packageJson = readJson<PackageMetadata>('package.json')
    const packageLock = readJson<{ version: string; packages: { '': { version: string } } }>('package-lock.json')

    expect(packageJson.version).toBe('0.1.2')
    expect(packageLock.version).toBe(packageJson.version)
    expect(packageLock.packages[''].version).toBe(packageJson.version)
    expect(packageJson.poiPlugin).not.toHaveProperty('apiVer')
    expect(packageJson.poiPlugin).not.toHaveProperty('earliestCompatibleMain')
    expect(packageJson.poiPlugin).not.toHaveProperty('lastApiVer')
  })
})
