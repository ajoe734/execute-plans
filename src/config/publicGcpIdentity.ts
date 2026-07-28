export type PublicGcpIdentityConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
};

function required(name: string): Error {
  return new Error(
    `${name} is required public browser configuration for GCP Identity Platform`,
  );
}

export function validatePublicGcpIdentityConfig(
  apiKey: string | undefined,
  projectId: string | undefined,
  authDomain: string | undefined,
): PublicGcpIdentityConfig {
  if (!apiKey || apiKey.trim() !== apiKey || !/^AIza[A-Za-z0-9_-]{35}$/u.test(apiKey)) {
    throw required("VITE_GCP_IDENTITY_API_KEY");
  }
  if (
    !projectId
    || projectId.trim() !== projectId
    || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId)
  ) {
    throw required("VITE_GCP_IDENTITY_PROJECT_ID");
  }
  if (
    !authDomain
    || authDomain.trim() !== authDomain
    || authDomain.includes("/")
    || authDomain.includes("@")
    || !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/u.test(
      authDomain,
    )
  ) {
    throw required("VITE_GCP_IDENTITY_AUTH_DOMAIN");
  }

  return { apiKey, authDomain, projectId };
}
