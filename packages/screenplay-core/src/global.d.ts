export {};

declare global {
  // Available as a global in both browsers and Node 19+. Declared minimally
  // here (rather than pulling in "dom" or "node" libs) to keep this package
  // free of platform-specific types (§4).
  var crypto: { randomUUID(): string };
}
