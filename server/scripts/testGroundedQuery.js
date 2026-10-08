require("dotenv").config();
const connectDB = require("../config/db");
const PolicyChunk = require("../models/PolicyChunk");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const { upsertPolicyChunks, deleteChunksByDocument } = require("../services/vectorService");
const { generateGroundedAnswer } = require("../services/groundingService");
const { executeHybridSearch } = require("../services/hybridSearch");

async function runGroundedQueryTest() {
  console.log("=== Starting Step 6: Grounded LLM Generation, Citations & Guardrails Test ===");
  await connectDB();

  // Create test document and version
  const testDoc = new Document({
    title: "Water Subsidy Scheme 2026",
    category: "Sanitation & Water",
    status: "ACTIVE",
    uploadedBy: "test_admin",
  });
  await testDoc.save();

  const testVersion = new DocumentVersion({
    documentId: testDoc._id,
    versionNumber: 3,
    fileName: "water_subsidy_2026.pdf",
    filePath: "mock/water_subsidy.pdf",
    status: "ACTIVE",
    uploadedBy: "test_admin",
  });
  await testVersion.save();

  const mockChunks = [
    {
      chunkId: `${testDoc._id}_v3_p5_para2`,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 3,
      documentTitle: "Water Subsidy Scheme 2026",
      category: "Sanitation & Water",
      status: "active",
      pageNumber: 5,
      paragraphNumber: 2,
      section: "Eligibility Criteria",
      text: "SECTION 2: ELIGIBILITY CRITERIA. Households with aggregate annual income below ₹3,00,000 are eligible for subsidized tap water under the municipal scheme. Applicants must have a registered residential water meter.",
    },
    {
      chunkId: `${testDoc._id}_v3_p5_para3`,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 3,
      documentTitle: "Water Subsidy Scheme 2026",
      category: "Sanitation & Water",
      status: "active",
      pageNumber: 5,
      paragraphNumber: 3,
      section: "Required Documents",
      text: "SECTION 3: MANDATORY DOCUMENTS. Applicants must provide proof of residence, an income certificate issued by the Tehsildar, and the latest water utility bill.",
    },
  ];

  console.log("[Setup] Indexing policy chunks into MongoDB and Pinecone...");
  await PolicyChunk.deleteMany({ documentId: testDoc._id });
  await PolicyChunk.insertMany(
    mockChunks.map((c) => ({
      ...c,
      status: "ACTIVE",
    }))
  );
  await upsertPolicyChunks(mockChunks);

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Supported Policy Question with Exact Citations
    // -------------------------------------------------------------
    console.log("\n[Scenario 1] Testing Supported Query: 'What is the maximum income limit for water subsidy?'...");
    const candidates1 = await executeHybridSearch("What is the maximum income limit for water subsidy?", {
      topK: 5,
      filter: { documentId: { $eq: String(testDoc._id) } },
    });

    const res1 = await generateGroundedAnswer("What is the maximum income limit for water subsidy?", candidates1);
    console.log("Answer:", res1.answer);
    console.log("Confidence:", res1.confidence);
    console.log("Grounded:", res1.grounded);
    console.log("Citizen Response:", res1.suggested_citizen_response);
    console.log("Sources count:", res1.sources.length);
    if (res1.sources.length > 0) {
      console.log("Source 1:", JSON.stringify(res1.sources[0], null, 2));
    }

    if (!res1.grounded || !res1.answer.includes("3,00,000") || res1.sources.length === 0) {
      throw new Error("Scenario 1 failed: Answer not properly grounded or missing ₹3,00,000 threshold/sources!");
    }

    // -------------------------------------------------------------
    // SCENARIO 2: Unsupported Query (Anti-Hallucination Guard)
    // -------------------------------------------------------------
    console.log("\n[Scenario 2] Testing Unsupported Query: 'Does the municipality reimburse private taxi expenses?'...");
    const candidates2 = await executeHybridSearch("Does the municipality reimburse private taxi expenses?", {
      topK: 5,
      filter: { documentId: { $eq: String(testDoc._id) } },
    });

    const res2 = await generateGroundedAnswer("Does the municipality reimburse private taxi expenses?", candidates2);
    console.log("Answer:", res2.answer);
    console.log("Confidence:", res2.confidence);
    console.log("Grounded:", res2.grounded);

    if (res2.grounded || !res2.answer.toLowerCase().includes("could not find sufficient information")) {
      throw new Error("Scenario 2 failed: LLM hallucinated an answer instead of returning 'insufficient information'!");
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Policy Conflict Detection
    // -------------------------------------------------------------
    console.log("\n[Scenario 3] Testing Policy Conflict Detection (Adding Circular B with ₹5,00,000 threshold)...");
    const conflictingChunk = {
      chunkId: `${testDoc._id}_v3_p9_para1`,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 3,
      documentTitle: "Water Subsidy Amendment Circular B",
      category: "Sanitation & Water",
      status: "active",
      pageNumber: 9,
      paragraphNumber: 1,
      section: "Amended Income Criteria",
      text: "CIRCULAR B AMENDMENT: Notwithstanding previous guidelines, the revised annual household income threshold for water subsidy is ₹5,00,000.",
    };

    const combinedCandidates = [candidates1[0], conflictingChunk];

    const res3 = await generateGroundedAnswer("What is the income threshold for water subsidy?", combinedCandidates);
    console.log("Answer:", res3.answer);
    console.log("Conflict Detected:", res3.conflict_detected);
    console.log("Conflict Notes:", res3.conflict_notes);

    if (!res3.conflict_detected) {
      console.warn("Notice: Conflict detected was false, checking if answer text discusses both numbers...");
      if (!res3.answer.includes("3,00,000") || !res3.answer.includes("5,00,000")) {
        throw new Error("Scenario 3 failed: Neither conflict flag nor both conflicting amounts mentioned!");
      }
    }

    console.log("\n=== ALL STEP 6 GROUNDED GENERATION & GUARDRAIL TESTS PASSED! ===");
  } finally {
    console.log("\nCleaning up test records...");
    await deleteChunksByDocument(String(testDoc._id));
    await PolicyChunk.deleteMany({ documentId: testDoc._id });
    await DocumentVersion.deleteMany({ documentId: testDoc._id });
    await Document.findByIdAndDelete(testDoc._id);
  }

  process.exit(0);
}

runGroundedQueryTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
