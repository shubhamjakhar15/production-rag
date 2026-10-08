const { createParagraphChunks } = require('../services/chunkingService');

const mockPages = [
  {
    pageNumber: 1,
    paragraphs: [
      { text: 'MUNICIPAL CORPORATION WATER SUBSIDY SCHEME 2026', section: 'Header', paragraphIndex: 1 },
      { text: 'SECTION 1: OBJECTIVE\nThe scheme aims to provide subsidized tap water connections to economically weaker sections residing within the municipal boundaries.', section: 'SECTION 1: OBJECTIVE', paragraphIndex: 2 },
      { text: 'SECTION 2: ELIGIBILITY CRITERIA\n2.1 Beneficiary families must have an aggregate annual income of less than ₹3,00,000 from all sources. Applicants must possess a valid residential water meter registered in their name or landlord consent. 2.2 Commercial establishments, industrial units, and defaulting accounts from previous fiscal years shall be strictly ineligible for any tariff reduction.', section: 'SECTION 2: ELIGIBILITY CRITERIA', paragraphIndex: 3 },
      { text: 'SECTION 3: MANDATORY DOCUMENTS\nApplicants must produce the following original proofs along with physical application form: (a) Domicile certificate issued by Tehsildar, (b) Aadhaar card of family head, (c) Water billing ledger extract for the last 6 months, (d) Income affidavit attested by Notary Public.', section: 'SECTION 3: MANDATORY DOCUMENTS', paragraphIndex: 4 }
    ]
  }
];

const chunks = createParagraphChunks(mockPages, {
  documentId: 'doc_water_2026',
  versionId: 'ver_001',
  versionNumber: 1,
  documentTitle: 'Water Subsidy Scheme 2026',
  category: 'Water & Sanitation',
  status: 'active'
});

console.log('Generated chunks count:', chunks.length);
chunks.forEach((c, idx) => {
  console.log(`\n[Chunk ${idx + 1}] ID: ${c.chunkId} | Section: ${c.section} | Page: ${c.pageNumber}`);
  console.log(`Text: ${c.text}`);
});
