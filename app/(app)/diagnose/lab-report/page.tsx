"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { labReportSchema, type LabReportInput } from "@/lib/validations/diagnose"
import { CROP_OPTIONS, LOCATIONS } from "@/lib/constants/profile"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"

export default function LabReportPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const form = useForm({
    resolver: zodResolver(labReportSchema),
    defaultValues: {
      labName: '',
      testDate: '',
      sampleId: '',
      ph: '',
      organicMatter: '',
      nitrogen: '',
      phosphorus: '',
      potassium: '',
      calcium: '',
      magnesium: '',
      sulfur: '',
      zinc: '',
      manganese: '',
      iron: '',
      copper: '',
      boron: '',
      cec: '',
      baseSaturation: '',
      crop: '',
      locationState: '',
      locationCountry: 'US',
    },
  })

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch('/api/profile')
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

  async function onSubmit(data: any) {
    // Check if at least one nutrient value is provided (not empty string)
    const hasNutrientValue = [
      data.ph,
      data.organicMatter,
      data.nitrogen,
      data.phosphorus,
      data.potassium,
      data.calcium,
      data.magnesium,
      data.sulfur,
      data.zinc,
      data.manganese,
      data.iron,
      data.copper,
      data.boron,
      data.cec,
      data.baseSaturation,
    ].some(value => value !== undefined && value !== '')

    if (!hasNutrientValue) {
      toast.error('Please enter at least one nutrient value')
      return
    }

    setIsLoading(true)

    try {
      // Extract nutrient values into labData object
      const labData = {
        ph: data.ph ? parseFloat(data.ph) : null,
        organicMatter: data.organicMatter ? parseFloat(data.organicMatter) : null,
        nitrogen: data.nitrogen ? parseFloat(data.nitrogen) : null,
        phosphorus: data.phosphorus ? parseFloat(data.phosphorus) : null,
        potassium: data.potassium ? parseFloat(data.potassium) : null,
        calcium: data.calcium ? parseFloat(data.calcium) : null,
        magnesium: data.magnesium ? parseFloat(data.magnesium) : null,
        sulfur: data.sulfur ? parseFloat(data.sulfur) : null,
        zinc: data.zinc ? parseFloat(data.zinc) : null,
        manganese: data.manganese ? parseFloat(data.manganese) : null,
        iron: data.iron ? parseFloat(data.iron) : null,
        copper: data.copper ? parseFloat(data.copper) : null,
        boron: data.boron ? parseFloat(data.boron) : null,
        cec: data.cec ? parseFloat(data.cec) : null,
        baseSaturation: data.baseSaturation ? parseFloat(data.baseSaturation) : null,
        labName: data.labName || null,
        testDate: data.testDate || null,
        sampleId: data.sampleId || null,
      }

      const inputRes = await fetch('/api/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'LAB_REPORT',
          labData,
          crop: data.crop,
          location: `${data.locationState}, ${data.locationCountry}`,
        }),
      })

      if (!inputRes.ok) {
        const err = await inputRes.json()
        throw new Error(err.error || 'Failed to save input')
      }

      const input = await inputRes.json()
      toast.success('Lab report submitted!')
      router.push(`/recommendations/${input.id}`)
    } catch (error) {
      console.error('Error submitting lab report:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit lab report')
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
        <span className="text-foreground">Lab Report</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Lab Report Data Entry
        </h1>
        <p className="text-muted-foreground">
          Enter your soil test results for precise recommendations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Soil Test Results</CardTitle>
          <CardDescription>
            Enter values from your lab report. All fields are optional, but more data means better recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Accordion type="multiple" defaultValue={["macronutrients"]} className="w-full">
                {/* Basic Info */}
                <AccordionItem value="basic-info">
                  <AccordionTrigger>Basic Information</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 px-1">
                    <FormField
                      control={form.control}
                      name="labName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lab Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., AgriTech Labs" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="testDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Test Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="sampleId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sample ID</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., S-2024-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Macronutrients */}
                <AccordionItem value="macronutrients">
                  <AccordionTrigger>Macronutrients</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 px-1">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="ph"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>pH</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="0-14" {...field} />
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
                              <Input type="number" step="0.1" placeholder="0-100" {...field} />
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
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
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
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
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
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Secondary Nutrients */}
                <AccordionItem value="secondary-nutrients">
                  <AccordionTrigger>Secondary Nutrients</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 px-1">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="calcium"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Calcium (Ca)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="magnesium"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Magnesium (Mg)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="sulfur"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sulfur (S)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Micronutrients */}
                <AccordionItem value="micronutrients">
                  <AccordionTrigger>Micronutrients</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 px-1">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="zinc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Zinc (Zn)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="manganese"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Manganese (Mn)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="iron"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Iron (Fe)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="copper"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Copper (Cu)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="boron"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Boron (B)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="ppm" {...field} />
                            </FormControl>
                            <FormDescription>ppm</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Other */}
                <AccordionItem value="other">
                  <AccordionTrigger>Other Properties</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 px-1">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="cec"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CEC</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="meq/100g" {...field} />
                            </FormControl>
                            <FormDescription>meq/100g</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="baseSaturation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Base Saturation</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="0-100" {...field} />
                            </FormControl>
                            <FormDescription>%</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Crop and Location */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-medium">Context Information</h3>

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
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Analyzing..." : "Analyze Soil"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
