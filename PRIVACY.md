# Privacy

Yeraz is open-source software with no server of its own. The people who publish it receive
nothing from you: no account, no analytics, no cookies, no error reports. This page lists
everything the app keeps and every place it connects to, as the EU's GDPR (Art. 13) asks.

**Who publishes it:** the maintainers of
[Alessandro-Schmidt/YerazKnowledge](https://github.com/Alessandro-Schmidt/YerazKnowledge).
Questions about privacy: open an issue there, or for anything sensitive, use the
**Security** tab's private report.

## What stays on your device

Kept only so the app works, never sent to the maintainers:

- **Your GitHub token:** in the browser's IndexedDB on the web, in the operating system's
  keychain in the desktop app. *Sign out* deletes it.
- **Copies of your notes** and edits not yet saved, so the app opens fast and works offline:
  in IndexedDB, and the app's own files in the browser's cache. They stay after *Sign out*,
  for the next sign-in. Clearing the site's data in the browser removes them.
- **Your settings** (theme, panel widths, views, insert menu): in `localStorage`.
- **Families in a folder** are files on your computer, or in the browser's own storage where
  folders can't be opened. They go nowhere unless you push them to GitHub.

None of this is a cookie or a tracker, so the app asks for no consent.

## Where the app connects

- **GitHub Pages** serves the web app at `yeraznotes.com`. GitHub sees your IP
  address and browser when the app's files are loaded, as for any website. GitHub is the
  controller of that data: see the
  [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- **GitHub's API** (`api.github.com`) is where your notes live. The app talks to it with your
  token, from your device only, to read and commit the repositories you chose. What GitHub
  does with your repositories is between you and GitHub, under its terms.
- **YouTube**, only when you press play on a video in a note. Until then nothing is fetched
  from YouTube or Google, not even a thumbnail. Playing it loads the player from
  `youtube-nocookie.com`, and Google then sees your IP address and browser: see
  [Google's Privacy Policy](https://policies.google.com/privacy). In the desktop app, the
  player is loaded through the web app's own page, `yeraznotes.com/youtube.html`.
- **Images from other websites**, when a note you open links to one
  (`![…](https://…)`). Your browser loads it from that website, which sees your IP address,
  as with an image in an email. Images kept in the repository (`/assets/…`) come from GitHub.
- **Links** you click open in your browser like any link.

The desktop app connects to nothing else: it has no updater and no telemetry.

## Your rights

The maintainers hold no data about you, so there is nothing of yours they can show, correct
or delete. For what GitHub or Google hold, ask them (links above). Everything the app keeps on
your device you can delete yourself: *Sign out*, then clear the site's data in the browser,
or uninstall the desktop app.
