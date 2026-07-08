export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getWebEnv } = await import("./src/env");
    getWebEnv();
  }
}
