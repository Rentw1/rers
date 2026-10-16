// Release signing (env keystore or the bundled shared key) and per-ABI APK splits.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            def nexusKeystore = System.getenv("NEXUS_KEYSTORE_PATH")
            if (nexusKeystore) {
                storeFile file(nexusKeystore)
                storePassword System.getenv("NEXUS_KEYSTORE_PASSWORD")
                keyAlias System.getenv("NEXUS_KEY_ALIAS")
                keyPassword System.getenv("NEXUS_KEY_PASSWORD")
            } else {
                logger.warn("Nexus: NEXUS_KEYSTORE_PATH is not set, signing with the shared build key (signing/nexus-shared.keystore)")
                storeFile file("\${rootDir}/../signing/nexus-shared.keystore")
                storePassword "nexus-shared"
                keyAlias "nexus"
                keyPassword "nexus-shared"
            }
        }`;

const SPLITS = `
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a"
            universalApk true
        }
    }
`;

function patch(gradle) {
  let out = gradle;
  if (!out.includes('NEXUS_KEYSTORE_PATH')) {
    out = out.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
  }
  // Point the release build type at the release signing config.
  out = out.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
  if (!out.includes('universalApk')) {
    out = out.replace(/\nandroid\s*\{\n/, (m) => `${m}${SPLITS}`);
  }
  if (!out.includes('NEXUS_KEYSTORE_PATH') || !out.includes('universalApk') || !/release\s*\{[\s\S]*?signingConfig signingConfigs\.release/.test(out)) {
    throw new Error('withAndroidRelease: app/build.gradle layout not recognised; update the plugin');
  }
  return out;
}

module.exports = function withAndroidRelease(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withAndroidRelease: expected Groovy build.gradle');
    cfg.modResults.contents = patch(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.patch = patch;
