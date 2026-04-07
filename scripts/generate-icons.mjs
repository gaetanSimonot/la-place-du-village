import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svg = readFileSync(join(root, 'public', 'icon.svg'))

const sizes = [192, 512]
for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

// Apple touch icon (180x180)
await sharp(svg)
  .resize(180, 180)
  .png()
  .toFile(join(root, 'public', 'apple-touch-icon.png'))
console.log('✓ apple-touch-icon.png')

// Favicon (32x32)
await sharp(svg)
  .resize(32, 32)
  .png()
  .toFile(join(root, 'public', 'favicon-32.png'))
console.log('✓ favicon-32.png')

console.log('Icons generated successfully.')
