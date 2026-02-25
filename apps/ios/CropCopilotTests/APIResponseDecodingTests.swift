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

    func testCreateInputAcceptedResponseDecoding() throws {
        let json = """
        {
            "inputId": "inp1",
            "jobId": "job1",
            "status": "queued",
            "acceptedAt": "2026-01-15T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(CreateInputAcceptedResponse.self, from: json)
        XCTAssertEqual(response.inputId, "inp1")
        XCTAssertEqual(response.jobId, "job1")
        XCTAssertEqual(response.status, "queued")
    }

    func testProfileResponseDecoding() throws {
        let json = """
        {
            "profile": {
                "userId": "user1",
                "location": "Iowa",
                "farmSize": "medium",
                "cropsOfInterest": ["corn", "soybeans"],
                "experienceLevel": "intermediate",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-15T00:00:00.000Z"
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ProfileResponse.self, from: json)
        XCTAssertEqual(response.profile.userId, "user1")
        XCTAssertEqual(response.profile.location, "Iowa")
        XCTAssertEqual(response.profile.farmSize, "medium")
        XCTAssertEqual(response.profile.cropsOfInterest, ["corn", "soybeans"])
        XCTAssertEqual(response.profile.experienceLevel, "intermediate")
    }

    func testUploadUrlResponseDecoding() throws {
        let json = """
        {
            "uploadUrl": "https://storage.example.com/uploads/photo.jpg?signature=abc",
            "objectKey": "uploads/photo.jpg",
            "expiresInSeconds": 900
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(UploadUrlResponse.self, from: json)
        XCTAssertEqual(response.uploadUrl, "https://storage.example.com/uploads/photo.jpg?signature=abc")
        XCTAssertEqual(response.objectKey, "uploads/photo.jpg")
        XCTAssertEqual(response.expiresInSeconds, 900)
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

    func testRecommendationDetailResponseDecodingWithLegacyDiagnosisShape() throws {
        let json = """
        {
            "id": "rec-legacy-1",
            "createdAt": "2026-02-17T11:00:00.000Z",
            "diagnosis": {
                "condition": "probable_foliar_disease",
                "conditionType": "disease",
                "reasoning": "Legacy payload from earlier pipeline.",
                "confidence": 0.78
            },
            "confidence": 0.78,
            "input": {
                "id": "input-1",
                "type": "PHOTO",
                "description": "Leaf symptoms",
                "imageUrl": "/uploads/test.jpg",
                "crop": "corn",
                "location": "Iowa, US",
                "season": "Vegetative",
                "createdAt": "2026-02-17T10:59:00.000Z"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.id, "rec-legacy-1")
        XCTAssertEqual(detail.diagnosis.diagnosis.condition, "probable_foliar_disease")
        XCTAssertEqual(detail.diagnosis.diagnosis.conditionType, "disease")
        XCTAssertEqual(detail.diagnosis.recommendations.count, 0)
        XCTAssertEqual(detail.diagnosis.products.count, 0)
    }

    func testRecommendationDetailResponseDecodingWithNullSourceReference() throws {
        let json = """
        {
            "id": "rec-2",
            "createdAt": "2026-02-17T12:00:00.000Z",
            "diagnosis": {
                "diagnosis": {
                    "condition": "Magnesium deficiency",
                    "condition_type": "deficiency",
                    "confidence": 0.65,
                    "reasoning": "Observed interveinal chlorosis."
                },
                "recommendations": [],
                "products": [],
                "sources": [],
                "confidence": 0.65
            },
            "confidence": 0.65,
            "modelUsed": "aws-bedrock-runtime",
            "input": {
                "id": "input-2",
                "type": "PHOTO",
                "createdAt": "2026-02-17T11:59:00.000Z"
            },
            "sources": [
                {
                    "id": "src-rel-1",
                    "chunkId": "chunk-1",
                    "type": "text",
                    "content": "Example source content",
                    "imageUrl": null,
                    "relevanceScore": 0.88,
                    "source": null
                }
            ]
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.sources.count, 1)
        XCTAssertNil(detail.sources[0].source)
    }

    func testRecommendationDetailResponseDecodingWithSparseRecommendationFields() throws {
        let json = """
        {
            "id": "rec-3",
            "createdAt": "2026-02-18T12:00:00.000Z",
            "diagnosis": {
                "condition": "probable_foliar_disease",
                "conditionType": "disease",
                "confidence": 0.74,
                "reasoning": "Pattern and crop context support foliar disease.",
                "recommendations": [
                    {
                        "action": "Inspect lower canopy"
                    }
                ]
            },
            "input": {
                "id": "input-3",
                "type": "PHOTO",
                "createdAt": "2026-02-18T11:59:00.000Z"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.diagnosis.recommendations.count, 1)
        XCTAssertEqual(detail.diagnosis.recommendations[0].action, "Inspect lower canopy")
        XCTAssertFalse(detail.diagnosis.recommendations[0].timing.isEmpty)
    }

    func testRecommendationDetailResponseDecodingWithDiagnosisProductAliases() throws {
        let json = """
        {
            "id": "rec-alias-products",
            "createdAt": "2026-02-18T12:00:00.000Z",
            "confidence": "0.81",
            "diagnosis": {
                "diagnosis": {
                    "condition": "magnesium deficiency",
                    "conditionType": "deficiency",
                    "reasoning": "Interveinal chlorosis supports Mg deficiency.",
                    "confidence": 0.81
                },
                "recommendedProducts": [
                    {
                        "product_id": "prod-9",
                        "product_name": "MagBoost 5-0-0",
                        "product_type": "FERTILIZER",
                        "reasoning": "Supports magnesium availability."
                    }
                ]
            },
            "input": {
                "id": "input-9",
                "type": "PHOTO"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.confidence, 0.81, accuracy: 0.0001)
        XCTAssertEqual(detail.recommendedProducts.count, 1)
        XCTAssertEqual(detail.recommendedProducts[0].catalogProductId, "prod-9")
        XCTAssertEqual(detail.recommendedProducts[0].name, "MagBoost 5-0-0")
    }

    func testRecommendationDetailResponseDecodingLossyProductArray() throws {
        let json = """
        {
            "id": "rec-lossy-products",
            "createdAt": "2026-02-18T12:00:00.000Z",
            "diagnosis": {
                "diagnosis": {
                    "condition": "leaf spot",
                    "conditionType": "disease",
                    "reasoning": "Spots with spread pattern.",
                    "confidence": 0.72
                }
            },
            "recommendedProducts": [
                {
                    "id": "prod-good",
                    "name": "Field Shield",
                    "type": "FUNGICIDE"
                },
                12345
            ],
            "input": {
                "id": "input-10",
                "type": "PHOTO"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.recommendedProducts.count, 1)
        XCTAssertEqual(detail.recommendedProducts[0].id, "prod-good")
        XCTAssertEqual(detail.recommendedProducts[0].name, "Field Shield")
    }

    func testRecommendationDetailResponseDecodingWithNestedDiagnosisProductShape() throws {
        let json = """
        {
            "id": "rec-nested-products",
            "createdAt": "2026-02-18T12:00:00.000Z",
            "diagnosis": {
                "diagnosis": {
                    "condition": "magnesium deficiency",
                    "conditionType": "deficiency",
                    "reasoning": "Interveinal chlorosis in lower leaves.",
                    "confidence": 0.81
                },
                "products": [
                    {
                        "product": {
                            "id": "6f84c14d-3f7f-4a56-9f8c-2db26f89ab52",
                            "name": "Magnesium Sulfate Foliar",
                            "type": "FERTILIZER"
                        },
                        "reason": "Fast foliar correction.",
                        "application_rate": "10-20 lbs/acre"
                    }
                ]
            },
            "input": {
                "id": "input-12",
                "type": "PHOTO"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.diagnosis.products.count, 1)
        XCTAssertEqual(detail.diagnosis.products[0].productName, "Magnesium Sulfate Foliar")
        XCTAssertEqual(detail.diagnosis.products[0].productType, "FERTILIZER")
    }

    func testRecommendationDetailResponseDecodingWithStringProductField() throws {
        let json = """
        {
            "id": "rec-string-product",
            "createdAt": "2026-02-18T12:00:00.000Z",
            "diagnosis": {
                "diagnosis": {
                    "condition": "magnesium deficiency",
                    "conditionType": "deficiency",
                    "reasoning": "Lower-leaf interveinal chlorosis.",
                    "confidence": 0.81
                },
                "products": [
                    {
                        "product": "magnesium_sulfate_foliar",
                        "application_rate": "10-20 lbs/acre",
                        "reasoning": "Fast foliar correction."
                    }
                ]
            },
            "input": {
                "id": "input-13",
                "type": "PHOTO"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.diagnosis.products.count, 1)
        XCTAssertEqual(detail.diagnosis.products[0].productName, "magnesium_sulfate_foliar")
        XCTAssertEqual(detail.diagnosis.products[0].applicationRate, "10-20 lbs/acre")
    }

    func testRecommendationDetailResponseInfersGenericProductNameFromApplicationRate() throws {
        let json = """
        {
            "id": "rec-inferred-product",
            "createdAt": "2026-02-18T12:00:00.000Z",
            "recommendedProducts": [
                {
                    "name": "Suggested product",
                    "type": "unspecified",
                    "application_rate": "10-20 lbs magnesium sulfate per acre in 15-20 gallons water",
                    "reasoning": "Provides immediate magnesium availability."
                }
            ],
            "diagnosis": {
                "diagnosis": {
                    "condition": "magnesium deficiency",
                    "conditionType": "deficiency",
                    "reasoning": "Leaf chlorosis pattern",
                    "confidence": 0.82
                }
            },
            "input": {
                "id": "input-14",
                "type": "PHOTO"
            },
            "sources": []
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(RecommendationDetailResponse.self, from: json)
        XCTAssertEqual(detail.recommendedProducts.count, 1)
        XCTAssertEqual(detail.recommendedProducts[0].name, "Magnesium Sulfate")
    }

    func testBatchPricingResponseDecodesMetaRegion() throws {
        let json = """
        {
            "pricing": [],
            "meta": {
                "region": "British Columbia, CA",
                "fetchedAt": "2026-02-20T14:00:00.000Z"
            }
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(BatchPricingResponse.self, from: json)
        XCTAssertEqual(detail.meta?.region, "British Columbia, CA")
        XCTAssertEqual(detail.meta?.fetchedAt, "2026-02-20T14:00:00.000Z")
    }

    func testProductsListResponseDecodingWithDataEnvelope() throws {
        let json = """
        {
            "data": {
                "products": [
                    {
                        "id": "prod-1",
                        "name": "Product One",
                        "type": "FERTILIZER"
                    }
                ],
                "total": 1,
                "limit": 20,
                "offset": 0
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ProductsListResponse.self, from: json)
        XCTAssertEqual(response.products.count, 1)
        XCTAssertEqual(response.products[0].name, "Product One")
        XCTAssertEqual(response.total, 1)
    }

    func testProductDetailResponseDecodingSnakeCaseEnvelope() throws {
        let json = """
        {
            "data": {
                "id": "prod-9",
                "name": "Sulfur Blend",
                "type": "AMENDMENT",
                "application_rate": "3 lb/acre",
                "used_in_recommendations": 4,
                "related_products": [],
                "recommendations": []
            }
        }
        """.data(using: .utf8)!

        let detail = try decoder.decode(ProductDetailResponse.self, from: json)
        XCTAssertEqual(detail.id, "prod-9")
        XCTAssertEqual(detail.applicationRate, "3 lb/acre")
        XCTAssertEqual(detail.usedInRecommendations, 4)
    }
}
