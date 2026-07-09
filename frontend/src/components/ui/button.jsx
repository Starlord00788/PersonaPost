import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] btn-glow',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-white shadow-glow-sm hover:bg-accent-light hover:shadow-glow',
        secondary:
          'bg-surface-2 text-ink border border-border hover:bg-surface-3 hover:border-border-hi',
        ghost:
          'text-ink-2 hover:text-ink hover:bg-surface-2',
        danger:
          'bg-rose/10 text-rose border border-rose/20 hover:bg-rose/20',
        outline:
          'border border-border text-ink-2 hover:border-border-hi hover:text-ink bg-transparent',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-lg',
        default: 'h-10 px-5',
        lg: 'h-12 px-7 text-base rounded-2xl',
        icon: 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'

export { Button, buttonVariants }
