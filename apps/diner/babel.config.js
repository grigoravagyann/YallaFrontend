module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    // babel-preset-expo ships with `expo` and configures Expo Router's
    // file-based routing plus the React Native transforms.
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
  };
};
