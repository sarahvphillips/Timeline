# Timeline Bot API

One HTTPS Cloud Function, `api` (region `europe-west2`, project `timelineapp-3bc05`).
After deploy the base URL is `https://europe-west2-timelineapp-3bc05.cloudfunctions.net/api`
(Cloud Functions v2 also gives a `https://api-<hash>-nw.a.run.app` URL; either works).

**Status:** deployed. Keys are made in the app: Settings → Connect a bot → Create bot key.

## Auth
Every request: `Authorization: Bearer <key>`.
- Firestore `botKeys/{sha256(key)}` → `{ uid, createdAt, lastUsedAt, revoked }`. Only the hash is stored.
- Unknown or revoked key → `401`. `lastUsedAt` updates at most once a minute.
- Rate limit: 60 requests per minute per key → `429`, with a `Retry-After` header (seconds until the window resets) and `{ "error", "code": "rate_limit" }`. The counter is in memory, with one `botRate/{keyHash}` doc as the shared fallback (read once a minute, written every few requests, not on every call).
- Daily allowance used up → `402`, also with `Retry-After` (seconds until midnight UK time) and `{ "error", "code": "allowance_exhausted", "used", "allowance", "resetsAt" }`. The cap is `config/usageRules.dailyAllowance` (default 500 points) plus `meta/usage.adsUnlocked * adUnlockPoints`. A per-user override lives on `users/{uid}/entitlements/main.dailyAllowance`. `premium` or `allowanceExempt` skips the cap. Bot points are stored on `users/{uid}/meta/botUsage` (the app cannot write that doc).
- All reads and writes are limited to `users/{uid}` of the key's owner.

Errors are JSON: `{ "error": "message" }`. `429` and `402` add `code` and, for `402`, the allowance fields above.

## Event shape
Stored at `users/{uid}/events/{id}` exactly like the app's `saveEvent()`:

| Field | Notes |
|---|---|
| `id` | string, same format as the app (`Date.now()` + 6 random chars) |
| `title` | required on create |
| `description` | string, default `""` |
| `date` | ISO string; default now. Accepts `2026-10-18` or full ISO |
| `category` | `personal` (default), `work`, `family`, `health`, `travel`, `hobby`, `household`, `other`, or a custom category id |
| `source` | `manual` (default), `hobby`, `food`, … (drives the Timeline filters) |
| `hobbyType` | e.g. `poetry` (Poems filter = `source: hobby` + `hobbyType: poetry`) |
| `labels` | array of strings |
| `location`, `placeName`, `photoNote`, `imageUri`, `coverImageUri`, `nextAction`, `foodStatus`, `foodItems`, `collectionName`, `shareCaption`, `emailFrom`, `botNote` | optional |
| `socialUrl`, `url`, `driveUrl`, `readingUrl`, `recipeUrl` | optional https URL (400 otherwise). `socialUrl` drives "Open post". `driveUrl` drives "Open card in Drive". `readingUrl` drives "Play my reading" |
| `socialTitle`, `socialPlatform` (e.g. `X`), `socialAction` (e.g. `Posted`), `socialNote` | optional strings for social media events |
| `mealKit`, `recipeName`, `cardNumber`, `cookMinutes`, `mealTags` | optional meal-kit strings, length-capped |
| `createdAt`, `updatedAt` | ISO strings, set by the API |
| `ownerUid` | key owner's uid, set by the API |
| `addedBy` | always `"bot"` on bot-created events (marker for sorting / removing) |
| `attachments` | set by the API only: `[{ name, contentType, size, storagePath, url, addedAt, addedBy: "bot" }]` (tickets, PDFs). The app shows an **Open ticket** button per file on the event view |
| `shareId`, `isShared`, `sharedFrom` | set by `POST /events/:id/invite`, the same as the app's Share |

Responses also include `appLink: "timelineapp://event/<id>"` and `webLink: null` (Hosting redirect comes later).

### Quick-reply `kind` (optional on create)
| kind | source | category | extra |
|---|---|---|---|
| `memory` | manual | personal | |
| `event` | manual | personal | |
| `poem` | hobby | hobby | hobbyType `poetry` |
| `food` | food | other | |
| `social` | social | hobby | |
| `other` | manual | other | |

Explicit `source` / `category` override `kind`.

## Endpoints

### `GET /me/profile` (read only)
`200` → `{ "displayName", "dateOfBirth", "dateOfBirthIso", "username" }` from `users/{uid}/settings/profile`. `dateOfBirth` is as stored; `dateOfBirthIso` is `yyyy-mm-dd` or `null`; `username` is the handle with no `@`. Missing fields are `""`. Email, devices, visibility, and the photo are never returned. There is no write route.

### `POST /photos`
Upload one image (max 5 MB, `image/*`). Stored at `users/{uid}/events/{eventId}/imageUri.jpg`, the same path the app uses.
Send one of:
- JSON `{ "imageBase64": "<base64 or data: URL>", "contentType": "image/jpeg", "eventId": "optional" }`
- `multipart/form-data` with one file field (+ optional `eventId` field)
- raw body with `Content-Type: image/jpeg` (optional `?eventId=`)

`201` → `{ "eventId", "storagePath", "downloadUrl" }`. Pass `eventId` as `id` and `downloadUrl` as `imageUri` to `POST /events`.

### `POST /events`
```json
{ "title": "Beach day", "kind": "memory", "date": "2026-10-18", "description": "…",
  "labels": ["family"], "id": "<eventId from /photos>", "imageUri": "<downloadUrl>" }
```
Or attach the photo in the same call with `imageBase64` (+ `contentType`).
Tickets in the same call: `"attachments": [{ "fileBase64": "<base64 or data: URL>", "contentType": "application/pdf", "name": "train-ticket.pdf" }]`
(or a single top-level `fileBase64` + `contentType` + `name`). Same limits as `POST /events/:id/attachments`.
`201` → the stored event + `appLink` + `webLink`. `409` if `id` already exists.

### `GET /events?from=&to=&q=&label=&kind=&source=&limit=`
- `from` / `to`: ISO dates (inclusive, on `date`)
- `q`: case-insensitive text match on title, description (poem text), location, placeName, photoNote, socialTitle, socialNote, botNote, labels
- `label`: exact label (case-insensitive)
- `kind`: one of
  | kind | matches |
  |---|---|
  | `poem` | `hobbyType: poetry`, or `source: poem`, or a `Poem` label |
  | `social` | `source: social` |
  | `food` | `source: food` |
  | `todo` | `source: todo` or `fromTodo` (ticked-off to-dos) |
  | `memory`, `event` | `source: manual`, category not `other`, not a poem or to-do (the app stores both the same way, so they return the same set) |
  | `other` | `source: manual` + `category: other` |
- `source`: exact `source` match (e.g. `youtube`, `laundry`, `clip`); missing source counts as `manual`
- All filters combine (e.g. `?kind=poem&q=love&from=2025-01-01`).
- `limit`: default 50, max 200. Newest first.

`200` → `{ "count", "total", "events": [ … ], "truncated"?, "nextCursor"? }`. `total` = matches in this page's scan before `limit`. With any of `q`/`label`/`kind`/`source`, the newest 1000 events are searched; `truncated: true` means there were more. Tombstones (`deleted: true`) are left out. Pass `cursor` from `nextCursor` to read the next page (date order). For a whole year, use `GET /recap` instead of stopping after one page.

### `GET /events/:id`
`200` → event + links, or `404`.

### `PATCH /events/:id`
Body: any of the optional fields above. `id`, `ownerUid`, `addedBy`, `createdAt` cannot be changed. Sets `updatedAt`.
`200` → the updated event + links.

### `DELETE /events/:id`
Bot-added events delete on the first call. Events the user made return `409` `{ needsConfirm, confirmToken, expiresAt, event, message }`; repeat with `?confirm=TOKEN` within 5 minutes (single use). Storage files, pending invites, and an unjoined share are still removed. The event doc becomes a tombstone (`deleted: true`, `updatedAt` set) so other devices drop it on delta sync. `GET` hides it (`404` by id). `POST` with the same id may create it again.
`200` → `{ deleted: "<id>", removed: { files, invites, sharedEvent } }`.

### `GET /events/exists?id=` or `?url=`
`200` → `{ exists, id, field? }`. An id check is one document read. A url check tries `socialUrl`, `url`, `driveUrl`, `readingUrl`, then `recipeUrl` (`field` limits it to one). A tombstone counts as not existing. Use this for duplicate checks instead of `GET /events?q=`.

### `GET /sync?version=` or `?since=&limit=&cursor=`
Reads `users/{uid}/meta/sync` first. If `version` matches, `{ changed: false, version, count: 0, events: [] }` and no event query. Otherwise `since` (ISO `updatedAt`) returns changed events, including tombstones, one page at a time (`nextCursor`). 

### `POST /sync/bump`
One write to `meta/sync`. Use after a batch of writes sent with `?nosync=1` (or header `X-No-Sync: 1`). The bump is on by default, and at most once per request.

### `GET /recap?year=2026`
Walks that calendar year with `orderBy(date)` and `startAfter`, 80 events at a time, up to 40 pages. `200` → `{ title: "My 2026 so far", year, count, byMonth, byKind, highlights, pages, truncated, scanned }`. Tombstones are not counted. A past year is titled `My {year}`. This is the call that covers the whole year; `GET /events` still returns one page unless you follow `nextCursor`.

## Tickets and files (attachments)
Max **10 MB** per file, up to 10 per event. Allowed `contentType`: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`. PDFs must start with `%PDF-`.
Stored at `users/{uid}/events/{eventId}/attachments/<name>` (name is cleaned to `A-Z a-z 0-9 . _ -`, extension from the type; a clash gets a short prefix).
`url` is a Firebase download URL (token link), so it opens in a browser or PDF viewer without signing in. Treat it like a private link.
If the event is shared, the shared copy (`sharedEvents/{shareId}.attachments`) is updated too, so friends who joined see the ticket.

### `POST /events/:id/attachments`
Send one of:
- JSON `{ "fileBase64": "<base64 or data: URL>", "contentType": "application/pdf", "name": "ticket.pdf" }` (`pdfBase64` also accepted)
- `multipart/form-data` with one file field (+ optional `name` field)
- raw body with `Content-Type: application/pdf` (optional `?name=`)

`201` → `{ eventId, attachment: { name, contentType, size, storagePath, url, addedAt, addedBy }, attachments: [ … ] }`.
`413` over 10 MB, `415` wrong type, `404` unknown event. (`POST /photos` stays image-only and points PDFs here.)

### `DELETE /events/:id/attachments/:name`
Removes the file and its entry. `200` → `{ eventId, attachments }`.

## Sharing with a friend (invites)
Works exactly like tapping **Share** on an event in the app (`shareService.createEventShare`):
creates or reuses `sharedEvents/{shareId}` (`share_<base36 time>_<6 chars>`, creator listed as participant), writes `eventInvites/{CODE}`
`{ shareId, fromUid, fromName, fromHandle?, fromEmail?, code, status: "pending", eventTitle, createdAt, expiresAt, addedBy: "bot" }`,
and sets `shareId`, `isShared: true`, `sharedFrom` on the event. Codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, single use, expire after **14 days**.
The app has no free-tier invite cap yet, so none is applied here (add it in both places when friend caps arrive).
Only the event's creator can invite (`409` on an event a friend shared with you).

### `POST /events/:id/invite`
No body. `201` →
```json
{ "eventId": "…", "shareId": "share_…", "code": "K7QM3P",
  "link": "timelineapp://share/K7QM3P", "joinLink": "timelineapp://join/K7QM3P",
  "expiresAt": "2026-11-01T17:50:00.000Z",
  "invite": { "code", "status": "pending", "shareId", "eventTitle", "createdAt", "expiresAt", "link", "joinLink" },
  "howToAccept": "Your friend opens the Timeline app, goes to Accept Invite and types the code …" }
```
The friend accepts by typing the code on **Accept Invite**, scanning a QR of `link`, or tapping `link` on their phone. Each call makes a new code for the same share (one per friend).

### `GET /events/:id/invites`
`200` → `{ eventId, shareId, invites: [{ code, status: pending|accepted|declined|expired, shareId, eventTitle, createdAt, expiresAt, acceptedByUid?, acceptedAt?, link, joinLink }] }`, newest first.

## To-dos
Stored where the app keeps them: `users/{uid}/settings/todos` → `{ items: [row], updatedAt }`, newest first (mirrors `src/services/todoService.js`).
Row: `{ id: "<base36 time><6 chars>", title, note, category (default "personal"), date ("YYYY-MM-DD" or ""), createdAt, doneAt ("" if open), eventId ("" until done) }`.
Every write is a Firestore transaction on that doc, so app items are never lost.

### `GET /todos?status=open|done|all`
Default `all`. `200` → `{ status, count, open: [row], done: [row] }`.

### `POST /todos { "title", "note"?, "category"?, "date"? }`
`201` → `{ todo }` (added at the top, like the app).

### `PATCH /todos/:id { "title"?, "note"?, "category"?, "date"?, "done"?: true|false }`
- `done: true` works like ticking it off in the app: a timeline event is created
  `{ id (to-do id format), title, description: note, date: to-do date (today, London, if blank), category, source: "todo", fromTodo: true, nextAction: "none", addedBy: "bot" }`,
  and the row gets `doneAt` + `eventId`. `200` → `{ todo, event }`.
- `done: false` reopens it (`doneAt: ""`, `eventId: ""`). The app has no undo; the API deletes the linked event only if the API created it (`eventRemoved`), otherwise it is left on the timeline (`eventKept`).
- Edits to a done item do not change its event.

### `DELETE /todos/:id`
Removes the row (like the app; a linked event stays). `200` → `{ deleted }`.

## Word to Int
Saved words live at `users/{uid}/wordNumbers/{id}`, the same docs the app's Word to Int screen reads and writes. The numbers are worked out exactly as the app does it (the code is ported from `src/services/wordToIntService.js`, so keep the two in sync).

**Rules:** the text is trimmed first. Upper and lower case count the same, and only the letters A–Z count. Spaces, punctuation, digits and accented letters are all ignored, so `É` adds nothing.
| cipher id (aliases) | rule |
|---|---|
| `ordinal` (`English Ordinal`) | A=1 … Z=26, summed |
| `pythagorean` (`Full Reduction`) | A=1 … I=9, J=1 … R=9, S=1 … Z=8 (`((n-1)%9)+1`), summed |
| `reverse` (`Reverse Ordinal`) | A=26 … Z=1, summed |
| `reduced` | ordinal sum digit-summed until it is 1–9, or stops at master number 11, 22 or 33 |
| `hashcode` | Java `String.hashCode` of the trimmed text (case and spaces count here), 32-bit signed |

**Saved doc shape** (the same as the app's, plus `addedBy` and `lookupKey`): `{ id: "<ms>-<6 base36>", phrase, notes, preferred: "ordinal", lookupKey, ordinal, pythagorean, reverse, reduced, hashCode, letterCount, createdAt, updatedAt, ownerUid, addedBy: "bot" }`.
`lookupKey` is the phrase in lower case, with the ends trimmed and repeated spaces collapsed. Those keys also live in one doc, `users/{uid}/meta/wordIndex` (`entries` of `{ k, id }`, plus `count`, `bytes`, `seeded`).

### `POST /words/calc { "text" }`
This writes nothing. One index read.
`200` → `{ values, saved: { id } or null, indexReady, reads }`.
`400` if the text has no letters A–Z.

### `POST /words { "text", "notes"?, "preferred"? }`
One index read. A new word is two writes (the word and the index). An existing word is no write.
`201` → `{ existing: false, word, values, reads, writes }`. Already saved: `200` → `{ existing: true, id, values, reads, writes }`.
`409` `index_not_ready` until the index has been built.

### `POST /words/index/rebuild`
Reads the word list once and writes the index. Run this once after deploy (about one read per saved word). The owner calls it with a bot key. An admin can call `POST /admin/users/:uid/word-index/rebuild`.
`200` → `{ seeded, count, bytes, reads, writes }`.

### `POST /words/bulk { "words", "notes"?, "preferred"? }`
`words` is an array of text, or `{ "text", "notes"?, "preferred"? }`. At most **499** words. A longer array is `400` `batch_too_large` and the index is not read.
One transaction reads the index, skips keys already there, and writes the new words plus the index. Cost is 1 read and (new words + 1) writes.
`201` if any word was added, otherwise `200` → `{ count, added, existing, errors, reads, writes, results }`.
`409` `index_not_ready` if the index has not been built. `409` `index_full` if it would pass 800 KB.

### `GET /words?cursor=&limit=`
One page at a time (default 50, max 200), in document id order. Pass `cursor` from `nextCursor`. A page costs one read per word on that page, not one read per saved word. `200` → `{ count, words, scanned, reads, nextCursor? }`. If the list cannot be read, `503` `{ code: "words_unavailable", error }` instead of a bare 500.

### `GET /words?number=10` or `?value=10&cipher=ordinal`
Looks up the number in `meta/wordIndex`. **1 read**, however many words are saved. It does not open each word document. `cipher` defaults to `ordinal`. `200` → `{ number, cipher, count, reads: 1, matches: [{ id, key, number }] }`. `409` `index_not_ready` if the index has not been built.

### `GET /words?q=&limit=&cursor=`
Searches the phrase and notes on this page only, ignoring case. Same paging as the plain list.

### `PATCH /words/:id { "notes" }`
Updates notes. The index stays as it is. `200` → `{ word }`. `404` if it is missing.
`PATCH /words/:id { "text" }` renames the word and moves its index key. If that text is already saved, `{ existing: true, id }` and nothing is written.

### `DELETE /words/:id`
Tombstones the word and removes its key from the index. `200` → `{ deleted, removedKey, reads, writes }`.

## Key management (app only)
These use `Authorization: Bearer <Firebase ID token>` of the signed-in app user, not a bot key.
- `POST /keys/create { label, replace? }` → `201 { key, hash, label, botType: "grok" }`. Key = `tl_` + 32 random bytes (base64url). Only its SHA-256 is stored, with `botType: "grok"`. One active key. A second create without `{ "replace": true }` is `409`. Replace revokes the previous active key in the same transaction. Other bot types are `400` for now. Keys that were already active stay valid until revoked or replaced.
- `POST /keys/list` → `{ keys: [{ hash, label, revoked, botType, createdAt, lastUsedAt }] }`
- `POST /keys/revoke { hash }` → `{ hash, revoked: true }` (only your own keys)

## Read cost
- Every API write (events, attachments, invites, to-dos, words) bumps `users/{uid}/meta/sync` `{ version, lastChanged, lastChangedBy: "bot", lastWhat }` unless `?nosync=1`.
- A word add reads `users/{uid}/meta/wordIndex` once. It does not read the whole word list. `POST /words/bulk` is capped at 499 words. A longer sheet is refused before that read. Build the index once with `POST /words/index/rebuild`.

## Admin API
Separate from user bot keys. Send `Authorization: Bearer <Firebase ID token>` of Sarah (`sarah.v.phillips@googlemail.com`) or an email on `app/staff.admins`, or `Bearer tla_…` (an admin key created in the app). Admin routes do not spend the user's allowance.
- `POST /admin/keys/create` (signed-in admin only) → `201 { key, hash }`. The key is shown once.
- `POST /admin/keys/revoke { hash }`
- `GET /admin/lookup?email=`
- `GET /admin/users/:uid/limits` and `PATCH` `{ dailyAllowance?, adsUnlocked?, premium?, allowanceExempt?, testAccount? }`
- `GET /admin/users/:uid/keys` and `POST /admin/users/:uid/keys/revoke { hash }`
- `GET /admin/usage-rules` and `PATCH /admin/usage-rules`
- `GET /admin/tickets?status=` and `PATCH /admin/tickets/:id { status?, note?, draftEmail? }`. `draftEmail` is stored for a person to approve. The API does not send mail.
- `GET /admin/log`
- `POST /admin/allowance-test { uid | email }` dry-runs costs. `403` unless `entitlements/main.testAccount` is true. It does not write usage.

Every admin mutation appends to `adminLog` (create-only).

Problem tickets from the app are `tickets/{id}` with `status: "open"`. Users read their own. Only the admin API updates or closes them.

## Example
```bash
curl -X POST "$BASE/events" -H "Authorization: Bearer $TIMELINE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Dentist","kind":"event","date":"2026-10-20T15:00:00Z"}'
```
