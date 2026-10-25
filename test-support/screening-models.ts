import { fetchModel, MODELS, modelsDir } from '../packages/screening/src/models.js'

// The box classifier's tests run with its models loaded (#1273), in the screening package and in
// the render worker's, so a run fetches them first, once per machine: they are kept in the user's
// cache, checked against their checksums, and fetched again only when they are not the files
// named. It is the same step as the render image's build.
export default async function setup(): Promise<void> {
  for (const model of Object.values(MODELS)) await fetchModel(model, modelsDir())
}
