import { useState, type MouseEvent, type ReactNode } from 'react'

interface Ripple {
  id: number
  x: number
  y: number
  size: number
}

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
}

export default function Button({
  children,
  onClick,
}: ButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const handleClick = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const button = event.currentTarget
    const bounds = button.getBoundingClientRect()

    const size = Math.max(
      bounds.width,
      bounds.height,
    ) * 2

    const ripple: Ripple = {
      id: Date.now(),
      size,
      x: event.clientX - bounds.left - size / 2,
      y: event.clientY - bounds.top - size / 2,
    }

    setRipples((current) => [...current, ripple])
    onClick?.()
  }

  const removeRipple = (id: number) => {
    setRipples((current) =>
      current.filter((ripple) => ripple.id !== id),
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="
        relative
        border-studio-accent-soft
        border-1
        transition-[box-shadow, transform]
        hover:-translate-y-0.5
        duration-300 ease-in-out
        hover:shadow-[0_0_10px_rgba(185,228,109,0.4)]
        isolate
        overflow-hidden
        rounded-lg bg-studio-accent
        px-4 py-2
        text-studio-shell
      "
    >
      <span className="relative z-10">
        {children}
      </span>

      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          onAnimationEnd={() => removeRipple(ripple.id)}
          className="
            pointer-events-none absolute z-0 block origin-center
            animate-ripple rounded-full
            bg-studio-shell/35
            motion-reduce:hidden
          "
          style={{
            width: ripple.size,
            height: ripple.size,
            left: ripple.x,
            top: ripple.y,
          }}
        />
      ))}
    </button>
  )
}
