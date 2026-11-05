import { Suspense } from 'react'
import { useParams } from 'react-router'
import { useCatalog, useModuleContent } from '../lib/api.ts'
import { ModuleContext } from '../lib/moduleContext.ts'
import { labs } from '../modules/labs.ts'

function Loaded({ slug, lab }: { slug: string; lab: string }) {
  const content = useModuleContent(slug)
  const Lab = labs[lab]
  return (
    <ModuleContext.Provider value={content}>
      <Lab />
    </ModuleContext.Provider>
  )
}

/** /:slug — finds the module in the catalog, loads its content and mounts its lab. */
export default function ModulePage() {
  const { slug = '' } = useParams()
  const { modules } = useCatalog()
  const meta = modules.find((m) => m.slug === slug)
  if (!meta) return <p>Not found.</p>
  if (!labs[meta.lab]) return <p>Lab “{meta.lab}” is not available in this build.</p>
  return (
    <Suspense fallback={<p className="lede">Loading module…</p>}>
      <Loaded key={slug} slug={slug} lab={meta.lab} />
    </Suspense>
  )
}
