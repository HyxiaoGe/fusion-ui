import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

beforeAll(() => {
  window.PointerEvent = MouseEvent as typeof PointerEvent;
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

describe("DropdownMenu", () => {
  it("支持键盘打开并选择单选项", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>执行模式</DropdownMenuTrigger>
        <DropdownMenuContent aria-label="选择执行模式">
          <DropdownMenuRadioGroup value="auto" onValueChange={onValueChange}>
            <DropdownMenuRadioItem value="auto">自动</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="plan">计划</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="deep_research">深度研究</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    screen.getByRole("button", { name: "执行模式" }).focus();
    await user.keyboard("{ArrowDown}");

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("aria-label", "选择执行模式");
    expect(menu).toBeVisible();
    await user.keyboard("{End}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("deep_research");
  });
});
