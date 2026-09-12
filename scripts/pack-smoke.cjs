const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const zlib = require('node:zlib')
const path = require('node:path')
const { execFileSync, execSync } = require('node:child_process')
const Module = require('node:module')

const projectDir = path.resolve(__dirname, '..')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poi-rich-presence-pack-'))
const npmArgs = ['pack', '--json', '--pack-destination', tempDir]

try {
  const output = process.platform === 'win32'
    ? execSync(`npm pack --json --pack-destination "${tempDir}"`, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    : execFileSync('npm', npmArgs, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  const metadata = JSON.parse(output)
  const archive = path.join(tempDir, metadata[0].filename)
  const extractDir = path.join(tempDir, 'extracted')
  extractTarGz(archive, extractDir)

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'react') return {}
    if (request === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
    if (request === 'views/create-store') return { getStore: () => ({}), store: { subscribe: () => () => {} } }
    if (request === 'views/env') return { config: { get: () => undefined, set: () => {}, addListener: () => {}, removeListener: () => {} } }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const plugin = require(path.join(extractDir, 'package', 'index.js'))
    assert.equal(typeof plugin.pluginDidLoad, 'function')
    assert.equal(typeof plugin.pluginWillUnload, 'function')
    assert.equal(typeof plugin.settingsClass, 'function')
  } finally {
    Module._load = originalLoad
  }

  process.stdout.write('packed artifact load smoke test passed\n')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

function extractTarGz(archive, destination) {
  const tar = zlib.gunzipSync(fs.readFileSync(archive))
  fs.mkdirSync(destination, { recursive: true })
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString().trim() || '0', 8)
    const type = header[156]
    const fileStart = offset + 512
    if (type === 53) fs.mkdirSync(path.join(destination, name), { recursive: true })
    else if (type === 0 || type === 48) {
      const filePath = path.join(destination, name)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, tar.subarray(fileStart, fileStart + size))
    }
    offset = fileStart + Math.ceil(size / 512) * 512
  }
}
