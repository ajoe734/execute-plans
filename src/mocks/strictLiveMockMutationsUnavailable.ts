// Strict-live mock mutations stub — fails closed in production bundle.
export const mutations = new Proxy({}, {
  get: (_, prop) => () => {
    throw new Error(`Mock mutation '${String(prop)}' is unavailable in a strict-live build.`);
  },
});
