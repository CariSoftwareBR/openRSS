import { describe, expect, it } from "vitest";
import { installMethod, isNewerVersion } from "@/lib/updates";

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
