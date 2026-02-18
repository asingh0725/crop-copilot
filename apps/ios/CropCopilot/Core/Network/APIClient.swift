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
    private let runtimeBaseURL = Configuration.apiRuntimeBaseURL
    private let authInterceptor = AuthInterceptor()
    private let session: URLSession

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Generic Request
    func request<T: Decodable>(
        _ endpoint: APIEndpoint,
        body: Encodable? = nil,
        retry: Bool = true
    ) async throws -> T {
        guard let url = endpoint.url(primaryBaseURL: baseURL, runtimeBaseURL: runtimeBaseURL) else {
            throw NetworkError.unknown(
                NSError(
                    domain: "Configuration",
                    code: -1,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "API runtime URL is not configured. Set API_RUNTIME_BASE_URL in Config/Secrets.xcconfig."
                    ]
                )
            )
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Add auth header
        if let token = await authInterceptor.getAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Encode body if present
        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                throw NetworkError.encodingError(error)
            }
        }

        // Execute request
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw NetworkError.cancelled
        } catch let urlError as URLError where urlError.code == .cancelled {
            throw NetworkError.cancelled
        } catch {
            throw NetworkError.unknown(error)
        }

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
        struct UploadUrlRequest: Encodable {
            let fileName: String
            let contentType: String
            let contentLength: Int
        }

        let uploadUrlResponse: UploadUrlResponse = try await request(
            .uploadImage,
            body: UploadUrlRequest(
                fileName: fileName,
                contentType: "image/jpeg",
                contentLength: imageData.count
            )
        )

        guard let directUploadUrl = URL(string: uploadUrlResponse.uploadUrl) else {
            throw NetworkError.unknown(NSError(domain: "Invalid upload URL", code: -1))
        }

        var uploadRequest = URLRequest(url: directUploadUrl)
        uploadRequest.httpMethod = "PUT"
        uploadRequest.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        uploadRequest.httpBody = imageData

        let uploadResponse: URLResponse
        do {
            (_, uploadResponse) = try await session.data(for: uploadRequest)
        } catch is CancellationError {
            throw NetworkError.cancelled
        } catch let urlError as URLError where urlError.code == .cancelled {
            throw NetworkError.cancelled
        } catch {
            throw NetworkError.unknown(error)
        }
        guard let httpResponse = uploadResponse as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError(statusCode: (uploadResponse as? HTTPURLResponse)?.statusCode ?? 500)
        }

        if let objectUrl = uploadUrlResponse.uploadUrl.split(separator: "?").first {
            return String(objectUrl)
        }

        return uploadUrlResponse.uploadUrl
    }

    // MARK: - Recommendation Job Polling
    func waitForRecommendation(
        jobId: String,
        timeoutSeconds: TimeInterval = 120,
        pollIntervalSeconds: TimeInterval = 2
    ) async throws -> RecommendationJobStatusResponse {
        let startedAt = Date()

        while Date().timeIntervalSince(startedAt) < timeoutSeconds {
            do {
                try await Task.sleep(nanoseconds: UInt64(pollIntervalSeconds * 1_000_000_000))
            } catch {
                throw NetworkError.cancelled
            }

            let status: RecommendationJobStatusResponse = try await request(
                .getJobStatus(jobId: jobId)
            )
            if status.status == "completed" {
                return status
            }

            if status.status == "failed" {
                throw NetworkError.unknown(
                    NSError(
                        domain: "RecommendationJobFailed",
                        code: -1,
                        userInfo: [
                            NSLocalizedDescriptionKey:
                                status.failureReason ?? "Recommendation job failed"
                        ]
                    )
                )
            }
        }

        throw NetworkError.timeout
    }
}
