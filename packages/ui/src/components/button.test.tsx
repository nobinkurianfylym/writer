import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button.js";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Export</Button>);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-destructive");
  });
});
