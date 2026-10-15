# Community themes

Each `.json` file here is a theme anyone can pick in **Settings › Appearance**. A theme
starts from one of the three bases and overrides some of its colours
([ARCHITECTURE.md §13](../ARCHITECTURE.md#13-themes)):

```json
{ "yerazTheme": 1, "name": "Midnight", "base": "graphite", "accent": "#5AC8FA", "font": "geist", "tokens": { "bg": "#0E1116" } }
```

- `base`: `vanta`, `graphite` or `paper`. `font`: `geist` or `serif`.
- `accent`: a named accent (`green`, `amber`, `blue`, `violet`) or a `#RRGGBB` colour.
- `tokens`: any of the base's tokens (`design/themes/themes.json`), as `#RRGGBB`, or
  `rgba(…)` for `grid` and `shadow`.

To contribute one, make it in the app (Appearance › Create from current), export it, add
the file here and open a pull request. `npm test` checks every theme: it must parse, and
pass every contrast rule as written, without the app having to adjust a colour.
