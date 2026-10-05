// Draws a team's badge (its emblem on a round field in its colors) with Skia,
// once per logo and color pair, into a PNG kept in memory. Lists show it as a
// plain image, so fifty logos on a screen don't mean fifty live canvases.
import { FillType, ImageFormat, PaintStyle, Skia, StrokeCap, StrokeJoin, type SkPath } from "@shopify/react-native-skia";
import { readableOn } from "../field/colors";
import { EMBLEMS, type Ink } from "./emblems";

/** Pixel size the badges are drawn at (shown smaller, so they stay sharp). */
const DRAW = 192;

const paths = new Map<string, SkPath | null>();
const images = new Map<string, string | null>();

function path(d: string, eo: boolean): SkPath | null {
  const key = `${eo ? 1 : 0}${d}`;
  if (!paths.has(key)) {
    const p = Skia.Path.MakeFromSVGString(d);
    paths.set(key, p && eo ? Skia.PathBuilder.MakeFromPath(p).setFillType(FillType.EvenOdd).detach() : p);
  }
  return paths.get(key)!;
}

/** The badge as a PNG data URI, or null if Skia can't draw here. */
export function badgeImage(logo: string, primary: string, trim: string): string | null {
  const key = `${logo}|${primary}|${trim}`;
  if (images.has(key)) return images.get(key)!;
  let uri: string | null = null;
  try {
    uri = draw(logo, primary, trim);
  } catch {
    uri = null;
  }
  images.set(key, uri);
  return uri;
}

function draw(logo: string, primary: string, trim: string): string | null {
  const surface = Skia.Surface.Make(DRAW, DRAW);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(DRAW / 100, DRAW / 100);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const ink: Record<Ink, string> = { t: trim, p: primary, a: readableOn(primary) };

  // The round field, ringed in trim.
  paint.setStyle(PaintStyle.Fill);
  paint.setColor(Skia.Color(primary));
  canvas.drawCircle(50, 50, 48, paint);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(4);
  paint.setColor(Skia.Color(trim));
  canvas.drawCircle(50, 50, 46, paint);

  // The emblem, a little inside the ring.
  canvas.save();
  canvas.translate(50, 50);
  canvas.scale(0.86, 0.86);
  canvas.translate(-50, -50);
  for (const layer of EMBLEMS[logo] ?? []) {
    paint.setColor(Skia.Color(ink[layer.c]));
    if (layer.w) {
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(layer.w);
      paint.setStrokeCap(StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
    } else paint.setStyle(PaintStyle.Fill);
    // Filled shapes one at a time, so overlaps add up; even-odd layers keep their holes.
    const parts = layer.w || layer.eo ? [layer.d] : layer.d.split(/(?=M)/);
    for (const d of parts) {
      const p = path(d, !!layer.eo);
      if (p) canvas.drawPath(p, paint);
    }
  }
  canvas.restore();

  surface.flush();
  const image = surface.makeImageSnapshot();
  const b64 = image.encodeToBase64(ImageFormat.PNG, 100);
  return b64 ? `data:image/png;base64,${b64}` : null;
}
