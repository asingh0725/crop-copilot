"use client"

import Link from "next/link"
import { Camera, FileSpreadsheet, Layers, ChevronRight } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const inputMethods = [
  {
    id: 'photo',
    title: 'Photo + Description',
    description: 'Upload a field photo and describe what you see',
    icon: Camera,
    href: '/diagnose/photo',
    time: '~2 min'
  },
  {
    id: 'lab-report',
    title: 'Lab Report Data',
    description: 'Enter soil test results for precise recommendations',
    icon: FileSpreadsheet,
    href: '/diagnose/lab-report',
    time: '~5 min'
  },
  {
    id: 'hybrid',
    title: 'Both (Most Accurate)',
    description: 'Combine visual observation with lab data',
    icon: Layers,
    href: '/diagnose/hybrid',
    time: '~7 min'
  }
]

export default function DiagnosePage() {
  return (
    <div className="container max-w-7xl py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Diagnose</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Diagnose Your Crop Issue
        </h1>
        <p className="text-muted-foreground">
          Choose your preferred method to get personalized recommendations
        </p>
      </div>

      {/* Input Method Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {inputMethods.map((method) => {
          const Icon = method.icon
          return (
            <Link key={method.id} href={method.href}>
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {method.time}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{method.title}</CardTitle>
                  <CardDescription className="text-base">
                    {method.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
