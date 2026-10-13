import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  credentials: null as null | { email: string; password: string },
  error: null as null | { code: string },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async (credentials: {
        email: string;
        password: string;
      }) => {
        state.credentials = credentials;
        return {
          data: { session: state.error ? null : { user: { id: "one" } } },
          error: state.error,
        };
      },
    },
  }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  state.credentials = null;
  state.error = null;
});
async function service() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public");
  return import("./cloud");
}
it("uses email password auth and preserves meaningful password whitespace", async () => {
  const { signInWithEmail } = await service();
  await signInWithEmail(" learner@example.com ", " secret ");
  expect(state.credentials).toEqual({
    email: "learner@example.com",
    password: " secret ",
  });
});
it("rejects malformed email before sending credentials", async () => {
  const { signInWithEmail } = await service();
  await expect(signInWithEmail("not-email", "secret")).rejects.toThrow("邮箱");
  expect(state.credentials).toBeNull();
});
it("shows a safe login error without exposing credentials", async () => {
  const { signInWithEmail } = await service();
  state.error = { code: "invalid_credentials" };
  await expect(
    signInWithEmail("learner@example.com", "my-private-password"),
  ).rejects.toThrow("邮箱或密码不正确");
});
