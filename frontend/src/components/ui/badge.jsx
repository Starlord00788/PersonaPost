import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors border',
  {
    variants: {
      variant: {
        default:   'bg-accent-soft border-accent/30 text-accent-light',
        green:     'bg-emerald-soft border-emerald/30 text-emerald',
        amber:     'bg-amber-soft border-amber/30 text-amber',
        rose:      'bg-rose-soft border-rose/30 text-rose',
        cyan:      'bg-cyan-soft border-cyan/30 text-cyan',
        muted:     'bg-surface-2 border-border text-ink-2',
        outline:   'border-border-hi text-ink-2 bg-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

const Badge = React.forwardRef(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
