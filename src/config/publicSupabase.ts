export type PublicSupabaseConfig = {
  publishableKey: string;
  url: string;
};

function required(name: string): Error {
  return new Error(
    `${name} is required public browser configuration; provide a publishable/anon client value through the deployment environment`,
  );
}

function invalidPublishableKey(): Error {
  return new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY must contain only a Supabase publishable key or legacy anon key; secret and service-role keys are forbidden",
  );
}

function legacyJwtRole(value: string): string | null {
  const segments = value.split(".");
  if (segments.length !== 3) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    ) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
    const role = (payload as Record<string, unknown>).role;
    return typeof role === "string" ? role : "";
  } catch {
    return "";
  }
}

export function validatePublicSupabaseConfig(
  url: string | undefined,
  publishableKey: string | undefined,
): PublicSupabaseConfig {
  if (!url || url.trim() !== url) throw required("VITE_SUPABASE_URL");
  if (
    !publishableKey
    || publishableKey.trim() !== publishableKey
    || /\s/u.test(publishableKey)
  ) {
    throw required("VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be an absolute http(s) URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("VITE_SUPABASE_URL must be an absolute http(s) URL");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("VITE_SUPABASE_URL must not contain credentials");
  }

  const legacyRole = legacyJwtRole(publishableKey);
  const modernPublishable = /^sb_publishable_[A-Za-z0-9_-]+$/u.test(
    publishableKey,
  );
  if (
    /^sb_secret_/iu.test(publishableKey)
    || (!modernPublishable && legacyRole !== "anon")
  ) {
    throw invalidPublishableKey();
  }

  return { publishableKey, url };
}
