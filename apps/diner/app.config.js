/**
 * The dynamic half of the app config: `app.json` is the config, and this adds the one value that
 * must not be committed.
 *
 * `react-native-maps` always draws Google Maps on Android, and a development or store build without
 * a key shows an empty grey map (Expo Go carries its own, which is why it works there). The key is a
 * secret per project, so it lives in the EAS environment as `GOOGLE_MAPS_ANDROID_API_KEY` - set it
 * with `eas env:create` for `preview` and `production` - and this puts it where Expo reads it. Unset,
 * the config is exactly `app.json`, so local development and Expo Go are unchanged.
 */
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!apiKey) return config;

  return {
    ...config,
    android: {
      ...config.android,
      config: { ...config.android?.config, googleMaps: { apiKey } },
    },
  };
};
