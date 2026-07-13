export const PUBLIC_DEV_VIEWER_BEARER_TOKEN = "pantheon-dev-browser:viewer";

export function validatePublicBuildBearerToken(
  value: string | null | undefined,
): string {
  const token = value?.trim() ?? "";
  if (token && token !== PUBLIC_DEV_VIEWER_BEARER_TOKEN) {
    throw new Error(
      "VITE_BFF_DEV_BEARER_TOKEN must be empty or the canonical public dev viewer identity",
    );
  }
  return token;
}
