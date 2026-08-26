import Menu from "./components/Menu"
import Landing from "./pages/Landing"
import Explorer from './pages/Explorer'
import { useState } from 'react';

type Page = 'landing' | 'explorer';
const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function App() {
  const [page, setPage] = useState<Page>('landing');
  const [files, setFiles] = useState<File[]>([]);
  const [analysisId, setAnalysisId] = useState<number | null>(null)

  const handleFileUpload = (files: File[]) => {
    setFiles(files);
    setPage('explorer');
  };

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
      className={`flex flex-col items-center bg-studio-shell text-center text-black ${
        page === 'explorer' ? 'h-screen overflow-hidden' : 'min-h-screen gap-5'
      }`}
    >
      <Menu onNewAnalysis={handleNewAnalysis} />
      {page === 'landing' && (
        <section className="page-fade-in flex w-full flex-col items-center gap-5">
          <p className="mt-3 text-zinc-400">Arrastra y suelta archivos CSV aquí para ver el diagrama de relaciones.</p>
          <Landing onFileUpload={handleFileUpload} />
        </section>
      )}
      {page === 'explorer' && (
        <div className="page-fade-in flex min-h-0 w-full flex-1 overflow-hidden">
          <Explorer files={files} onAnalysisReady={setAnalysisId} />
        </div>
      )}
    </main>
  )
}
