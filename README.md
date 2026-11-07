# CollabPatrol

CollabPatrol is a MediaWiki extension that brings collaborative revision patrolling to your wiki. It started as a JavaScript gadget for the [Vikidia](https://en.vikidia.org) project and has since grown into a full extension, available for any MediaWiki wiki.

The idea is simple: instead of patrolling alone, patrollers can flag a revision they are unsure about, so other patrollers know it needs a second look. Flagged revisions are highlighted in Recent Changes, making the workload visible to the whole team.

## Requirements

- MediaWiki 1.43 or later
- PHP 8.1 or later
- A user group with the `patrol` right (e.g. `patroller`, `sysop`)

## Installation

1. Download and place the `CollabPatrol` folder in your `extensions/` directory (see the releases page).
2. Add the following line to your `LocalSettings.php`:
   ```php
   wfLoadExtension( 'CollabPatrol' );
   ```
3. Run the database update script:
   ```bash
   php maintenance/run.php update
   ```
4. Navigate to `Special:Version` to confirm the extension is loaded.

## Permissions

| Right | Default groups | Description |
|---|---|---|
| `collabpatrol-use` | `patroller`, `sysop` | Flag, take and finish patrol entries |
| `collabpatrol-admin` | `sysop` | Manage entries and moderate the chat |
| `collabpatrol-chatmod` | `sysop` | Moderate (delete) chat messages without full patrol admin |

You can override these in `LocalSettings.php`:
```php
$wgGroupPermissions['patroller']['collabpatrol-use'] = true;
$wgGroupPermissions['sysop']['collabpatrol-admin'] = true;
$wgGroupPermissions['sysop']['collabpatrol-chatmod'] = true;
```

## Configuration

All settings go in `LocalSettings.php`.

| Variable | Default | Description |
|---|---|---|
| `$wgCollabPatrolExpirationDelay` | `172800` (48 h) | Seconds before a patrol entry expires automatically |
| `$wgCollabPatrolUrgencyThreshold` | `3600` (1 h) | Seconds before a pending entry is marked urgent |
| `$wgCollabPatrolAutoPatrol` | `true` | Automatically mark the revision as patrolled when status is set to *finished* |
| `$wgCollabPatrolEnableEcho` | `true` | Send Echo notifications when someone is @mentioned in the patrol chat |
| `$wgCollabPatrolChatEnabled` | `true` | Enable the per-diff discussion popup |
| `$wgCollabPatrolChatMaxLength` | `500` | Maximum character length for a chat message |
| `$wgCollabPatrolChatModerators` | `[]` | Optional additional usernames allowed to moderate chat |
| `$wgCollabPatrolChatBannedWords` | `[]` | Words forbidden in chat messages (case-insensitive) |
| `$wgCollabPatrolChatAutoDelete` | `true` | Delete chat messages when the entry is finished or removed |

Example:
```php
$wgCollabPatrolUrgencyThreshold = 1800;
$wgCollabPatrolChatBannedWords = [ 'spam', 'badword' ];
$wgGroupPermissions['patroller']['collabpatrol-chatmod'] = true;
```

## User preferences

Each user can configure CollabPatrol in `Special:Preferences`, under Appearance > Collaborative patrol.

| Preference | Default | Description |
|---|---|---|
| Auto-refresh interval | 30 seconds | Refresh interval for RC markers, dashboard and chat |
| Show notification after finishing an entry | Enabled | Show a completion notification when an entry is marked finished |
| Show history block on entries | Enabled | Display or hide entry history in diff interfaces |

## Mentions and Echo

In the discussion panel, type `@` followed by a username to get suggestions. Mentions are written `@Username` (underscores stand for spaces) or `@[User Name]`. Existing users are highlighted in the message, and messages mentioning you are marked.

If the [Echo](https://www.mediawiki.org/wiki/Extension:Echo) extension is installed and `$wgCollabPatrolEnableEcho` is `true`, every mentioned user who holds the `collabpatrol-use` right receives a notification (up to 5 per message, the author is never notified). The link opens the diff with the discussion popup already open. Users can opt out in `Special:Preferences` > Notifications (category *Patrol chat mentions*). Echo is optional: without it, mentions are still highlighted.

## How it works

1. A patroller views a diff and is unsure about the revision.
2. They click **Flag** and optionally pick a reason (vandalism, complex edit, needs sourcing…).
3. The revision appears with a marker in Recent Changes so other patrollers can see it.
4. Another patroller clicks **Take** to signal they are looking at it, then **Finish** once done.
5. If `$wgCollabPatrolAutoPatrol` is enabled, finishing also marks the revision as patrolled in MediaWiki.

A discussion panel is available on each flagged diff, allowing patrollers to leave short notes for each other.

The dashboard at `Special:CollabPatrol` shows all active entries, their status, and patroller statistics.

## License

[GPL-2.0-or-later](LICENSE)

## Credits
Thanks to [Janus](https://github.com/janusdevikidia) to the UI refont when CollabPatrol was a gadget on Vikidia.

## Blocks

CollabPatrol has no block system of its own (it was removed in 1.2.0). Every write
action (`set`, `remove`, `chat_post`, `chat_delete`) re-checks, at the moment it is
performed, that the user is not blocked on the wiki (sitewide block). A blocked user
gets an error message and the action is refused. The `collab_patrol_chat_ban` table is
dropped by `php maintenance/run.php update`.
