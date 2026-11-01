# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub:
on this repository's **Security** tab, choose **Report a vulnerability**. Only the maintainers
see the report.

Include what an attacker could do, the steps to reproduce it, and the version or commit. We aim
to reply within a week. Once a fix is released, the advisory is published with credit
to you, unless you would rather stay anonymous.

## Supported versions

Only the latest release, and the web app at
<https://alessandro-schmidt.github.io/YerazKnowledge/>, get security fixes.

## How Yeraz handles your data

Yeraz has no server. Knowing what it trusts helps to judge a report:

- **Your GitHub token** stays on your device: in the browser's IndexedDB for the web app, and
  in the operating system's keychain for the desktop app. It is sent only to `api.github.com`,
  in the `Authorization` header, and is never logged or put in a URL. Use a fine-grained token
  limited to the repositories that hold your notes.
- **Notes are untrusted input.** A repository or folder can be shared with other people, so
  rendering treats every note as possibly hostile. Markdown is rendered without raw HTML,
  `javascript:` and `data:` links are refused, Mermaid runs in strict mode, KaTeX without
  `trust`, and SVG images open as `data:` URLs that can't reach the app.
- **The Content-Security-Policy** allows scripts only from the app itself, network requests
  only to GitHub's API, and frames only from YouTube's privacy-enhanced domain and the app's own PDF previews.
- **The desktop app** reads and writes only folders you picked. Paths with `..`, absolute
  paths and symbolic links inside the folder are refused.

### Known limits

- **The web app shares its origin with other GitHub Pages sites of the same account.** The
  official build is served from `alessandro-schmidt.github.io`, so that account hosts no other
  Pages site. If you deploy your own copy to `<you>.github.io/<repo>`, every other Pages site on
  that account can read the token stored by the app. Serve it from its own domain, or keep no
  other Pages sites on that account.
- **Images from the web load when a note is shown.** A note that links to an image on another
  server reveals to that server that the note was read, and from which IP address, as an email
  would. The note's content is not sent.
- **Edits are merged, not authenticated.** Anyone with write access to a repository can change
  its notes. Use GitHub's own access controls and branch protection for that.
