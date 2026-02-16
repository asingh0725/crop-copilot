//
//  User.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case createdAt = "created_at"
    }
}
