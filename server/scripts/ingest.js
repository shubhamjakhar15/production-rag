const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();
const fs = require("fs");

const { addDocuments } = require("../services/vectorService");

const knowledgePath = path.join(
  __dirname,
  "../data/knowledge.txt"
);

const loadKnowledge = () => {
  const text = fs.readFileSync(
    knowledgePath,
    "utf-8"
  );

  return text
    .split(/\r?\n\s*\r?\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
};

const ingest = async () => {
  try {
    const chunks = loadKnowledge();

    console.log(
      `Found ${chunks.length} knowledge chunks.`
    );

    const documents = chunks.map((chunk) => ({
      text: chunk,
      source: "knowledge.txt",
    }));

    await addDocuments(documents);

    console.log(
      "Knowledge successfully stored in ChromaDB."
    );

  } catch (error) {
    console.error(
      "Ingestion failed:",
      error
    );
  }
};

ingest();

