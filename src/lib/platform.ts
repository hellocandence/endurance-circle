export type Platform = "ios" | "android" | "other";

/** Best-effort platform from the user agent. iPadOS reports itself as a Mac with touch, so `touch` is passed in. */
export function detectPlatform(ua: string, touch = false): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** iOS can only install from Safari itself; Chrome, Firefox and in-app browsers on iOS cannot. */
export function isIosSafari(ua: string): boolean {
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//i.test(ua);
}
