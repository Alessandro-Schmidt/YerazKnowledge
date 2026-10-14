import styles from './Shell.module.css'

const brand = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`

export function Shell() {
  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <div className={styles.brand}>
          {/* Both marks are present; CSS shows the one for the current mode, so a theme switch renders nothing. */}
          <img
            className={`${styles.mark} ${styles.markDark}`}
            src={brand('yeraz-mark.svg')}
            alt=""
          />
          <img
            className={`${styles.mark} ${styles.markLight}`}
            src={brand('yeraz-mark-light.svg')}
            alt=""
          />
          <span className={styles.word}>Yeraz</span>
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <h1 className={styles.title}>All trees</h1>
      </header>
      <main className={styles.canvas}>
        <p className={styles.empty}>Your trees will appear here.</p>
      </main>
    </div>
  )
}
