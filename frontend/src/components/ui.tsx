import React from 'react'

type Classy = { className?: string }

function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className }: { children: React.ReactNode } & Classy) {
  return (
    <div
      className={cx(
        'rounded-3xl border border-white/10 bg-white/90 backdrop-blur shadow-xl shadow-black/10',
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
}: { title: string; subtitle?: string; right?: React.ReactNode } & Classy) {
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
    'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed'
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 focus:ring-offset-white',
    ghost: 'bg-transparent text-slate-900 hover:bg-slate-900/5 focus:ring-slate-400 focus:ring-offset-white',
    outline:
      'bg-white/80 text-slate-900 border border-slate-200 hover:bg-white focus:ring-slate-400 focus:ring-offset-white',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-400 focus:ring-offset-white',
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
        'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300',
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
        'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300',
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
        'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300',
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
