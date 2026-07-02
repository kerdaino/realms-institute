"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PrimaryButton } from "@/components/ui/Button";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { mobileNavLinks, navLinks, siteConfig } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--realm-border)] bg-[var(--realm-navy)]/72 backdrop-blur-2xl">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between px-5 md:px-8"
      >
        <Link
          href="/"
          className={cn("flex items-center gap-3 rounded-full", realmClasses.focus)}
          onClick={() => setIsOpen(false)}
        >
          <BrandLogo
            priority
            className="w-10"
            sizes="40px"
          />
          <span className="leading-none">
            <span className="block text-sm font-semibold tracking-[0.12em] text-[var(--realm-white)] uppercase">
              {siteConfig.instituteName}
            </span>
            <span className="mt-1 hidden text-xs text-[var(--realm-muted)] sm:block">
              Kingdom formation institute
            </span>
          </span>
        </Link>
        <ul className="hidden items-center gap-1 xl:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "rounded-full px-2.5 py-2 text-[0.8rem] text-[var(--realm-muted)] hover:bg-white/[0.05] hover:text-[var(--realm-white)]",
                  realmClasses.focus,
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-3 xl:flex">
          <PrimaryButton href="/register" className="min-h-10 px-4">
            Apply Now
          </PrimaryButton>
        </div>
        <button
          type="button"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-controls="mobile-navigation"
          aria-expanded={isOpen}
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[var(--realm-white)] xl:hidden",
            realmClasses.focus,
          )}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
        </button>
      </nav>
      <div
        id="mobile-navigation"
        className={cn(
          "grid border-t border-[var(--realm-border)] bg-[var(--realm-navy)]/96 px-5 transition-[grid-template-rows] duration-200 xl:hidden",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 py-4">
            {mobileNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-xl px-4 py-3 text-sm font-medium text-[var(--realm-muted)] hover:bg-white/[0.07] hover:text-[var(--realm-white)]",
                  realmClasses.focus,
                )}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <PrimaryButton
              href="/register"
              className="mt-2 w-full"
              showIcon
            >
              Apply Now
            </PrimaryButton>
          </div>
        </div>
      </div>
    </header>
  );
}
