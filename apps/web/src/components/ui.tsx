import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Tiny, dependency-free UI kit. Colors come from the app's CSS variables
 * (see globals.css) so token-based themes restyle these without raw CSS.
 * Borders use neutral opacity utilities to stay readable in light + dark.
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  ghost:
    "bg-transparent text-foreground border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-lg border border-black/10 bg-background p-4 shadow-sm dark:border-white/10",
        className,
      )}
      {...props}
    />
  );
}

const fieldClasses = cx(
  "w-full rounded-md border border-black/15 bg-background px-3 py-2 text-sm text-foreground",
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-foreground/40 disabled:cursor-not-allowed disabled:opacity-50",
  "dark:border-white/20",
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldClasses, "min-h-32 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldClasses, className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cx("mb-1 block text-sm font-medium text-foreground", className)} {...props} />
  );
}
