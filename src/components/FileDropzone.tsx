import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import Button from './Button'

export default function FileDropzone({ onFileUpload }: { onFileUpload: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectCsvFiles = (files: File[]) => {
    const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith('.csv'))
    if (csvFiles.length > 0) onFileUpload(csvFiles)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    selectCsvFiles(Array.from(event.dataTransfer.files));
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      selectCsvFiles(Array.from(event.target.files))
    }
  }

  return (
    <div onDragOver={(event) => {
      event.preventDefault()
      setDragging(true)
    }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`${dragging ? 'border-studio-accent bg-studio-accent-soft' : 'border-studio-border bg-studio-raised'} mx-20 flex h-[400px] outline-dotted outline-2 w-full max-w-[800px] flex-col items-center gap-2.5 rounded-2xl bg-studio-raised pt-12 text-center text-white`}>
      <div className="text-studio-accent w-20 h-20 rounded-full align-center text-center bg-studio-accent-soft py-5 px-5">
        <svg
          className="mx-auto"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M15 3V6.4C15 6.96005 15 7.24008 15.109 7.45399C15.2049 7.64215 15.3578 7.79513 15.546 7.89101C15.7599 8 16.0399 8 16.6 8H20M10 8H6C4.89543 8 4 8.89543 4 10V19C4 20.1046 4.89543 21 6 21H12C13.1046 21 14 20.1046 14 19V16M16 3H13.2C12.0799 3 11.5198 3 11.092 3.21799C10.7157 3.40973 10.4097 3.71569 10.218 4.09202C10 4.51984 10 5.0799 10 6.2V12.8C10 13.9201 10 14.4802 10.218 14.908C10.4097 15.2843 10.7157 15.5903 11.092 15.782C11.5198 16 12.0799 16 13.2 16H16.8C17.9201 16 18.4802 16 18.908 15.782C19.2843 15.5903 19.5903 15.2843 19.782 14.908C20 14.4802 20 13.9201 20 12.8V7L16 3Z"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <label htmlFor="file-upload" className="text-2xl pt-2">
        Convertí tus CSV en un mapa
      </label>

      <input
        id="file-upload"
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv, text/csv"
        multiple
        className="sr-only"
      />
      <p className="px-20 text-gray-400">Arrastrá una carpeta o seleccioná varios archivos. Se validan primero y después aparece el diagrama.</p>
      <Button onClick={() => fileInputRef.current?.click()}>Seleccionar archivos CSV</Button>
    </div>
  )
}
