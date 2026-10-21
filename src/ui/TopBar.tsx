import type { ReactNode } from 'react'
import { allHref } from './paths'
import styles from './TopBar.module.css'

const brand = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`

/** The 56 px bar: the leaf and "Yeraz" (a link to every Family), then whatever the screen puts after it. */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.top}>
      <a className={styles.brand} href={`#${allHref()}`} aria-label="Yeraz: all Families">
        {/* Both marks are present; CSS shows the one for the current mode, so a theme switch renders nothing. */}
        <img
          className={`${styles.mark} ${styles.markDark}`}
          src={brand('yeraz-mark-small.svg')}
          alt=""
        />
        <img
          className={`${styles.mark} ${styles.markLight}`}
          src={brand('yeraz-mark-small-light.svg')}
          alt=""
        />
        <span className={styles.word}>Yeraz</span>
      </a>
      {children}
    </header>
  )
}

export function Divider() {
  return <span className={styles.divider} aria-hidden="true" />
}
