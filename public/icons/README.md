# PWA Icons

## Required Icons

The following icon sizes are needed for the Progressive Web App:

- **72x72** - `icon-72x72.png`
- **96x96** - `icon-96x96.png`
- **128x128** - `icon-128x128.png`
- **144x144** - `icon-144x144.png`
- **152x152** - `icon-152x152.png`
- **192x192** - `icon-192x192.png`
- **384x384** - `icon-384x384.png`
- **512x512** - `icon-512x512.png`
- **180x180** - `apple-touch-icon.png` (for iOS)

## Generating Icons

### Option 1: Using a tool like [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator)

```bash
npx pwa-asset-generator logo.svg public/icons --icon-only --favicon --type png
```

### Option 2: Using ImageMagick

```bash
# Create a simple green placeholder
for size in 72 96 128 144 152 192 384 512; do
  convert -size ${size}x${size} xc:#22c55e public/icons/icon-${size}x${size}.png
done

# Apple touch icon
convert -size 180x180 xc:#22c55e public/icons/apple-touch-icon.png
```

### Option 3: Design Tools

Use Figma, Sketch, or Adobe Illustrator to create your app icon, then export at all required sizes.

## Design Guidelines

- **Style**: Simple, recognizable agricultural symbol (e.g., leaf, seedling, plant)
- **Color**: Primary green (#22c55e) on white or transparent background
- **Safety Area**: Keep important elements within 80% of the icon area
- **Format**: PNG with transparency
- **Purpose**: Icons should work as both `maskable` and `any` purpose
