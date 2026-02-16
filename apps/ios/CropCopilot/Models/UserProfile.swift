//
//  UserProfile.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

struct UserProfile: Codable, Identifiable {
    let id: String
    let userId: String
    let location: String?
    let farmSize: Double?
    let cropsOfInterest: [String]?
    let experienceLevel: ExperienceLevel?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case location
        case farmSize = "farm_size"
        case cropsOfInterest = "crops_of_interest"
        case experienceLevel = "experience_level"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

enum ExperienceLevel: String, Codable, CaseIterable {
    case beginner = "BEGINNER"
    case intermediate = "INTERMEDIATE"
    case expert = "EXPERT"

    var displayName: String {
        switch self {
        case .beginner: return "Beginner"
        case .intermediate: return "Intermediate"
        case .expert: return "Expert"
        }
    }
}
