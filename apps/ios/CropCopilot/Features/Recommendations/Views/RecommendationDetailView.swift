//
//  RecommendationDetailView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//
//  Note: This is a thin wrapper that reuses DiagnosisResultView.
//  DiagnosisResultView handles both direct navigation from diagnosis
//  and navigation from the recommendations list.
//

import SwiftUI

// RecommendationDetailView simply wraps DiagnosisResultView
// so we have a distinct type for navigation from the recommendations list.
// All the rendering logic lives in DiagnosisResultView.
struct RecommendationDetailView: View {
    let recommendationId: String

    var body: some View {
        DiagnosisResultView(recommendationId: recommendationId)
    }
}
