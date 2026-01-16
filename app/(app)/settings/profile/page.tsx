"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  useForm,
  type ControllerRenderProps,
  type FieldPath,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { profileSchema, type ProfileInput } from "@/lib/validations/profile"
import {
  LOCATIONS,
  FARM_SIZES,
  EXPERIENCE_LEVELS,
  CROP_OPTIONS,
  type CropOption,
  type LocationOption,
  type LabeledOption,
} from "@/lib/constants/profile"
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
import { Checkbox } from "@/components/ui/checkbox"
import type { CheckedState } from "@radix-ui/react-checkbox"
import { toast } from "sonner"

type ProfileFieldRenderProps<Name extends FieldPath<ProfileInput>> = {
  field: ControllerRenderProps<ProfileInput, Name>
}

type CropsByCategory = Record<string, CropOption[]>

export default function ProfilePage(): JSX.Element {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isFetching, setIsFetching] = useState<boolean>(true)

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      location: undefined,
      farmSize: undefined,
      cropsOfInterest: [],
      experienceLevel: undefined,
    },
  })

  useEffect((): void => {
    async function fetchProfile(): Promise<void> {
      try {
        const response = await fetch('/api/profile')
        if (response.ok) {
          const responseData: {
            profile?: ProfileInput | null
          } = await response.json()
          const { profile } = responseData
          if (profile) {
            form.reset({
              location: profile.location || undefined,
              farmSize: profile.farmSize || undefined,
              cropsOfInterest: profile.cropsOfInterest || [],
              experienceLevel: profile.experienceLevel || undefined,
            })
          }
        }
      } catch (error: unknown) {
        console.error('Error fetching profile:', error)
        toast.error('Failed to load profile')
      } finally {
        setIsFetching(false)
      }
    }

    fetchProfile()
  }, [form])

  async function onSubmit(data: ProfileInput): Promise<void> {
    setIsLoading(true)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      toast.success('Profile updated successfully')
      router.refresh()
    } catch (error: unknown) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  // Group crops by category
  const cropsByCategory: CropsByCategory = CROP_OPTIONS.reduce(
    (acc: CropsByCategory, crop: CropOption): CropsByCategory => {
      const current: CropOption[] = acc[crop.category] ?? []
      acc[crop.category] = [...current, crop]
      return acc
    },
    {}
  )

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
          <CardDescription>
            Update your farming profile to get personalized recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="location"
                render={({ field }: ProfileFieldRenderProps<"location">): JSX.Element => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px]">
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                          United States
                        </div>
                        {LOCATIONS.filter(
                          (loc: LocationOption): boolean => loc.country === 'US'
                        ).map((location: LocationOption): JSX.Element => (
                          <SelectItem key={location.value} value={location.value}>
                            {location.label}
                          </SelectItem>
                        ))}
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground mt-2">
                          Canada
                        </div>
                        {LOCATIONS.filter(
                          (loc: LocationOption): boolean => loc.country === 'CA'
                        ).map((location: LocationOption): JSX.Element => (
                          <SelectItem key={location.value} value={location.value}>
                            {location.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Your farm&apos;s location helps provide region-specific advice
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="farmSize"
                render={({ field }: ProfileFieldRenderProps<"farmSize">): JSX.Element => (
                  <FormItem>
                    <FormLabel>Farm Size</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select farm size" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FARM_SIZES.map((size: LabeledOption): JSX.Element => (
                          <SelectItem key={size.value} value={size.value}>
                            {size.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The approximate size of your farming operation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experienceLevel"
                render={({ field }: ProfileFieldRenderProps<"experienceLevel">): JSX.Element => (
                  <FormItem>
                    <FormLabel>Experience Level</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select experience level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPERIENCE_LEVELS.map(
                          (level: LabeledOption): JSX.Element => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Your farming experience helps tailor recommendations
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cropsOfInterest"
                render={(): JSX.Element => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Crops of Interest</FormLabel>
                      <FormDescription>
                        Select the crops you grow or are interested in growing
                      </FormDescription>
                    </div>
                    <div className="space-y-6">
                      {Object.entries(cropsByCategory).map(
                        ([category, crops]: [string, CropOption[]]): JSX.Element => (
                        <div key={category} className="space-y-3">
                          <h4 className="font-medium text-sm">{category}</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {crops.map((crop: CropOption): JSX.Element => (
                              <FormField
                                key={crop.value}
                                control={form.control}
                                name="cropsOfInterest"
                                render={({
                                  field,
                                }: ProfileFieldRenderProps<"cropsOfInterest">): JSX.Element => {
                                  return (
                                    <FormItem
                                      key={crop.value}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(crop.value)}
                                          onCheckedChange={(
                                            checked: CheckedState
                                          ): void => {
                                            const currentValue: string[] =
                                              field.value ?? []
                                            const shouldAdd: boolean =
                                              checked !== false
                                            if (shouldAdd) {
                                              field.onChange([
                                                ...currentValue,
                                                crop.value,
                                              ])
                                              return
                                            }
                                            field.onChange(
                                              currentValue.filter(
                                                (value: string): boolean =>
                                                  value !== crop.value
                                              )
                                            )
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm font-normal">
                                        {crop.label}
                                      </FormLabel>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        )
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(): void => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
