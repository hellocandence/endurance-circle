import { describe, expect, it } from "vitest";
import { detectPlatform, isIosSafari } from "@/lib/platform";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it("recognises iPhone, iPad (even when it reports as a Mac), Android and desktop", () => {
    expect(detectPlatform(IPHONE_SAFARI)).toBe("ios");
    expect(detectPlatform(IPAD_DESKTOP, true)).toBe("ios");
    expect(detectPlatform(IPAD_DESKTOP, false)).toBe("other"); // a real Mac has no touch screen
    expect(detectPlatform(ANDROID_CHROME)).toBe("android");
    expect(detectPlatform(MAC)).toBe("other");
  });
});

describe("isIosSafari", () => {
  it("only Safari itself can add to the home screen on iOS", () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(IPHONE_SAFARI.replace("Safari/604.1", "Safari/604.1 Instagram 300.0"))).toBe(false);
  });
});
