'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Camera, FileSpreadsheet } from 'lucide-react'
import { timeAgo } from '@/lib/utils/date'

interface Input {
  id: string
  type: 'PHOTO' | 'LAB_REPORT'
  crop: string | null
  location: string | null
  createdAt: string
  recommendations: { id: string } | null
}

const typeIcons = {
  PHOTO: Camera,
  LAB_REPORT: FileSpreadsheet,
}

const typeLabels = {
  PHOTO: 'Photo Analysis',
  LAB_REPORT: 'Lab Report',
}

export default function HistoryPage() {
  const [inputs, setInputs] = useState<Input[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function fetchInputs() {
      try {
        const res = await fetch('/api/inputs')
        if (!res.ok) throw new Error('Failed to fetch inputs')
        const data = await res.json()
        setInputs(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    fetchInputs()
  }, [])

  if (loading) {
    return (
      <div className="container max-w-4xl py-8 space-y-4">
        <h1 className="text-2xl font-bold">Diagnosis History</h1>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="container max-w-4xl py-8">
        <h1 className="text-2xl font-bold mb-4">Diagnosis History</h1>
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (inputs.length === 0) {
    return (
      <div className="container max-w-4xl py-8">
        <h1 className="text-2xl font-bold mb-4">Diagnosis History</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No diagnoses yet. Start by uploading a photo or entering lab data.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Diagnosis History</h1>

      {inputs.map((input) => {
        const Icon = typeIcons[input.type]
        const hasRecommendation = input.recommendations !== null
        const recommendationId = input.recommendations?.id

        return (
          <Card
            key={input.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/recommendations/${recommendationId || input.id}`)}
          >
            <CardHeader className="flex flex-row items-center gap-4 py-4">
              <div className="p-2 bg-muted rounded-lg">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{typeLabels[input.type]}</CardTitle>
                  <Badge variant={hasRecommendation ? 'default' : 'secondary'}>
                    {hasRecommendation ? 'Complete' : 'Processing'}
                  </Badge>
                </div>
                <CardDescription>
                  {input.crop && `${input.crop} • `}
                  {input.location && `${input.location} • `}
                  {timeAgo(input.createdAt)}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        )
      })}
    </div>
  )
}
