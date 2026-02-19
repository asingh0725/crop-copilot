//
//  SecureAsyncImage.swift
//  CropCopilot
//

import SwiftUI

private actor SignedImageUrlCache {
    static let shared = SignedImageUrlCache()

    private struct Entry {
        let url: URL
        let expiresAt: Date
    }

    private var entries: [String: Entry] = [:]

    func read(for key: String) -> URL? {
        guard let entry = entries[key] else {
            return nil
        }
        if entry.expiresAt <= Date() {
            entries[key] = nil
            return nil
        }
        return entry.url
    }

    func write(url: URL, for key: String, expiresInSeconds: Int) {
        let ttl = max(30, expiresInSeconds - 5)
        entries[key] = Entry(url: url, expiresAt: Date().addingTimeInterval(TimeInterval(ttl)))
    }
}

struct SecureAsyncImage<Content: View, Placeholder: View, Failure: View>: View {
    let source: String?
    @ViewBuilder let content: (Image) -> Content
    @ViewBuilder let placeholder: () -> Placeholder
    @ViewBuilder let failure: () -> Failure

    @State private var resolvedURL: URL?
    @State private var isResolving = false
    @State private var didFail = false
    @State private var lastResolvedSource: String?

    var body: some View {
        Group {
            if let resolvedURL {
                AsyncImage(url: resolvedURL) { phase in
                    switch phase {
                    case .success(let image):
                        content(image)
                    case .empty:
                        placeholder()
                    case .failure:
                        failure()
                    @unknown default:
                        failure()
                    }
                }
            } else if isResolving {
                placeholder()
            } else if didFail {
                failure()
            } else {
                placeholder()
            }
        }
        .task(id: source ?? "") {
            await resolveSource()
        }
    }

    private func resolveSource() async {
        didFail = false
        isResolving = true
        defer { isResolving = false }

        guard let source, !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            resolvedURL = nil
            lastResolvedSource = nil
            return
        }

        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        if lastResolvedSource == trimmed, resolvedURL != nil {
            return
        }

        if let url = URL(string: trimmed), url.scheme != nil {
            if shouldPresign(url: url) {
                if let cached = await SignedImageUrlCache.shared.read(for: trimmed) {
                    resolvedURL = cached
                    lastResolvedSource = trimmed
                    return
                }

                if let signed = await fetchSignedURL(objectUrl: url.absoluteString, cacheKey: trimmed) {
                    resolvedURL = signed
                    lastResolvedSource = trimmed
                    return
                }

                // Fallback to direct URL in case bucket policy allows public reads.
                resolvedURL = url
                lastResolvedSource = trimmed
                return
            }

            resolvedURL = url
            lastResolvedSource = trimmed
            return
        }

        guard let resolved = Configuration.resolveMediaURL(trimmed) else {
            resolvedURL = nil
            didFail = true
            lastResolvedSource = nil
            return
        }

        if shouldPresign(url: resolved) {
            if let cached = await SignedImageUrlCache.shared.read(for: resolved.absoluteString) {
                resolvedURL = cached
                lastResolvedSource = trimmed
                return
            }

            if let signed = await fetchSignedURL(
                objectUrl: resolved.absoluteString,
                cacheKey: resolved.absoluteString
            ) {
                resolvedURL = signed
                lastResolvedSource = trimmed
                return
            }

            resolvedURL = resolved
            lastResolvedSource = trimmed
            return
        }

        resolvedURL = resolved
        lastResolvedSource = trimmed
    }

    private func fetchSignedURL(objectUrl: String, cacheKey: String) async -> URL? {
        for attempt in 0...1 {
            do {
                let response: UploadViewUrlResponse = try await APIClient.shared.request(
                    .getUploadViewUrl(objectUrl: objectUrl)
                )
                guard let signed = URL(string: response.downloadUrl) else {
                    continue
                }

                await SignedImageUrlCache.shared.write(
                    url: signed,
                    for: cacheKey,
                    expiresInSeconds: response.expiresInSeconds
                )
                return signed
            } catch let error as NetworkError {
                if case .unauthorized = error, attempt == 0 {
                    try? await Task.sleep(nanoseconds: 180_000_000)
                    continue
                }
                if case .forbidden = error, attempt == 0 {
                    try? await Task.sleep(nanoseconds: 180_000_000)
                    continue
                }
                return nil
            } catch {
                if attempt == 0 {
                    try? await Task.sleep(nanoseconds: 180_000_000)
                    continue
                }
                return nil
            }
        }
        return nil
    }

    private func shouldPresign(url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }
        let isAws = host.contains("amazonaws.com")
        let query = url.query?.lowercased() ?? ""
        let hasSignature = query.contains("x-amz-signature")
        return isAws && !hasSignature
    }
}

extension SecureAsyncImage where Placeholder == ProgressView<EmptyView, EmptyView>, Failure == EmptyView {
    init(
        source: String?,
        @ViewBuilder content: @escaping (Image) -> Content
    ) {
        self.source = source
        self.content = content
        self.placeholder = { ProgressView() }
        self.failure = { EmptyView() }
    }
}
