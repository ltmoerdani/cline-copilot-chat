/**
 * Cline Copilot Chat — image attachment normalization.
 *
 * Ported from opencode-copilot-chat `src/imageNormalizer.ts` (feature doc:
 * `docs/features/13-20260803-image-normalization.md`, upstream issue #94).
 *
 * CONTRACT:
 * - Vision input is normalized BEFORE the request leaves the extension:
 *   oversized dimensions are resized to ≤2000×2000 (Lanczos3) and the result
 *   is re-encoded PNG → JPEG (quality ladder) until base64 fits ≤5MB.
 * - This fixes the class of upstream `400` errors for images that are valid
 *   pixels but exceed the gateway's implicit size contract, AND cuts token
 *   cost: vision models bill per image tile, so a 4000×3000 screenshot can
 *   cost several × more tokens than its 2000px-normalized self.
 * - Non-data URLs, malformed images, and Photon load failures pass through
 *   unchanged — the caller's final payload guard makes the send/drop call.
 * - RULE: dynamic `import()` keeps the ~2.2MB WASM module lazy — it loads on
 *   the FIRST image request, never at extension activation.
 * - INVARIANT: an image already within spec (≤2000×2000, ≤5MB base64) is
 *   returned byte-identical (no re-encode).
 */

import type * as Photon from "@silvia-odwyer/photon-node";

const MAX_IMAGE_WIDTH = 2_000;
const MAX_IMAGE_HEIGHT = 2_000;
export const MAX_IMAGE_BASE64_BYTES = 5 * 1024 * 1024;
const JPEG_QUALITIES = [80, 85, 70, 55, 40] as const;

type PhotonModule = typeof Photon;

let photonModulePromise: Promise<PhotonModule> | undefined;

function loadPhoton(): Promise<PhotonModule> {
  photonModulePromise ??= import("@silvia-odwyer/photon-node");
  return photonModulePromise;
}

function parseBase64DataUrl(url: string): { mime: string; base64: string } | undefined {
  const match = /^data:([^;,]+);base64,(.+)$/is.exec(url);
  if (!match) {
    return undefined;
  }

  return { mime: match[1], base64: match[2] };
}

export function getImageDataUrlBase64Bytes(url: string): number | undefined {
  const parsed = parseBase64DataUrl(url);
  return parsed ? Buffer.byteLength(parsed.base64, "utf8") : undefined;
}

function candidateSizes(width: number, height: number): { width: number; height: number }[] {
  const scale = Math.min(1, MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
  let nextWidth = Math.max(1, Math.round(width * scale));
  let nextHeight = Math.max(1, Math.round(height * scale));
  const sizes: { width: number; height: number }[] = [];

  while (sizes.length < 32) {
    if (sizes.some((size) => size.width === nextWidth && size.height === nextHeight)) {
      break;
    }

    sizes.push({ width: nextWidth, height: nextHeight });

    const reducedWidth = nextWidth === 1 ? 1 : Math.max(1, Math.floor(nextWidth * 0.75));
    const reducedHeight = nextHeight === 1 ? 1 : Math.max(1, Math.floor(nextHeight * 0.75));
    if (reducedWidth === nextWidth && reducedHeight === nextHeight) {
      break;
    }

    nextWidth = reducedWidth;
    nextHeight = reducedHeight;
  }

  return sizes;
}

/**
 * Normalize an image data URL: resize oversized dimensions and try PNG/JPEG
 * encodings until the base64 payload fits. Unsupported or malformed images
 * are passed through unchanged.
 */
export async function normalizeImageDataUrl(url: string): Promise<string> {
  const parsed = parseBase64DataUrl(url);
  if (!parsed) {
    return url;
  }

  let photon: PhotonModule;
  try {
    photon = await loadPhoton();
  } catch {
    return url;
  }

  let decoded: Photon.PhotonImage;
  try {
    decoded = photon.PhotonImage.new_from_byteslice(Buffer.from(parsed.base64, "base64"));
  } catch {
    return url;
  }

  try {
    const width = decoded.get_width();
    const height = decoded.get_height();
    const base64Bytes = getImageDataUrlBase64Bytes(url) ?? Number.POSITIVE_INFINITY;

    if (width <= MAX_IMAGE_WIDTH && height <= MAX_IMAGE_HEIGHT && base64Bytes <= MAX_IMAGE_BASE64_BYTES) {
      return url;
    }

    for (const size of candidateSizes(width, height)) {
      const resized = photon.resize(decoded, size.width, size.height, photon.SamplingFilter.Lanczos3);
      try {
        const candidates: { mime: string; bytes: Uint8Array }[] = [
          { mime: "image/png", bytes: resized.get_bytes() },
          ...JPEG_QUALITIES.map((quality) => ({
            mime: "image/jpeg",
            bytes: resized.get_bytes_jpeg(quality),
          })),
        ];

        for (const candidate of candidates) {
          const base64 = Buffer.from(candidate.bytes).toString("base64");
          if (Buffer.byteLength(base64, "utf8") <= MAX_IMAGE_BASE64_BYTES) {
            return `data:${candidate.mime};base64,${base64}`;
          }
        }
      } finally {
        resized.free();
      }
    }
  } catch {
    return url;
  } finally {
    decoded.free();
  }

  return url;
}
