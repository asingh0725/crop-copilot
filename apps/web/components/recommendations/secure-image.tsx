"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image, { type ImageProps } from "next/image";

interface SecureImageProps extends Omit<ImageProps, "src" | "alt"> {
  src: string;
  alt: string;
}

interface ViewUrlResponse {
  downloadUrl?: string;
  expiresInSeconds?: number;
}

interface CachedViewUrl {
  downloadUrl: string;
  expiresAtMs: number;
}

const VIEW_URL_CACHE = new Map<string, CachedViewUrl>();
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 900;
const CACHE_SAFETY_WINDOW_MS = 5000;

function requiresSignedViewUrl(src: string): boolean {
  try {
    const parsed = new URL(src);
    return (
      parsed.hostname.includes("amazonaws.com") &&
      !parsed.searchParams.has("X-Amz-Signature")
    );
  } catch {
    return false;
  }
}

export function SecureImage({ src, alt, ...props }: SecureImageProps) {
  const shouldPresign = useMemo(() => requiresSignedViewUrl(src), [src]);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!shouldPresign) {
      return src;
    }

    const cached = VIEW_URL_CACHE.get(src);
    if (!cached) {
      return null;
    }

    if (cached.expiresAtMs - CACHE_SAFETY_WINDOW_MS <= Date.now()) {
      VIEW_URL_CACHE.delete(src);
      return null;
    }

    return cached.downloadUrl;
  });

  useEffect(() => {
    if (!shouldPresign) {
      setResolvedSrc(src);
      return;
    }

    const cached = VIEW_URL_CACHE.get(src);
    if (cached && cached.expiresAtMs - CACHE_SAFETY_WINDOW_MS > Date.now()) {
      setResolvedSrc(cached.downloadUrl);
      return;
    }

    setResolvedSrc(null);

    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(
          `/api/v1/upload/view?objectUrl=${encodeURIComponent(src)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          // Fall back to raw URL for publicly accessible objects.
          setResolvedSrc(src);
          return;
        }

        const body = (await response.json()) as ViewUrlResponse;
        if (body.downloadUrl) {
          const ttlSeconds =
            typeof body.expiresInSeconds === "number" &&
            body.expiresInSeconds > 0
              ? body.expiresInSeconds
              : DEFAULT_SIGNED_URL_EXPIRY_SECONDS;
          VIEW_URL_CACHE.set(src, {
            downloadUrl: body.downloadUrl,
            expiresAtMs: Date.now() + ttlSeconds * 1000,
          });
          setResolvedSrc(body.downloadUrl);
          return;
        }

        setResolvedSrc(src);
      } catch {
        // Keep original URL as a fallback.
        setResolvedSrc(src);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [src, shouldPresign]);

  if (!resolvedSrc) {
    const style: CSSProperties = {};
    if (!props.fill) {
      if (typeof props.width === "number") {
        style.width = props.width;
      }
      if (typeof props.height === "number") {
        style.height = props.height;
      }
    }

    return (
      <div
        aria-hidden
        className={`h-full w-full animate-pulse bg-gray-100 ${props.className ?? ""}`}
        style={style}
      />
    );
  }

  return <Image src={resolvedSrc} alt={alt} {...props} />;
}
