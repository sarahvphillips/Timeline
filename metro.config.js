const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs');

const adsStub = path.resolve(__dirname, 'src/shims/emptyAds.js');

function isFirebase(moduleName) {
  return moduleName === 'firebase' || moduleName.startsWith('firebase/') || moduleName.startsWith('@firebase/');
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'react-native-google-mobile-ads' ||
      moduleName.startsWith('react-native-google-mobile-ads/'))
  ) {
    return { type: 'sourceFile', filePath: adsStub };
  }
  if (platform !== 'web' && isFirebase(moduleName)) {
    return context.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
