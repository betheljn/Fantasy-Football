// Web entry: load Skia's CanvasKit (WebAssembly) before Expo Router renders.
// Native platforms use index.ts, where Skia is built in.
import "@expo/metro-runtime";
import { App } from "expo-router/build/qualified-entry";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  renderRootComponent(App);
});
