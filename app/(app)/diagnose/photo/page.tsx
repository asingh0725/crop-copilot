"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  useForm,
  type ControllerRenderProps,
  type FieldPath,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronRight } from "lucide-react"
import { toast } from "sonner"
import {
  photoDiagnoseSchema,
  type PhotoDiagnoseInput,
  GROWTH_STAGES,
} from "@/lib/validations/diagnose"
import {
  CROP_OPTIONS,
  LOCATIONS,
  type CropOption,
  type LocationOption,
} from "@/lib/constants/profile"
import { ImageUploadZone } from "@/components/diagnose/image-upload-zone"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type PhotoFieldRenderProps = {
  field: ControllerRenderProps<PhotoDiagnoseInput, FieldPath<PhotoDiagnoseInput>>
}

export default function PhotoDiagnosePage(): JSX.Element {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isFetching, setIsFetching] = useState<boolean>(true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string>('')

  const form = useForm<PhotoDiagnoseInput, unknown, PhotoDiagnoseInput>({
    resolver: zodResolver<PhotoDiagnoseInput, unknown, PhotoDiagnoseInput>(
      photoDiagnoseSchema
    ),
    mode: 'onChange',
    defaultValues: {
      description: '',
      crop: '',
      growthStage: '',
      locationState: '',
      locationCountry: 'US',
    },
  })

  const description: string = form.watch('description')

  useEffect((): void => {
    async function fetchProfile(): Promise<void> {
      try {
        const response = await fetch('/api/profile')
        if (response.ok) {
          const responseData: {
            profile?: { location?: string | null } | null
          } = await response.json()
          const { profile } = responseData
          if (profile?.location) {
            const location: LocationOption | undefined = LOCATIONS.find(
              (loc: LocationOption): boolean => loc.value === profile.location
            )
            if (location) {
              form.setValue('locationState', location.value)
              form.setValue('locationCountry', location.country)
            }
          }
        }
      } catch (error: unknown) {
        console.error('Error fetching profile:', error)
      } finally {
        setIsFetching(false)
      }
    }

    fetchProfile()
  }, [form])

  async function onSubmit(data: PhotoDiagnoseInput): Promise<void> {
    if (!imageFile) {
      setImageError('Please upload an image')
      return
    }

    setIsLoading(true)
    setImageError('')

    try {
      // Step 1: Upload image
      const uploadForm = new FormData()
      uploadForm.append('file', imageFile)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      })

      if (!uploadRes.ok) {
        const err: { error?: string } = await uploadRes.json()
        throw new Error(err.error ?? 'Upload failed')
      }

      const uploadData: { url: string } = await uploadRes.json()
      const imageUrl: string = uploadData.url

      // Step 2: Create input record
      const inputRes = await fetch('/api/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PHOTO',
          imageUrl,
          description: data.description,
          crop: data.crop,
          season: data.growthStage,
          location: `${data.locationState}, ${data.locationCountry}`,
        }),
      })

      if (!inputRes.ok) {
        const err: { error?: string } = await inputRes.json()
        throw new Error(err.error ?? 'Failed to save input')
      }

      const input: { id: string } = await inputRes.json()
      toast.success('Analysis submitted!')
      router.push(`/recommendations/${input.id}`)
    } catch (error: unknown) {
      console.error('Error submitting diagnosis:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to submit analysis'
      )
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="container max-w-3xl py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/diagnose" className="hover:text-foreground transition-colors">
          Diagnose
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Photo Analysis</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Photo + Description Analysis
        </h1>
        <p className="text-muted-foreground">
          Upload a photo of your crop and describe what you&apos;re observing
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crop Issue Details</CardTitle>
          <CardDescription>
            Provide as much detail as possible for accurate recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Image Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Field Photo *</label>
                <ImageUploadZone
                  value={imageFile}
                  onChange={setImageFile}
                  error={imageError}
                />
              </div>

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }: PhotoFieldRenderProps): JSX.Element => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what you see: yellowing leaves, spots, wilting, etc."
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {description.length}/1000 characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Crop */}
              <FormField
                control={form.control}
                name="crop"
                render={({ field }: PhotoFieldRenderProps): JSX.Element => (
                  <FormItem>
                    <FormLabel>Crop *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select crop" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px]">
                        {CROP_OPTIONS.map((crop: CropOption): JSX.Element => (
                          <SelectItem key={crop.value} value={crop.value}>
                            {crop.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Growth Stage */}
              <FormField
                control={form.control}
                name="growthStage"
                render={({ field }: PhotoFieldRenderProps): JSX.Element => (
                  <FormItem>
                    <FormLabel>Growth Stage *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select growth stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GROWTH_STAGES.map((stage: string): JSX.Element => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Current stage of your crop&apos;s development
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="locationCountry"
                  render={({ field }: PhotoFieldRenderProps): JSX.Element => (
                    <FormItem>
                      <FormLabel>Country *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="US">United States</SelectItem>
                          <SelectItem value="CA">Canada</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="locationState"
                  render={({ field }: PhotoFieldRenderProps): JSX.Element => (
                    <FormItem>
                      <FormLabel>State/Province *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px]">
                          {LOCATIONS.filter(
                            (loc: LocationOption): boolean =>
                              loc.country === form.watch('locationCountry')
                          ).map((location: LocationOption): JSX.Element => (
                            <SelectItem key={location.value} value={location.value}>
                              {location.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(): void => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || (!imageFile && !form.formState.isValid)}>
                  {isLoading ? "Analyzing..." : "Analyze Crop"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
