import React from 'react'

type Classy = { className?: string }

function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className }: { children: React.ReactNode } & Classy) {
  return (
    <div
      className={cx(
        'rounded-3xl border border-white/10 bg-slate-50/95 backdrop-blur shadow-xl shadow-black/10',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode } & Classy) {
  return (
    <div className={cx('p-5 border-b border-slate-200/60 flex items-start justify-between gap-4', className)}>
      <div>
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="text-sm text-slate-600 mt-1">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant } & Classy) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-4 py-2 min-h-[44px] text-sm font-medium transition-all duration-100 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.97] active:brightness-90 active:shadow-inner select-none'
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400 focus-visible:ring-offset-white',
    ghost: 'bg-transparent text-slate-900 hover:bg-slate-900/5 focus-visible:ring-slate-400 focus-visible:ring-offset-white',
    outline:
      'bg-white/80 text-slate-900 border border-slate-200 hover:bg-slate-50 focus-visible:ring-slate-400 focus-visible:ring-offset-white',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400 focus-visible:ring-offset-white',
  }
  return (
    <button {...props} className={cx(base, styles[variant], className)} type={props.type ?? 'button'}>
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 min-h-[44px] text-[14.5px] text-slate-900 shadow-sm',
        'placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus:border-blue-300',
        props.className
      )}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 min-h-[44px] text-[14.5px] text-slate-900 shadow-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus:border-blue-300',
        props.className
      )}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 min-h-[44px] text-[14.5px] text-slate-900 shadow-sm',
        'placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus:border-blue-300',
        props.className
      )}
    />
  )
}

export function Pill({ children, className }: { children: React.ReactNode } & Classy) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs text-slate-700 border border-white/20 backdrop-blur',
        className
      )}
    >
      {children}
    </span>
  )
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null
  return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{message}</div>
}

// A small "?" affordance that reveals a short explanation of a nearby action on
// hover (desktop) or tap (touch). Purely informational; never submits anything.
export function HelpTip({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={text}
        title={text}
        className="grid place-items-center w-4 h-4 rounded-full border border-slate-300 text-slate-500 text-[10px] font-bold leading-none hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute z-[80] left-1/2 -translate-x-1/2 top-6 w-56 max-w-[70vw] rounded-lg bg-slate-900 text-white text-xs leading-snug px-3 py-2 shadow-xl pointer-events-none"
        >
          {text}
        </span>
      ) : null}
    </span>
  )
}
