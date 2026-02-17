# Crop Copilot - iOS Native App

Native iOS application for Crop Copilot, built with SwiftUI.

## Requirements

- Xcode 15.0 or later
- iOS 16.0 or later
- Swift 5.9 or later
- CocoaPods or Swift Package Manager

## Setup

### 1. Install Dependencies

This project uses Swift Package Manager for dependencies:

- supabase-swift
- Kingfisher

Dependencies are managed in the Xcode project. Open `CropCopilot.xcodeproj` and Xcode will automatically fetch the packages.

### 2. Configure Environment Variables

Create a `.env` file in the `apps/ios` directory with the following:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
API_BASE_URL=https://your-web-api.example.com
API_RUNTIME_BASE_URL=https://your-api-id.execute-api.ca-west-1.amazonaws.com
```

For production builds, update these in the Xcode scheme settings.

`API_RUNTIME_BASE_URL` is optional but recommended for AWS cutover. If set, iOS will use it for profile, recommendations, inputs, jobs, upload, and feedback endpoints.

### 3. Open in Xcode

```bash
cd apps/ios
open CropCopilot.xcodeproj
```

### 4. Run

1. Select a simulator or connected device
2. Press Cmd+R to build and run

## Architecture

### MVVM Pattern

```
CropCopilot/
├── App/               # App entry point, configuration
├── Core/              # Core infrastructure
│   ├── Network/       # API client, endpoints, auth
│   └── Storage/       # Keychain, Core Data
├── Models/            # Data models (Codable)
├── Features/          # Feature modules (MVVM)
│   └── Auth/
│       ├── Views/
│       ├── ViewModels/
│       └── Repositories/
└── Shared/            # Reusable components, theme
```

### Key Components

- **APIClient**: Generic network layer with JWT auth injection
- **KeychainManager**: Secure token storage
- **AuthRepository**: Supabase authentication wrapper
- **AuthViewModel**: Authentication state management

## Testing

### Unit Tests

```bash
xcodebuild test -scheme CropCopilot -destination 'platform=iOS Simulator,name=iPhone 15'
```

Or press Cmd+U in Xcode.

## Building for Release

1. Update version in `Info.plist`
2. Select "Any iOS Device" as destination
3. Product → Archive
4. Follow App Store Connect submission flow

## Phase 1 Features

- ✅ Authentication (Email/Password, Apple Sign In)
- ✅ JWT token management with Keychain
- ✅ API client with auth interceptor
- ✅ Swift models matching Prisma schema
- ⏳ Core Data setup (in progress)
- ⏳ Network monitoring

## Upcoming Phases

- **Phase 2**: Dashboard, Camera, Lab Report, Recommendations
- **Phase 3**: Products, Offline Mode, Push Notifications
- **Phase 4**: Widgets, Share Extension, Siri Shortcuts
- **Phase 5**: Polish, App Store Submission

## Troubleshooting

### Build Errors

- Clean build folder: Cmd+Shift+K
- Delete derived data: Cmd+Option+Shift+K
- Reset package caches: File → Packages → Reset Package Caches

### Keychain Access

If keychain is not working in simulator, reset the simulator:
```bash
xcrun simctl erase all
```

## Contributing

See the root repository README for contribution guidelines.

## License

See LICENSE in root directory.
