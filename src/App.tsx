import Menu from "./components/Menu"
import Landing from "./pages/Landing"
import Explorer from './pages/Explorer'
import { useLayoutEffect, useState } from 'react';

type Page = 'landing' | 'explorer';
const API_URL = import.meta.env.VITE_API_URL ?? ''

function deviceUsesDarkMode(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function App() {
  const [page, setPage] = useState<Page>('landing');
  const [files, setFiles] = useState<File[]>([]);
  const [analysisId, setAnalysisId] = useState<number | null>(null)
  const [darkMode, setDarkMode] = useState(deviceUsesDarkMode);

  useLayoutEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    const root = document.documentElement

    if (root.dataset.theme === theme) {
      root.style.colorScheme = theme
      return
    }

    root.dataset.themeTransitioning = 'true'
    // Confirma los estilos anteriores con las transiciones ya activas antes de
    // cambiar las variables. Sin esta lectura ambos cambios se agrupan y saltan
    // directamente al color final.
    void root.offsetWidth
    root.dataset.theme = theme
    root.style.colorScheme = theme

    const transitionTimer = window.setTimeout(() => {
      delete root.dataset.themeTransitioning
    }, 1000)

    return () => {
      window.clearTimeout(transitionTimer)
      delete root.dataset.themeTransitioning
    }
  }, [darkMode])

  const handleFileUpload = (files: File[]) => {
    setFiles(files);
    setPage('explorer');
  };

  const handleDarkMode = () => {
    setDarkMode((currentMode) => !currentMode)
  }

  const handleNewAnalysis = () => {
    // Libera los DataFrames retenidos por el backend antes de empezar otro análisis.
    if (analysisId !== null) {
      void fetch(`${API_URL}/api/analyses/${analysisId}`, { method: 'DELETE' })
    }

    setAnalysisId(null)
    setFiles([]);
    setPage('landing');
  }

  return (
    <main
      className={`flex flex-col items-center bg-studio-shell text-center text-studio-text ${
        page === 'explorer' ? 'h-screen overflow-hidden' : 'min-h-screen gap-5'
      }`}
    >
      <Menu onNewAnalysis={handleNewAnalysis} darkModeHandler={handleDarkMode} darkModeState={darkMode} />
      {page === 'landing' && (
        <section className="page-fade-in flex w-full flex-col items-center gap-5">
          <p className="mt-3 text-studio-muted">Arrastra y suelta archivos CSV aquí para ver el diagrama de relaciones.</p>
          <Landing onFileUpload={handleFileUpload} />
        </section>
      )}
      {page === 'explorer' && (
        <div className="page-fade-in flex min-h-0 w-full flex-1 overflow-hidden">
          <Explorer files={files} onAnalysisReady={setAnalysisId} darkMode={darkMode} />
        </div>
      )}
    </main>
  )
}
