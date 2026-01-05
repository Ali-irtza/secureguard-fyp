import { cn } from "@/lib/utils";
import { Upload, FileCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SUPPORTED_EXTENSIONS = [".py", ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp"];

const LANGUAGE_BADGES = [
  { ext: ".py", label: "Python", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { ext: ".c", label: "C", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { ext: ".cpp", label: "C++", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
];

interface FileUploadAreaProps {
  uploadedFile: File | null;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
}

const validateFile = (file: File): boolean => {
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    toast.error(`Unsupported file type: ${extension}`, {
      description: "Please upload Python (.py), C (.c, .h), or C++ (.cpp, .hpp) files only.",
    });
    return false;
  }
  return true;
};

export const FileUploadArea = ({
  uploadedFile,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onRemoveFile,
}: FileUploadAreaProps) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      onDrop(e);
    } else {
      onDragLeave();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onFileSelect(e);
    } else {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Supported Languages */}
      <div className="flex items-center gap-2 justify-center">
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
            : uploadedFile
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(",")}
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        {uploadedFile ? (
          <div className="space-y-3">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-scale-in">
              <FileCode className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(uploadedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile();
              }}
            >
              <X className="h-4 w-4" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={cn(
              "mx-auto w-16 h-16 rounded-full flex items-center justify-center transition-all",
              isDragOver ? "bg-primary/20 scale-110" : "bg-muted"
            )}>
              <Upload className={cn(
                "h-8 w-8 transition-colors",
                isDragOver ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                Drop your code file here
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse
              </p>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Supports .py, .c, .cpp, .h, .hpp files up to 10MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
