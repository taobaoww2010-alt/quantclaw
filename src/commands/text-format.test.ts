import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("quantclaw", 16)).toBe("quantclaw");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("quantclaw-status-output", 10)).toBe("quantclaw-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
