/**
 * Tests: SHA-256 hashing and UUID generation
 */

import { describe, it, expect } from "vitest";
import { sha256Hex, generateUUID } from "../services/dedup";

describe("sha256Hex", () => {
  it("produces a 64-character hex string", async () => {
    const hash = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("produces consistent hashes for the same input", async () => {
    const data = new TextEncoder().encode("hello world");
    const h1 = await sha256Hex(data);
    const h2 = await sha256Hex(data);
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", async () => {
    const h1 = await sha256Hex(new TextEncoder().encode("file-content-A"));
    const h2 = await sha256Hex(new TextEncoder().encode("file-content-B"));
    expect(h1).not.toBe(h2);
  });

  it("produces lowercase hex characters only", async () => {
    const hash = await sha256Hex(new TextEncoder().encode("test"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("empty input produces 64-char hash", async () => {
    const hash = await sha256Hex(new Uint8Array(0));
    expect(hash).toHaveLength(64);
  });
});

describe("generateUUID", () => {
  it("returns a string matching UUID v4 format", () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique values each call", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateUUID()));
    expect(ids.size).toBe(50);
  });
});
