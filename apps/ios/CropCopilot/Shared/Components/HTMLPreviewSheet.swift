import SwiftUI
import WebKit

/// A SwiftUI wrapper around WKWebView that renders a raw HTML string.
struct HTMLWebView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = false
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: nil)
    }
}

/// A full-screen sheet that renders a raw HTML string inside a WKWebView.
/// Usage:
///   .sheet(item: $reportHtml) { html in HTMLPreviewSheet(html: html) }
/// where reportHtml is a `String?` binding driven by an `@State`.
struct HTMLPreviewSheet: View {
    let title: String
    let html: String
    @Environment(\.dismiss) private var dismiss

    init(html: String, title: String = "Application Prep Packet") {
        self.html = html
        self.title = title
    }

    var body: some View {
        NavigationView {
            HTMLWebView(html: html)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") { dismiss() }
                            .fontWeight(.semibold)
                    }
                }
        }
        .navigationViewStyle(.stack)
    }
}
