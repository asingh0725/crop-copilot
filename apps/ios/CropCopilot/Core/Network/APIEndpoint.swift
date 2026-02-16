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
    case listInputs
    case getInput(id: String)

    // Recommendations
    case listRecommendations(page: Int, pageSize: Int, search: String?, sort: String?)
    case getRecommendation(id: String)
    case deleteRecommendation(id: String)

    // Products
    case listProducts(search: String?, type: String?)
    case getProduct(id: String)
    case compareProducts
    case getProductPricing

    // Upload
    case uploadImage

    // Feedback
    case submitFeedback

    var path: String {
        switch self {
        case .login: return "/auth/login"
        case .signup: return "/auth/signup"
        case .refreshToken: return "/auth/refresh"
        case .getProfile, .updateProfile: return "/profile"
        case .createInput, .listInputs: return "/inputs"
        case .getInput(let id): return "/inputs/\(id)"
        case .listRecommendations: return "/recommendations"
        case .getRecommendation(let id): return "/recommendations/\(id)"
        case .deleteRecommendation(let id): return "/recommendations/\(id)"
        case .listProducts: return "/products"
        case .getProduct(let id): return "/products/\(id)"
        case .compareProducts: return "/products/compare"
        case .getProductPricing: return "/products/pricing/batch"
        case .uploadImage: return "/upload"
        case .submitFeedback: return "/feedback"
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

        case .listProducts(let search, let type):
            var items: [URLQueryItem] = []
            if let search = search {
                items.append(URLQueryItem(name: "search", value: search))
            }
            if let type = type {
                items.append(URLQueryItem(name: "type", value: type))
            }
            return items.isEmpty ? nil : items

        default:
            return nil
        }
    }

    func url(baseURL: String) -> URL? {
        var components = URLComponents(string: baseURL + path)
        components?.queryItems = queryItems
        return components?.url
    }
}
