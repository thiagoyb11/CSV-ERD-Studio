export default function Button({ text, onClick }: { text: string; onClick?: () => void }) {
  return (
    <button className="bg-studio-accent text-studio-shell px-4 py-2 my-6 rounded-xl" onClick={onClick}>{text}</button>
  )
}
