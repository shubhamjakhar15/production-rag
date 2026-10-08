const { Pinecone } = require("@pinecone-database/pinecone");
const { generateEmbedding } = require("./embeddingService");
const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const ChatMeta = require("../models/ChatMeta");

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME || "voice-chatbot";
const indexHost = process.env.PINECONE_HOST || "https://voice-chatbot-89i442y.svc.aped-4627-b74a.pinecone.io";

const getIndex = () => pc.index(indexName, indexHost);

const addMessageToChat = async (chatId, text, sender, messageIndex) => {
  const index = getIndex().namespace("chat_history");
  const embedding = await generateEmbedding(text);
  
  await index.upsert({ records: [{
    id: `${chatId}_msg_${messageIndex}`,
    values: embedding,
    metadata: { chatId, sender, text, timestamp: new Date().toISOString(), messageIndex }
  }] });
};

const getChatMessages = async (chatId) => {
  try {
    const chatMeta = await ChatMeta.findOne({ chatId });
    if (!chatMeta) return [];
    
    const ids = [];
    for (let i = 0; i < chatMeta.messageCount; i++) {
      ids.push(`${chatId}_msg_${i}`);
    }
    
    if (ids.length === 0) return [];

    const index = getIndex().namespace("chat_history");
    const response = await index.fetch({ ids });
    
    const messages = [];
    for (const [id, record] of Object.entries(response.records)) {
      messages.push({
        id,
        text: record.metadata.text,
        sender: record.metadata.sender,
        index: record.metadata.messageIndex
      });
    }
    
    return messages.sort((a, b) => a.index - b.index);
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return [];
  }
};

const searchCurrentChat = async (chatId, query, topK = 5) => {
  try {
    const index = getIndex().namespace("chat_history");
    const queryEmbedding = await generateEmbedding(query);
    
    const results = await index.query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true,
      filter: { chatId: { $eq: chatId } }
    });

    return results.matches.map(match => match.metadata.text);
  } catch (error) {
    console.error("Error searching current chat:", error);
    return [];
  }
};

const summarizeAndStore = async (chatId, userId) => {
  try {
    const messages = await getChatMessages(chatId);
    if (messages.length === 0) return;

    const chatText = messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join("\n");
    
    const prompt = `Summarize the following chat conversation into a concise paragraph that captures the main topics discussed, user preferences, and any important conclusions. This summary will be used as memory for future conversations.\n\nConversation:\n${chatText}\n\nSummary:`;
    
    const genaiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
    });
    
    const summary = genaiResponse.text;
    const index = getIndex().namespace("master_memory");
    const embedding = await generateEmbedding(summary);
    
    await index.upsert({ records: [{
      id: `summary_${chatId}`,
      values: embedding,
      metadata: { source_chat: chatId, userId, text: summary, timestamp: new Date().toISOString() }
    }] });
    

    return summary;
  } catch (error) {
    console.error("Error summarizing chat:", error);
  }
};

const searchMasterMemory = async (query, userId, topK = 3) => {
  try {
    const index = getIndex().namespace("master_memory");
    const queryEmbedding = await generateEmbedding(query);
    
    const results = await index.query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true,
      filter: { userId: { $eq: userId } }
    });

    return results.matches.map(match => match.metadata.text);
  } catch (error) {
    console.error("Error searching master memory:", error);
    return [];
  }
};

module.exports = {
  addMessageToChat,
  getChatMessages,
  searchCurrentChat,
  summarizeAndStore,
  searchMasterMemory
};
