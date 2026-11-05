import { useEffect, useRef, useState } from 'react'
import lightMode from '../icons/Light-mode.svg'
import darkMode from '../icons/Dark-mode.svg'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'

export default function ThemeToggle({ darkModeState, darkModeHandler }: { darkModeState: boolean, darkModeHandler: () => void }) {
  const reduceMotion = useReducedMotion()
  const flipControls = useAnimationControls()
  const displayedMode = useRef(darkModeState)
  const [displayedDarkMode, setDisplayedDarkMode] = useState(darkModeState)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (displayedMode.current === darkModeState) return
    let active = true

    if (reduceMotion) {
      displayedMode.current = darkModeState
      flipControls.set({ rotateY: 0 })
      queueMicrotask(() => {
        if (active) setDisplayedDarkMode(darkModeState)
      })
      return () => {
        active = false
      }
    }

    const flip = async () => {
      setFlipping(true)
      await flipControls.start({
        rotateY: 90,
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
      })
      if (!active) return

      // Cambia la cara cuando la moneda está de canto, donde el intercambio no se ve.
      displayedMode.current = darkModeState
      setDisplayedDarkMode(darkModeState)
      flipControls.set({ rotateY: -90 })

      await flipControls.start({
        rotateY: 0,
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
      })
      if (active) setFlipping(false)
    }

    void flip()
    return () => {
      active = false
    }
  }, [darkModeState, flipControls, reduceMotion])

  return (
    <div className="my-auto size-10 [perspective:500px]">
      <motion.button
        type="button"
        aria-label={darkModeState ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'}
        title={darkModeState ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'}
        onClick={darkModeHandler}
        disabled={flipping}
        animate={flipControls}
        whileHover={reduceMotion ? undefined : { scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={{ scale: { duration: 0.16 } }}
        className="relative grid size-10 place-items-center overflow-hidden rounded-full border border-studio-accent-soft bg-studio-accent shadow-sm [transform-style:preserve-3d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent-strong disabled:cursor-default"
      >
        <img
          className="size-6 pointer-events-none"
          src={displayedDarkMode ? darkMode : lightMode}
          alt=""
          aria-hidden="true"
        />
      </motion.button>
    </div>
  )
}
