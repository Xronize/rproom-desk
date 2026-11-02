# rproom-desk

Plan B is a static iPhone desk served by GitHub Pages. There is no server API in this repository. The phone only reads JSON that the desk computer publishes. Python agents stay on that computer and are not part of this site.

## Open

https://xronize.github.io/rproom-desk/#d=DATA_PATH

`DATA_PATH` is a runtime secret (32+ characters). Put it only in the URL fragment (`#d=`). The page copies that value into `localStorage` under `desk_data_path` and reuses it when the fragment is gone, including after Add to Home Screen.

A token in the fragment (`#d=…&t=…`) is unused on Plan B. These polls are plain GETs and do not need `APP_TOKEN`.

PAPER mode on the phone is read-only. Change settings in Telegram.

## What it polls

Every 15 seconds, from the Pages site root (not the bare host):

- `d/{DATA_PATH}/state.json`
- `d/{DATA_PATH}/chart.json`
- `d/{DATA_PATH}/activity.json`
- `d/{DATA_PATH}/coin/{mint}.json` for mints named by state or activity

Example shape: `https://xronize.github.io/rproom-desk/d/{DATA_PATH}/state.json`

Nothing is served at bare `/d/`. Do not add a data directory, a placeholder, or a directory index to this repo. The runtime publisher creates `/d/{DATA_PATH}/` on the Pages deployment when it publishes JSON. That secret path never belongs in git.

If the fragment is missing, the shell asks for `#d=`. If the JSON cannot be loaded, the shell stays up and shows an offline row. Defaults before the first successful poll are a PAPER balance of `$200.00`, `+0.00%` today, `1.00×`, an empty chart (“Waiting for the first trade”), no agents, and no activity.

### JSON the shell reads

Missing fields keep the last value, starting from those defaults.

- `state.json`: `mode`, `balance` (or `equity`), `pnl_today_pct`, `multiplier`, `agents` (`name`, `status`), `mints` or `positions[].mint`
- `chart.json`: `points` as numbers or `{ "t", "v" }` objects
- `activity.json`: `items` with `text` (or `title`), `ts`, optional `mint`
- `coin/{mint}.json`: `symbol`, `name`, `price`

## Pages

`.github/workflows/pages.yml` checks the shell on pull requests and, on `main`, publishes the `web/` directory with GitHub Actions (`actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`). Pages source is GitHub Actions, not a branch folder.

After a green run on `main`, the site is https://xronize.github.io/rproom-desk/

Add to Home Screen uses `web/manifest.json` and `web/icons/apple-touch-icon.png`. Open the `#d=` link once before adding it so the data path is stored on the phone.

Account links are built in `web/links.js`. Invite is https://fomo.family/r/savipww and the FOMO profile is https://fomo.family/profile/RPRoom?source=share_link&r=savipww

## Secrets

Never commit `DATA_PATH`, `TYPESAFE_API_KEY`, `TG_TOKEN`, `VAPID_PRIVATE_KEY`, `APP_TOKEN`, `.env`, `secrets/`, database files, or settings files that hold tokens. `.gitignore` blocks those paths.
