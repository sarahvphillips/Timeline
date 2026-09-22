# Timeline App â Todo List
**Project:** Timeline App (KD #kern2622 / RN #kern2622)  
**Owner:** Sarah Victoria Pauline Phillips  
**Last updated:** 21 Sep 2026 (profile privacy + people share)

---

## Done

- [x] Login / Auth (Firebase email + password)
- [x] Forgot password flow
- [x] Starlink connection check
- [x] Timeline list (local AsyncStorage)
- [x] Add / Edit event
- [x] Categories: Personal, Work, Family, Health, Travel, Hobby, Days Between, Other
- [x] Email-as-event (manual): source type, category, next action, From field
- [x] Next action: âAsk Grok to draft a replyâ
- [x] Ask Grok: copy prompt + on-screen toast + open Grok
- [x] App running in browser on HP laptop
- [x] User login with email and password
- [x] User register as new account (basic)  
  *(Welcome letter in-app after register; inbox send still Blaze)*
- [x] User add things like hobbies (MVP)  
  Poetry (title + poem text), Singing/Music (title + take file on-device), Reading (progress).
- [x] Add poem â own screen (`AddPoemScreen`)
- [x] Home â simple menu (profile initial, Timeline, Add from email, Starlink, Word to Int, Days between dates, Share / Settings / Add account / Logout rows)
- [x] Year overview timeline (centre line, count bubbles, tap year â months)
- [x] Year overview kind-bubbles (8 Sep 2026): purple spine; per-year coloured Poem/Event/Email/QR/Family/Food/category bubbles on dotted spokes (alternating L/R); `getYearBubbleSummaries` + tap bubble → MonthOverview with kind filter params (filter UI deferred)
- [x] TEMP Design mock preview buttons (8 Sep 2026): reusable `DesignTargetButton` + `assets/design-*.png` on Home, YearOverview, Settings, Timeline (events-year), AddEvent (poetry-night detail), EventsWithFriends — remove when screens match sketches
- [x] Settings UI rename (8 Sep 2026): **Poem categories** → **Poem types** / placeholder **New poem type**. Labels unchanged. Data keys (`poemCategories`, `@timeline_poem_categories_*`) kept so existing lists still load.
- [x] Settings: Enter/Return in Labels and Poem types add fields adds the item (same as Add button) (8 Sep 2026)
- [x] Month view (centre spine, JâD, count bubbles, empty months as ticks, + menu)
- [x] Month items â centre line (Option B): items alternate left/right, tap to expand
- [x] Timeline cards â compact, expandable
- [x] Add button â single + with menu (Event, Email, Hobby/Poetry, QR, â¦)
- [x] Word to Int converter + saved number list
- [x] Word to Int: Java hashCode method (full phrase, 32-bit signed)
- [x] Word to Int: lookup matches saved date spans; Use as day count to Days between
- [x] Days between dates (timeanddate-style breakdown)
- [x] Days between: saved span list (AsyncStorage)
- [x] Days between: Add N days (sets To); matching Word-to-Int phrases
- [x] Add QR link screen
- [x] Profile photo - tap avatar to pick (camera / gallery / file); stored in AsyncStorage (`@profile_photo`); initials remain the fallback
- [x] Share to Timeline (code)  
  Android: `expo-share-intent` + intent filters (`text/*`, `text/plain`, `message/rfc822`, `image/*`, jpeg/png/webp/gif), package `com.sarahphillips.timelineapp`.  
  iOS: text, URL, and image activation rules. Shared images are copied into the app documents folder, then Add Event opens with `imageUri` (held until login if needed).  
  Home: **Add from email** pre-fills Add Event (`fromEmail`).  
  *Gmail / Camera / Gallery / Google Photos / Files -> Share -> Timeline only works in a real Android or iOS development build, not Expo Go. Web cannot receive share-sheet images; in-app picker still works.*
- [x] Persist events to Firestore for the signed-in user (`users/{uid}/events/{eventId}`). AsyncStorage `@timeline_events` remains the offline cache. Poems stored as hobby events (hobbyType poetry) sync with the rest. Local image URIs still sync as fields; Firebase Storage is not in this pass. Date spans stay local.
- [x] Persist Word-to-Int numbers list to Firestore (`users/{uid}/wordNumbers/{entryId}`). AsyncStorage `@word_to_int_list` remains the offline cache. Logged-out use stays device-only.
- [x] Record this install as a Firestore session (`users/{uid}/sessions/{deviceId}`). Home lists signed-in devices and notes other laptop/phone sessions; no single-device lockout.

---

## Built as placeholders (rows exist, not connected yet)

- [x] Settings screen (light/dark + colour palettes; profile display name + DOB; custom labels; poem types (UI label; storage key poemCategories unchanged) - all local AsyncStorage for now; HomeFab on timeline/year/month/settings)
- [x] Settings menu shell (5 Sep 2026): working prefs at top; Account (real **Signed-in devices** from `users/{uid}/sessions` + Soon rows); Timeline / Sharing & mail / Privacy Soon rows (web `window.alert` / native Alert); wired **About** (app name, version 1.0.0 from expo-constants/app.json, Expo SDK 57, #kern2622); local cache clear kept near bottom
- [x] Settings Soon: **Friend invite limits** + **Friend referrals** (8 Sep 2026) — free tier caps invites/friends per shared event; paid unlocks more; refer-a-friend → one month free invite headroom (details TBD).
- [x] Settings Soon: **Purchases security** (8 Sep 2026) — placeholder under Privacy; 2FA-style checks before in-app purchases. Purchases UX likely Home hub for browse/buy + Settings for security/payment methods + in-context buy actions.
- [x] Events with friends MVP (per-event share invites + intersecting view)
- [x] Delete event with confirm (Add Event edit + Timeline expanded Delete; web uses window.confirm; removes local + Firestore for uid when sync on)
- [x] Add Event save feedback on web (window.alert like Settings clear-cache; Save disabled while saving; on-screen Saved notice; goBack once)
- [x] Firestore share participants hardened - participantForCloud only allows uid/displayName/email/initial/colour/status timestamps; never write photoUri/local image refs (fixes Property participants contains an invalid nested entity)
- [x] Friend source on shared events - invitee UI shows `From friend - email` (or `From friend - if unknown); `sharedFromEmail` / invite `fromEmail` / `createdByEmail` persisted on accept/share
- [x] Add Event edit Source area shows shared / From friend (same label as Timeline) for `source===shared` / isShared / sharedFromEmail
- [x] Shared ownership: creator Delete (own copy; may end share for them); invitee **Leave event** (removes users/{uid}/events copy only; sets participants[uid].status left/declined + recentLeft notice; does not delete sharedEvents/creator event)
- [x] Creator notice: Share screen banner when someone left/declined (`recentLeft`, prefer email); Decline invite uses same notify path
- [x] Shared edit suggestions MVP: invitee Suggest a note (core fields read-only); persist \editSuggestions\ on \sharedEvents/{shareId}\; creator Approve/Decline on Share screen; approve appends attributed note to description + syncs creator copy; invitee copies refresh via \syncLocalEventFromShared\; ecentSuggestion\ banner / pending count
- [x] Creator notices on Edit Event (AddEventScreen): load sharedEvents when creator opens Edit; banner for friend left + pending suggest-notes with Approve/Decline; Timeline light "Friend left" / "Note suggested" flags; leave invite cleanup by inviteCode (no collection query / no LogBox warn); Events with friends filters out shares with no other active participant
- [x] Accept invite **Scan QR** (`AcceptInviteScreen` + `expo-camera` CameraView on native; parses raw code / `timelineapp://share/CODE` / https share links; web keeps paste-only note). Share QR enlarged for coffee-table scan.
- [x] **Events with friends layout (21 Sep 2026):** year/month/week on the centre axis; shared cards left/right with curves. Filter chips per friend + All friends. **Show private items** off by default (personal cards grey, Personal only).
- [x] **People invite share (21 Sep 2026):** Copy, Gmail, SMS, WhatsApp, More (OS share sheet). After Add person, optional Invite.
- [x] **Profile privacy (21 Sep 2026):** Settings Totally private (default) vs Searchable. Public handle, share link + QR. People → Find a public profile. Publish `publicProfiles` + `profileHandles` rules.
- [ ] Share whole timeline with another Timeline user (still later)
- [ ] Add another account (alert: log out and sign in with a different email)

---

## Priority â Email integration

- [x] Share to Timeline (wired; needs Android/iOS dev build to test from Gmail or photo apps)
- [x] Add from email in-app (Home â Add Event with From + body)
- [x] **In-app Pick from Gmail** (working in preview + Expo picker). Live Gmail API list still later if wanted.
- [x] **Welcome email on register (21 Sep 2026):** letter from Sarah after Create account. Settings → Welcome email to re-read. Copy to clipboard. Real inbox send still needs Blaze / Trigger Email.

---

## Food (thin Timeline add-on - not a calorie app)

Product map:
- Layers: **Cupboard** / **Plan** / **Eaten**
- Photo-heavy optional add-on; calories out of scope for now

- [x] **Show Food in the + menu** Settings toggle - default **OFF**; uid-scoped AsyncStorage + Firestore `settings/foodPrefs`
- [x] **Add Food** form (`AddFoodScreen`): photo + items (text) + date + planned/eaten -> Timeline event `source: 'food'` (`foodStatus`, `foodItems`, optional `imageUri`)
- [x] Web photo quota: compress/resize on pick (`expo-image-manipulator`, max width ~1280, JPEG ~0.7; canvas fallback for blob:/data:); heavy `data:` payloads stored under `@timeline_img_{eventId}` with short refs in events list; QuotaExceededError -> clear message. **Firebase Storage still the real long-term fix.**
- [x] + menus (Timeline / Month / Week) show Food only when toggle is on
- [x] **Cupboard** (preview bought list / use in a meal). Expo cupboard still thin vs preview.
- [ ] Calories / structured nutrition - not in this pass

---

## From Trello â still open

### Media & content

- [x] User add image (camera, gallery, or files; Google Photos appears via the Android system gallery - no separate OAuth)
- [x] **Singing / music takes (22 Sep 2026):** Add event → Singing / music. Attach or record a take (on-device, not Firestore). How it felt, optional lyrics, optional link to a saved poem. Timeline **Singing** filter. Call recordings stay credit-gated; this is free.
- [x] Labels shown on expanded timeline card (20 Sep 2026): Settings labels picker on Add Event / Poem / SMS / Calls. Purple chips on expanded Timeline cards and year/month/week bubble sheets.
- [x] Customisable poem types (Settings UI says Type; AsyncStorage/Firestore key poemCategories unchanged)
- [x] Label / tag system basics (Settings can edit labels list locally; showing on expanded cards still open)
- [x] **TV & films** (21 Sep 2026): Add event → TV & films. Film / series / episode, date, score /10, status, where, with, optional IMDb/Letterboxd, labels, timeline. Own **TV & films** filter chip (`source: watched`). Not YouTube.
- [x] **YouTube** (first pass 17 Sep 2026) — track *your own* uploads: paste video URL, title, upload date, note. Optional add to timeline. Share that view with Timeline friends (note + link, not YouTube comments). Thumbnail from the video id. Channel list / auto-import later. Not the same as TV & films watched.
- [x] **Spotify** (19–20 Sep 2026): share-link only. Paste track/album/playlist/artist/episode URL, title, artist, listened/saved/playlist, note, optional timeline + share view. **No live Spotify login / Web API** for now (50-play cap, 5-user dev mode, Premium owner). Parked until asked again.
- [x] **Call recordings credits perk** (19 Sep 2026): attach/record/screen-recording on phone calls locked until `callRecording` shop item (4 credits). Call log itself stays free.
- [x] **Call recordings credits perk** (19 Sep 2026): attach/record/screen-recording on phone calls locked until `callRecording` shop item (4 credits). Call log itself stays free.
- [x] **Social media** (20 Sep 2026): paste X / Instagram / Facebook / TikTok / Threads / Reddit / LinkedIn / Bluesky link (or type a title). Posted/Shared/Saved/Liked/Replied. Timeline + **Social** filter chip (item bubbles). No live feed login.
- [x] Home slim (20 Sep 2026): SMS, calls, People, Gmail, social, games, YouTube, etc. live under **Add event** picker. Timeline **+** opens the same picker. People also in Settings.
- [x] Credits in Firestore (20 Sep 2026): `users/{uid}/settings/rewards` + `rewardsIndex/{email}` for admin lookup. Admin screen can set / +5 / −5. Publish `firestore.rules`. Device AsyncStorage is cache.
- [x] **Word-to-int graph (22 Sep 2026):** Utilities → Word to int → Graph. Force layout. Words link through a number hub when they share Ordinal / Pythagorean / Reverse / Reduced. Drag nodes. Not Gephi itself.
- [ ] User add friends photos from social media
- [ ] User add social media feeds (live import — later; APIs are locked down)

### Communication

- [x] **Add SMS** (17 Sep 2026): log received/sent texts, match People by name/number, show their card, default share from SMS Auto (can untick). Location Home/Internet/free text. Saves timeline `source: 'sms'`. If they use the app, tries event share. Home + + menus. Year bubble SMS.
- [x] **Phone calls** (19 Sep 2026): incoming / outgoing / missed, duration, note, location. Match People; Calls Auto default share. Attach audio or record a voice note (not a tap of the live line). Audio stays on-device (`audioUri`). Timeline `source: 'call'`.

### Daily life & tracking

- [x] **Games** (20 Sep 2026): manual log + paste Steam / PlayStation / Play Store link. Platform, session time, Playing/Finished/Dropped/Backlog, optional score, timeline. **No live APIs:** PSN unofficial (NPSSO = password, ban risk); Android UsageStats needs a native build; Steam Web API needs a secret key (not in the phone app). Parked like Spotify login.
- [ ] Time playing games live import (Steam API key server-side / Android usage stats native / PSN unofficial — not doing unofficial)
- [x] User add purchases (preview mock 10 Sep 2026): manual / email / Amazon / Uber Eats / website / **notification screenshot** (easy path — no bank login) / bank screenshot. **Uber Eats Gmail import**. Driver details perk.
- [x] **Banking section** (preview 10 Sep 2026): own hub, not mixed with poems/life. Event kinds: Direct debit, Standing order, Rent, Credit card, Large spend, Incoming. Monthly repeat, pin to timeline, 6-month spend bars from purchases + these events.
- [ ] **Open Banking** (after screenshot/notification flow is solid). Optional connect for Lloyds and other UK banks so payments can import without photos. Not all users will want this; screenshots stay. Needs FCA-regulated provider (TrueLayer / Plaid / Moneyhub etc.), consent, and a perk/credits discussion. Could feed the Banking hub (upcoming DDs, rent, cards) as well as purchases.
- [x] **Open Banking sandbox (20 Sep 2026):** perk (6 credits), Settings + Add event, Lloyds-shaped demo txs → Banking events. Live AISP + Cloud Functions still parked.
- [ ] **Purchases: Delivery tracking perk** (credits or subscription — not all users want this). Driver name / reg / photo / phone from a delivery screenshot. Later: doorbell clip of arrival, phone screen recording, phone camera of drop-off. Off by default. Preview toggle on Add purchase.
- [x] **Clip points without editing the original** (preview 10 Sep 2026): pick video, show size + length, user sets start/end. **Checksum the trimmed copy** (what the user verifies). Also store the original file checksum. Preview downloads a new WebM copy (does not overwrite gallery). Expo later: save clip to gallery (`MediaLibrary`). Re-encode in browser; native can stream-copy.
- [x] **App checksums** (preview): Home section + `/checksums`. Events get a checksum on create; each edit adds a new checksum row (edit-list). Videos checksummed too.
- [x] **Locations / Places (21 Sep 2026):** Add event → Location. Presets Home / Internet / high street. Paste Google Maps share link. **Use current GPS** (foreground only, Expo Go permission). Date, arrived/left, People, optional share. Timeline **Places** filter. Generic events can also take a location. Maps Timeline history cannot be imported (Google closed it).
- [ ] User add household chores

### Life & people

- [x] **Life events (21 Sep 2026):** Add event → Life event. Birthday / house move / wedding / graduation / new job / new baby / other. Who (People), place, photo, Coming up (incl. People birthdays not yet saved). Timeline **Life** filter. Birthdays already on People stay there too.
- [x] User add friends - per-event invite MVP (`sharedEvents` + `eventInvites`; Events with friends screen)
- [x] **People** (17 Sep 2026): real-life friends even if they don’t use Timeline. Name, phone, email, birthday DD/MM/YYYY, note. Optional invite. Auto-share SMS/calls flags for later SMS/call screens. Import from date circle / add to wheel. Birthday can be pinned as a Family timeline event. Local uid-scoped list (`@timeline_people_v1_{uid}`).
- [x] **Stamps + credits shop** (17 Sep 2026): Home private stamps (Poem, Friend joined, Word saved, Wash done, Event shared, Checksum, Food, Birthday). First row of four filled → +2 credits once. Shop spends credits on delivery perk, extra invites, clip points, custom categories, checksums-on-home. No streaks.
- [ ] **Credits shop catalogue (later):** only add items after weighing (1) build cost, (2) how often it would actually be used, (3) how much people want it vs a free tool. Current placeholders can stay or be replaced. Do not price everyday logging (poems, events, word-to-int, date circle, People, SMS/call logs, wash, food).
  **Once current unlocks are owned, prefer consumable packs (repeat buys):** extra clip points; extra invite slots; extra Open Banking refresh / extra linked account; extra custom categories or labels.
  **Nice-to-have unlocks:** widget pack (new event, QR scan, current month); extra palettes / one custom colour; longer wash/call recording; Gmail import above a monthly cap; Share-to-Timeline from Android (Play build); pin a year / extra saved timeline filters.
  **Heavier later (credits or subscription):** live Steam import; delivery doorbell clips; full Open Banking (provider fees); banking graphs / upcoming DD hub; video clip packs; whole-timeline share.
  **Admin:** gift 5 credits + thank-you stamp for testers.
- [ ] Broader friend graph / whole-timeline link (later)
- [ ] **Friend usernames (privacy)** - some people may not want to share emails with friends. Add optional usernames; prefer username over email in friend source labels when set. Until then, friend source uses email.
- [ ] **Friend avatars on sharedEvents** - do not write local photoUri (data:/blob:/asref:) to participants; use Firebase Storage download URLs later. Until then friends view falls back to initial. (participantForCloud)
- [ ] **Polish Events with friends timeline display** - first cut done 21 Sep (curves, friend filter, optional private). Avatars on lines / extra friends-view ideas still later. Remove TEMP Design button when it matches the sketch.
- [ ] **TEMP: Design button on Events with friends** - top-right corner opens `assets/friends-design-target.jpg` modal preview. Remove when friends view polish matches the sketch.
- [x] User specify date of birth (Settings, local for now)

### Account & setup

- [x] **Custom event categories (22 Sep 2026):** Settings. Built-in stay. Extra names after unlocking **Custom event categories** (4 credits). Add Event / Poem chips + Timeline filters pick them up. Synced in Firestore `settings/eventCategories`.
- [x] Light mode and dark mode (Settings: match device / light / dark). Home and headers follow the theme; other screens still have mixed hardcoded colours.
- [x] User-chosen colour scheme in Settings (Slate/cyan, Teal, Purple, Rose, Amber, High-contrast)

---

## Home screen widgets (later)

- [ ] Widgets for new events (needs a development build)
- [ ] Quick QR code scan widget (Add QR screen exists; home-screen widget does not)

---

## Next / Nice to have

- [ ] **Future: IRL / public event QR** - scan a venue/poster/public-page QR -> draft a Timeline event from page/link metadata (title, URL, date if present). Friend-invite Scan QR (share code / `timelineapp://share/CODE`) stays separate; codes/SMS remain for remote invites.

- [ ] Google Sign-In (re-enable fully if needed)
- [ ] Better date picker (calendar UI)
- [x] Filter timeline by category (20 Sep 2026): chips on Years + list. **Poems** (and Games/SMS/…) puts every matching item on the spine as its own bubble, grouped by year — same idea as the poems-chip design.
- [ ] Mark next-action as done from the list
- [x] Photos / attachments on events (imageUri on Add Event / Add Poem; shown on expanded Timeline cards)
- [x] **Privacy policy + user manual** (20 Sep 2026): Settings screens + docs/PRIVACY.md + docs/USER-MANUAL.md. Public URL still needed for Play Store. Export/delete account still later.
- [ ] Custom Firebase password-reset email template (needs Blaze plan)
- [ ] Android development / Play Store build (share sheet for text and images, and widgets, need this)
- [ ] **Play Store credit SKUs** (parked until listing is ready). Package `com.sarahphillips.timelineapp`. Consumable one-time products, same ids as Mafia: `1_credits`, `10_credits`, `25_credits`, `100_credits`. Browser must not sell credits.
  1. Play Console app + Payments profile.
  2. Upload an `.aab` to Internal testing (Expo Go does not count).
  3. License tester: `sarah.v.phillips@googlemail.com`.
  4. Monetize with Play → Products → One-time products → Create each SKU (Buy, not Rent/subscription) → price → Activate.
  5. App consumes after grant (`finishTransaction` / `isConsumable: true`) then Firestore credits. No extra rules text for SKUs.
- [ ] Firebase Storage for event photos (imageUri/coverImageUri currently local-only / web AsyncStorage-split; compress+separate keys is a stopgap - Storage is the real fix)

---

## Security / device (separate from app features)

- [ ] Laptop security checks (remote apps, mic permissions, Windows password)
- [ ] Prefer throwaway password for Timeline until device feels safer

---

## Notes

- **CLEANUP (manual):** If account B still shows A's events, delete B's docs under `users/{B_uid}/events` in Firebase Console (Firestore) again. Then full-reload Expo Go and sign into B - must be empty. Sign into A - events still there. Do not rely on Admin SDK unless already set up.

- **AsyncStorage key audit (5 Sep 2026) - first-slice isolation**

  | Key pattern | Scope | Notes |
  |---|---|---|
  | `@timeline_events_{uid}` / `@timeline_events_guest` | uid / guest | Events local cache. Legacy `@timeline_events` migrates only to rightful uid. |
  | `@word_to_int_list_{uid}` / `@word_to_int_list_guest` | uid / guest | Word-to-Int local cache. Legacy `@word_to_int_list` same last_uid gate. |
  | `@date_span_list_{uid}` / `@date_span_list_guest` | uid / guest | Date spans (newly scoped 5 Sep). Legacy `@date_span_list` migrates only when `@timeline_last_uid` matches. |
  | `@timeline_profile_{uid}` / guest | uid / guest | Display name + DOB. |
  | `@timeline_labels_{uid}` / guest | uid / guest | Custom labels. |
  | `@timeline_poem_categories_{uid}` / guest | uid / guest | Poem types (UI); key name unchanged. |
  | `@timeline_theme_mode_{uid}` / `@timeline_theme_palette_{uid}` (+ guest) | uid / guest | Appearance prefs. |
  | `@timeline_food_prefs_{uid}` / guest | uid / guest | Show Food in + menu (default off). |
  | `@timeline_img_{eventId}` / `_cover` | per event | Heavy web photo payloads (data URIs) split out of events JSON to avoid localStorage quota. |
  | `@profile_photo_{uid}` / `@profile_photo_guest` | uid / guest | Profile photo URI (newly scoped 5 Sep). Legacy `@profile_photo` last_uid-gated. |
  | `@timeline_last_uid` | device-global | Last successful login uid (migration gate). Not cleared by cache clear. |
  | `@timeline_device_id` | device-global | Install UUID for sessions. Intentionally shared across accounts. |
  | Firebase Auth persistence (RN AsyncStorage) | auth SDK | Keep intact - do not wipe. |

  **Settings -> Clear this account's local cache:** empties only current uid's events, wordNumbers, date spans, and profile photo. Does **not** clear other uids' keys, guest keys of other sessions, Firestore, `@timeline_last_uid`, or `@timeline_device_id`. Auth scopes re-bumped after clear; navigator remounts on uid change so in-memory lists reset.

  **Sync re-enabled (5 Sep 2026):** `EVENTS_FIRESTORE_SYNC_ENABLED=true`, `WORD_NUMBERS_FIRESTORE_SYNC_ENABLED=true`. Clear-this-account local cache confirmed (B cleared, A untouched). Account B should start from **empty cloud** after clear (previously 0 events under B) - create new events on B only; they must not reappear on A.

- **Events / wordNumbers Firestore sync RE-ENABLED (5 Sep 2026):** Flags true in `eventService.js` / `wordToIntService.js`. Kept uid scoping, `ownerUid` checks, `beginAuthScope`, and clear-local-cache. App shell waits for the first cloud pull before painting Home/Timeline; Year/Month/Week/Timeline and Word-to-Int show a syncing state and await `getEvents` / `getWordNumbers` (no empty-then-fill flash). Local-only photo URIs (`file://`, `content://`, etc.) are stripped on upload (merge write) - **still no Firebase Storage** for photos; `imageUri` / `coverImageUri` remain device-local. Do not invent Storage in this pass.

- **Isolation note:** Phone A keeps its local + cloud events. Browser B after clear should sync empty (or only B’s own cloud docs). Creating an event on B must persist via Firestore for B only.

- **Legacy bleed fix (4 Sep 2026):** `eventBelongsToUid` requires `ownerUid === uid` (missing ≠ belong). Legacy `@timeline_events` migrates only when `@timeline_last_uid` matches, every event already has `ownerUid === uid`, or this uid's cloud is non-empty - never into an empty-cloud other account. Same last_uid gate for word-to-int / profile / theme legacy keys. On login, `App.js` sets `@timeline_last_uid` after sync.


- Event storage: Firestore `users/{uid}/events/{eventId}` when signed in; AsyncStorage `@timeline_events_{uid}` offline cache (guest: `@timeline_events_guest`). Legacy global `@timeline_events` migrates only to the rightful uid (see above), with `ownerUid` stamped.
- Device sessions: Firestore `users/{uid}/sessions/{sessionId}` (install UUID in AsyncStorage `@timeline_device_id`). Rules need `match /users/{userId}/sessions/{sessionId} { allow read, write: if isOwner(userId) || isAdmin(); }`
- Firebase project: `timelineapp-3bc05` â Firestore database and rules still need enabling in the console if not already on
- Admin email: `sarah.v.phillips@googlemail.com`
- Running via Expo in browser (`localhost:8081`) and Expo Go on phone
- Android package / iOS bundle: `com.sarahphillips.timelineapp`
- Scheme: `timelineapp`
- Share-intent: `expo-share-intent` in `app.json` plugins
- Trello user stories imported 23 Aug 2026
- Code on laptop: `C:\Users\sarah\Desktop\TimelineApp`
- Grok project: Timeline app for Sarah Victoria Pauline Phillips

- [x] Week-by-week view with named dated days (MonâSun).

- [x] EAS / share-intent `app.json` restored (owner `sarahpoet6014`, projectId `0f4f935b-9897-4ac5-b760-39d00794adfc`, splash/icon images, iOS infoPlist, Android adaptiveIcon + CAMERA/media permissions + versionCode, expo-share-intent text+image filters, expo-image-picker plugin). Upgraded to Expo SDK **57** (expo ~57.0.0, React Native 0.86.3, expo-share-intent ^8.0.0). Config plugins and intent filters kept; OS share-into-app still needs a real Android/iOS development build (not Expo Go). Restart Metro and reopen in Expo Go SDK 57 on the phone after this upgrade.


## Events with friends (MVP) - Firestore rules to paste

### Publish these rules (Firebase Console — no CLI)

Sarah must paste/publish in **Firebase Console → Firestore → Rules** (project `timelineapp-3bc05`). Full file is also at repo root `firestore.rules`.

**eventInvites update must allow:**
- `fromUid` always
- pending → accepted by `acceptedByUid`
- pending → declined by `declinedByUid`
- accepted → declined by `acceptedByUid` (leave cleanup)

App leave path no longer queries `eventInvites` by `shareId`; it updates the single invite doc when local `inviteCode` is set. Creator sees friend-left / suggest-note banners on **Edit Event** (and light flags on Timeline); Events with friends hides shares with no other active participant.



Collections:
- `sharedEvents/{shareId}` - event snapshot + `participantUids` + `participants` map
- `eventInvites/{inviteId}` - invite code is the document id; `status`: pending|accepted|declined|expired

Suggested rules (practical; keep existing `isOwner` / `isAdmin` for `users/{uid}/...`):

```
match /sharedEvents/{id} {
  // Signed-in read so invitees can preview before accept (MVP).
  // Tighten later to creator/participant OR pending-invite holder.
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.createdByUid
    && request.auth.uid in request.resource.data.participantUids;
  allow update: if request.auth != null
    && (request.auth.uid == resource.data.createdByUid
        || request.auth.uid in resource.data.participantUids
        || (request.auth.uid in request.resource.data.participantUids
            && !(request.auth.uid in resource.data.participantUids)));
  allow delete: if request.auth != null
    && request.auth.uid == resource.data.createdByUid;
}

match /eventInvites/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.fromUid;
  // fromUid always; pending→accepted by acceptedByUid;
  // pending→declined by declinedByUid; accepted→declined by acceptedByUid (leave cleanup)
  allow update: if request.auth != null
    && (
      request.auth.uid == resource.data.fromUid
      || (
        resource.data.status == 'pending'
        && request.resource.data.status == 'accepted'
        && request.resource.data.acceptedByUid == request.auth.uid
      )
      || (
        resource.data.status == 'pending'
        && request.resource.data.status == 'declined'
        && request.resource.data.declinedByUid == request.auth.uid
      )
      || (
        resource.data.status == 'accepted'
        && request.resource.data.status == 'declined'
        && resource.data.acceptedByUid == request.auth.uid
        && request.resource.data.declinedByUid == request.auth.uid
      )
    );
  allow delete: if request.auth != null
    && request.auth.uid == resource.data.fromUid;
}

// Existing - accept writes the invitee's own event copy:
match /users/{userId}/events/{eventId} {
  allow read, write: if isOwner(userId) || isAdmin();
}
```

**Test path (two accounts):**
1. Account A: create/open an event -> **Share with a friend** -> copy code.
2. Log out -> Account B: Home -> **Enter invite code** -> paste -> Accept.
3. Both: Home -> **Events with friends** - shared node on centre spine with friend colour meeting it.


**Coffee-table QR test:** A: Share with a friend (large QR on screen). B: Enter invite code -> **Scan QR** -> Accept.

**Edit suggestions test path:**
1. A: share event -> B: accept invite.
2. B: open shared event -> core fields read-only -> **Suggest a note** -> Submit.
3. A: Share with a friend -> see pending suggestion / banner -> **Approve** (note appears on description for A; B sees it after reopening) or **Decline**.

