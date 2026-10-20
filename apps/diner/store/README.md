# Store listing assets

What the App Store and Google Play need besides the build. The icon and splash live with the app
(`../assets/images/`, design D from the icon canvas, chosen on 2026-10-20); this folder holds the
screenshots.

| Folder                       | Size        | For                                                                          |
| ---------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `screenshots/ios-6.7/`       | 1290 × 2796 | App Store iPhone screenshots (1290 × 2796 is accepted for the 6.9″ slot)     |
| `screenshots/android-phone/` | 1080 × 1920 | Google Play phone screenshots (9:16; Play refuses the iPhone's taller ratio) |

Five screens, captions in Armenian:

1. Explore — «Գտեք ձեր հաջորդ սիրելի վայրը»
2. A place — «Ճաշացանկ, սրահներ և կարծիքներ՝ մեկ տեղում»
3. Booking a table on the room photo — «Ընտրեք ժամն ու սեղանը սրահի նկարից»
4. Ordering from the table — «Պատվիրեք անմիջապես ձեր սեղանից»
5. The tab — «Հաշիվը՝ միշտ ձեր աչքի առաջ»

## Before uploading

- **Venue names.** The screens are the real app on its mock data. The mock borrows the names of real
  Yerevan places; `capture.cjs` swaps those for invented ones (Dolmama → Pomegranate Table, and so on),
  because a store screenshot is an advertisement. Once real partner venues are on Yalla, re-shoot with
  them, with their permission.
- **Times** on the booking screen are the time of capture.
- **Other languages.** Change the captions in `compose.cjs` and the capture locale in `capture.cjs`
  (`hy-AM`) to make ru and en sets.

## Regenerating

```bash
cd apps/diner
EXPO_PUBLIC_DATA_SOURCE=mock npx expo export --platform web
node store/source/serve.cjs dist 8099          # leave running
node store/source/capture.cjs ../.. /tmp/yalla-raw
node store/source/compose.cjs ../.. /tmp/yalla-raw store/screenshots
```

`serve.cjs` exists because `expo serve` does not map `/place/<id>` onto the export's
`place/[placeId].html`. The icon set is regenerated with `node assets/images/source/render-icons.cjs ../..`.
