import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const DEFAULT_OPENAPI_PATH = 'openapi/hsa-person-lookup.yaml'
const DEFAULT_OUTPUT_DIR = 'tmp/openapi/hsa-person-lookup'
const SWAGGER_ASSETS = [
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'swagger-ui.css',
  'favicon-16x16.png',
  'favicon-32x32.png',
]

function readArg(args, name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}.`)
  }
  return value
}

function normalizeAssetBasePath(assetBasePath = './') {
  return assetBasePath.endsWith('/') ? assetBasePath : `${assetBasePath}/`
}

export function swaggerHtml({
  assetBasePath = './',
  specFileName = 'hsa-person-lookup.yaml',
  title = 'Kravhantering HSA Person Lookup Facade',
} = {}) {
  const assetBaseUrl = normalizeAssetBasePath(assetBasePath)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <link rel="stylesheet" href="${assetBaseUrl}swagger-ui.css">
    <link rel="icon" href="${assetBaseUrl}favicon-32x32.png" sizes="32x32">
    <link rel="icon" href="${assetBaseUrl}favicon-16x16.png" sizes="16x16">
    <style>
      body {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${assetBaseUrl}swagger-ui-bundle.js"></script>
    <script src="${assetBaseUrl}swagger-ui-standalone-preset.js"></script>
    <script>
      window.addEventListener('load', () => {
        window.ui = SwaggerUIBundle({
          dom_id: '#swagger-ui',
          layout: 'StandaloneLayout',
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset,
          ],
          plugins: [
            () => ({
              components: {
                authorizationPopup: () => null,
                authorizeBtn: () => null,
                authorizeOperationBtn: () => null,
              },
            }),
          ],
          supportedSubmitMethods: [],
          url: '${assetBaseUrl}${specFileName}',
        })
      })
    </script>
  </body>
</html>
`
}

export function generateHsaPersonLookupSwaggerUi({
  assetBasePath,
  fsImpl = fs,
  openapiPath = DEFAULT_OPENAPI_PATH,
  outputDir = DEFAULT_OUTPUT_DIR,
  swaggerDistPath = path.dirname(
    require.resolve('swagger-ui-dist/package.json'),
  ),
} = {}) {
  fsImpl.rmSync(outputDir, { force: true, recursive: true })
  fsImpl.mkdirSync(outputDir, { recursive: true })

  const specFileName = path.basename(openapiPath)
  fsImpl.copyFileSync(openapiPath, path.join(outputDir, specFileName))
  for (const asset of SWAGGER_ASSETS) {
    fsImpl.copyFileSync(
      path.join(swaggerDistPath, asset),
      path.join(outputDir, asset),
    )
  }
  fsImpl.writeFileSync(
    path.join(outputDir, 'index.html'),
    swaggerHtml({ assetBasePath, specFileName }),
  )

  return {
    outputDir,
    files: ['index.html', specFileName, ...SWAGGER_ASSETS].sort(),
  }
}

export function isDirectRun(argv = process.argv, metaUrl = import.meta.url) {
  return Boolean(argv[1] && path.resolve(argv[1]) === fileURLToPath(metaUrl))
}

if (isDirectRun()) {
  const assetBasePath = readArg(process.argv, '--asset-base-path', undefined)
  const outputDir = readArg(process.argv, '--output-dir', DEFAULT_OUTPUT_DIR)
  const openapiPath = readArg(process.argv, '--openapi', DEFAULT_OPENAPI_PATH)
  const result = generateHsaPersonLookupSwaggerUi({
    assetBasePath,
    openapiPath,
    outputDir,
  })
  console.log(JSON.stringify(result, null, 2))
}
