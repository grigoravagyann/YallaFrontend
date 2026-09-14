# Phone QA: ten minutes on a real phone

The checks nothing else can make: the camera, the lock screen, a native photo
picker, native maps, a kill and relaunch, and Hermes formatting dates in
Armenian and Russian. Tests, CI and the web target cover the rest.

**When:** before merging a pull request that changes `apps/diner`, on one
phone. Before a release, once on Android and once on iOS. Record the result on
the pull request's `Phone QA:` line, for example
`Phone QA: pass — Pixel 7, Android 15, development build`.

## Before you start (not part of the ten minutes)

- The laptop and the phone are on the same wifi, and it is not a guest network
  that isolates devices.
- The backend runs in Development with the dev seed on, reachable from the
  phone: `pnpm dev:real --only api`, or `dotnet run --project src/Yalla.Api`
  in the backend repo. Check by opening `http://<laptop LAN address>:5086/swagger`
  in the phone's browser.
- The console runs (`pnpm dev:real --only console`) and you are signed in as a
  manager or owner of **Yalla Demo Cafe**, so you can show a table's QR code.
- For step 6 you need a **development build** with an EAS project id. Expo Go
  does the other steps. Without a project id, mark step 6 "not run: no EAS
  project" rather than "pass".
- A test phone number from the `+37499000xxx` range. In Development the
  verification code is shown on the code screen.

## The checklist

Each step says what you should see. If you see something else, that step fails:
note the step number and take a screenshot.

1. **Launch on the LAN URL.** Run `pnpm dev:diner` and open the `exp://<laptop LAN address>:8081`
   link on the phone.
   **Expect:** the Explore tab lists **Yalla Demo Cafe** with its cover photo, a
   star rating and a review count. Mock places here mean the app is on
   `EXPO_PUBLIC_DATA_SOURCE=mock`. A red screen naming `EXPO_PUBLIC_API_URL`, or
   "You are offline", means the phone cannot reach the backend: see the root
   README.

   **Start the push check now**, so it lands while you do steps 2 to 5. Sign in
   with the test number, open Yalla Demo Cafe, and book the **earliest slot more
   than three hours from now**, for two, with a short note. Allow notifications
   on the confirmation screen.
   **Expect:** the booking-confirmed screen, then the booking under Bookings. The
   reminder is due three hours before the slot, so a slot at 3 h 05 min sends it
   in about five minutes. (If the venue is closed three hours from now, run step
   6 another time.)

2. **Scan the seeded QR.** In the console, Floor plan, select a table: its QR
   code is in the side panel. On the phone, open the Scan tab and point the
   camera at the laptop screen.
   **Expect:** the tab screen for that table opens, with you as the host. If the
   camera permission was declined, typing the code printed under the QR must
   lead to the same screen.

3. **Pick an avatar.** Profile, Edit, change the photo, choose one from the
   library, save.
   **Expect:** the new photo on Profile. It survives step 5.

4. **The map marker shows.** Explore, open the map.
   **Expect:** a marker for Yalla Demo Cafe at its address in Yerevan. Tapping it
   shows the place's card. On an **Android development or store build** the map
   is Google Maps and needs an API key in `android.config.googleMaps.apiKey`
   (see "Needs something outside the code" in the app README); without one it is
   an empty grey map. Mark that "not run: no Android Maps key" rather than
   "fail". Expo Go and iOS need no key.

5. **Kill and relaunch.** Swipe the app away from the app switcher and open it
   again.
   **Expect:** still signed in, with no code screen. Profile shows your name and
   the avatar from step 3, and the booking is still under Bookings.

6. **The booking push arrives, and Cancel works from the lock screen.** Lock the
   phone and wait for the reminder from step 1.
   **Expect:** the reminder arrives on the lock screen. Expand it (long-press on
   iOS, pull down on Android) and tap **Cancel**: the notification goes away and
   **the app does not open**. Unlock and open the app: under Bookings the booking
   is cancelled, and Profile, Notifications lists the reminder.

7. **Armenian and Russian dates and prices render.** Profile, Settings, choose
   Հայերեն, then open Bookings and a place's menu. Repeat with Русский, then
   switch back.
   **Expect:** dates with Armenian (then Russian) month names, prices in dram
   with the `֏` sign and grouped digits, and no crash, blank text, `Invalid Date`
   or `NaN`. This is the step that catches a missing Hermes `Intl` polyfill,
   which only a phone shows.

## Recording the result

On the pull request:

```
Phone QA: pass — iPhone 13, iOS 18.6, development build
```

or, when something failed:

```
Phone QA: fail — Pixel 7, Android 15, Expo Go. Step 4: no marker (screenshot attached). Step 6 not run: no EAS project.
```
