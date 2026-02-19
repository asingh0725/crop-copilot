"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { profileSchema, type ProfileInput } from "@/lib/validations/profile"
import {
  LOCATIONS,
  FARM_SIZES,
  EXPERIENCE_LEVELS,
  CROP_OPTIONS
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
import { toast } from "sonner"

export default function ProfilePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema as any),
    defaultValues: {
      location: undefined,
      farmSize: undefined,
      cropsOfInterest: [],
      experienceLevel: undefined,
    },
  })

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch('/api/v1/profile')
        if (response.ok) {
          const { profile } = await response.json()
          if (profile) {
            form.reset({
              location: profile.location || undefined,
              farmSize: profile.farmSize || undefined,
              cropsOfInterest: profile.cropsOfInterest || [],
              experienceLevel: profile.experienceLevel || undefined,
            })
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        toast.error('Failed to load profile')
      } finally {
        setIsFetching(false)
      }
    }

    fetchProfile()
  }, [form])

  async function onSubmit(data: ProfileInput) {
    setIsLoading(true)

    try {
      const response = await fetch('/api/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      toast.success('Profile updated successfully')
      router.refresh()
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  const cropsOfInterest = form.watch('cropsOfInterest')

  // Group crops by category
  const cropsByCategory = CROP_OPTIONS.reduce((acc, crop) => {
    if (!acc[crop.category]) {
      acc[crop.category] = []
    }
    acc[crop.category].push(crop)
    return acc
  }, {} as Record<string, typeof CROP_OPTIONS>)

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
                render={({ field }) => (
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
                        {LOCATIONS.filter(loc => loc.country === 'US').map((location) => (
                          <SelectItem key={location.value} value={location.value}>
                            {location.label}
                          </SelectItem>
                        ))}
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground mt-2">
                          Canada
                        </div>
                        {LOCATIONS.filter(loc => loc.country === 'CA').map((location) => (
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Farm Size</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select farm size" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FARM_SIZES.map((size) => (
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience Level</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select experience level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPERIENCE_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
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
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Crops of Interest</FormLabel>
                      <FormDescription>
                        Select the crops you grow or are interested in growing
                      </FormDescription>
                    </div>
                    <div className="space-y-6">
                      {Object.entries(cropsByCategory).map(([category, crops]) => (
                        <div key={category} className="space-y-3">
                          <h4 className="font-medium text-sm">{category}</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {crops.map((crop) => (
                              <FormField
                                key={crop.value}
                                control={form.control}
                                name="cropsOfInterest"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={crop.value}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(crop.value)}
                                          onCheckedChange={(checked) => {
                                            const currentValue = field.value || []
                                            return checked
                                              ? field.onChange([...currentValue, crop.value])
                                              : field.onChange(
                                                  currentValue.filter(
                                                    (value) => value !== crop.value
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
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
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
