"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, CheckCircle2, Circle, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import {
  hybridDiagnoseSchema,
  type HybridDiagnoseInput,
  GROWTH_STAGES,
} from "@/lib/validations/diagnose";
import { CROP_OPTIONS, LOCATIONS } from "@/lib/constants/profile";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { ImageUploadZone } from "@/components/diagnose/image-upload-zone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default function HybridDiagnosePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string>("");

  const form = useForm({
    resolver: zodResolver(hybridDiagnoseSchema),
    defaultValues: {
      description: "",
      ph: "",
      organicMatter: "",
      nitrogen: "",
      phosphorus: "",
      potassium: "",
      crop: "",
      growthStage: "",
      locationState: "",
      locationCountry: "US",
    },
  });

  const description = form.watch("description");
  const handleTranscript = useCallback(
    (transcript: string) => {
      const currentValue = form.getValues("description") || "";
      const nextValue = currentValue
        ? `${currentValue.trimEnd()} ${transcript}`.trim()
        : transcript;
      form.setValue("description", nextValue, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form]
  );

  const {
    isSupported: isSpeechSupported,
    isRecording,
    error: speechError,
    start: startDictation,
    stop: stopDictation,
  } = useSpeechRecognition({ onTranscript: handleTranscript });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch("/api/profile");
        if (response.ok) {
          const { profile } = await response.json();
          if (profile?.location) {
            const location = LOCATIONS.find(
              (loc) => loc.value === profile.location
            );
            if (location) {
              form.setValue("locationState", location.value);
              form.setValue("locationCountry", location.country);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setIsFetching(false);
      }
    }

    fetchProfile();
  }, [form]);

  async function onSubmit(data: any) {
    // Check if at least one data source is provided (not empty string)
    const hasImage = imageFile !== null;
    const hasLabData = [
      data.ph,
      data.organicMatter,
      data.nitrogen,
      data.phosphorus,
      data.potassium,
    ].some((value) => value !== undefined && value !== "");

    if (!hasImage && !hasLabData) {
      toast.error("Please provide either a photo or lab data");
      return;
    }

    setIsLoading(true);
    setImageError("");

    try {
      let imageUrl: string | null = null;

      // Step 1: Upload image if provided
      if (imageFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", imageFile);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadForm,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || "Upload failed");
        }

        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
      }

      // Step 2: Build labData from form
      const labData = {
        ph: data.ph ? parseFloat(data.ph) : null,
        organicMatter: data.organicMatter
          ? parseFloat(data.organicMatter)
          : null,
        nitrogen: data.nitrogen ? parseFloat(data.nitrogen) : null,
        phosphorus: data.phosphorus ? parseFloat(data.phosphorus) : null,
        potassium: data.potassium ? parseFloat(data.potassium) : null,
      };

      // Check if any lab data was provided
      const hasLabDataValues = Object.values(labData).some((v) => v !== null);

      // Step 3: Create input record
      const inputRes = await fetch("/api/inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "HYBRID",
          imageUrl,
          description: data.description || null,
          labData: hasLabDataValues ? labData : null,
          crop: data.crop,
          season: data.growthStage,
          location: `${data.locationState}, ${data.locationCountry}`,
        }),
      });

      if (!inputRes.ok) {
        const err = await inputRes.json();
        throw new Error(err.error || "Failed to save input");
      }

      const input = await inputRes.json();
      toast.success("Hybrid analysis submitted!");
      router.push(`/recommendations/${input.id}`);
    } catch (error) {
      console.error("Error submitting hybrid diagnosis:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to submit analysis"
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Check section completion
  const photoSectionComplete =
    imageFile !== null || (description && description.length >= 20);
  const labSectionComplete =
    [
      form.watch("ph"),
      form.watch("organicMatter"),
      form.watch("nitrogen"),
      form.watch("phosphorus"),
      form.watch("potassium"),
    ].some((value) => value !== undefined && value !== "") &&
    !form.formState.errors.ph &&
    !form.formState.errors.organicMatter &&
    !form.formState.errors.nitrogen &&
    !form.formState.errors.phosphorus &&
    !form.formState.errors.potassium;

  if (isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/dashboard"
          className="transition-colors hover:text-foreground"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link
          href="/diagnose"
          className="transition-colors hover:text-foreground"
        >
          Diagnose
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Hybrid Analysis</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Hybrid Diagnosis
          </h1>
          <Badge variant="default" className="bg-green-600">
            Most Accurate Results
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Combine visual observation with soil test data for comprehensive
          analysis
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Photo Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {photoSectionComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    Photo + Description
                  </CardTitle>
                  <CardDescription>
                    Upload a field photo and describe what you&apos;re observing
                    (optional)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Field Photo</label>
                <ImageUploadZone
                  value={imageFile}
                  onChange={setImageFile}
                  error={imageError}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Description</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={isRecording ? stopDictation : startDictation}
                        disabled={!isSpeechSupported}
                        aria-pressed={isRecording}
                        title={
                          isSpeechSupported
                            ? isRecording
                              ? "Stop voice input"
                              : "Start voice input"
                            : "Voice input not supported in this browser"
                        }
                      >
                        {isRecording ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what you see: yellowing leaves, spots, wilting, etc."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      <span>{description?.length || 0}/1000 characters</span>
                      {speechError && (
                        <span className="block text-destructive">
                          Voice input error: {speechError}
                        </span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Lab Data Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {labSectionComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    Lab Data - Macronutrients
                  </CardTitle>
                  <CardDescription>
                    Enter key soil test values (optional)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ph"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>pH</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0-14"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>pH scale</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="organicMatter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organic Matter</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0-100"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>%</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nitrogen"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nitrogen (N)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="ppm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>ppm</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phosphorus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phosphorus (P)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="ppm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>ppm</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="potassium"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Potassium (K)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="ppm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>ppm</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Shared Context Fields */}
          <Card>
            <CardHeader>
              <CardTitle>Context Information *</CardTitle>
              <CardDescription>
                Required information for accurate analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="locationCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px]">
                          {LOCATIONS.filter(
                            (loc) =>
                              loc.country === form.watch("locationCountry")
                          ).map((location) => (
                            <SelectItem
                              key={location.value}
                              value={location.value}
                            >
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
            </CardContent>
          </Card>

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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Analyzing..." : "Analyze Crop"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
