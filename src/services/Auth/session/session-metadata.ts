import { createHash, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { authConfig } from "@/config/env";

export type SessionMetadata = { browser: string | null; device: string | null; city: string | null; region: string | null };

const browsers: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\//i, "Edge"], [/OPR\/|Opera\//i, "Opera"],
  [/SamsungBrowser\//i, "Samsung Internet"], [/Firefox\/|FxiOS\//i, "Firefox"],
  [/Chrome\/|CriOS\//i, "Chrome"], [/Version\/.*Safari\//i, "Safari"],
];
const devices: [RegExp, string][] = [
  [/iPhone/i, "iPhone"], [/iPad|Macintosh.*Mobile/i, "iPad"], [/iPod/i, "iPod"],
  [/Android/i, "Android"], [/Windows/i, "Windows"], [/CrOS/i, "ChromeOS"],
  [/Macintosh|Mac OS X/i, "macOS"], [/Linux/i, "Linux"],
];

function readPlace(value?: string) {
  if (!value) return null;
  try {
    const place = decodeURIComponent(value).trim();
    return place.length <= 100 && /^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(place) ? place : null;
  } catch {
    return null;
  }
}

export function sessionMetadata(req: Request): SessionMetadata {
  const userAgent = req.get("User-Agent")?.slice(0, 1024) ?? "";
  const secret = authConfig.sessionLocationProxySecret;
  const supplied = req.get("X-Session-Location-Secret");
  const hash = (input: string) => createHash("sha256").update(input).digest();
  const trusted = Boolean(secret && supplied && timingSafeEqual(hash(secret), hash(supplied)));
  return {
    browser: browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null,
    device: devices.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null,
    city: trusted ? readPlace(req.get("X-Session-City")) : null,
    region: trusted ? readPlace(req.get("X-Session-Region")) : null,
  };
}
