"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withShareExtensionXcodeTarget = void 0;
const config_plugins_1 = require("@expo/config-plugins");
const constants_1 = require("./constants");
const writeIosShareExtensionFiles_1 = require("./writeIosShareExtensionFiles");
//───────────────────────────────────────────────────────────────────────────
// Helper: pull DEVELOPMENT_TEAM from the main-app target's build settings
//───────────────────────────────────────────────────────────────────────────
function getMainAppDevelopmentTeam(pbx) {
    const configs = pbx.pbxXCBuildConfigurationSection();
    for (const key in configs) {
        const config = configs[key];
        const bs = config.buildSettings;
        if (!bs || !bs.PRODUCT_NAME)
            continue;
        const productName = bs.PRODUCT_NAME?.replace(/"/g, "");
        // Ignore other extensions/widgets
        if (productName &&
            (productName.includes("Extension") || productName.includes("Widget"))) {
            continue;
        }
        const developmentTeam = bs.DEVELOPMENT_TEAM?.replace(/"/g, "");
        if (developmentTeam) {
            console.log(`[expo-share-intent] Found DEVELOPMENT_TEAM='${developmentTeam}' from main app configuration.`);
            return developmentTeam;
        }
    }
    console.warn("[expo-share-intent] No DEVELOPMENT_TEAM found in main app build settings. Developer will need to manually add Dev Team.");
    return null;
}
const withShareExtensionXcodeTarget = (config, parameters) => {
    return (0, config_plugins_1.withXcodeProject)(config, async (config) => {
        const extensionName = (0, constants_1.getShareExtensionName)(parameters);
        const platformProjectRoot = config.modRequest.platformProjectRoot;
        const scheme = config.scheme;
        const appIdentifier = config.ios?.bundleIdentifier;
        const shareExtensionIdentifier = (0, constants_1.getShareExtensionBundledIdentifier)(appIdentifier, parameters);
        const currentProjectVersion = config.ios.buildNumber || "1";
        const marketingVersion = config.version;
        // Write extension files first
        await (0, writeIosShareExtensionFiles_1.writeShareExtensionFiles)(platformProjectRoot, scheme, appIdentifier, parameters, config.name);
        const pbxProject = config.modResults;
        /* ------------------------------------------------------------------ */
        /* 1. Bail out early if target/group already exist                    */
        /* ------------------------------------------------------------------ */
        const existingTarget = pbxProject.pbxTargetByName(extensionName);
        if (existingTarget) {
            console.log(`[expo-share-intent] ${extensionName} already exists in project. Skipping…`);
            return config;
        }
        const existingGroups = pbxProject.hash.project.objects.PBXGroup;
        const groupExists = Object.values(existingGroups).some((group) => group && group.name === extensionName);
        if (groupExists) {
            console.log(`[expo-share-intent] ${extensionName} group already exists in project. Skipping…`);
            return config;
        }
        /* ------------------------------------------------------------------ */
        /* 2. Resolve DEVELOPMENT_TEAM                                        */
        /* ------------------------------------------------------------------ */
        const detectedDevTeam = getMainAppDevelopmentTeam(pbxProject);
        const devTeam = detectedDevTeam ?? undefined;
        /* ------------------------------------------------------------------ */
        /* 3. Define all files for the extension                              */
        /* ------------------------------------------------------------------ */
        const sourceFiles = [constants_1.shareExtensionViewControllerFileName];
        const resourceFiles = [
            constants_1.shareExtensionStoryBoardFileName,
            constants_1.shareExtensionPreprocessorFileName,
            "PrivacyInfo.xcprivacy",
        ];
        const configFiles = [
            constants_1.shareExtensionInfoFileName,
            constants_1.shareExtensionEntitlementsFileName,
        ];
        const allFiles = [...sourceFiles, ...resourceFiles, ...configFiles];
        /* ------------------------------------------------------------------ */
        /* 4. Create target, group & build phases (CORRECTED APPROACH)       */
        /* ------------------------------------------------------------------ */
        // 4.1 Create PBXGroup for the extension using addPbxGroup (OneSignal style)
        const extGroup = pbxProject.addPbxGroup(allFiles, extensionName, extensionName);
        // 4.2 Add the new PBXGroup to the top level group
        const groups = pbxProject.hash.project.objects.PBXGroup;
        Object.keys(groups).forEach(function (key) {
            if (typeof groups[key] === "object" &&
                groups[key].name === undefined &&
                groups[key].path === undefined) {
                pbxProject.addToPbxGroup(extGroup.uuid, key);
            }
        });
        // 4.3 WORK AROUND for addTarget BUG (from OneSignal)
        // Xcode projects don't contain these if there is only one target
        const projObjects = pbxProject.hash.project.objects;
        projObjects.PBXTargetDependency = projObjects.PBXTargetDependency || {};
        projObjects.PBXContainerItemProxy = projObjects.PBXContainerItemProxy || {};
        // 4.4 Create native target
        const target = pbxProject.addTarget(extensionName, "app_extension", extensionName);
        // 4.5 Add build phases to the new target
        pbxProject.addBuildPhase(sourceFiles, // Add source files directly to the build phase
        "PBXSourcesBuildPhase", "Sources", target.uuid);
        pbxProject.addBuildPhase(resourceFiles, // Add resource files directly to the build phase
        "PBXResourcesBuildPhase", "Resources", target.uuid);
        pbxProject.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
        /* ------------------------------------------------------------------ */
        /* 5. Build-settings configuration                                    */
        /* ------------------------------------------------------------------ */
        const configurations = pbxProject.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
            const config = configurations[key];
            const buildSettingsObj = config.buildSettings;
            if (!buildSettingsObj)
                continue;
            if (typeof buildSettingsObj["PRODUCT_NAME"] !== "undefined" &&
                buildSettingsObj["PRODUCT_NAME"] === `"${extensionName}"`) {
                buildSettingsObj["CLANG_ENABLE_MODULES"] = "YES";
                buildSettingsObj["INFOPLIST_FILE"] =
                    `"${extensionName}/${constants_1.shareExtensionInfoFileName}"`;
                buildSettingsObj["CODE_SIGN_ENTITLEMENTS"] =
                    `"${extensionName}/${constants_1.shareExtensionEntitlementsFileName}"`;
                buildSettingsObj["CODE_SIGN_STYLE"] = "Automatic";
                buildSettingsObj["CURRENT_PROJECT_VERSION"] =
                    `"${currentProjectVersion}"`;
                buildSettingsObj["GENERATE_INFOPLIST_FILE"] = "YES";
                buildSettingsObj["MARKETING_VERSION"] = `"${marketingVersion}"`;
                buildSettingsObj["PRODUCT_BUNDLE_IDENTIFIER"] =
                    `"${shareExtensionIdentifier}"`;
                buildSettingsObj["SWIFT_EMIT_LOC_STRINGS"] = "YES";
                buildSettingsObj["SWIFT_VERSION"] = "5.0";
                buildSettingsObj["TARGETED_DEVICE_FAMILY"] = `"1,2"`;
                if (devTeam) {
                    buildSettingsObj["DEVELOPMENT_TEAM"] = devTeam;
                }
            }
        }
        /* ------------------------------------------------------------------ */
        /* 6. Apply DevelopmentTeam to both targets                           */
        /* ------------------------------------------------------------------ */
        if (devTeam) {
            pbxProject.addTargetAttribute("DevelopmentTeam", devTeam);
            const shareTarget = pbxProject.pbxTargetByName(extensionName);
            pbxProject.addTargetAttribute("DevelopmentTeam", devTeam, shareTarget);
        }
        console.log(`[expo-share-intent] Successfully created ${extensionName} target with files`);
        return config;
    });
};
exports.withShareExtensionXcodeTarget = withShareExtensionXcodeTarget;
