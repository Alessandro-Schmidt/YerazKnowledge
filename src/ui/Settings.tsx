// The frame every Settings page shares (design/screens/09): the top bar with Done, and
// the rail of pages, which becomes a row of tabs on phones.

import type { ReactNode } from 'react'
import { Link } from 'wouter'
import styles from './Appearance.module.css'
import controls from './controls.module.css'
import { Icon } from './icons'
import { Divider, TopBar } from './TopBar'
import { ViewIcon } from '../views/ViewSwitcher'

const PAGES = [
  { id: 'appearance', label: 'Appearance', icon: <Icon name="contrast" size={18} /> },
  { id: 'views', label: 'Views', icon: <ViewIcon view="treemap" size={18} /> },
  { id: 'colours', label: 'Tree colours', icon: <ViewIcon view="map" size={18} /> },
  { id: 'hidden', label: 'Hidden', icon: <Icon name="eyeOff" size={18} /> },
] as const

type SettingsPage = (typeof PAGES)[number]['id']

export function SettingsShell({ page, children }: { page: SettingsPage; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <TopBar>
        <Divider />
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/">Family</Link>
          <Icon name="chevronRight" size={14} />
          <span aria-current="page">Settings</span>
        </nav>
        <Link href="/" className={`${controls.ghost} ${styles.done}`}>
          Done
        </Link>
      </TopBar>
      <div className={styles.body}>
        <nav className={styles.rail} aria-label="Settings">
          <p className={controls.eyebrow}>Settings</p>
          {PAGES.map((p) => (
            <a
              key={p.id}
              className={styles.railItem}
              aria-current={p.id === page ? 'page' : undefined}
              href={`#/settings/${p.id}`}
            >
              {p.icon}
              {p.label}
            </a>
          ))}
        </nav>
        {children}
      </div>
    </div>
  )
}
