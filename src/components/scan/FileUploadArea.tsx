import { cn } from "@/lib/utils";
import { Upload, FileCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SUPPORTED_EXTENSIONS = [".py", ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".zip"];

const LANGUAGE_BADGES = [
  { ext: ".py", label: "Python", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { ext: ".c", label: "C", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { ext: ".cpp", label: "C++", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { ext: ".zip", label: "ZIP", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
];

interface FileUploadAreaProps {
  uploadedFiles: File[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
}

const validateFile = (file: File): boolean => {
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    toast.error(`Unsupported file type: ${extension}`, {
      description: "Please upload Python (.py), C (.c, .h), C++ (.cpp, .hpp), or .zip files only.",
    });
    return false;
  }
  return true;
};

export const FileUploadArea = ({
  uploadedFiles,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onRemoveFile,
}: FileUploadAreaProps) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const allValid = files.every(validateFile);
    if (allValid && files.length > 0) {
      onDrop(e);
    } else {
      onDragLeave();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allValid = files.every(validateFile);
    if (allValid && files.length > 0) {
      onFileSelect(e);
    } else {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Supported Languages */}
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <span className="text-xs text-muted-foreground">Supported:</span>
        {LANGUAGE_BADGES.map((lang) => (
          <span
            key={lang.ext}
            className={cn(
              "text-xs px-2 py-1 rounded-full border font-medium",
              lang.color
            )}
          >
            {lang.label}
          </span>
        ))}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/10 scale-[1.02]"
            : uploadedFiles.length > 0
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(",")}
          multiple
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="space-y-4">
          <div className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center transition-all",
            isDragOver ? "bg-primary/20 scale-110" : uploadedFiles.length > 0 ? "bg-primary/20" : "bg-muted"
          )}>
            {uploadedFiles.length > 0 ? (
              <FileCode className="h-8 w-8 text-primary" />
            ) : (
              <Upload className={cn(
                "h-8 w-8 transition-colors",
                isDragOver ? "text-primary" : "text-muted-foreground"
              )} />
            )}
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {uploadedFiles.length > 0
                ? `${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""} selected`
                : "Drop your files or .zip folder here"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {uploadedFiles.length > 0 ? "Drop more files or click to add" : "or click to browse"}
            </p>
          </div>
          {uploadedFiles.length === 0 && (
            <p className="text-xs text-muted-foreground/70">
              Supports .py, .c, .cpp, .h, .hpp files or a .zip archive up to 50MB
            </p>
          )}
        </div>
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileCode className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(index);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
