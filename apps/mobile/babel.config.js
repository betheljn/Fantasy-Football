// Explicit Babel config: with pnpm's isolated node_modules, babel-preset-expo
// can't find react-native-worklets on its own, so the worklets plugin (needed
// by Reanimated and Skia animations) is listed here. It must come last.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
