# Timeline preview (Grok live preview)

This folder is the **web preview** we have been building in Grok (TanStack / Vite), not the Expo app at the repo root.

Expo phone app stays in `App.js` and `src/screens/`. Do not mix the two.

## Admin gates (11 Sep 2026)

- Owner is always `sarah.v.phillips@googlemail.com` — cannot be removed or blocked
- Only the owner can grant/revoke admin
- Feature gates: Everyone vs Admin only
- Invite codes, block list, audit log
- Web preview: `src/lib/admin.ts`, `/admin` route
- Expo: `src/services/adminService.js`, `src/screens/AdminScreen.js`, Firestore `app/staff` (publish `firestore.rules`)

Laptop Expo copy: `C:\Users\sarah\Desktop\TimelineApp`
