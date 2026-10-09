# Contributing

Thanks for helping! Issues and pull requests are welcome.

## Before you open a pull request

```bash
go test -race ./server/...
cd webapp && npm ci && npm run lint && npm run check-types && npm test
cd .. && make dist
cd e2e && npm ci && MM_VERSION=11.7.11 ./scripts/start-server.sh && npx playwright test
```

CI runs the same checks plus `golangci-lint` on `./server/...`, and the end-to-end suite on
every supported Mattermost line.

## Server rules

- Reminder logic lives in `server/reminders` behind small interfaces (`Store`, `Mattermost`,
  `Clock`) so it can be unit-tested with fakes; `server/` only wires it to Mattermost.
- Every delivery goes through `Service.deliver`: it claims the reminder with a compare-and-set
  and re-checks the creator, the recipient and channel access right before posting.
- Errors meant for the user are `UserError`s with plain-language messages; anything else is
  logged and shown as a generic error.

## Integrations

- **Poll** builds Matterpoll's `/poll "Q" "A" "B" --flags` command (`src/poll.ts`) and runs it
  through `POST /api/v4/commands/execute`. Matterpoll splits on straight quotes, so typed quotes
  are replaced with a look-alike.
- **Todo** calls `POST /plugins/com.mattermost.plugin-todo/add`. If either plugin changes these,
  the E2E suite (which installs both) will catch it.

## Webapp compatibility rules

The plugin uses the **server's** React at runtime — React 17 on Mattermost 10.11, 18 on 11.x,
19 on 12.x — so one build has to work on all of them:

- Keep `@babel/preset-react` on the **classic** JSX runtime. The automatic runtime needs
  `window.ReactJSXRuntime`, which only Mattermost 12 provides.
- Use function components and hooks available since React 16.8. Avoid `defaultProps` on
  function components, string refs, legacy context, `findDOMNode`, `ReactDOM.render`,
  `useId` and `useSyncExternalStore`.
- Don't import `prop-types`, `react-bootstrap` or `react-router-dom`.
