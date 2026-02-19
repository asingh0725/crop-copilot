//
//  APIEndpoint.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

enum APIEndpoint {
    // Auth
    case login
    case signup
    case refreshToken

    // Profile
    case getProfile
    case updateProfile

    // Inputs
    case createInput
    case getJobStatus(jobId: String)
    case listInputs
    case getInput(id: String)

    // Recommendations
    case listRecommendations(page: Int, pageSize: Int, search: String?, sort: String?)
    case getRecommendation(id: String)
    case deleteRecommendation(id: String)

    // Products
    case listProducts(
        search: String?,
        type: String?,
        limit: Int?,
        offset: Int?,
        sortBy: String?,
        sortOrder: String?
    )
    case getProduct(id: String)
    case compareProducts
    case getProductPricing

    // Upload
    case uploadImage
    case getUploadViewUrl(objectUrl: String)

    // Feedback
    case getFeedback(recommendationId: String)
    case submitFeedback

    private enum HostTarget {
        case primary
        case runtimePreferred
    }

    var path: String {
        switch self {
        case .login: return "/auth/login"
        case .signup: return "/auth/signup"
        case .refreshToken: return "/auth/refresh"
        case .getProfile, .updateProfile: return "/profile"
        case .createInput, .listInputs: return "/inputs"
        case .getJobStatus(let jobId): return "/jobs/\(jobId)"
        case .getInput(let id): return "/inputs/\(id)"
        case .listRecommendations: return "/recommendations"
        case .getRecommendation(let id): return "/recommendations/\(id)"
        case .deleteRecommendation(let id): return "/recommendations/\(id)"
        case .listProducts: return "/products"
        case .getProduct(let id): return "/products/\(id)"
        case .compareProducts: return "/products/compare"
        case .getProductPricing: return "/products/pricing/batch"
        case .uploadImage: return "/upload"
        case .getUploadViewUrl: return "/upload/view"
        case .getFeedback, .submitFeedback: return "/feedback"
        }
    }

    private var hostTarget: HostTarget {
        switch self {
        case .getProfile,
             .updateProfile,
             .createInput,
             .getJobStatus,
             .listRecommendations,
             .getRecommendation,
             .deleteRecommendation,
             .listProducts,
             .getProduct,
             .compareProducts,
             .getProductPricing,
             .uploadImage,
             .getUploadViewUrl,
             .getFeedback,
             .submitFeedback:
            return .runtimePreferred
        default:
            return .primary
        }
    }

    var method: HTTPMethod {
        switch self {
        case .login, .signup, .refreshToken,
             .createInput, .compareProducts,
             .getProductPricing, .uploadImage,
             .submitFeedback:
            return .post
        case .updateProfile:
            return .put
        case .deleteRecommendation:
            return .delete
        default:
            return .get
        }
    }

    var queryItems: [URLQueryItem]? {
        switch self {
        case .listRecommendations(let page, let pageSize, let search, let sort):
            var items = [
                URLQueryItem(name: "page", value: "\(page)"),
                URLQueryItem(name: "pageSize", value: "\(pageSize)")
            ]
            if let search = search {
                items.append(URLQueryItem(name: "search", value: search))
            }
            if let sort = sort {
                items.append(URLQueryItem(name: "sort", value: sort))
            }
            return items

        case .listProducts(let search, let type, let limit, let offset, let sortBy, let sortOrder):
            var items: [URLQueryItem] = []
            if let search = search {
                items.append(URLQueryItem(name: "search", value: search))
            }
            if let type = type {
                items.append(URLQueryItem(name: "types", value: type))
            }
            if let limit {
                items.append(URLQueryItem(name: "limit", value: "\(limit)"))
            }
            if let offset {
                items.append(URLQueryItem(name: "offset", value: "\(offset)"))
            }
            if let sortBy {
                items.append(URLQueryItem(name: "sortBy", value: sortBy))
            }
            if let sortOrder {
                items.append(URLQueryItem(name: "sortOrder", value: sortOrder))
            }
            return items.isEmpty ? nil : items

        case .getUploadViewUrl(let objectUrl):
            return [URLQueryItem(name: "objectUrl", value: objectUrl)]

        case .getFeedback(let recommendationId):
            return [URLQueryItem(name: "recommendationId", value: recommendationId)]

        default:
            return nil
        }
    }

    private func normalizeBaseURL(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let withoutTrailingSlash =
            trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed

        if withoutTrailingSlash.lowercased().hasSuffix("/api/v1") {
            return withoutTrailingSlash
        }

        return withoutTrailingSlash + "/api/v1"
    }

    func url(primaryBaseURL: String, runtimeBaseURL: String?) -> URL? {
        let baseURL: String
        switch hostTarget {
        case .runtimePreferred:
            let runtime = runtimeBaseURL?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let runtime, !runtime.isEmpty {
                baseURL = runtime
            } else {
                baseURL = primaryBaseURL
            }
        case .primary:
            baseURL = primaryBaseURL
        }

        var components = URLComponents(string: normalizeBaseURL(baseURL) + path)
        components?.queryItems = queryItems
        return components?.url
    }

    func url(baseURL: String) -> URL? {
        url(primaryBaseURL: baseURL, runtimeBaseURL: nil)
    }
}
