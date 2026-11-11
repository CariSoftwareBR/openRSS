import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, imagePublished, installMethod, isNewerVersion } from "@/lib/updates";

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
  const release = { tag_name: "v99.0.0", body: "notas", html_url: "https://example.test/r", published_at: "2026-11-01T00:00:00Z" };

  /** GitHub responde a release; o ghcr.io responde `manifestStatus` para a tag da imagem. */
  function stubNetwork(manifestStatus: number) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://ghcr.io/token")) return Response.json({ token: "t" });
      if (url.startsWith("https://ghcr.io/v2/")) return new Response(null, { status: manifestStatus });
      return Response.json(release);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENRSS_INSTALL_METHOD;
    delete (globalThis as { openrssRelease?: unknown }).openrssRelease;
  });

  it("throws when GitHub cannot be reached instead of reporting 'up to date'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 403 })));
    await expect(checkForUpdate()).rejects.toThrow();
  });

  it("returns the newer release once its image is published", async () => {
    const fetchMock = stubNetwork(200);
    const update = await checkForUpdate();
    expect(update?.latest).toBe("99.0.0");
    expect(update?.notes).toBe("notas");
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain("https://ghcr.io/v2/carisoftwarebr/openrss/manifests/99.0.0");
  });

  it("hides the release while its Docker image is still being built", async () => {
    stubNetwork(404);
    expect(await checkForUpdate()).toBeNull();
  });

  it("throws when the registry cannot be checked", async () => {
    stubNetwork(503);
    await expect(checkForUpdate()).rejects.toThrow();
  });

  it("does not wait for the image on source installs", async () => {
    process.env.OPENRSS_INSTALL_METHOD = "source";
    const fetchMock = stubNetwork(404);
    expect((await checkForUpdate())?.latest).toBe("99.0.0");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("ghcr.io"))).toBe(false);
  });
});

describe("imagePublished", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks the version tag without the v prefix", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("/token") ? Response.json({ token: "t" }) : new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await imagePublished("v0.1.6")).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://ghcr.io/v2/carisoftwarebr/openrss/manifests/0.1.6");
  });
});
