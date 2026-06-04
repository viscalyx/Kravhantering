import { forwardRef, type HTMLAttributes } from 'react'

const requirementDetailCardClassName =
  'relative flex-1 min-w-0 rounded-2xl border bg-white/80 p-6 text-sm shadow-sm backdrop-blur-sm space-y-5 dark:bg-secondary-900/60'

type RequirementDetailCardProps = HTMLAttributes<HTMLDivElement>

const RequirementDetailCard = forwardRef<
  HTMLDivElement,
  RequirementDetailCardProps
>(function RequirementDetailCard({ className, ...props }, ref) {
  return (
    <div
      className={
        className
          ? `${requirementDetailCardClassName} ${className}`
          : requirementDetailCardClassName
      }
      ref={ref}
      {...props}
    />
  )
})

export default RequirementDetailCard
