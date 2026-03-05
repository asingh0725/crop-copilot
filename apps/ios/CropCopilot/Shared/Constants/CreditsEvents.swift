//
//  CreditsEvents.swift
//  CropCopilot
//

import Foundation

extension Notification.Name {
    static let creditsStateNeedsRefresh = Notification.Name("cropcopilot.credits.refresh")
}

enum CreditsRefreshReason: String {
    case recommendationGenerated = "recommendation_generated"
    case feedbackRewardGranted = "feedback_reward_granted"
    case manual = "manual"
}

enum CreditsEvents {
    static func postRefresh(_ reason: CreditsRefreshReason) {
        NotificationCenter.default.post(
            name: .creditsStateNeedsRefresh,
            object: nil,
            userInfo: ["reason": reason.rawValue]
        )
    }
}
