import { useState } from 'react'
import DataTable from '../components/DataTable'
import FileList from '../components/FileList';

export default function Explorer({ files }: { files: File[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedFile = files[selectedIndex]

  return (
    <section className="flex w-full flex-col flex-1 overflow-hidden border-t border-studio-border sm:flex-row">
      <FileList files={files} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
      <div className="grid min-h-full min-w-0 w-full place-items-center bg-studio-shell p-6 text-center">
        <div id="visualizador" className="h-full w-full items-center flex flex-col">
          <div className="bg-studio-panel h-full w-full">
            <p className="text-sm font-medium text-studio-text">Área de visualización</p>
            <p className="mt-2 text-xs text-studio-muted">El diagrama se mostrará en este espacio.</p>
          </div>
        </div>
        <div className="mx-auto h-full w-full bg-studio-panel p-4 text-white">
          {selectedFile && (
            <DataTable
              key={`${selectedFile.name}-${selectedFile.lastModified}`}
              file={selectedFile}
            />
          )}
        </div>
      </div>
    </section>
  )
}
