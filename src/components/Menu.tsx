import { useState } from 'react'
import logo from '../assets/logo.svg'
import Button from './Button'
import Modal from './Modal'
import ThemeToggle from './ThemeToggle'

export default function Menu({ onNewAnalysis, darkModeHandler, darkModeState }: { onNewAnalysis: () => void, darkModeHandler: () => void, darkModeState: boolean }) {
  const [modalOpen, setModalOpen] = useState(false)

  const handleConfirm = () => {
    setModalOpen(false)
    onNewAnalysis()
  }

  return (
    <header className="flex h-16 w-full items-center justify-between overflow-hidden border-b border-studio-border bg-studio-panel px-5 sm:px-7">
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />

      <div className="flex min-w-0 items-center gap-3">
        <img
          src={logo}
          alt="Logo de CSV ERD Studio"
          width="36"
          height="36"
          className="shrink-0 rounded-lg object-contain"
          style={{ width: 36, height: 36 }}
        />
        <span className="truncate text-base font-semibold tracking-tight text-studio-text">
          CSV ERD Studio
        </span>
      </div>
      <div className="flex flex-row gap-10 justify-between">
        <ThemeToggle darkModeHandler={darkModeHandler} darkModeState={darkModeState}></ThemeToggle>
        <Button onClick={() => setModalOpen(true)}>Nuevo análisis</Button>
      </div>
    </header>
  )
}
