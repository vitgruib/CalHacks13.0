// The landing's first screen (T75). The real 3D hero is hero/src/embed.tsx
// (T76), lazy-loaded so the portals never download three.js. While that file
// doesn't exist the glob below is empty and HeroStub stands in, so the swap
// needs no change here. Its packages resolve from web/node_modules
// (resolve.dedupe in vite.config.ts), because Vercel installs only web/.
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import type { HeroEmbedProps } from '@hero/embed'
import { HeroStill, HeroStub } from './HeroStub'

const found = import.meta.glob<{ default: ComponentType<HeroEmbedProps> }>('../../../hero/src/embed.tsx')
const load = Object.values(found)[0]
const Embed = load ? lazy(load) : null

/** A hero that fails to load or throws shows the stub, never a blank app. */
class OrStub extends Component<{ stub: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.stub : this.props.children
  }
}

export default function HeroSlot({ onEnter }: HeroEmbedProps) {
  const stub = <HeroStub onEnter={onEnter} />
  if (!Embed) return stub
  return (
    <OrStub stub={stub}>
      <Suspense fallback={<HeroStill />}>
        <Embed onEnter={onEnter} />
      </Suspense>
    </OrStub>
  )
}
