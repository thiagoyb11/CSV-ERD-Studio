
import FileList from '../components/FileList';

export default function Explorer({ files }: { files: File[] }) {
  return (
    <section className="flex w-full flex-1 flex-col overflow-hidden border-t border-studio-border sm:flex-row">
      <FileList files={files} />
      <div className="grid grid-cols-1 grid-rows-1 min-h-[520px] h-full min-w-0 w-full flex-1 place-items-center bg-studio-shell p-6 text-center">
        <div id="visualizador" className="h-full w-full items-center flex flex-col">
          <div className="bg-studio-panel h-full w-full">
            <p className="text-sm font-medium text-studio-text">Área de visualización</p>
            <p className="mt-2 text-xs text-studio-muted">El diagrama se mostrará en este espacio.</p>
          </div>
        </div>
        <div className="mx-auto grid align-middle h-full w-full mt-6 text-white bg-studio-panel">

        </div>
      </div>
    </section>
  )
}
