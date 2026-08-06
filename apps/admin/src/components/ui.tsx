import React from 'react';
import { Loader2, X } from 'lucide-react';

/**
 * Shared UI primitives.
 *
 * Every screen in the panel draws its buttons, inputs, panels and badges from
 * here. The point is that a "save" button looks the same on every page, and a
 * change to the vocabulary happens in one file rather than seven.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white border border-accent hover:bg-accent-strong hover:border-accent-strong',
  secondary:
    'bg-surface text-ink border border-line hover:bg-raised hover:border-faint/40',
  ghost:
    'bg-transparent text-muted border border-transparent hover:bg-raised hover:text-ink',
  danger:
    'bg-surface text-critical border border-critical-line hover:bg-critical-soft',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap',
        'transition-colors duration-150 ease-out-quart',
        'disabled:opacity-45 disabled:pointer-events-none',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

type IconTone = 'neutral' | 'accent' | 'danger';

const ICON_TONES: Record<IconTone, string> = {
  neutral: 'text-muted hover:text-ink hover:bg-raised',
  accent: 'text-accent hover:bg-accent-soft',
  danger: 'text-critical hover:bg-critical-soft',
};

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconTone;
  label: string;
}

/** Square icon-only control. `label` is required: it becomes the accessible name. */
export function IconButton({ tone = 'neutral', label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-control',
        'transition-colors duration-150 ease-out-quart',
        'disabled:opacity-45 disabled:pointer-events-none',
        ICON_TONES[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Panel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx('bg-surface border border-line rounded-panel', className)}
    >
      {children}
    </div>
  );
}

/** Title row for a panel, with an optional dismiss affordance. */
export function PanelHeader({
  title,
  hint,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line-soft">
      <div className="min-w-0">
        <h3 className="text-[0.9375rem] font-bold text-ink">{title}</h3>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        {onClose && (
          <IconButton label="بستن" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** Page-level title block. Every route starts with one of these. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
        {description && (
          <p className="text-sm text-muted mt-1 max-w-[68ch]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export const controlClass =
  'w-full bg-surface border border-line rounded-control px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-faint transition-colors duration-150 ease-out-quart ' +
  'hover:border-faint/50 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/15 ' +
  'disabled:bg-raised disabled:text-muted disabled:cursor-not-allowed';

export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold text-muted mb-1.5"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-faint mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx(controlClass, className)} />;
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} {...rest} className={cx(controlClass, 'cursor-pointer', className)}>
      {children}
    </select>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} {...rest} className={cx(controlClass, 'resize-y', className)} />;
});

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        'flex items-start gap-3 select-none',
        disabled ? 'opacity-50' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border-line text-accent accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted mt-0.5 leading-relaxed">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Single-choice control for short option sets. Replaces the loose pill buttons
 * that were duplicated across the books and subscriptions forms.
 */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: React.ReactNode }>;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-control bg-raised p-1 border border-line"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-[6px] px-3 h-7 text-xs font-semibold',
              'transition-colors duration-150 ease-out-quart',
              active
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select chips, used for category assignment. */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-control px-3 h-8 text-xs font-semibold border',
        'transition-colors duration-150 ease-out-quart',
        selected
          ? 'bg-accent-soft text-accent-strong border-accent-line'
          : 'bg-surface text-muted border-line hover:border-faint/50 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted border-line',
  accent: 'bg-accent-soft text-accent-strong border-accent-line',
  positive: 'bg-positive-soft text-positive border-positive-line',
  caution: 'bg-caution-soft text-caution border-caution-line',
  critical: 'bg-critical-soft text-critical border-critical-line',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Inline feedback after an action. Dismissible, never a modal. */
export function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'positive' | 'critical';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles =
    tone === 'positive'
      ? 'bg-positive-soft border-positive-line text-positive'
      : 'bg-critical-soft border-critical-line text-critical';

  return (
    <div
      role="status"
      className={cx(
        'animate-rise flex items-start justify-between gap-3 rounded-control border px-4 py-3 text-sm font-medium',
        styles,
      )}
    >
      <span className="min-w-0">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="بستن پیام"
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Empty state that names the next action instead of announcing emptiness. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-raised text-faint">
        <Icon className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hint && <p className="text-xs text-muted max-w-[46ch] leading-relaxed">{hint}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-breathe rounded-control bg-raised', className)} />;
}

/** Row-shaped placeholder used while lists and tables load. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line-soft">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-9 w-9 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-7 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start border-collapse">{children}</table>
    </div>
  );
}

export function Th({
  className,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={cx(
        'px-5 py-3 text-start text-xs font-semibold text-muted bg-raised/60 border-b border-line',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={cx('px-5 py-3.5 align-middle', className)}>
      {children}
    </td>
  );
}

export function Tr({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      className={cx(
        'border-b border-line-soft last:border-0 transition-colors duration-150 ease-out-quart hover:bg-raised/50',
        className,
      )}
    >
      {children}
    </tr>
  );
}
