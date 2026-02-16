//
//  APIResponseDecodingTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

final class APIResponseDecodingTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    func testRecommendationsListResponseDecoding() throws {
        let json = """
        {
            "recommendations": [
                {
                    "id": "rec1",
                    "createdAt": "2026-01-15T10:00:00.000Z",
                    "confidence": 0.85,
                    "condition": "Nitrogen Deficiency",
                    "conditionType": "nutrient_deficiency",
                    "firstAction": "Apply urea fertilizer",
                    "input": {
                        "id": "inp1",
                        "type": "PHOTO",
                        "crop": "Corn",
                        "location": "Iowa",
                        "imageUrl": "https://example.com/photo.jpg"
                    }
                }
            ],
            "pagination": {
                "page": 1,
                "pageSize": 20,
                "total": 1,
                "totalPages": 1
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(RecommendationsListResponse.self, from: json)
        XCTAssertEqual(response.recommendations.count, 1)
        XCTAssertEqual(response.recommendations[0].id, "rec1")
        XCTAssertEqual(response.recommendations[0].condition, "Nitrogen Deficiency")
        XCTAssertEqual(response.recommendations[0].confidence, 0.85)
        XCTAssertEqual(response.recommendations[0].input.crop, "Corn")
        XCTAssertEqual(response.pagination.total, 1)
        XCTAssertEqual(response.pagination.totalPages, 1)
    }

    func testCreateInputResponseDecoding() throws {
        let json = """
        {
            "input": {
                "id": "inp1",
                "userId": "user1",
                "type": "PHOTO",
                "imageUrl": "https://example.com/photo.jpg",
                "description": "Test photo",
                "labData": null,
                "location": "Iowa",
                "crop": "Corn",
                "season": "Spring",
                "createdAt": "2026-01-15T10:00:00.000Z"
            },
            "recommendationId": "rec1"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(CreateInputResponse.self, from: json)
        XCTAssertEqual(response.input.id, "inp1")
        XCTAssertEqual(response.input.type, "PHOTO")
        XCTAssertEqual(response.input.crop, "Corn")
        XCTAssertEqual(response.recommendationId, "rec1")
    }

    func testProfileResponseDecoding() throws {
        let json = """
        {
            "profile": {
                "id": "prof1",
                "userId": "user1",
                "location": "Iowa",
                "farmSize": 500.0,
                "cropsOfInterest": ["Corn", "Soybeans"],
                "experienceLevel": "INTERMEDIATE",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-15T00:00:00.000Z"
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ProfileResponse.self, from: json)
        XCTAssertEqual(response.profile.id, "prof1")
        XCTAssertEqual(response.profile.location, "Iowa")
        XCTAssertEqual(response.profile.farmSize, 500.0)
        XCTAssertEqual(response.profile.cropsOfInterest, ["Corn", "Soybeans"])
        XCTAssertEqual(response.profile.experienceLevel, "INTERMEDIATE")
    }

    func testUploadResponseDecoding() throws {
        let json = """
        {"url": "https://storage.example.com/uploads/photo.jpg"}
        """.data(using: .utf8)!

        let response = try decoder.decode(UploadResponse.self, from: json)
        XCTAssertEqual(response.url, "https://storage.example.com/uploads/photo.jpg")
    }

    func testPaginationDecoding() throws {
        let json = """
        {"page": 2, "pageSize": 20, "total": 45, "totalPages": 3}
        """.data(using: .utf8)!

        let pagination = try decoder.decode(Pagination.self, from: json)
        XCTAssertEqual(pagination.page, 2)
        XCTAssertEqual(pagination.pageSize, 20)
        XCTAssertEqual(pagination.total, 45)
        XCTAssertEqual(pagination.totalPages, 3)
    }

    func testRecommendationSummaryWithNullOptionals() throws {
        let json = """
        {
            "id": "rec1",
            "createdAt": "2026-01-15T10:00:00.000Z",
            "confidence": 0.6,
            "condition": "Unknown",
            "conditionType": "unknown",
            "firstAction": null,
            "input": {
                "id": "inp1",
                "type": "LAB_REPORT",
                "crop": null,
                "location": null,
                "imageUrl": null
            }
        }
        """.data(using: .utf8)!

        let summary = try decoder.decode(RecommendationSummary.self, from: json)
        XCTAssertEqual(summary.id, "rec1")
        XCTAssertNil(summary.firstAction)
        XCTAssertNil(summary.input.crop)
        XCTAssertNil(summary.input.location)
        XCTAssertNil(summary.input.imageUrl)
    }
}
