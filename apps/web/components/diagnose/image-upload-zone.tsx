"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, Camera, X, ImagePlus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ImageUploadZoneProps {
  value: File | null
  onChange: (file: File | null) => void
  error?: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageUploadZone({ value, onChange, error }: ImageUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Please upload a JPEG, PNG, or WebP image'
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB'
    }
    return null
  }, [])

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      onChange(null)
      setPreview(null)
      return
    }

    onChange(file)

    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [onChange, validateFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  const handleRemove = useCallback(() => {
    onChange(null)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }, [onChange])

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleCameraClick = useCallback(() => {
    cameraInputRef.current?.click()
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  if (preview && value) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <div className="relative rounded-2xl overflow-hidden border-2 border-lime-400/30 shadow-lg shadow-lime-400/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- preview is a local blob: URL from createObjectURL; next/image cannot optimize blob URLs */}
          <img
            src={preview}
            alt="Preview"
            className="w-full h-64 object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-3 right-3 rounded-xl"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{value.name}</p>
          <p>{formatFileSize(value.size)}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300",
          isDragging && "border-lime-400 bg-lime-400/5 scale-[1.01]",
          error && "border-destructive",
          !isDragging && !error && "border-muted-foreground/20 hover:border-lime-400/40 hover:bg-lime-400/[0.02]"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={isDragging ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300 }}
            className={cn(
              "p-5 rounded-2xl transition-colors",
              isDragging ? "bg-lime-400/20" : "bg-lime-400/10"
            )}
          >
            <ImagePlus className={cn(
              "h-8 w-8 transition-colors",
              isDragging ? "text-lime-400" : "text-lime-400/70"
            )} />
          </motion.div>

          <div className="space-y-2">
            <p className="text-lg font-medium">
              Drop your image here, or click to browse
            </p>
            <p className="text-sm text-muted-foreground">
              JPEG, PNG, or WebP (max 10MB)
            </p>
          </div>
        </div>

        {/* Animated border on drag */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-2xl glow-accent-sm pointer-events-none"
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleBrowseClick}
          className="gap-2 rounded-xl"
        >
          <Upload className="h-4 w-4" />
          Browse Files
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleCameraClick}
          className="gap-2 rounded-xl"
        >
          <Camera className="h-4 w-4" />
          Take Photo
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
