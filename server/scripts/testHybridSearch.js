require("dotenv").config();
const connectDB = require("../config/db");
const PolicyChunk = require("../models/PolicyChunk");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const { upsertPolicyChunks, deleteChunksByDocument } = require("../services/vectorService");
const { searchBM25, executeHybridSearch, tokenize } = require("../services/hybridSearch");

async function runHybridTest() {
  console.log("=== Starting Step 5: Hybrid Search (Pinecone + BM25) & Fusion Test ===");
  await connectDB();

  // 1. Create a mock document & version for testing
  const testDoc = new Document({
    title: "Municipal Water Subsidy Scheme 2026",
    category: "Sanitation & Water",
    status: "ACTIVE",
    uploadedBy: "test_admin",
  });
  await testDoc.save();

  const testVersion = new DocumentVersion({
    documentId: testDoc._id,
    versionNumber: 1,
    fileName: "water_scheme_2026.pdf",
    filePath: "mock/water.pdf",
    status: "ACTIVE",
    uploadedBy: "test_admin",
  });
  await testVersion.save();

  // 2. Prepare 3 distinct chunks
  const mockChunks = [
    {
      chunkId: `${testDoc._id}_v1_p1_para1`,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 1,
      documentTitle: testDoc.title,
      category: testDoc.category,
      status: "active",
      pageNumber: 1,
      paragraphNumber: 1,
      section: "SECTION 2: ELIGIBILITY CRITERIA",
      text: "SECTION 2: ELIGIBILITY CRITERIA. Households with aggregate annual income below ₹3,00,000 are eligible for subsidized tap water under the municipal scheme. Applicants must have a registered water meter.",
    },
    {
      chunkId: `${testDoc._id}_v1_p1_para2`,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 1,
      documentTitle: testDoc.title,
      category: testDoc.category,
      status: "active",
      pageNumber: 1,
      paragraphNumber: 2,
      section: "SECTION 3: REQUIRED DOCUMENTS",
      text: "SECTION 3: REQUIRED DOCUMENTS. Mandatory proofs required: (a) Domicile certificate from Tehsildar, (b) Latest water utility bill, (c) Income certificate, (d) Aadhaar card.",
    },
    {
      chunkId: `${testDoc._id}_v1_p2_para3`,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 1,
      documentTitle: testDoc.title,
      category: testDoc.category,
      status: "active",
      pageNumber: 2,
      paragraphNumber: 3,
      section: "SECTION 4: EXCLUSIONS",
      text: "SECTION 4: EXCLUSIONS. Commercial enterprises, hotels, industrial factories, and properties with outstanding arrears are strictly ineligible under scheme reference code WSS-2026.",
    },
  ];

  console.log("\n[Setup] Inserting PolicyChunk records in MongoDB...");
  await PolicyChunk.deleteMany({ documentId: testDoc._id });
  await PolicyChunk.insertMany(
    mockChunks.map((c) => ({
      ...c,
      status: "ACTIVE",
    }))
  );

  console.log("[Setup] Indexing 3 chunks to Pinecone vector store...");
  await upsertPolicyChunks(mockChunks);

  try {
    // 3. Test Pure BM25 Keyword Search (Exact Codes & Amounts)
    console.log("\n[Test 1] Testing BM25 Keyword Search for exact reference code 'WSS-2026'...");
    const bm25CodeResults = await searchBM25("WSS-2026", 5);
    console.log(`BM25 found ${bm25CodeResults.length} matches:`);
    bm25CodeResults.forEach((r) => {
      console.log(`  - [Score: ${r.score.toFixed(3)}] ${r.section}: ${r.text.substring(0, 80)}...`);
    });

    if (bm25CodeResults.length === 0 || !bm25CodeResults[0].text.includes("WSS-2026")) {
      throw new Error("BM25 failed to retrieve exact reference code 'WSS-2026'!");
    }

    console.log("\n[Test 2] Testing BM25 Keyword Search for amount '₹3,00,000'...");
    const bm25AmountResults = await searchBM25("₹3,00,000 income", 5);
    console.log(`BM25 found ${bm25AmountResults.length} matches:`);
    bm25AmountResults.forEach((r) => {
      console.log(`  - [Score: ${r.score.toFixed(3)}] ${r.section}: ${r.text.substring(0, 80)}...`);
    });

    if (bm25AmountResults.length === 0 || !bm25AmountResults[0].text.includes("₹3,00,000")) {
      throw new Error("BM25 failed to retrieve amount '₹3,00,000'!");
    }

    // 4. Test Semantic Vector Search + Hybrid Fusion
    console.log("\n[Test 3] Testing Hybrid Search for natural language query: 'Who qualifies for discounted tap water tariffs?'...");
    const hybridResults = await executeHybridSearch("Who qualifies for discounted tap water tariffs?", {
      topK: 3,
      filter: { documentId: { $eq: String(testDoc._id) } },
    });

    console.log(`Hybrid Search returned ${hybridResults.length} fused candidates:`);
    hybridResults.forEach((r, idx) => {
      console.log(
        `\nCandidate ${idx + 1}:` +
        `\n  RRF Score: ${r.rrfScore.toFixed(5)} (Vector Rank: ${r.semanticRank || 'N/A'}, BM25 Rank: ${r.bm25Rank || 'N/A'})` +
        `\n  Section: ${r.section} | Page: ${r.pageNumber} | Paragraph: ${r.paragraphNumber}` +
        `\n  Text: ${r.text.substring(0, 100)}...`
      );
    });

    if (hybridResults.length === 0 || !hybridResults[0].text.includes("ELIGIBILITY CRITERIA")) {
      throw new Error("Hybrid search failed to rank Eligibility Criteria as Top 1 for qualification query!");
    }

    // 5. Test Active Policy Filter (Outdated Version Exclusion)
    console.log("\n[Test 4] Testing Active Policy Filter (Marking Eligibility chunk INACTIVE)...");
    await PolicyChunk.updateOne({ chunkId: mockChunks[0].chunkId }, { status: "INACTIVE" });

    const inactiveBm25 = await searchBM25("income ₹3,00,000", 5);
    const hasInactiveChunk = inactiveBm25.some((r) => r.chunkId === mockChunks[0].chunkId);
    console.log("Was deactivated chunk excluded from BM25?", !hasInactiveChunk);

    if (hasInactiveChunk) {
      throw new Error("Deactivated policy chunk was incorrectly returned by BM25!");
    }

    console.log("\n=== ALL STEP 5 HYBRID SEARCH TESTS PASSED! ===");
  } finally {
    console.log("\nCleaning up test records...");
    await deleteChunksByDocument(String(testDoc._id));
    await PolicyChunk.deleteMany({ documentId: testDoc._id });
    await DocumentVersion.deleteMany({ documentId: testDoc._id });
    await Document.findByIdAndDelete(testDoc._id);
  }

  process.exit(0);
}

runHybridTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
