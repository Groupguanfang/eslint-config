import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/typegen.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  onSuccess: () => {
    const typegenCTS = path.resolve(process.cwd(), 'dist/typegen.d.cts')
    const typegenMTS = path.resolve(process.cwd(), 'dist/typegen.d.mts')
    const typegenCTSContent = `// @ts-nocheck\n${fs.readFileSync(typegenCTS, 'utf-8')}`
    const typegenMTSContent = `// @ts-nocheck\n${fs.readFileSync(typegenMTS, 'utf-8')}`
    fs.writeFileSync(typegenCTS, typegenCTSContent)
    fs.writeFileSync(typegenMTS, typegenMTSContent)
  },
})
