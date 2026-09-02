"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShareExtensionBundledIdentifier = exports.getAppGroup = exports.getShareExtensionName = exports.shareExtensionPreprocessorFileName = exports.shareExtensionViewControllerFileName = exports.shareExtensionStoryBoardFileName = exports.shareExtensionEntitlementsFileName = exports.shareExtensionInfoFileName = void 0;
const shareExtensionName = "ShareExtension";
exports.shareExtensionInfoFileName = `${shareExtensionName}-Info.plist`;
exports.shareExtensionEntitlementsFileName = `${shareExtensionName}.entitlements`;
exports.shareExtensionStoryBoardFileName = "MainInterface.storyboard";
exports.shareExtensionViewControllerFileName = "ShareViewController.swift";
exports.shareExtensionPreprocessorFileName = "ShareExtensionPreprocessor.js";
const getShareExtensionName = (parameters) => {
    if (!parameters?.iosShareExtensionName)
        return shareExtensionName;
    return parameters.iosShareExtensionName.replace(/[^a-zA-Z0-9]/g, "");
};
exports.getShareExtensionName = getShareExtensionName;
const getAppGroup = (identifier, parameters) => {
    return parameters.iosAppGroupIdentifier || `group.${identifier}`;
};
exports.getAppGroup = getAppGroup;
const getShareExtensionBundledIdentifier = (appIdentifier, parameters) => {
    return (parameters.iosShareExtensionBundleIdentifier ||
        `${appIdentifier}.share-extension`);
};
exports.getShareExtensionBundledIdentifier = getShareExtensionBundledIdentifier;
