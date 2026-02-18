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
            return
        }

        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)

        if let url = URL(string: trimmed), url.scheme != nil {
            if shouldPresign(url: url) {
                if let cached = await SignedImageUrlCache.shared.read(for: trimmed) {
                    resolvedURL = cached
                    return
                }

                do {
                    let response: UploadViewUrlResponse = try await APIClient.shared.request(
                        .getUploadViewUrl(objectUrl: url.absoluteString)
                    )
                    if let signed = URL(string: response.downloadUrl) {
                        await SignedImageUrlCache.shared.write(
                            url: signed,
                            for: trimmed,
                            expiresInSeconds: response.expiresInSeconds
                        )
                        resolvedURL = signed
                        return
                    }
                } catch {
                    resolvedURL = url
                    return
                }
            }

            resolvedURL = url
            return
        }

        resolvedURL = Configuration.resolveMediaURL(trimmed)
        didFail = resolvedURL == nil
    }

    private func shouldPresign(url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }
        let isAws = host.contains("amazonaws.com")
        let hasSignature = url.query?.contains("X-Amz-Signature") == true
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
