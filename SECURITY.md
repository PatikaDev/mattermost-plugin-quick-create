# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/PatikaDev/mattermost-plugin-quick-create/security/advisories/new)
for this repository instead. We aim to acknowledge reports within 5 working days.

## Scope

- **Reminders** are posted by the plugin's bot. A reminder is only delivered to its creator,
  to the person the creator chose, or to a public/private channel the creator can post in —
  checked when it is created and again when it is delivered. The HTTP API only lets a user see
  and delete their own reminders. Snooze/Done buttons only act on the bot's own posts and only
  create reminders for the person who clicked.
- **Poll** and **Todo** use Matterpoll's slash command and the Todo plugin's API with the user's
  own session; they get no extra permissions from this plugin.
- Data stays on the Mattermost server (plugin key-value store).

## Supported versions

Security fixes are released for the latest minor version.
