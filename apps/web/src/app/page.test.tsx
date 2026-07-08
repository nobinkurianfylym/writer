import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("links to the design system", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "View design system" })).toHaveAttribute(
      "href",
      "/design",
    );
  });
});
