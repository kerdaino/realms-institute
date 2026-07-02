import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ButtonBaseProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: "primary" | "secondary" | "ghost";
  showIcon?: boolean;
};

const variants = {
  primary:
    "border-transparent bg-[var(--realm-gold)] text-[var(--realm-navy)] shadow-[0_0_32px_rgba(215,170,69,0.22)] hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-[var(--realm-gold-soft)] hover:shadow-[0_0_42px_rgba(215,170,69,0.34)] active:scale-[0.98]",
  secondary:
    "border-white/[0.18] bg-white/[0.07] text-[var(--realm-white)] backdrop-blur-xl hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[var(--realm-gold)]/45 hover:bg-white/[0.12] active:scale-[0.98]",
  ghost:
    "border-transparent bg-transparent text-[var(--realm-white)] hover:bg-white/[0.08] active:scale-[0.98]",
};

export function Button({
  className,
  children,
  href,
  target,
  rel,
  type = "button",
  disabled,
  onClick,
  variant = "primary",
  showIcon = false,
}: ButtonBaseProps) {
  const rootClassName = cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition duration-[var(--realm-duration-base)] ease-[var(--realm-ease)] disabled:pointer-events-none disabled:opacity-55",
    realmClasses.focus,
    variants[variant],
    className,
  );

  const content = (
    <>
      <span>{children}</span>
      {showIcon ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
    </>
  );

  if (href) {
    return (
      <Link className={rootClassName} href={href} target={target} rel={rel}>
        {content}
      </Link>
    );
  }

  return (
    <button
      className={rootClassName}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {content}
    </button>
  );
}

export function PrimaryButton(props: Omit<ButtonBaseProps, "variant">) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonBaseProps, "variant">) {
  return <Button {...props} variant="secondary" />;
}
