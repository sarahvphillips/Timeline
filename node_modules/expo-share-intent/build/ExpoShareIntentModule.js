import { requireOptionalNativeModule } from "expo-modules-core";
// Import the native module. it will be resolved on native platforms to ExpoShareIntentModule.ts
// It loads the native module object from the JSI or falls back to
// the bridge module (from NativeModulesProxy) if the remote debugger is on.
const ExpoShareIntentModule = requireOptionalNativeModule("ExpoShareIntentModule");
export default ExpoShareIntentModule;
//# sourceMappingURL=ExpoShareIntentModule.js.map