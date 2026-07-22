const INVALID_BEARER_TOKEN =
  "must be a non-blank bearer token with no raw whitespace or control characters";

export function normalizeBearerToken(value, label = "BFF credential") {
  if (typeof value !== "string") {
    throw new Error(`${label} ${INVALID_BEARER_TOKEN}`);
  }
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!value || value !== value.trim() || hasControlCharacter) {
    throw new Error(`${label} ${INVALID_BEARER_TOKEN}`);
  }

  let token = value;
  if (/^bearer(?:\s|$)/iu.test(value)) {
    if (!/^bearer [^\s]+$/iu.test(value)) {
      throw new Error(`${label} ${INVALID_BEARER_TOKEN}`);
    }
    token = value.slice("bearer ".length);
  }
  if (!token || /\s/u.test(token) || /^bearer(?:\s|$)/iu.test(token)) {
    throw new Error(`${label} ${INVALID_BEARER_TOKEN}`);
  }
  return token;
}

export function normalizeOptionalBearerToken(value, label = "BFF credential") {
  return value === undefined || value === null || value === ""
    ? ""
    : normalizeBearerToken(value, label);
}

export function bearerAuthorization(value, label = "BFF credential") {
  return `Bearer ${normalizeBearerToken(value, label)}`;
}
