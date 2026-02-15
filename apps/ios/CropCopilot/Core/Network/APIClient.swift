//
//  APIClient.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

class APIClient {
    static let shared = APIClient()

    private let baseURL = Configuration.apiBaseURL
    private let authInterceptor = AuthInterceptor()
    private let session: URLSession

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Generic Request
    func request<T: Codable>(
        _ endpoint: APIEndpoint,
        body: Encodable? = nil,
        retry: Bool = true
    ) async throws -> T {
        guard let url = endpoint.url(baseURL: baseURL) else {
            throw NetworkError.unknown(NSError(domain: "Invalid URL", code: -1))
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Add auth header
        await authInterceptor.addAuthHeader(to: &request)

        // Encode body if present
        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                throw NetworkError.encodingError(error)
            }
        }

        // Execute request
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.unknown(NSError(domain: "Invalid response", code: -1))
        }

        // Handle HTTP status codes
        switch httpResponse.statusCode {
        case 200...299:
            // Success - decode response
            do {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                return try decoder.decode(T.self, from: data)
            } catch {
                throw NetworkError.decodingError(error)
            }

        case 401:
            // Unauthorized - try to refresh token and retry
            if retry {
                do {
                    _ = try await authInterceptor.handleUnauthorized()
                    // Retry request with new token
                    return try await self.request(endpoint, body: body, retry: false)
                } catch {
                    throw NetworkError.unauthorized
                }
            } else {
                throw NetworkError.unauthorized
            }

        case 403:
            throw NetworkError.forbidden

        case 404:
            throw NetworkError.notFound

        case 500...599:
            throw NetworkError.serverError(statusCode: httpResponse.statusCode)

        default:
            throw NetworkError.unknown(NSError(
                domain: "HTTP Error",
                code: httpResponse.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "HTTP \(httpResponse.statusCode)"]
            ))
        }
    }

    // MARK: - Upload Image
    func uploadImage(imageData: Data, fileName: String) async throws -> String {
        guard let url = URL(string: baseURL + "/upload") else {
            throw NetworkError.unknown(NSError(domain: "Invalid URL", code: -1))
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        // Add auth header
        await authInterceptor.addAuthHeader(to: &request)

        // Create multipart form data
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Add image data
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".utf8))
        body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        body.append(imageData)
        body.append(Data("\r\n".utf8))
        body.append(Data("--\(boundary)--\r\n".utf8))

        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw NetworkError.serverError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }

        struct UploadResponse: Codable {
            let url: String
        }

        let uploadResponse = try JSONDecoder().decode(UploadResponse.self, from: data)
        return uploadResponse.url
    }
}
