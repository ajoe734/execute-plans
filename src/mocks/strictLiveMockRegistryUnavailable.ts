// Strict-live mock registry stub — fails closed in production bundle.
export function resolveMock(): undefined {
  return undefined;
}
export function registerMock(): void {}
export function clearMocks(): void {}
