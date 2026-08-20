import FileDropzone from "../components/FileDropzone";

export default function Landing({ onFileUpload }: { onFileUpload: (files: File[]) => void }) {
  return (
    <FileDropzone onFileUpload={onFileUpload} />
  );
}
