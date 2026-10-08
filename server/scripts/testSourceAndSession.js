require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const connectDB = require("../config/db");

const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const PolicyChunk = require("../models/PolicyChunk");

const chatRoutes = require("../routes/chatRoutes");
const sourceRoutes = require("../routes/sourceRoutes");
const { upsertPolicyChunks, deleteChunksByDocument } = require("../services/vectorService");

const app = express();
app.use(express.json());
app.use("/api/chat", chatRoutes);
app.use("/api/query", chatRoutes);
app.use("/api/sources", sourceRoutes);

const TEST_PORT = 5006;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function runSourceAndSessionTest() {
  console.log("=== Starting Step 7: PDF Evidence Viewer & Session Context Test ===");
  await connectDB();

  const server = app.listen(TEST_PORT);
  console.log(`Ephemeral test server running on port ${TEST_PORT}`);

  // Setup test PDF on disk
  const testDir = path.join(__dirname, "../uploads/documents");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const samplePdfPath = path.join(__dirname, "../node_modules/pdf-parse/test/data/04-valid.pdf");
  const testFilePath = path.join(testDir, `test_water_subsidy_${Date.now()}.pdf`);
  fs.copyFileSync(samplePdfPath, testFilePath);

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
    versionNumber: 1,
    fileName: "water_subsidy_scheme_2026.pdf",
    filePath: testFilePath,
    fileSize: fs.statSync(testFilePath).size,
    status: "ACTIVE",
    uploadedBy: "test_admin",
  });
  await testVersion.save();

  testDoc.currentVersionId = testVersion._id;
  testDoc.fileUrl = `/api/sources/${testDoc._id}/file`;
  await testDoc.save();

  const chunk1Id = `${testDoc._id}_v1_p1_para1`;
  const chunk2Id = `${testDoc._id}_v1_p1_para2`;

  const mockChunks = [
    {
      chunkId: chunk1Id,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 1,
      documentTitle: testDoc.title,
      category: testDoc.category,
      status: "active",
      pageNumber: 1,
      paragraphNumber: 1,
      section: "SECTION 2: ELIGIBILITY CRITERIA",
      text: "SECTION 2: ELIGIBILITY CRITERIA. Households with aggregate annual income below ₹3,00,000 are eligible for subsidized tap water under the municipal scheme. Applicants must have a registered residential water meter.",
    },
    {
      chunkId: chunk2Id,
      documentId: String(testDoc._id),
      versionId: String(testVersion._id),
      versionNumber: 1,
      documentTitle: testDoc.title,
      category: testDoc.category,
      status: "active",
      pageNumber: 1,
      paragraphNumber: 2,
      section: "SECTION 3: MANDATORY DOCUMENTS",
      text: "SECTION 3: MANDATORY DOCUMENTS. Applicants must provide proof of residence, an income certificate issued by the Tehsildar, and the latest water utility bill.",
    },
  ];

  await PolicyChunk.deleteMany({ documentId: testDoc._id });
  await PolicyChunk.insertMany(
    mockChunks.map((c) => ({
      ...c,
      status: "ACTIVE",
    }))
  );
  await upsertPolicyChunks(mockChunks);

  try {
    // -----------------------------------------------------------------
    // 1. Test PDF File Streaming (GET /api/sources/:id/file)
    // -----------------------------------------------------------------
    console.log(`\n[Test 1] Testing PDF Streaming: GET /api/sources/${testDoc._id}/file...`);
    const fileRes = await fetch(`${BASE_URL}/sources/${testDoc._id}/file`);
    console.log("PDF Stream Status:", fileRes.status);
    console.log("Content-Type:", fileRes.headers.get("content-type"));
    console.log("Content-Disposition:", fileRes.headers.get("content-disposition"));
    console.log("Accept-Ranges:", fileRes.headers.get("accept-ranges"));

    if (
      fileRes.status !== 200 ||
      fileRes.headers.get("content-type") !== "application/pdf" ||
      !fileRes.headers.get("content-disposition").includes("inline")
    ) {
      throw new Error("PDF file streaming failed!");
    }

    // -----------------------------------------------------------------
    // 2. Test Page Details with Highlighted Citation
    // -----------------------------------------------------------------
    console.log(`\n[Test 2] Testing Page Citation Modal: GET /api/sources/${testDoc._id}/page/1?highlight=${chunk2Id}...`);
    const pageRes = await fetch(`${BASE_URL}/sources/${testDoc._id}/page/1?highlight=${chunk2Id}`);
    const pageData = await pageRes.json();

    console.log("Page API Status:", pageRes.status);
    console.log("Document Title:", pageData.data.document_title);
    console.log("Paragraphs on Page 1:", pageData.data.paragraphs.length);

    const highlightedPara = pageData.data.paragraphs.find((p) => p.is_highlighted);
    console.log("Highlighted Paragraph Chunk:", highlightedPara?.chunk_id);

    if (pageRes.status !== 200 || !highlightedPara || highlightedPara.chunk_id !== chunk2Id) {
      throw new Error("Page citation inspection failed to highlight target chunk!");
    }

    // -----------------------------------------------------------------
    // 3. Test Direct Chunk Lookup
    // -----------------------------------------------------------------
    console.log(`\n[Test 3] Testing Chunk Lookup: GET /api/sources/chunk/${chunk1Id}...`);
    const chunkRes = await fetch(`${BASE_URL}/sources/chunk/${chunk1Id}`);
    const chunkData = await chunkRes.json();

    console.log("Chunk Status:", chunkRes.status);
    console.log("Chunk Section:", chunkData.data.section);
    console.log("Chunk Viewer Anchor:", chunkData.data.file_url);

    if (chunkRes.status !== 200 || !chunkData.data.file_url.includes("#page=1")) {
      throw new Error("Direct chunk lookup failed!");
    }

    // -----------------------------------------------------------------
    // 4. Test Conversational Follow-up Context
    // -----------------------------------------------------------------
    const testSessionId = `test_sess_${Date.now()}`;

    console.log(`\n[Test 4a] Turn 1: 'Who is eligible for the water subsidy?' (Session: ${testSessionId})...`);
    const turn1Res = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity", "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Who is eligible for the water subsidy?",
        session_id: testSessionId,
      }),
    });
    const turn1Data = await turn1Res.json();
    console.log("Turn 1 Answer:", turn1Data.answer);
    console.log("Turn 1 Sources:", turn1Data.sources.map((s) => s.section));

    if (!turn1Data.answer.includes("3,00,000")) {
      throw new Error("Turn 1 query failed!");
    }

    console.log(`\n[Test 4b] Turn 2 Follow-Up: 'What documents do they need?' (Anaphoric follow-up)...`);
    const turn2Res = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity", "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What documents do they need?",
        session_id: testSessionId,
      }),
    });
    const turn2Data = await turn2Res.json();
    console.log("Turn 2 Answer:", turn2Data.answer);
    console.log("Turn 2 Sources:", turn2Data.sources.map((s) => s.section));

    const mentionsDocs =
      turn2Data.answer.toLowerCase().includes("residence") ||
      turn2Data.answer.toLowerCase().includes("certificate") ||
      turn2Data.answer.toLowerCase().includes("water bill");

    if (!mentionsDocs) {
      throw new Error("Turn 2 follow-up failed to understand context 'they' = water subsidy applicants!");
    }

    // -----------------------------------------------------------------
    // 5. Test Clear Session
    // -----------------------------------------------------------------
    console.log(`\n[Test 5] Testing Clear Session: DELETE /api/chat/session/${testSessionId}...`);
    const clearRes = await fetch(`${BASE_URL}/chat/session/${testSessionId}`, {
      method: "DELETE",
    });
    const clearData = await clearRes.json();
    console.log("Clear Session Status:", clearRes.status, clearData.message);
    if (clearRes.status !== 200) throw new Error("Session clear failed!");

    console.log("\n=== ALL STEP 7 PDF EVIDENCE & SESSION TESTS PASSED! ===");
  } finally {
    server.close();
    console.log("Cleaning up test records and files...");
    await deleteChunksByDocument(String(testDoc._id));
    await PolicyChunk.deleteMany({ documentId: testDoc._id });
    await DocumentVersion.deleteMany({ documentId: testDoc._id });
    await Document.findByIdAndDelete(testDoc._id);
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  }

  process.exit(0);
}

runSourceAndSessionTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
