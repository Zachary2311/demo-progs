import { useState, useRef, useCallback } from 'react';
import { ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { filesApi } from '../api';
import { useToastStore } from '../store';

interface FileUploadProps {
  onFileUploaded?: (file: { id: string; filename: string; url: string }) => void;
  maxSize?: number;
}

export default function FileUpload({ onFileUploaded, maxSize = 2 * 1024 * 1024 }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: string; filename: string; url: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToastStore();

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    },
    [maxSize]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      await uploadFiles(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [maxSize]
  );

  const uploadFiles = async (files: File[]) => {
    setUploading(true);

    for (const file of files) {
      if (file.size > maxSize) {
        addToast(`File ${file.name} exceeds ${maxSize / 1024 / 1024}MB limit`, 'error');
        continue;
      }

      const result = await filesApi.upload(file);
      
      if (result.success && result.data) {
        setUploadedFiles((prev) => [...prev, result.data!]);
        onFileUploaded?.(result.data);
        addToast(`Uploaded ${file.name}`, 'success');
      } else {
        addToast(result.error || `Failed to upload ${file.name}`, 'error');
      }
    }

    setUploading(false);
  };

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  return (
    <div className="space-y-3">
      <div
        className={`file-upload-area cursor-pointer ${isDragging ? 'dragover' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          multiple
        />
        
        <ArrowUpTrayIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        
        {uploading ? (
          <p className="text-gray-400">Uploading...</p>
        ) : (
          <>
            <p className="text-gray-300">Drag and drop files here, or click to select</p>
            <p className="text-sm text-gray-500 mt-1">Max file size: {maxSize / 1024 / 1024}MB</p>
          </>
        )}
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2 bg-chat-sidebar rounded-lg"
            >
              <span className="flex-1 truncate text-sm">{file.filename}</span>
              <button
                onClick={() => handleRemoveFile(file.id)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
