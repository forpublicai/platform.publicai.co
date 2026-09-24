// Test-only stub for @zuplo/runtime.
// Real Zuplo deployments provide this package; it is unavailable to the
// offline test environment, so tests substitute this minimal shim.
// `environment` proxies process.env so tests can set values directly.
export const environment = new Proxy({}, {
  get(_target, key) {
    return process.env[key];
  }
});

// ZuploContext/ZuploRequest are TypeScript interfaces (types only) in the
// real package. Node's type-stripping does not elide named type imports
// without full type-checking, so we export harmless placeholders here to
// satisfy the runtime import.
export const ZuploContext = undefined;
export const ZuploRequest = undefined;
