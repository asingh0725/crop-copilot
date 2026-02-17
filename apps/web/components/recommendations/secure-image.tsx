"use client";

import { useEffect, useMemo, useState } from "react";
import Image, { type ImageProps } from "next/image";

interface SecureImageProps extends Omit<ImageProps, "src" | "alt"> {
  src: string;
  alt: string;
}

interface ViewUrlResponse {
  downloadUrl?: string;
}

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
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const shouldPresign = useMemo(() => requiresSignedViewUrl(src), [src]);

  useEffect(() => {
    setResolvedSrc(src);
    if (!shouldPresign) {
      return;
    }

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
          return;
        }

        const body = (await response.json()) as ViewUrlResponse;
        if (body.downloadUrl) {
          setResolvedSrc(body.downloadUrl);
        }
      } catch {
        // Keep original URL as a fallback.
      }
    })();

    return () => {
      controller.abort();
    };
  }, [src, shouldPresign]);

  return <Image src={resolvedSrc} alt={alt} {...props} />;
}
