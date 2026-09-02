# Timeline App – Todo List
**Project:** Timeline App (KD #kern2622 / RN #kern2622)  
**Owner:** Sarah Victoria Pauline Phillips  
**Last updated:** 2 Sep 2026 (Settings appearance)

---

## Done

- [x] Login / Auth (Firebase email + password)
- [x] Forgot password flow
- [x] Starlink connection check
- [x] Timeline list (local AsyncStorage)
- [x] Add / Edit event
- [x] Categories: Personal, Work, Family, Health, Travel, Hobby, Days Between, Other
- [x] Email-as-event (manual): source type, category, next action, From field
- [x] Next action: “Ask Grok to draft a reply”
- [x] Ask Grok: copy prompt + on-screen toast + open Grok
- [x] App running in browser on HP laptop
- [x] User login with email and password
- [x] User register as new account (basic)  
  *(Welcome email with next steps still open)*
- [x] User add things like hobbies (MVP)  
  Poetry (title + poem text), Singing/Music (title + description + file note), Reading (progress). Full audio file attach still open.
- [x] Add poem – own screen (`AddPoemScreen`)
- [x] Home – simple menu (profile initial, Timeline, Add from email, Starlink, Word to Int, Days between dates, Share / Settings / Add account / Logout rows)
- [x] Year overview timeline (centre line, count bubbles, tap year → months)
- [x] Month view (centre spine, J–D, count bubbles, empty months as ticks, + menu)
- [x] Month items – centre line (Option B): items alternate left/right, tap to expand
- [x] Timeline cards – compact, expandable
- [x] Add button – single + with menu (Event, Email, Hobby/Poetry, QR, …)
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

- [x] Settings screen (light/dark + colour palettes; Home navigates here)
- [ ] Share timeline with another Timeline user (alert only)
- [ ] Add another account (alert: log out and sign in with a different email)

---

## Priority – Email integration

- [x] Share to Timeline (wired; needs Android/iOS dev build to test from Gmail or photo apps)
- [x] Add from email in-app (Home → Add Event with From + body)
- [ ] **In-app Pick from Gmail**  
  List recent emails via Gmail API; tap → Add Event pre-filled
- [ ] Welcome email on register

---

## Food tracking (scope TBD)

- [ ] **Food tracking**  
  1. Simple meal log on the Timeline  
  2. Structured food entry (meal type, items, optional calories)  
  3. Both (Timeline + Food section/filter)

---

## From Trello – still open

### Media & content

- [x] User add image (camera, gallery, or files; Google Photos appears via the Android system gallery - no separate OAuth)
- [ ] Full audio file attach for singing/music
- [ ] Labels shown on expanded timeline card
- [ ] Customisable poem categories
- [ ] Label / tag system (poems and events)
- [ ] User add tv or films watched (description + score /10)
- [ ] User add Spotify activity
- [ ] User add friends photos from social media
- [ ] User add social media feeds

### Communication

- [ ] User add SMS
- [ ] User add phone calls (notes, category, inbound/outbound)

### Daily life & tracking

- [ ] Time playing games (Steam / PlayStation / Android)
- [ ] User add purchases
- [ ] User add household chores
- [ ] User add google locations visited

### Life & people

- [ ] Life events (birthdays, house moves, wedding, …)
- [ ] User add friends (link timeline with them)
- [ ] User specify date of birth

### Account & setup

- [ ] User add their own categories
- [x] Light mode and dark mode (Settings: match device / light / dark). Home and headers follow the theme; other screens still have mixed hardcoded colours.
- [x] User-chosen colour scheme in Settings (Slate/cyan, Teal, Purple, Rose, Amber, High-contrast)

---

## Home screen widgets (later)

- [ ] Widgets for new events (needs a development build)
- [ ] Quick QR code scan widget (Add QR screen exists; home-screen widget does not)

---

## Next / Nice to have

- [ ] Google Sign-In (re-enable fully if needed)
- [ ] Better date picker (calendar UI)
- [ ] Filter timeline by category
- [ ] Mark next-action as done from the list
- [x] Photos / attachments on events (imageUri on Add Event / Add Poem; shown on expanded Timeline cards)
- [ ] Custom Firebase password-reset email template (needs Blaze plan)
- [ ] Android development / Play Store build (share sheet for text and images, and widgets, need this)
- [ ] Firebase Storage for event photos (imageUri/coverImageUri currently local-only paths)

---

## Security / device (separate from app features)

- [ ] Laptop security checks (remote apps, mic permissions, Windows password)
- [ ] Prefer throwaway password for Timeline until device feels safer

---

## Notes

- Event storage: Firestore `users/{uid}/events/{eventId}` when signed in; AsyncStorage `@timeline_events` is the offline cache (and the only store when logged out)
- Device sessions: Firestore `users/{uid}/sessions/{sessionId}` (install UUID in AsyncStorage `@timeline_device_id`). Rules need `match /users/{userId}/sessions/{sessionId} { allow read, write: if isOwner(userId) || isAdmin(); }`
- Firebase project: `timelineapp-3bc05` — Firestore database and rules still need enabling in the console if not already on
- Admin email: `sarah.v.phillips@googlemail.com`
- Running via Expo in browser (`localhost:8081`) and Expo Go on phone
- Android package / iOS bundle: `com.sarahphillips.timelineapp`
- Scheme: `timelineapp`
- Share-intent: `expo-share-intent` in `app.json` plugins
- Trello user stories imported 23 Aug 2026
- Code on laptop: `C:\Users\sarah\Desktop\TimelineApp`
- Grok project: Timeline app for Sarah Victoria Pauline Phillips

- [x] Week-by-week view with named dated days (Mon–Sun).
