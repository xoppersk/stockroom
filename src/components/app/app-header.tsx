"use client";

import { Menu, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * App header: mobile nav trigger, command-palette trigger, theme toggle,
 * and the user-menu slot.
 *
 * Pass `userMenu` to override the default <UserMenu/> — e.g. a clone with
 * org switching renders its own menu here without touching this file.
 */
export function AppHeader({
  email,
  displayName,
  userMenu,
  onMenuClick,
  onPaletteOpen,
}: {
  email: string | undefined;
  displayName: string | null;
  userMenu?: ReactNode;
  onMenuClick: () => void;
  onPaletteOpen: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open navigation">
        <Menu className="size-4" />
      </Button>

      <Button
        variant="outline"
        onClick={onPaletteOpen}
        className="hidden w-64 justify-start gap-2 text-muted-foreground sm:flex"
      >
        <Search className="size-4" />
        <span className="text-sm">Search or command…</span>
        <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
      </Button>

      <div className="flex-1" />

      <ThemeToggle />
      {userMenu ?? <UserMenu email={email} displayName={displayName} />}
    </header>
  );
}
