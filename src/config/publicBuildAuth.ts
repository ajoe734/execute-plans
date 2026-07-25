export function validatePublicBuildBearerToken(
  value: string | null | undefined,
): string {
  const token = value ?? "";
  if (token) {
    throw new Error(
      "VITE_BFF_DEV_BEARER_TOKEN must be empty; browser bearer credentials are forbidden",
    );
  }
  return "";
}
