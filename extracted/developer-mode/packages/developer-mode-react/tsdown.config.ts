import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.tsx',
    noop: 'src/noop.tsx',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  treeshake: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@viscalyx/developer-mode-core',
  ],
})
