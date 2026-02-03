export interface UrlStatus {
  reachable: boolean;
  httpCode: number;
  lastChecked: string;
  contentType?: string;
}

const VALID_CONTENT_TYPES = ["text/html", "application/pdf"];

function isValidContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return VALID_CONTENT_TYPES.some((type) => contentType.includes(type));
}

export async function validateUrl(url: string): Promise<UrlStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    const headType = head.headers.get("content-type");
    if (head.ok && isValidContentType(headType)) {
      return {
        reachable: true,
        httpCode: head.status,
        lastChecked: new Date().toISOString(),
        contentType: headType || undefined,
      };
    }

    if (head.status === 405 || !headType) {
      const get = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      const getType = get.headers.get("content-type");
      if (get.ok && isValidContentType(getType)) {
        return {
          reachable: true,
          httpCode: get.status,
          lastChecked: new Date().toISOString(),
          contentType: getType || undefined,
        };
      }
      return {
        reachable: false,
        httpCode: get.status,
        lastChecked: new Date().toISOString(),
        contentType: getType || undefined,
      };
    }

    return {
      reachable: false,
      httpCode: head.status,
      lastChecked: new Date().toISOString(),
      contentType: headType || undefined,
    };
  } catch {
    return {
      reachable: false,
      httpCode: 0,
      lastChecked: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
