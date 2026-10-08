require("dotenv").config();
const fs = require("fs");
const path = require("path");
const connectDB = require("../config/db");
const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const ProcessingJob = require("../models/ProcessingJob");
const { processDocumentVersion } = require("../services/ingestionService");
const { searchPolicyVectors, deleteChunksByDocument } = require("../services/vectorService");

async function runTest() {
  console.log("--- Starting Step 3 Verification Test ---");
  await connectDB();

  // 1. Create test Document
  const testDoc = new Document({
    title: "Test Municipal Water Scheme 2026",
    description: "Policy for testing paragraph ingestion and Pinecone indexing",
    category: "Sanitation",
    status: "PROCESSING",
    uploadedBy: "test_admin_user",
  });
  await testDoc.save();

  // 2. Create test DocumentVersion
  const testVersion = new DocumentVersion({
    documentId: testDoc._id,
    versionNumber: 1,
    fileName: "04-valid.pdf",
    filePath: "mock/path/04-valid.pdf",
    fileSize: 80953,
    status: "PROCESSING",
    uploadedBy: "test_admin_user",
  });
  await testVersion.save();

  // 3. Create test ProcessingJob
  const testJob = new ProcessingJob({
    documentId: testDoc._id,
    versionId: testVersion._id,
    status: "UPLOADED",
    stage: "VALIDATING",
  });
  await testJob.save();

  testVersion.processingJobId = testJob._id;
  await testVersion.save();

  console.log(`Created test records: Doc=${testDoc._id}, Version=${testVersion._id}, Job=${testJob._id}`);

  // 4. Load sample PDF buffer
  const samplePdfPath = path.join(__dirname, "../node_modules/pdf-parse/test/data/04-valid.pdf");
  const buffer = fs.readFileSync(samplePdfPath);

  // 5. Run Ingestion Pipeline
  console.log("Running processDocumentVersion()...");
  await processDocumentVersion(testJob._id, testVersion._id, buffer);

  // 6. Verify MongoDB updates
  const updatedJob = await ProcessingJob.findById(testJob._id);
  const updatedVersion = await DocumentVersion.findById(testVersion._id);
  const updatedDoc = await Document.findById(testDoc._id);

  console.log(`\nResults:`);
  console.log(`Job Status: ${updatedJob.status} (Stage: ${updatedJob.stage}, Progress: ${updatedJob.progressPct}%)`);
  console.log(`Version Status: ${updatedVersion.status} (Chunks: ${updatedVersion.chunkCount})`);
  console.log(`Doc Status: ${updatedDoc.status}`);

  if (updatedJob.status !== "READY" || updatedVersion.chunkCount === 0) {
    throw new Error("Ingestion pipeline failed to complete with READY status!");
  }

  // 7. Verify Pinecone Vector Search
  console.log("\nTesting Pinecone Vector Search for 'exercise and nitric oxide'...");
  const searchResults = await searchPolicyVectors("exercise and nitric oxide", {
    topK: 3,
    filter: { documentId: { $eq: String(testDoc._id) } },
  });

  console.log(`Search returned ${searchResults.length} matches:`);
  searchResults.forEach((res, i) => {
    console.log(`\nMatch ${i + 1} (Score: ${res.score}):`);
    console.log(`  Page: ${res.pageNumber} | Paragraph: ${res.paragraphNumber} | Section: ${res.section}`);
    console.log(`  Text: ${res.text.substring(0, 120)}...`);
  });

  // 8. Cleanup test data from Mongo and Pinecone
  console.log("\nCleaning up test records...");
  await deleteChunksByDocument(String(testDoc._id));
  await Document.findByIdAndDelete(testDoc._id);
  await DocumentVersion.findByIdAndDelete(testVersion._id);
  await ProcessingJob.findByIdAndDelete(testJob._id);

  console.log("--- Step 3 Verification Test PASSED Successfully! ---");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
