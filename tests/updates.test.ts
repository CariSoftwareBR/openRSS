import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, installMethod, isNewerVersion } from "@/lib/updates";

describe("isNewerVersion", () => {
  it("compares semver tags with or without v", () => {
    expect(isNewerVersion("v0.1.3", "0.1.2")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("v1.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("v0.1.2", "0.1.2")).toBe(false);
    expect(isNewerVersion("v0.1.1", "0.1.2")).toBe(false);
    expect(isNewerVersion("v0.1.3-beta.1", "0.1.2")).toBe(true);
  });
});

describe("installMethod", () => {
  it("defaults to docker and accepts known stores", () => {
    delete process.env.OPENRSS_INSTALL_METHOD;
    expect(installMethod()).toBe("docker");
    process.env.OPENRSS_INSTALL_METHOD = "Umbrel";
    expect(installMethod()).toBe("umbrel");
    process.env.OPENRSS_INSTALL_METHOD = "whatever";
    expect(installMethod()).toBe("docker");
    delete process.env.OPENRSS_INSTALL_METHOD;
  });
});

describe("checkForUpdate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws when GitHub cannot be reached instead of reporting 'up to date'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 403 })));
    await expect(checkForUpdate()).rejects.toThrow();
  });

  it("returns the newer release when GitHub answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ tag_name: "v99.0.0", body: "notas", html_url: "https://example.test/r", published_at: "2026-11-01T00:00:00Z" })),
    );
    const update = await checkForUpdate();
    expect(update?.latest).toBe("99.0.0");
    expect(update?.notes).toBe("notas");
  });
});
