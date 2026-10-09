"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo, useState, type ReactNode } from "react";
import { LayoutDashboard, LogOut, Moon, Sun, UserRound } from "lucide-react";

import type { UserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/client";

import { AppHeader } from "./app-header";
import { AppSidebar, AppSidebarMobile, type NavBadges } from "./app-sidebar";
import { CommandPalette, openCommandPalette, type PaletteCommand } from "./command-palette";

/**
 * Client shell composing sidebar + header + command palette around page content.
 * The (app)/layout.tsx server component fetches the user/profile/role plus
 * live nav badge counts; all interactive state (mobile drawer, palette) lives
 * here.
 */
export function AppShell({
  email,
  displayName,
  role,
  badges,
  userMenu,
  children,
}: {
  email: string | undefined;
  displayName: string | null;
  role: UserRole;
  badges: NavBadges | null;
  userMenu?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "go-dashboard",
        label: "Go to Dashboard",
        keywords: "home overview",
        icon: LayoutDashboard,
        run: () => router.push("/dashboard"),
      },
      {
        id: "go-account",
        label: "Go to Account settings",
        keywords: "profile preferences",
        icon: UserRound,
        run: () => router.push("/app/account"),
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        keywords: "theme appearance",
        icon: theme === "dark" ? Sun : Moon,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "sign-out",
        label: "Sign out",
        keywords: "logout",
        icon: LogOut,
        run: () => {
          void createClient()
            .auth.signOut()
            .then(() => {
              router.push("/login");
              router.refresh();
            });
        },
      },
    ],
    [router, theme, setTheme],
  );

  const sidebarProps = { role, badges, displayName, email };

  return (
    <div className="flex min-h-svh">
      <AppSidebar {...sidebarProps} />
      <AppSidebarMobile {...sidebarProps} open={mobileOpen} onOpenChange={setMobileOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          email={email}
          displayName={displayName}
          userMenu={userMenu}
          onMenuClick={() => setMobileOpen(true)}
          onPaletteOpen={openCommandPalette}
        />
        <main className="flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <CommandPalette commands={commands} />
    </div>
  );
}
