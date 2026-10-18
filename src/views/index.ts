// Each view is its own chunk, loaded the first time it is chosen, so first load stays
// within budget (ARCHITECTURE.md §11). The radial map is the Family view's own.

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ViewProps } from './common'
import type { ViewId } from './views'

type Loader = () => Promise<{ default: ComponentType<ViewProps> }>

const loaders: Record<Exclude<ViewId, 'map'>, Loader> = {
  mind: () => import('./MindMap'),
  outline: () => import('./Outline'),
  columns: () => import('./Columns'),
  treemap: () => import('./Treemap'),
  graph: () => import('./Graph'),
  rings: () => import('./Rings'),
  atlas: () => import('./Atlas'),
}

export const VIEW_COMPONENTS = Object.fromEntries(
  Object.entries(loaders).map(([id, load]) => [id, lazy(load)]),
) as Record<Exclude<ViewId, 'map'>, LazyExoticComponent<ComponentType<ViewProps>>>
