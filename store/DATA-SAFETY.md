# Play Console — Data safety and content rating

Paste these when the console lets you in. Package `com.sarahphillips.timelineapp`. Privacy policy URL:

https://github.com/sarahvphillips/Timeline/blob/main/docs/privacy.html

Delete account URL (paste this in Play Console → App content → Account deletion):

https://github.com/sarahvphillips/Timeline/blob/main/docs/DELETE-ACCOUNT.md

This matches the app as of 26 September 2026. Purchases are off. Photos, video, and audio stay on the device.

## Data safety — overview

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (Firebase uses HTTPS) |
| Do you provide a way for users to request that their data is deleted? | Yes |
| Account created in the app? | Yes |
| Delete some or all data without deleting the account? (optional) | Yes. In the app they can delete single events, leave a shared event, remove a profile photo, clear this device’s local cache (Settings), and remove other signed-in devices. That does not close the login. To delete everything including the account: Settings → Delete account, or email sarah.v.phillips@googlemail.com. |
| Delete account | In the app: Settings → Delete account. Or email sarah.v.phillips@googlemail.com with subject “Delete my TimelineApp account”. Full steps: https://github.com/sarahvphillips/Timeline/blob/main/docs/DELETE-ACCOUNT.md |
| Ads | No |
| Data sold | No |
| Data shared with third parties for their own use | No. Google Firebase only processes it for Timeline. Another person sees an event only if the user shares that event or sends an invite. |

"Collected" means it leaves the phone and is stored in Firebase. A photo that stays in the gallery is not collected.

## Data types to tick

For every row below: purpose **App functionality**. Not used for ads, marketing, or analytics. Users can ask for it to be deleted.

| Data type | Collected | Shared | Required or optional |
|---|---|---|---|
| Precise location | Yes. Only after "Use current GPS". The place name, address, and coordinates can be saved on that event. | Only if the user later shares that event | Optional |
| Name | Yes. A person's name on an invite. | With the person who receives that invite | Optional |
| Email address | Yes. The sign-in email. A person's email if an invite is sent. | The account email stays private. An invite email is visible to that invite. | Account email is required to sign in. A friend's email is optional. |
| User IDs | Yes. Firebase user id. | No | Required |
| Phone number | No. A number typed on a person stays on the device. The app does not read the phone's contacts or call log. | No | — |
| Purchase history | Yes, only if the user types a purchase or a banking note. No card number, no bank password, no Play payment. | Only if that event is shared | Optional |
| Health and fitness | No. A Health label on a note is ordinary text, not a health record. | No | — |
| Emails (Messages) | Yes, only if the user adds an email as an event. The app does not read the whole inbox by itself. | Only if that event is shared | Optional |
| SMS or MMS | Yes, only the text the user types in. The app does not have permission to read the phone's messages. | Only if that event is shared | Optional |
| Photos and videos | No. They stay on the device in this version. | No | — |
| Audio | No. Recordings stay on the device. The microphone permission is off. | No | — |
| Contacts (the phone address book) | No | No | — |
| Calendar | No | No | — |
| Other user-generated content | Yes. Events, poems, notes, word lists, date-circle entries, wash and food notes. | Only the items the user chooses to share | Optional, apart from needing an account |
| Device or other IDs | Yes. A device id and the platform (Android, web), so Settings can list signed-in devices. | No | Required while signed in |
| Crash logs, web browsing, installed apps | No | No | — |

## Photo and camera permission (separate Play question)

The app asks for the camera and for photos. Reason: profile picture, a picture on an event, and scanning an invite QR code. One-time or infrequent use, chosen by the user. The picture is not uploaded in this version.

Location permission: only while the app is in use, only after the user taps Use current GPS. Not in the background.

## Content rating

App category: **Lifestyle**.

Answer **No** to violence, fear, sexual content, nudity, bad language in the app itself, controlled substances, crude humour, and gambling.

| Question | Answer |
|---|---|
| Can users interact or share content with other users? | Yes. Invites and shared events. There is no public feed. |
| Can users share their location with other users? | Yes, only if they share an event that has a place on it. |
| Does the app let users purchase digital goods? | No in this version. Credits are turned off. If Play Console notices the billing library in the file and forces this to Yes, say the goods are optional credits, not loot boxes and not gambling. |
| Is shared content visible to the public? | No |

Expected result: **PEGI 3** and **Everyone**, with the labels Users Interact and Shares Location. If the questionnaire treats unmoderated sharing as public content, it can come out PEGI 12. Do not change a Yes to a No to chase a lower rating.

Not for children under 13. Target age group: 18 and over is an honest choice. 13 and over is also fair if the console asks for a range.
