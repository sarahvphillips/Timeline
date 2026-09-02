import { ConfigPlugin } from "@expo/config-plugins";
import { Parameters } from "../types";
export declare function writeShareExtensionFiles(platformProjectRoot: string, scheme: string, appIdentifier: string, parameters: Parameters, appName: ConfigPlugin<Parameters>["name"]): Promise<void>;
export declare function getShareExtensionEntitlementsFilePath(platformProjectRoot: string, parameters: Parameters): string;
export declare function getShareExtensionEntitlements(appIdentifier: string, parameters: Parameters): {
    "com.apple.security.application-groups": string[];
};
export declare function getShareExtensionEntitlementsContent(appIdentifier: string, parameters: Parameters): string;
export declare function getShareExtensionInfoFilePath(platformProjectRoot: string, parameters: Parameters): string;
export declare function getShareExtensionInfoContent(appName: ConfigPlugin<Parameters>["name"], appIdentifier: string, parameters: Parameters): string;
export declare function getPrivacyInfoFilePath(platformProjectRoot: string, parameters: Parameters): string;
export declare function getPrivacyInfoContent(): string;
export declare function getShareExtensionStoryboardFilePath(platformProjectRoot: string, parameters: Parameters): string;
export declare function getShareExtensionStoryBoardContent(): string;
export declare function getShareExtensionViewControllerPath(platformProjectRoot: string, parameters: Parameters): string;
export declare function getPreprocessorFilePath(platformProjectRoot: string, parameters: Parameters): string;
export declare function getPreprocessorContent(parameters: Parameters): string;
export declare function getShareExtensionViewControllerContent(scheme: string, groupIdentifier: string): string;
