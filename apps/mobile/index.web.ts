// Web entry: load Skia's CanvasKit (WebAssembly) before the app renders.
// Native platforms use index.ts, where Skia is built in.
import "@expo/metro-runtime";
import { registerRootComponent } from "expo";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(async () => {
  const { default: App } = await import("./App");
  registerRootComponent(App);
});
