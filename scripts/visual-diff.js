#!/usr/bin/env node
// Pixel-compares Maestro screenshots against docs/release-1.0/visual-baseline (LOOP.md §8).
// Usage: node scripts/visual-diff.js <baseline-dir> <new-dir> [skipTopRows=160]
// skipTopRows ignores the iOS status bar (clock, battery). pngjs ships with expo's deps.
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const [baseDir, newDir, skipTopArg] = process.argv.slice(2)
if (!baseDir || !newDir) {
  console.error('usage: visual-diff.js <baseline-dir> <new-dir> [skipTopRows]')
  process.exit(2)
}
const skipTop = Number(skipTopArg ?? 160)
const THRESHOLD = 30 // summed RGB delta that counts as a changed pixel
let worst = 0

for (const name of fs
  .readdirSync(baseDir)
  .filter((f) => f.endsWith('.png'))
  .sort()) {
  const newPath = path.join(newDir, name)
  if (!fs.existsSync(newPath)) {
    console.log(`${name}: MISSING in new run`)
    worst = Math.max(worst, 100)
    continue
  }
  const a = PNG.sync.read(fs.readFileSync(path.join(baseDir, name)))
  const b = PNG.sync.read(fs.readFileSync(newPath))
  if (a.width !== b.width || a.height !== b.height) {
    console.log(
      `${name}: SIZE ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    )
    worst = Math.max(worst, 100)
    continue
  }
  let diff = 0
  let total = 0
  let minY = Infinity
  let maxY = -1
  for (let y = skipTop; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4
      total++
      const d =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])
      if (d > THRESHOLD) {
        diff++
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const pct = (100 * diff) / total
  worst = Math.max(worst, pct)
  console.log(
    `${name}: ${pct.toFixed(3)}% px differ${diff ? ` (rows ${minY}-${maxY})` : ''}`,
  )
}
console.log(`worst: ${worst.toFixed(3)}%`)
