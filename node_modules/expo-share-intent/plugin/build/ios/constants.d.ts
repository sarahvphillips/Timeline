import { Parameters } from "../types";
export declare const shareExtensionInfoFileName = "ShareExtension-Info.plist";
export declare const shareExtensionEntitlementsFileName = "ShareExtension.entitlements";
export declare const shareExtensionStoryBoardFileName = "MainInterface.storyboard";
export declare const shareExtensionViewControllerFileName = "ShareViewController.swift";
export declare const shareExtensionPreprocessorFileName = "ShareExtensionPreprocessor.js";
export declare const getShareExtensionName: (parameters?: Parameters) => string;
export declare const getAppGroup: (identifier: string, parameters: Parameters) => string;
export declare const getShareExtensionBundledIdentifier: (appIdentifier: string, parameters: Parameters) => string;
