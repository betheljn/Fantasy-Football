// Linear interpolation along a keyframe track, holding the first and last
// positions. Runs as a worklet on the UI thread every frame.
export function sampleAt(ts: readonly number[], vs: readonly number[], t: number): number {
  "worklet";
  const n = ts.length;
  if (n === 0) return 0;
  if (t <= ts[0]!) return vs[0]!;
  for (let i = 1; i < n; i++) {
    if (t <= ts[i]!) {
      const t0 = ts[i - 1]!;
      const t1 = ts[i]!;
      const f = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return vs[i - 1]! + (vs[i]! - vs[i - 1]!) * f;
    }
  }
  return vs[n - 1]!;
}
