//
//  ProductDetailViewModel.swift
//  CropCopilot
//

import Foundation

@MainActor
final class ProductDetailViewModel: ObservableObject {
    @Published var product: ProductDetailResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoadingPricing = false
    @Published var pricingEntry: ProductPricingEntry?
    @Published var pricingError: String?
    @Published var pricingRegion = ""
    @Published var resolvedPricingRegion: String?

    private let productId: String
    private let apiClient = APIClient.shared
    private static let pricingRegionDefaultsKey = "cropcopilot.pricing.region"
    private static let pricingCacheTTL: TimeInterval = 6 * 60 * 60
    private static let pricingCacheStoragePrefix = "cropcopilot.pricing.cache."
    private static var pricingCache: [String: (entry: ProductPricingEntry, region: String, cachedAt: Date)] = [:]

    private struct PersistedPricingOffer: Codable {
        let price: Double?
        let unit: String
        let retailer: String
        let url: String?
        let region: String
        let lastUpdated: String?
    }

    private struct PersistedPricingEntry: Codable {
        let productId: String
        let productName: String
        let brand: String?
        let currency: String
        let retailPrice: Double?
        let wholesalePrice: Double?
        let unit: String?
        let availability: String?
        let lastUpdated: String?
        let offers: [PersistedPricingOffer]
    }

    private struct PersistedPricingPayload: Codable {
        let region: String
        let cachedAt: Date
        let entry: PersistedPricingEntry
    }

    init(productId: String) {
        self.productId = productId
        pricingRegion = UserDefaults.standard.string(forKey: Self.pricingRegionDefaultsKey) ?? ""
    }

    func loadProduct() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: ProductDetailResponse = try await apiClient.request(
                .getProduct(id: productId)
            )
            product = response
            await preloadRegionFromProfileIfNeeded()
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func preloadRegionFromProfileIfNeeded() async {
        if !pricingRegion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return
        }

        do {
            let response: ProfileResponse = try await apiClient.request(.getProfile)
            let fallbackRegion = response.profile.location?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !fallbackRegion.isEmpty {
                pricingRegion = fallbackRegion
                UserDefaults.standard.set(fallbackRegion, forKey: Self.pricingRegionDefaultsKey)
            }
        } catch {
            // Keep region empty; user can still input manually.
        }
    }

    func loadPricingOnDemand(region rawRegion: String) async {
        let region = rawRegion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !region.isEmpty else {
            pricingError = "Enter your location before fetching pricing."
            return
        }

        let cacheKey = "\(productId.lowercased())::\(region.lowercased())"
        if let cached = Self.pricingCache[cacheKey],
           Date().timeIntervalSince(cached.cachedAt) <= Self.pricingCacheTTL {
            pricingEntry = cached.entry
            resolvedPricingRegion = cached.region
            pricingError = nil
            return
        }

        if let persisted = Self.loadPersistedPricing(for: cacheKey),
           Date().timeIntervalSince(persisted.cachedAt) <= Self.pricingCacheTTL {
            let restoredEntry = Self.toRuntimeEntry(from: persisted.entry)
            pricingEntry = restoredEntry
            resolvedPricingRegion = persisted.region
            pricingError = nil
            Self.pricingCache[cacheKey] = (
                entry: restoredEntry,
                region: persisted.region,
                cachedAt: persisted.cachedAt
            )
            return
        }

        isLoadingPricing = true
        pricingError = nil
        defer { isLoadingPricing = false }

        struct BatchPricingRequest: Encodable {
            let productIds: [String]
            let region: String
        }

        do {
            let response: BatchPricingResponse = try await apiClient.request(
                .getProductPricing,
                body: BatchPricingRequest(productIds: [productId], region: region)
            )
            let entry =
                response.pricing.first(where: { $0.productId == productId })
                ?? response.pricing.first
            pricingEntry = entry
            if pricingEntry == nil {
                pricingError = "No pricing data returned for this product."
                resolvedPricingRegion = nil
            } else if let entry {
                let resolvedRegion = response.meta?.region?.trimmingCharacters(in: .whitespacesAndNewlines)
                resolvedPricingRegion = (resolvedRegion?.isEmpty == false ? resolvedRegion : region)
                pricingRegion = region
                UserDefaults.standard.set(region, forKey: Self.pricingRegionDefaultsKey)
                let cachedAt = Date()
                let resolvedForCache = resolvedPricingRegion ?? region
                Self.pricingCache[cacheKey] = (entry: entry, region: resolvedForCache, cachedAt: cachedAt)
                let persistedPayload = PersistedPricingPayload(
                    region: resolvedForCache,
                    cachedAt: cachedAt,
                    entry: Self.toPersistedEntry(from: entry)
                )
                Self.storePersistedPricing(persistedPayload, for: cacheKey)
            }
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            pricingError = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            pricingError = error.localizedDescription
        }
    }

    private static func persistedStorageKey(for cacheKey: String) -> String {
        pricingCacheStoragePrefix + cacheKey
    }

    private static func loadPersistedPricing(for cacheKey: String) -> PersistedPricingPayload? {
        let key = persistedStorageKey(for: cacheKey)
        guard let data = UserDefaults.standard.data(forKey: key) else {
            return nil
        }
        do {
            return try JSONDecoder().decode(PersistedPricingPayload.self, from: data)
        } catch {
            UserDefaults.standard.removeObject(forKey: key)
            return nil
        }
    }

    private static func storePersistedPricing(_ payload: PersistedPricingPayload, for cacheKey: String) {
        let key = persistedStorageKey(for: cacheKey)
        if let data = try? JSONEncoder().encode(payload) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private static func toPersistedEntry(from entry: ProductPricingEntry) -> PersistedPricingEntry {
        PersistedPricingEntry(
            productId: entry.productId,
            productName: entry.productName,
            brand: entry.brand,
            currency: entry.pricing.currency,
            retailPrice: entry.pricing.retailPrice,
            wholesalePrice: entry.pricing.wholesalePrice,
            unit: entry.pricing.unit,
            availability: entry.pricing.availability,
            lastUpdated: entry.pricing.lastUpdated,
            offers: entry.offers.map {
                PersistedPricingOffer(
                    price: $0.price,
                    unit: $0.unit,
                    retailer: $0.retailer,
                    url: $0.url,
                    region: $0.region,
                    lastUpdated: $0.lastUpdated
                )
            }
        )
    }

    private static func toRuntimeEntry(from entry: PersistedPricingEntry) -> ProductPricingEntry {
        ProductPricingEntry(
            productId: entry.productId,
            productName: entry.productName,
            brand: entry.brand,
            pricing: ProductPricingSnapshot(
                currency: entry.currency,
                retailPrice: entry.retailPrice,
                wholesalePrice: entry.wholesalePrice,
                unit: entry.unit,
                availability: entry.availability,
                lastUpdated: entry.lastUpdated
            ),
            offers: entry.offers.map {
                ProductPricingOffer(
                    price: $0.price,
                    unit: $0.unit,
                    retailer: $0.retailer,
                    url: $0.url,
                    region: $0.region,
                    lastUpdated: $0.lastUpdated
                )
            }
        )
    }
}
