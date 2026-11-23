# Maestro flows (device loop)

UI flows for the iOS simulator, driven by [`scripts/device.sh`](../scripts/device.sh).

## Prerequisites

- Xcode with the iOS 26.5 simulators below.
- Maestro CLI (`brew install mobile-dev-inc/tap/maestro`, or `~/.maestro/bin/maestro`). Override the
  binary with `MAESTRO=/path/to/maestro`.
- Java 17+. When `java` is not usable on `PATH`, `device.sh` exports `JAVA_HOME` from Homebrew's
  `openjdk@25` before calling Maestro.
- Flows that hit the backend need the api up: `../proxy-api/scripts/dev-stack.sh up`.

## Devices

| Letter | Role | Simulator | UDID |
|---|---|---|---|
| A | CLIENT | iPhone 17 Pro (iOS 26.5) | `C29B497C-4443-4138-9DBA-DCFA5836C71E` |
| B | PROXY | iPhone 17e (iOS 26.5) | `ADFA408E-172E-426D-B2B0-A3D22DFFC188` |

## Running

```bash
scripts/device.sh metro                 # Metro on 8081, EXPO_PUBLIC_API_URL=http://localhost:3333
scripts/device.sh build A               # boot A, build + install + launch the debug app
scripts/device.sh boot B && scripts/device.sh install B   # reuse the build on B
scripts/device.sh test A .maestro/flows/auth/welcome-to-sign-in.yaml   # one flow
scripts/device.sh test A .maestro --include-tags smoke                 # a tag (workspace root: config.yaml recurses flows/**)
scripts/device.sh shot A .dev-stack/shots/manual                       # ad-hoc screenshot
scripts/device.sh down                  # stop our Metro, remove .dev-stack/
```

Screenshots: Maestro 2.12 writes `takeScreenshot` files under its run output dir
(`--test-output-dir`, which `device.sh test` points at `.dev-stack/maestro/<run>/`). After every run,
pass or fail, `device.sh test` copies each of them to `.dev-stack/shots/<name>.png`, keeping any
subpath in the name. So in flows use a plain name, e.g. `takeScreenshot: auth--sign-in` →
`.dev-stack/shots/auth--sign-in.png` (convention `<area>--<screen>`). Running `maestro` directly
bypasses this copy (screenshots stay in Maestro's own output dir, `~/.maestro/tests/` by default).
`.dev-stack/` is gitignored and `device.sh down` deletes it, shots included: copy anything you want to
keep out of `.dev-stack/shots/` before `down`. Restarting `metro` leaves `shots/` and `maestro/` alone.

## Writing flows

- One file per flow under `flows/<area>/`, `appId: com.anonymous.proxyapp`.
- Tags: `smoke`, `full`, `baseline`, plus one area tag (`auth`, `cards`, `tasks`, `wallet`,
  `history`, `profile`).
- Select by visible pt-BR text or placeholder. Add a `testID` only when a flow cannot otherwise
  select an element, and only inside the task that needs it.
- Start with `clearKeychain` + `launchApp: { clearState: true }` when the flow needs the signed-out
  splash: on iOS `clearState` does not wipe the keychain, where SecureStore keeps the session.

## Visual freeze check

After a run, compare the screenshots with the baseline before `device.sh down` removes them:

```
node scripts/visual-diff.js docs/release-1.0/visual-baseline .dev-stack/shots
```

It prints the percentage of changed pixels per screen (status bar rows ignored). Anything above
~0.1% that is not a blinking caret is a visual change and must be justified or reverted (LOOP.md §8).
