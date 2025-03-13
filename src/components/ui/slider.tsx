// 优化 src/components/ui/slider.tsx
"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  showValue = true,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  step?: number
  showValue?: boolean
}) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min],
    [value, defaultValue, min]
  )

  return (
    <div className="relative pt-6">
      {showValue && (
        <div className="absolute -top-1 left-0 right-0 flex justify-between px-1">
          <span className="text-xs text-muted-foreground">{min}</span>
          <span className="text-xs font-medium">
            当前值: {_values[0]}
          </span>
          <span className="text-xs text-muted-foreground">{max}</span>
        </div>
      )}
      <SliderPrimitive.Root
        data-slot="slider"
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        className={cn(
          "relative flex w-full touch-none items-center select-none",
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted relative h-2 w-full grow rounded-full"
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="bg-primary absolute h-full rounded-full"
          />
        </SliderPrimitive.Track>
        {_values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            data-slot="slider-thumb"
            className="border-primary bg-background ring-ring/50 block h-5 w-5 rounded-full border-2 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  )
}

export { Slider }