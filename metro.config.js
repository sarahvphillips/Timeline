const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs');

const adsStub = path.resolve(__dirname, 'src/shims/emptyAds.js');
const authNative = path.resolve(__dirname, 'node_modules/@firebase/auth/dist/rn/index.js');
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'react-native-google-mobile-ads' ||
      moduleName.startsWith('react-native-google-mobile-ads/'))
  ) {
    return { type: 'sourceFile', filePath: adsStub };
  }
  if (
    platform !== 'web' &&
    (moduleName === 'firebase/auth' || moduleName === '@firebase/auth')
  ) {
    return { type: 'sourceFile', filePath: authNative };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;