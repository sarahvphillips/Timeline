import { NativeModule } from "expo-modules-core";
import { ChangeEventPayload, ErrorEventPayload, StateEventPayload } from "./ExpoShareIntentModule.types";
type ExpoShareIntentModuleEvents = {
    onError: (event: ErrorEventPayload) => void;
    onChange: (event: ChangeEventPayload) => void;
    onStateChange: (event: StateEventPayload) => void;
};
declare class ExpoShareIntentModuleType extends NativeModule<ExpoShareIntentModuleEvents> {
    getShareIntent(url: string): string;
    clearShareIntent(key: string): Promise<void>;
    hasShareIntent(key: string): boolean;
}
declare const ExpoShareIntentModule: ExpoShareIntentModuleType | null;
export default ExpoShareIntentModule;
//# sourceMappingURL=ExpoShareIntentModule.d.ts.map