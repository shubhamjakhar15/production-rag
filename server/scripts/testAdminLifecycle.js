require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const connectDB = require("../config/db");

const Document = require("../models/Document");
const DocumentVersion = require("../models/DocumentVersion");
const ProcessingJob = require("../models/ProcessingJob");
const AuditLog = require("../models/AuditLog");

const adminRoutes = require("../routes/adminRoutes");

// Build test express app
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);

const TEST_PORT = 5005;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api/admin`;

async function runLifecycleTest() {
  console.log("=== Starting Step 4: Admin Document Lifecycle & Versioning Test ===");
  await connectDB();

  const server = app.listen(TEST_PORT);
  console.log(`Ephemeral test server running on port ${TEST_PORT}`);

  try {
    // Clean any prior runs
    const existing = await Document.find({ title: "Lifecycle Municipal Scheme 2026" });
    for (const d of existing) {
      await DocumentVersion.deleteMany({ documentId: d._id });
      await ProcessingJob.deleteMany({ documentId: d._id });
      await Document.findByIdAndDelete(d._id);
    }

    const testPdfPath = path.join(__dirname, "../node_modules/pdf-parse/test/data/04-valid.pdf");
    const testPdfBytes = fs.readFileSync(testPdfPath);

    // 1. Test Dashboard Stats
    console.log("\n[Test 1] Testing GET /api/admin/dashboard...");
    const dashRes = await fetch(`${BASE_URL}/dashboard`, {
      headers: { "x-dev-test": "antigravity" },
    });
    const dashData = await dashRes.json();
    console.log("Dashboard Status:", dashRes.status);
    console.log("Dashboard Data:", dashData.data);
    if (dashRes.status !== 200 || !dashData.success) throw new Error("Dashboard endpoint failed");

    // 2. Test Upload Document (v1)
    console.log("\n[Test 2] Testing POST /api/admin/documents (Upload v1)...");
    const formData = new FormData();
    formData.append("title", "Lifecycle Municipal Scheme 2026");
    formData.append("category", "Sanitation & Water");
    formData.append("description", "A test policy for lifecycle verification");
    formData.append(
      "file",
      new Blob([testPdfBytes], { type: "application/pdf" }),
      "04-valid.pdf"
    );

    const uploadRes = await fetch(`${BASE_URL}/documents`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity" },
      body: formData,
    });
    const uploadData = await uploadRes.json();
    console.log("Upload Status:", uploadRes.status);
    console.log("Upload Body:", uploadData);

    if (uploadRes.status !== 201 || !uploadData.data?.documentId) {
      throw new Error("Document upload failed: " + JSON.stringify(uploadData));
    }

    const { documentId, versionId, jobId } = uploadData.data;

    // 3. Test Poll Job Status
    console.log(`\n[Test 3] Testing GET /api/admin/jobs/${jobId}...`);
    const jobRes = await fetch(`${BASE_URL}/jobs/${jobId}`, {
      headers: { "x-dev-test": "antigravity" },
    });
    const jobData = await jobRes.json();
    console.log("Job Poll Status:", jobRes.status);
    console.log("Job Data:", jobData.data);
    if (jobRes.status !== 200) throw new Error("Job polling endpoint failed");

    // 4. Test List Documents
    console.log("\n[Test 4] Testing GET /api/admin/documents...");
    const listRes = await fetch(`${BASE_URL}/documents?category=Sanitation%20%26%20Water`, {
      headers: { "x-dev-test": "antigravity" },
    });
    const listData = await listRes.json();
    console.log("List Status:", listRes.status);
    console.log(`Found ${listData.data.length} documents in category.`);
    if (listRes.status !== 200 || listData.data.length === 0) {
      throw new Error("List documents endpoint failed");
    }

    // 5. Test Get Document Detail
    console.log(`\n[Test 5] Testing GET /api/admin/documents/${documentId}...`);
    const detailRes = await fetch(`${BASE_URL}/documents/${documentId}`, {
      headers: { "x-dev-test": "antigravity" },
    });
    const detailData = await detailRes.json();
    console.log("Detail Status:", detailRes.status);
    console.log("Versions count:", detailData.data.versions.length);
    if (detailRes.status !== 200 || detailData.data.versions.length !== 1) {
      throw new Error("Document detail endpoint failed");
    }

    // 6. Test Upload New Version (v2)
    console.log(`\n[Test 6] Testing POST /api/admin/documents/${documentId}/versions (Upload v2)...`);
    const v2Form = new FormData();
    v2Form.append(
      "file",
      new Blob([testPdfBytes], { type: "application/pdf" }),
      "04-valid-v2.pdf"
    );

    const v2Res = await fetch(`${BASE_URL}/documents/${documentId}/versions`, {
      method: "POST",
      headers: { "x-dev-test": "antigravity" },
      body: v2Form,
    });
    const v2Data = await v2Res.json();
    console.log("v2 Upload Status:", v2Res.status);
    console.log("v2 Data:", v2Data.data);
    if (v2Res.status !== 201 || v2Data.data.versionNumber !== 2) {
      throw new Error("Version 2 upload failed: " + JSON.stringify(v2Data));
    }

    const v2Id = v2Data.data.versionId;

    // Simulate v2 having completed indexing for testing activation
    await DocumentVersion.findByIdAndUpdate(v2Id, { chunkCount: 50, status: "INACTIVE" });

    // 7. Test Activate Version (Version Switching)
    console.log(`\n[Test 7] Testing PATCH /api/admin/documents/${documentId}/versions/${v2Id}/activate...`);
    const activateRes = await fetch(
      `${BASE_URL}/documents/${documentId}/versions/${v2Id}/activate`,
      {
        method: "PATCH",
        headers: { "x-dev-test": "antigravity" },
      }
    );
    const activateData = await activateRes.json();
    console.log("Activate Status:", activateRes.status);
    console.log("Activate Message:", activateData.message);
    if (activateRes.status !== 200) throw new Error("Version activation failed");

    // Verify in MongoDB that v1 is now INACTIVE and v2 is ACTIVE
    const v1Check = await DocumentVersion.findById(versionId);
    const v2Check = await DocumentVersion.findById(v2Id);
    const docCheck = await Document.findById(documentId);

    console.log(
      `Verification: v1 Status=${v1Check.status}, v2 Status=${v2Check.status}, Doc Active Version=${docCheck.currentVersionNumber}`
    );
    if (v1Check.status !== "INACTIVE" || v2Check.status !== "ACTIVE" || docCheck.currentVersionNumber !== 2) {
      throw new Error("Version switching failed to update statuses properly!");
    }

    // 8. Test Change Status to INACTIVE
    console.log(`\n[Test 8] Testing PATCH /api/admin/documents/${documentId}/status (Set INACTIVE)...`);
    const statusRes = await fetch(`${BASE_URL}/documents/${documentId}/status`, {
      method: "PATCH",
      headers: {
        "x-dev-test": "antigravity",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "INACTIVE" }),
    });
    const statusData = await statusRes.json();
    console.log("Status update result:", statusData.data.status);
    if (statusData.data.status !== "INACTIVE") throw new Error("Status update failed");

    // 9. Test Cascading Delete (Purges Mongo + Pinecone + File)
    console.log(`\n[Test 9] Testing DELETE /api/admin/documents/${documentId}...`);
    const deleteRes = await fetch(`${BASE_URL}/documents/${documentId}`, {
      method: "DELETE",
      headers: { "x-dev-test": "antigravity" },
    });
    const deleteData = await deleteRes.json();
    console.log("Delete Status:", deleteRes.status);
    console.log("Delete Message:", deleteData.message);
    if (deleteRes.status !== 200) throw new Error("Delete document failed");

    // 10. Verify Document no longer exists
    const finalCheck = await fetch(`${BASE_URL}/documents/${documentId}`, {
      headers: { "x-dev-test": "antigravity" },
    });
    console.log("\n[Test 10] Confirming 404 on deleted doc:", finalCheck.status);
    if (finalCheck.status !== 404) throw new Error("Deleted document still accessible!");

    // Verify Audit Logs were created
    const auditLogs = await AuditLog.find({ resourceId: String(documentId) });
    console.log(`Verified ${auditLogs.length} audit trail logs created for this document.`);

    console.log("\n=== ALL STEP 4 ADMIN LIFECYCLE TESTS PASSED! ===");
  } finally {
    server.close();
  }
  process.exit(0);
}

runLifecycleTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
