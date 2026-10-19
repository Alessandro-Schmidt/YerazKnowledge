import type { ReactNode } from 'react'
import styles from './TopBar.module.css'

const brand = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`

/** The 56 px bar: the leaf and "Yeraz", then whatever the screen puts after it. */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.top}>
      <div className={styles.brand}>
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
      </div>
      {children}
    </header>
  )
}

export function Divider() {
  return <span className={styles.divider} aria-hidden="true" />
}
