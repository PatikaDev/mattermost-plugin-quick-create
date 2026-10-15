# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.1.1] — 2026-10-15

### Fixed
- No more duplicate icons and buttons after an upgrade: when Mattermost starts the plugin twice
  in an open window (it can, if the plugin is re-enabled while its code is still loading), the
  second start is ignored. Previously the page needed a reload to clear the duplicates.

## [1.1.0] — 2026-10-15

### Added
- **Also send to channel** checkbox under the text of thread reply boxes, like Slack's: the reply
  is also posted in the channel as you, under a "↪ replied to a thread: …" line linking back to
  it, with its attachments. The box unticks itself after each reply.

## [1.0.0] — 2026-10-08

### Added
- ⊕ button in every message box (channel and thread reply) with **Poll**, **Todo** and
  **Reminder**.
- **Poll** dialog with any number of options (up to 20) and Matterpoll's settings; posts a
  Matterpoll poll.
- **Todo** dialog: add to your own list or send to a colleague (Todo plugin), with notes and a
  people picker.
- **Reminders**: yourself, someone else or the current channel; quick times or any date and
  time in the user's time zone; repeat daily, on weekdays or weekly (DST-safe); delivered by
  the *Reminders* bot with Snooze and Done; **Reminders** panel with Delete.
- Delivery-time checks; undeliverable reminders are removed and their creator is told why.
- Cluster-safe sender: each reminder is claimed atomically before delivery.
- One build for Mattermost 10.11+, verified on 11.7 and 12.0.
