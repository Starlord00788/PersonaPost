import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-sm text-ink placeholder:text-ink-3 transition-all duration-150',
      'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/60',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 transition-all duration-150 resize-y min-h-[100px]',
      'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/60',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-xs font-semibold text-ink-2 uppercase tracking-wider', className)}
    {...props}
  />
))
Label.displayName = 'Label'

export { Input, Textarea, Label }
