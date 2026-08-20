import FileDropzone from "./components/FileDropzone"
import Menu from "./components/Menu"

export default function App() {
  return (
    <main className="items-center flex flex-col gap-5 min-h-screen bg-studio-shell text-center text-black">
      <Menu />
      <p className="mt-3 text-zinc-400">Arrastra y suelta archivos CSV aquí para ver el diagrama de relaciones.</p>
      <FileDropzone />
    </main>
  )
}
