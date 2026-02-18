"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  LayoutDashboard,
  Camera,
  ClipboardList,
  Package,
  User,
  Search,
  ArrowRight,
  ChevronRight,
  Leaf,
  FileSpreadsheet,
  Plus,
  MapPin,
  Sprout,
  Ruler,
  Beaker,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductType } from "@/lib/types/product";

type DemoScene = {
  id: "dashboard" | "diagnose" | "recommendations" | "products" | "profile";
  route: string;
  label: string;
};

const scenes: DemoScene[] = [
  { id: "dashboard", route: "/dashboard", label: "Dashboard" },
  { id: "diagnose", route: "/diagnose", label: "Diagnose" },
  { id: "recommendations", route: "/recommendations", label: "Recommendations" },
  { id: "products", route: "/products", label: "Products" },
  { id: "profile", route: "/settings/profile", label: "Profile" },
];

const navIconByScene = {
  dashboard: LayoutDashboard,
  diagnose: Camera,
  recommendations: ClipboardList,
  products: Package,
  profile: User,
} as const;

const sampleProducts: Array<{
  id: string;
  name: string;
  brand: string;
  type: ProductType;
  npk: string;
}> = [
  { id: "p1", name: "NitroGrow 28-0-0", brand: "AgriMax", type: "FERTILIZER", npk: "28-0-0" },
  { id: "p2", name: "PhosPlus 10-34-0", brand: "FieldCore", type: "FERTILIZER", npk: "10-34-0" },
  { id: "p3", name: "Micronutrient Blend", brand: "CropShield", type: "AMENDMENT", npk: "0-0-0" },
];

function DashboardScene() {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-lime-400/10 bg-gradient-to-br from-earth-900 via-earth-800 to-earth-900 p-4 text-white">
        <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-lime-400/0 via-lime-400/60 to-lime-400/0" />
        <h3 className="text-lg font-bold">
          Good morning, <span className="text-[#9DD565]">sarah</span>!
        </h3>
        <p className="text-xs text-white/40">Monday, June 15, 2026 • Iowa, US</p>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-lime-400/20 bg-lime-400/10 p-4">
            <div className="mb-2 inline-flex rounded-xl bg-lime-400/20 p-2">
              <Camera className="h-4 w-4 text-lime-500" />
            </div>
            <p className="text-sm font-medium text-earth-900">New Diagnosis</p>
            <p className="text-xs text-gray-500">Upload a photo or enter lab data</p>
          </div>
          <div className="rounded-2xl border border-gray-200/70 bg-cream-100 p-4">
            <div className="mb-2 inline-flex rounded-xl bg-gray-100 p-2">
              <ClipboardList className="h-4 w-4 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">View Results</p>
            <p className="text-xs text-gray-500">See your recommendations</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h4 className="text-sm font-semibold text-gray-900">Recent Recommendations</h4>
            <span className="inline-flex items-center text-xs text-green-600">
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { crop: "Corn", condition: "Nitrogen Deficiency", confidence: "High" },
              { crop: "Soybean", condition: "Iron Chlorosis", confidence: "Medium" },
            ].map((item) => (
              <div
                key={`${item.crop}-${item.condition}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-2"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <Leaf className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-900">{item.crop}</span>
                    <span className="text-gray-300">•</span>
                    <span className="truncate text-xs text-gray-600">{item.condition}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {item.confidence}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <h4 className="text-sm font-semibold text-gray-900">Your Farm Profile</h4>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              Iowa, US
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <Sprout className="h-3.5 w-3.5 text-gray-400" />
              Corn, Soybeans
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <Ruler className="h-3.5 w-3.5 text-gray-400" />
              500 acres
            </div>
            <div className="pt-1 text-xs text-green-600">Edit profile <ChevronRight className="inline h-3 w-3" /></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DiagnoseScene() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Dashboard</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Diagnose</span>
      </div>

      <div className="text-center">
        <h3 className="mb-1 text-xl font-bold tracking-tight text-gray-900">Diagnose Your Crop Issue</h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Choose your preferred method to get personalized recommendations
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="transition-all hover:border-primary hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">~2 min</span>
            </div>
            <CardTitle className="text-base">Photo + Description</CardTitle>
            <CardDescription className="text-sm">Upload a field photo and describe what you see</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button variant="outline" size="sm" className="w-full">Get Started</Button>
          </CardContent>
        </Card>

        <Card className="transition-all hover:border-primary hover:shadow-lg">
          <CardHeader className="pb-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">~5 min</span>
            </div>
            <CardTitle className="text-base">Lab Report Data</CardTitle>
            <CardDescription className="text-sm">Enter soil test results for precise recommendations</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button variant="outline" size="sm" className="w-full">Get Started</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecommendationsScene() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">My Recommendations</h3>
        <Button size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Diagnosis
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="h-9 pl-9" placeholder="Search by crop or condition..." />
        </div>
        <div className="flex h-9 min-w-[140px] items-center justify-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
          Newest first
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { condition: "probable_foliar_disease", crop: "corn", location: "Iowa, US", confidence: "78%" },
          { condition: "nitrogen_deficiency", crop: "wheat", location: "Kansas, US", confidence: "84%" },
        ].map((item) => (
          <Card key={item.condition} className="cursor-pointer overflow-hidden transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row gap-3 p-3">
              <div className="h-16 w-16 shrink-0 rounded-lg bg-gray-100" />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h4 className="truncate text-sm font-semibold text-gray-900">{item.condition}</h4>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{item.confidence}</Badge>
                </div>
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-600">
                  <span className="capitalize">{item.crop}</span>
                  <span>•</span>
                  <span>{item.location}</span>
                </div>
                <p className="text-[11px] text-gray-500">2 hours ago</p>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProductsScene() {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h3 className="text-xl font-bold tracking-tight text-gray-900">Product Browser</h3>
        <p className="text-sm text-muted-foreground">
          Browse fertilizers, pesticides, and agricultural products.
        </p>
      </div>

      <div className="rounded-lg border bg-white p-3">
        <div className="flex gap-2">
          <Input className="h-9" placeholder="Search products..." />
          <div className="flex h-9 min-w-[110px] items-center justify-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
            Product type
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">127 products found</p>
        <p className="text-sm text-gray-400">Select products to compare</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {sampleProducts.map((product) => (
          <Card key={product.id} className="group transition-shadow hover:shadow-lg">
            <CardContent className="p-3">
              <Badge variant="outline" className="mb-2 bg-green-100 text-green-700">
                <Beaker className="mr-1 h-3 w-3" />
                Fertilizer
              </Badge>
              <h4 className="line-clamp-1 text-sm font-semibold text-gray-900 group-hover:text-[#2C5F2D]">
                {product.name}
              </h4>
              <p className="text-xs text-gray-500">{product.brand}</p>
              <p className="mb-2 mt-1 text-xs font-medium text-gray-700">{product.npk}</p>
              <div className="flex flex-wrap gap-1">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">corn</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">soybean</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProfileScene() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>
          Update your farming profile to get personalized recommendations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {[
          { label: "Location", value: "Iowa, US", description: "Region-specific recommendations" },
          { label: "Farm Size", value: "201-500 acres", description: "Operation size context" },
          { label: "Experience Level", value: "Intermediate", description: "Tailors recommendation detail" },
        ].map((field) => (
          <div key={field.label} className="space-y-1">
            <p className="text-sm font-medium">{field.label}</p>
            <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm text-gray-700">
              {field.value}
            </div>
            <p className="text-xs text-muted-foreground">{field.description}</p>
          </div>
        ))}
        <div>
          <p className="mb-2 text-sm font-medium">Crops of Interest</p>
          <div className="flex flex-wrap gap-2">
            {["Corn", "Soybeans", "Wheat", "Canola"].map((crop) => (
              <span key={crop} className="rounded-md border bg-muted px-2 py-1 text-xs">
                {crop}
              </span>
            ))}
          </div>
        </div>
        <div className="pt-2">
          <Button size="sm">Save profile</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SceneContent({ sceneId }: { sceneId: DemoScene["id"] }) {
  if (sceneId === "dashboard") {
    return <DashboardScene />;
  }
  if (sceneId === "diagnose") {
    return <DiagnoseScene />;
  }
  if (sceneId === "recommendations") {
    return <RecommendationsScene />;
  }
  if (sceneId === "products") {
    return <ProductsScene />;
  }
  return <ProfileScene />;
}

export function DashboardPreview() {
  const [sceneIndex, setSceneIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSceneIndex((previous) => (previous + 1) % scenes.length);
    }, 2800);

    return () => clearInterval(timer);
  }, []);

  const scene = useMemo(() => scenes[sceneIndex], [sceneIndex]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className="flex items-center gap-3 rounded-t-2xl border border-white/[0.12] bg-white/[0.1] px-4 py-3 backdrop-blur-xl">
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 justify-center">
          <div className="flex w-full max-w-xs items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.08] px-4 py-1 text-xs text-white/[0.7]">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
            cropcopilot.app{scene.route}
          </div>
        </div>
        <div className="w-16" />
      </div>

      <div className="overflow-hidden rounded-b-2xl border border-t-0 border-white/[0.12] bg-white/[0.06] backdrop-blur-2xl">
        <div className="grid min-h-[500px] grid-cols-1 md:grid-cols-[180px_1fr]">
          <aside className="hidden border-r border-white/[0.12] bg-earth-950 p-3 md:block">
            <Link href="/" className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-lime-400 text-earth-950">
                <Leaf className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-white">Crop Copilot</span>
            </Link>

            <nav className="space-y-1">
              {scenes.map((item, index) => {
                const Icon = navIconByScene[item.id];
                const active = index === sceneIndex;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "bg-lime-400/10 text-lime-400"
                        : "text-white/55"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                );
              })}
            </nav>
          </aside>

          <main className="bg-gray-50 p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                className="h-full"
              >
                <SceneContent sceneId={scene.id} />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <div className="grid grid-cols-5 gap-2 border-t border-white/[0.12] bg-white/[0.08] px-4 py-3">
          {scenes.map((item, index) => (
            <div
              key={`progress-${item.id}`}
              className={`h-1.5 rounded-full transition-all ${
                index === sceneIndex ? "bg-lime-300" : "bg-white/[0.25]"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
