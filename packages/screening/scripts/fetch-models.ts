// Fetches the box classifier's models (#1273) into BYD_MODELS_DIR, or the user's cache without it,
// each from its pinned revision and kept only with its checksum. The render image runs this at
// its build; a machine that runs the worker or the tests runs it once:
//   pnpm --filter @byd/screening fetch-models
import { fetchModel, MODELS, modelsDir } from '../src/models.js'

const dir = modelsDir()
for (const model of Object.values(MODELS)) {
  const path = await fetchModel(model, dir)
  console.log(JSON.stringify({ msg: 'model', file: model.file, bytes: model.bytes, licence: model.licence, path }))
}
