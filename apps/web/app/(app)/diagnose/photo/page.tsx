"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getBrowserApiBase } from "@/lib/api-client"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronRight } from "lucide-react"
import { toast } from "sonner"
import {
  photoDiagnoseSchema,
  type PhotoDiagnoseInput,
  GROWTH_STAGES,
} from "@/lib/validations/diagnose"
import { CROP_OPTIONS, LOCATIONS } from "@/lib/constants/profile"
import { ImageUploadZone } from "@/components/diagnose/image-upload-zone"
import { AnalyzingLoader } from "@/components/diagnose/analyzing-loader"
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

interface UploadUrlResponse {
  uploadUrl: string
  objectKey: string
}

interface CreateInputAccepted {
  inputId: string
  jobId: string
  status: string
  acceptedAt: string
}

interface JobStatusResponse {
  status: string
  failureReason?: string
  result?: {
    recommendationId?: string
  }
}

export default function PhotoDiagnosePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<"uploading" | "analyzing">("uploading")
  const [isFetching, setIsFetching] = useState(true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string>('')

  const form = useForm<PhotoDiagnoseInput>({
    resolver: zodResolver(photoDiagnoseSchema as any),
    mode: 'onChange',
    defaultValues: {
      description: '',
      crop: '',
      growthStage: '',
      locationState: '',
      locationCountry: 'US',
    },
  })

  const description = form.watch('description')

  useEffect(() => {
    async function fetchProfile() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const base = getBrowserApiBase()
        const response = await fetch(`${base}/api/v1/profile`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (response.ok) {
          const { profile } = await response.json()
          if (profile?.location) {
            const location = LOCATIONS.find(loc => loc.value === profile.location)
            if (location) {
              form.setValue('locationState', location.value)
              form.setValue('locationCountry', location.country)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setIsFetching(false)
      }
    }

    fetchProfile()
  }, [form])

  async function onSubmit(data: PhotoDiagnoseInput) {
    if (!imageFile) {
      setImageError('Please upload an image')
      return
    }

    setIsLoading(true)
    setLoadingStage("uploading")
    setImageError('')

    try {
      // Step 1: Request a presigned upload URL from the AWS-compatible API contract.
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const base = getBrowserApiBase()
      const uploadRes = await fetch(`${base}/api/v1/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          fileName: imageFile.name,
          contentType: imageFile.type || 'image/jpeg',
          contentLength: imageFile.size,
        }),
      })

      if (!uploadRes.ok) {
        const err = await uploadRes.json()
        throw new Error(err.error || 'Upload failed')
      }

      const { uploadUrl }: UploadUrlResponse = await uploadRes.json()

      const directUploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': imageFile.type || 'image/jpeg',
        },
        body: imageFile,
      })
      if (!directUploadRes.ok) {
        throw new Error('Failed to upload image to storage')
      }

      const imageUrl = uploadUrl.split('?')[0]

      // Step 2: Enqueue recommendation generation.
      setLoadingStage("analyzing")
      const inputRes = await fetch(`${base}/api/v1/inputs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          idempotencyKey: `web-photo-${crypto.randomUUID()}`,
          type: 'PHOTO',
          imageUrl,
          description: data.description,
          crop: data.crop,
          season: data.growthStage,
          location: `${data.locationState}, ${data.locationCountry}`,
        }),
      })

      if (!inputRes.ok) {
        const err = await inputRes.json()
        throw new Error(err.error || 'Failed to generate recommendation')
      }

      const accepted: CreateInputAccepted = await inputRes.json()
      const recommendation = await waitForRecommendation(accepted.jobId, base, session?.access_token ?? '')
      if (!recommendation) {
        throw new Error('Recommendation completed without an ID')
      }

      toast.success('Recommendation generated!')
      router.push(`/recommendations/${recommendation}`)
    } catch (error) {
      console.error('Error submitting diagnosis:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit analysis')
    } finally {
      setIsLoading(false)
    }
  }

  async function waitForRecommendation(jobId: string, base: string, accessToken: string): Promise<string | null> {
    const startedAt = Date.now()
    const timeoutMs = 120000

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const statusRes = await fetch(`${base}/api/v1/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })
      if (!statusRes.ok) {
        const err = await statusRes.json().catch(() => null)
        throw new Error(err?.error?.message || 'Failed to fetch recommendation status')
      }

      const statusBody = (await statusRes.json()) as JobStatusResponse
      if (statusBody.status === 'failed') {
        throw new Error(statusBody.failureReason || 'Recommendation failed')
      }
      if (statusBody.status === 'completed') {
        return statusBody.result?.recommendationId || null
      }
    }

    throw new Error('Recommendation is taking longer than expected. Please check recommendations.')
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <>
      {isLoading && <AnalyzingLoader stage={loadingStage} />}
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
                render={({ field }) => (
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Crop *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select crop" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px]">
                        {CROP_OPTIONS.map((crop) => (
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Growth Stage *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select growth stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GROWTH_STAGES.map((stage) => (
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
                  render={({ field }) => (
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
                  render={({ field }) => (
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
                            loc => loc.country === form.watch('locationCountry')
                          ).map((location) => (
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
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || (!imageFile && !form.formState.isValid)}>
                  Analyze Crop
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
    </>
  )
}
