// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "CropCopilot",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "CropCopilot",
            targets: ["CropCopilot"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
        .package(url: "https://github.com/onevcat/Kingfisher.git", from: "7.0.0"),
    ],
    targets: [
        .target(
            name: "CropCopilot",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
                .product(name: "Kingfisher", package: "Kingfisher"),
            ]
        ),
        .testTarget(
            name: "CropCopilotTests",
            dependencies: ["CropCopilot"]
        )
    ]
)
