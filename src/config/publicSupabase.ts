export type PublicSupabaseConfig = {
  publishableKey: string;
  url: string;
};

function required(name: string): Error {
  return new Error(
    `${name} is required public browser configuration; provide a publishable/anon client value through the deployment environment`,
  );
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
  if (/^sb_secret_/iu.test(publishableKey)) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must not contain a Supabase secret key",
    );
  }

  return { publishableKey, url };
}
