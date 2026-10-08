export const municipalDocuments = [];

export const departmentsList = [
  {
    id: "housing",
    name: "Housing",
    title: "Housing Schemes",
    docCount: 0,
    description: "Affordable housing schemes, slum rehabilitation, housing subsidies, and tenant allotment circulars.",
    icon: "Home",
  },
  {
    id: "water",
    name: "Water & Sanitation",
    title: "Water & Sanitation",
    docCount: 0,
    description: "Domestic potable supply, sewerage connections, drainage bylaws, and municipal water tax concessions.",
    icon: "Droplets",
  },
  {
    id: "roads",
    name: "Roads & Infrastructure",
    title: "Roads & Infrastructure",
    docCount: 0,
    description: "Public works regulations, right-of-way permissions, road cutting permits, and bridge maintenance norms.",
    icon: "Construction",
  },
  {
    id: "waste",
    name: "Waste Management",
    title: "Waste Management",
    docCount: 0,
    description: "Solid waste segregation, commercial sanitation fines, recycling centers, and compost operations.",
    icon: "Trash2",
  },
  {
    id: "tax",
    name: "Property Tax",
    title: "Property Tax",
    docCount: 0,
    description: "Unit area assessment values, rebate schedules, senior citizen waivers, and municipal billing circulars.",
    icon: "Receipt",
  },
  {
    id: "licensing",
    name: "Licensing & Permits",
    title: "Licensing & Permits",
    docCount: 0,
    description: "Street vendor registrations, trade licenses, hoarding approvals, and commercial health permits.",
    icon: "FileCheck2",
  },
  {
    id: "environment",
    name: "Environment",
    title: "Environment & Parks",
    docCount: 0,
    description: "Tree preservation orders, green buffer zones, rainwater harvesting mandate, and lake revival directives.",
    icon: "Trees",
  },
  {
    id: "emergency",
    name: "Emergency Services",
    title: "Emergency Services",
    docCount: 0,
    description: "Disaster mitigation guidelines, fire NOC protocols, monsoon contingency plans, and relief helplines.",
    icon: "ShieldAlert",
  },
];

// Lightweight storage format for previous chats
export const initialPreviousChats = [];

export const verifiedAnswersDatabase = {};

export const suggestedQuestionsList = [];

export const noSourceResponseData = {
  isNoSource: true,
  message: "I couldn't find this information in the available municipal documents.",
  sourcesFound: 0,
  advice: "Upload official municipal schemes, circulars, or policies via the Admin Portal, or ask a question relevant to your uploaded documents.",
};


