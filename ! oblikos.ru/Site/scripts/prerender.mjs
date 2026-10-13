import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

await build({ configFile: false, plugins: [react()], build: {
  ssr: 'src/entry-server.tsx', outDir: '.tmp/seo-ssr',
  rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
} })
  const { render } = await import(pathToFileURL(path.resolve('.tmp/seo-ssr/entry.mjs')).href)
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
  let markup = render()
  for (const [source, asset] of Object.entries(manifest)) {
    markup = markup.replaceAll(`/${source}`, `/${asset.file}`)
  }
  if (markup.includes('/src/assets/')) throw new Error('Unresolved prerender asset')
  const html = await readFile('dist/index.html', 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error('Missing prerender root')
  await writeFile('dist/index.html', html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`))
  console.log('Landing prerendered: content and links available without JavaScript')
