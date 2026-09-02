"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withIosAppInfoPlist = void 0;
const config_plugins_1 = require("@expo/config-plugins");
const constants_1 = require("./constants");
const withIosAppInfoPlist = (config, parameters) => {
    return (0, config_plugins_1.withInfoPlist)(config, (config) => {
        const appIdentifier = config.ios?.bundleIdentifier;
        config.modResults["AppGroupIdentifier"] = (0, constants_1.getAppGroup)(appIdentifier, parameters);
        return config;
    });
};
exports.withIosAppInfoPlist = withIosAppInfoPlist;
