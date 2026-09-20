# TimelineApp user manual

Version 1.0 · Updated 20 September 2026

Same text as Settings → User manual in the app.

## What it is

A private timeline of your life. Expo Go while we build; Google Play later. #kern2622.

## Sign in

Email and password, or Google. Forgot password uses Firebase mail.

## Home and Add event

Home: Timeline, Add event, Credits, Utilities, latest wash. Add event is one picker (Event, Poem, SMS, Call, Person, Social, Game, YouTube, Spotify, TV, Email, Gmail, QR, Food, Wash, Open Banking).

## Timeline

Years → months → weeks. Centre spine, bubbles left and right. Filter chips for Poems, Games, SMS, Banking, and so on. Home icon next to + goes Home.

## People

Friends even if they do not use the app. Invite code / QR. Share is per event.

## Credits

Stamps can grant credits. Shop spends them on extras. Everyday logging is free. Play Store packs later. Transfers between Timeline emails. Admin can set a test balance.

## Word to int / date circle

A=1…Z=26 (sarah = 47). No duplicate words. Sort alpha / number / date. Date circle: days between birthdays; optional Wheel of dates event. Dates as DD/MM/YYYY.

## Household and money

Wash: on-device media. Food: planned or eaten. Purchases: manual / email / screenshots. Open Banking: credit perk + sandbox import; live bank later.

## Checksums

SHA-256 for events and trimmed clips. Original file left as-is.

## Settings

Profile, labels, theme, People, Open Banking, privacy policy, this manual, clear local cache.

## If it fails

```
cd C:\Users\sarah\Desktop\TimelineApp
git pull
npx expo start --clear
```

Same Wi‑Fi as the phone. Publish Firestore rules if cloud reads fail.
