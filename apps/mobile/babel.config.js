module.exports = function(api) {
  api.cache(true);

  const plugins = ['react-native-reanimated/plugin'];

  // Remove console statements in production
  if (process.env.NODE_ENV === 'production') {
    plugins.push(['transform-remove-console', {
      exclude: ['error', 'warn'] // Keep console.error and console.warn for critical issues
    }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
