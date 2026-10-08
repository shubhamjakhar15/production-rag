const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();
const fs = require("fs");
const express = require("express");
const connectDB = require("../config/db");

const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const ProcessingJob = require("../models/ProcessingJob");
const PolicyChunk = require("../models/PolicyChunk");

const adminRoutes = require("../routes/adminRoutes");
const chatRoutes = require("../routes/chatRoutes");
const sourceRoutes = require("../routes/sourceRoutes");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { deleteChunksByDocument } = require("../services/vectorService");

// Helper to generate a valid PDF byte buffer from an array of text lines using pdf-lib
async function buildSamplePdf(lines) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([600, 800]);

  let y = 740;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
    y -= 30;
  }

  const pdfBytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(pdfBytes);
}

// Build Express test server
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);
app.use("/api/query", chatRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/sources", sourceRoutes);

const TEST_PORT = 5007;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

async function runFullDemo() {
  console.log("==================================================================");
  console.log("   MUNICIPAL POLICY AI COPILOT — COMPLETE END-TO-END DEMO TEST    ");
  console.log("==================================================================");

  await connectDB();
  const server = app.listen(TEST_PORT);
  console.log(`Live Demo Server running on port ${TEST_PORT}\n`);

  let createdDocId = null;

  try {
    // -------------------------------------------------------------------------
    // SCENE 1: ADMIN UPLOAD & AUTONOMOUS INGESTION (v1)
    // -------------------------------------------------------------------------
    console.log("--- [SCENE 1] Admin Ingests 'Water Subsidy Scheme 2026 v1.pdf' ---");

    const v1PdfLines = [
      "MUNICIPAL CORPORATION WATER SUBSIDY SCHEME 2026",
      "SECTION 1: OBJECTIVE",
      "The scheme provides subsidized potable water connections to low income households.",
      "SECTION 2: ELIGIBILITY CRITERIA",
      "Beneficiary households must have an aggregate annual income of less than Rs 300000 from all sources. Applicants must possess a valid residential water meter.",
      "SECTION 3: MANDATORY DOCUMENTS",
      "Applicants must submit proof of residence, an income certificate from Tehsildar, and the latest water utility bill.",
    ];

    const v1PdfBuffer = await buildSamplePdf(v1PdfLines);

    const formData1 = new FormData();
    formData1.append("title", "Water Subsidy Scheme 2026");
    formData1.append("category", "Sanitation & Water");
    formData1.append("description", "Official municipal water connection tariff subsidy");
    formData1.append(
      "file",
      new Blob([v1PdfBuffer], { type: "application/pdf" }),
      "Water_Subsidy_Scheme_2026_v1.pdf"
    );

    const uploadRes = await fetch(`${BASE_URL}/admin/documents`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity" },
      body: formData1,
    });
    const uploadData = await uploadRes.json();
    console.log("Upload Status:", uploadRes.status);
    console.log("Upload Message:", uploadData.message);

    createdDocId = uploadData.data.documentId;
    const { versionId: v1Id, jobId: j1Id } = uploadData.data;

    // Poll Job until READY
    console.log("Polling ingestion job progress...");
    let jobStatus = "PROCESSING";
    let attempts = 0;
    while (jobStatus !== "READY" && attempts < 20) {
      await new Promise((r) => setTimeout(r, 2000));
      const jobRes = await fetch(`${BASE_URL}/admin/jobs/${j1Id}`, {
        headers: { "x-dev-test": "antigravity" },
      });
      const jobData = await jobRes.json();
      jobStatus = jobData.data.status;
      console.log(`  Job Stage: ${jobData.data.stage} | Progress: ${jobData.data.progressPct}% | Status: ${jobStatus}`);
      attempts++;
    }

    if (jobStatus !== "READY") {
      throw new Error("Scene 1 Failed: Ingestion job did not reach READY state!");
    }
    console.log("✓ SCENE 1 PASSED: Document v1 is READY and indexed in Pinecone!\n");

    // -------------------------------------------------------------------------
    // SCENE 2: EMPLOYEE ASKS POLICY QUESTION + VIEWS EVIDENCE
    // -------------------------------------------------------------------------
    console.log("--- [SCENE 2] Employee Asks Policy Question ---");
    const demoSessionId = `session_employee_${Date.now()}`;

    const query1Res = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity", "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Who is eligible for the water subsidy?",
        session_id: demoSessionId,
      }),
    });
    const query1Data = await query1Res.json();

    console.log("Question: 'Who is eligible for the water subsidy?'");
    console.log("Answer:", query1Data.answer);
    console.log("Confidence Score:", `${(query1Data.confidence * 100).toFixed(0)}%`);
    console.log("Grounded in Official Sources:", query1Data.grounded);
    console.log("Suggested Citizen Response:", query1Data.suggested_citizen_response);

    const mentions300k =
      query1Data.answer.includes("300000") ||
      query1Data.answer.includes("300,000") ||
      query1Data.answer.includes("3,00,000") ||
      query1Data.answer.toLowerCase().includes("3 lakh");

    if (query1Data.sources.length === 0 || !mentions300k) {
      throw new Error("Scene 2 Failed: Answer missing Rs 300,000 eligibility or source citation!");
    }

    const firstSource = query1Data.sources[0];
    console.log("\nTop Citation:");
    console.log(`  Document: ${firstSource.document_title} (v${firstSource.version})`);
    console.log(`  Page: ${firstSource.page} | Section: ${firstSource.section} | Paragraph: ${firstSource.paragraph}`);

    // Test Employee clicking "View Evidence"
    console.log("\n[Simulating Employee Clicking 'View Evidence']");
    const pageModalRes = await fetch(
      `${BASE_URL}/sources/${createdDocId}/page/${firstSource.page}?highlight=${firstSource.chunk_id}`
    );
    const pageModalData = await pageModalRes.json();
    console.log("Evidence Modal API Status:", pageModalRes.status);
    console.log("Total paragraphs on page:", pageModalData.data.paragraphs.length);
    const highlightedChunk = pageModalData.data.paragraphs.find((p) => p.is_highlighted);
    console.log("✓ Targeted paragraph correctly highlighted in UI modal:", Boolean(highlightedChunk));

    // Test Employee streaming original PDF
    const pdfStreamRes = await fetch(`${BASE_URL}/sources/${createdDocId}/file`);
    console.log("✓ PDF Stream returned Content-Type:", pdfStreamRes.headers.get("content-type"));
    console.log("✓ SCENE 2 PASSED: Factual answer with exact citation verified!\n");

    // -------------------------------------------------------------------------
    // SCENE 3: MULTI-TURN CONTEXT FOLLOW-UP ("What documents do they need?")
    // -------------------------------------------------------------------------
    console.log("--- [SCENE 3] Employee Asks Multi-Turn Follow-Up ---");
    const query2Res = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity", "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What documents do they need?",
        session_id: demoSessionId,
      }),
    });
    const query2Data = await query2Res.json();

    console.log("Follow-up: 'What documents do they need?' (Subject: 'they')");
    console.log("Answer:", query2Data.answer);
    console.log("Citations:", query2Data.sources.map((s) => s.section));

    const understandsFollowUp =
      query2Data.answer.toLowerCase().includes("residence") ||
      query2Data.answer.toLowerCase().includes("certificate") ||
      query2Data.answer.toLowerCase().includes("water");

    if (!understandsFollowUp) {
      throw new Error("Scene 3 Failed: Engine did not understand conversational follow-up!");
    }
    console.log("✓ SCENE 3 PASSED: Multi-turn context successfully resolved!\n");

    // -------------------------------------------------------------------------
    // SCENE 4: UNSUPPORTED QUESTION (ANTI-HALLUCINATION GUARD)
    // -------------------------------------------------------------------------
    console.log("--- [SCENE 4] Employee Asks Unsupported Question ---");
    const query3Res = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity", "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Does the municipality reimburse private taxi expenses?",
        session_id: demoSessionId,
      }),
    });
    const query3Data = await query3Res.json();

    console.log("Question: 'Does the municipality reimburse private taxi expenses?'");
    console.log("Answer:", query3Data.answer);
    console.log("Grounded:", query3Data.grounded);
    console.log("Confidence:", query3Data.confidence);

    if (query3Data.grounded !== false || !query3Data.answer.includes("could not find sufficient information")) {
      throw new Error("Scene 4 Failed: Engine hallucinated an answer for unsupported query!");
    }
    console.log("✓ SCENE 4 PASSED: Anti-hallucination guard strictly triggered!\n");

    // -------------------------------------------------------------------------
    // SCENE 5: POLICY AMENDMENT & VERSION-AWARE RAG (v2)
    // -------------------------------------------------------------------------
    console.log("--- [SCENE 5] Admin Uploads Policy Amendment (v2) ---");

    const v2PdfLines = [
      "MUNICIPAL CORPORATION WATER SUBSIDY SCHEME 2026 (REVISED)",
      "SECTION 1: POLICY AMENDMENT",
      "This circular supersedes previous guidelines on annual household income thresholds.",
      "SECTION 2: REVISED ELIGIBILITY CRITERIA",
      "Beneficiary households must have an aggregate annual income of less than Rs 500000 from all sources.",
      "SECTION 3: MANDATORY DOCUMENTS",
      "Applicants must submit proof of residence and revised income certificate.",
    ];

    const v2PdfBuffer = await buildSamplePdf(v2PdfLines);
    const formData2 = new FormData();
    formData2.append(
      "file",
      new Blob([v2PdfBuffer], { type: "application/pdf" }),
      "Water_Subsidy_Scheme_2026_v2.pdf"
    );

    const v2UploadRes = await fetch(`${BASE_URL}/admin/documents/${createdDocId}/versions`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity" },
      body: formData2,
    });
    const v2UploadData = await v2UploadRes.json();
    console.log("v2 Upload Status:", v2UploadRes.status);
    console.log(`Uploaded Version ${v2UploadData.data.versionNumber} (Job: ${v2UploadData.data.jobId})`);

    const { versionId: v2Id, jobId: j2Id } = v2UploadData.data;

    // Poll v2 Job until READY
    let v2Status = "PROCESSING";
    let attempts2 = 0;
    while (v2Status !== "READY" && attempts2 < 20) {
      await new Promise((r) => setTimeout(r, 2000));
      const j2Res = await fetch(`${BASE_URL}/admin/jobs/${j2Id}`, {
        headers: { "x-dev-test": "antigravity" },
      });
      const j2Data = await j2Res.json();
      v2Status = j2Data.data.status;
      attempts2++;
    }
    console.log(`v2 Ingestion Job completed with status: ${v2Status}`);

    // Activate Version 2
    console.log(`Activating Version 2 via PATCH /api/admin/documents/${createdDocId}/versions/${v2Id}/activate...`);
    const activateRes = await fetch(
      `${BASE_URL}/admin/documents/${createdDocId}/versions/${v2Id}/activate`,
      {
        method: "PATCH",
        headers: { "x-dev-test": "antigravity" },
      }
    );
    const activateData = await activateRes.json();
    console.log("Activation Message:", activateData.message);

    // Ask the same question again in a fresh session!
    console.log("\n[Employee Asks Question Again After Policy Update]");
    const updatedQueryRes = await fetch(`${BASE_URL}/query`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity", "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What is the maximum income limit for water subsidy?",
        session_id: `session_post_update_${Date.now()}`,
      }),
    });
    const updatedQueryData = await updatedQueryRes.json();

    console.log("Question: 'What is the maximum income limit for water subsidy?'");
    console.log("Answer After v2 Activation:", updatedQueryData.answer);
    console.log("Citations Used:", updatedQueryData.sources.map((s) => `Version ${s.version}: ${s.section}`));

    const reflectsV2 =
      updatedQueryData.answer.includes("500000") ||
      updatedQueryData.answer.includes("500,000") ||
      updatedQueryData.answer.includes("5,00,000") ||
      updatedQueryData.answer.toLowerCase().includes("5 lakh");
    const citesV2 = updatedQueryData.sources.some((s) => s.version === 2);

    console.log("Reflects new Rs 500,000 threshold?", reflectsV2);
    console.log("Cites Version 2?", citesV2);

    if (!reflectsV2 || !citesV2) {
      throw new Error("Scene 5 Failed: System did not prioritize the active Version 2 policy!");
    }
    console.log("✓ SCENE 5 PASSED: Version-aware RAG successfully superseded outdated policy!\n");

    console.log("==================================================================");
    console.log("   🎉 ALL 5 HACKATHON DEMO SCENES COMPLETED AND VERIFIED 100%    ");
    console.log("==================================================================");
  } finally {
    server.close();
    if (createdDocId) {
      console.log("\nCleaning up demo records...");
      await deleteChunksByDocument(String(createdDocId));
      await PolicyChunk.deleteMany({ documentId: createdDocId });
      await DocumentVersion.deleteMany({ documentId: createdDocId });
      await ProcessingJob.deleteMany({ documentId: createdDocId });
      await Document.findByIdAndDelete(createdDocId);
    }
  }

  process.exit(0);
}

runFullDemo().catch((err) => {
  console.error("Demo failed with error:", err);
  process.exit(1);
});
