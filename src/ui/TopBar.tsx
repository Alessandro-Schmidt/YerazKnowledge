import type { ReactNode } from 'react'
import styles from './TopBar.module.css'

const brand = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`

/**
 * The 56 px bar: the leaf and "Yeraz", then whatever the screen puts after it. The leaf
 * opens the introduction (`#/welcome`); `home` shows it instead, where the address must stay.
 */
export function TopBar({ children, home }: { children?: ReactNode; home?: () => void }) {
  return (
    <header className={styles.top}>
      <a
        className={styles.skip}
        href="#main"
        onClick={(e) => {
          // Not a route: the hash is the router's (App.tsx).
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <a
        className={styles.brand}
        href="#/welcome"
        aria-label="Yeraz"
        onClick={
          home &&
          ((e) => {
            e.preventDefault()
            home()
          })
        }
      >
        {/* Both marks are present; CSS shows the one for the current mode, so a theme switch renders nothing. */}
        <img
          className={`${styles.mark} ${styles.markDark}`}
          src={brand('yeraz-mark-small.svg')}
          alt=""
          width={25}
          height={24}
        />
        <img
          className={`${styles.mark} ${styles.markLight}`}
          src={brand('yeraz-mark-small-light.svg')}
          alt=""
          width={25}
          height={24}
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
