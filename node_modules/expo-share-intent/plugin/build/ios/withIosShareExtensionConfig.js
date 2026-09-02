"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withShareExtensionConfig = void 0;
const constants_1 = require("./constants");
const writeIosShareExtensionFiles_1 = require("./writeIosShareExtensionFiles");
const withShareExtensionConfig = (config, parameters) => {
    const extName = (0, constants_1.getShareExtensionName)(parameters);
    const appIdentifier = config.ios.bundleIdentifier;
    const shareExtensionIdentifier = (0, constants_1.getShareExtensionBundledIdentifier)(appIdentifier, parameters);
    // When disabled this function no longer alters the config object passed to it
    // It only returns the original config to satisfy any calling conventions
    if (!parameters.disableExperimental) {
        let extConfigIndex = null;
        config.extra?.eas?.build?.experimental?.ios?.appExtensions?.forEach((ext, index) => {
            ext.targetName === extName && (extConfigIndex = index);
        });
        if (!config.extra) {
            config.extra = {};
        }
        if (!extConfigIndex) {
            if (!config.extra.eas) {
                config.extra.eas = {};
            }
            if (!config.extra.eas.build) {
                config.extra.eas.build = {};
            }
            if (!config.extra.eas.build.experimental) {
                config.extra.eas.build.experimental = {};
            }
            if (!config.extra.eas.build.experimental.ios) {
                config.extra.eas.build.experimental.ios = {};
            }
            if (!config.extra.eas.build.experimental.ios.appExtensions) {
                config.extra.eas.build.experimental.ios.appExtensions = [];
            }
            config.extra.eas.build.experimental.ios.appExtensions.push({
                targetName: extName,
                bundleIdentifier: shareExtensionIdentifier,
            });
            extConfigIndex =
                config.extra.eas.build.experimental.ios.appExtensions.length - 1;
        }
        const extConfig = config.extra.eas.build.experimental.ios.appExtensions[extConfigIndex];
        extConfig.entitlements = {
            ...extConfig.entitlements,
            ...(0, writeIosShareExtensionFiles_1.getShareExtensionEntitlements)(appIdentifier, parameters),
        };
    }
    else {
        console.warn(`[expo-share-intent] experimental config disabled`);
    }
    return config;
};
exports.withShareExtensionConfig = withShareExtensionConfig;
