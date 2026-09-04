export interface ModelEntry {
  id: string;
  contextLength: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  country: string;
  details: string;
}
// no need to comment out models here when removed, please leave all in. the list is sanitized by an api call to https://models.publicai.co
export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: "swiss-ai/apertus-v1.5-8b",
    contextLength: "262K",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.2,
    country: "Switzerland",
    details:
      "Latest 8B Apertus model. Multilingual and multimodal with strong instruction-following, tool use, and a 262K-token context window. A good default for general-purpose tasks.",
  },
  {
    id: "swiss-ai/apertus-v1.5-8b-thinking",
    contextLength: "262K",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.2,
    country: "Switzerland",
    details:
      "8B Apertus v1.5 with extended reasoning mode enabled. Best for tasks that benefit from step-by-step thinking before answering.",
  },
  {
    id: "swiss-ai/apertus-v1.5-70b",
    contextLength: "262K",
    inputPricePerMillion: 0.82,
    outputPricePerMillion: 2.92,
    country: "Switzerland",
    details:
      "Latest 70B Apertus model. Higher capability than the 8B variants, with multilingual and multimodal support, tool use, and a 262K-token context window.",
  },
  {
    id: "swiss-ai/apertus-v1.5-70b-thinking",
    contextLength: "262K",
    inputPricePerMillion: 0.82,
    outputPricePerMillion: 2.92,
    country: "Switzerland",
    details:
      "70B Apertus v1.5 with extended reasoning mode. Use for complex analytical or multi-step reasoning tasks where the standard 70B model needs more deliberation.",
  },
  {
    id: "swiss-ai/apertus-8b-instruct",
    contextLength: "65K",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.2,
    country: "Switzerland",
    details:
      "Earlier-generation 8B instruct-tuned Apertus model. Apache 2.0 licensed and multilingual. Suitable for lighter workloads or when v1.5 is not required.",
  },
  {
    id: "swiss-ai/apertus-70b-instruct",
    contextLength: "65K",
    inputPricePerMillion: 0.82,
    outputPricePerMillion: 2.92,
    country: "Switzerland",
    details:
      "Earlier-generation 70B instruct-tuned Apertus model. Higher capability than the 8B instruct variant, with strong multilingual performance.",
  },
  {
    id: "aisingapore/Gemma-SEA-LION-v4-27B-IT",
    contextLength: "128K",
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.4,
    country: "Singapore",
    details:
      "Instruction-tuned for Southeast Asian languages including English, Mandarin, Vietnamese, Indonesian, Thai, Tagalog, Tamil, Malay, Khmer, Lao, and Burmese. Inherits Gemma 3 vision and document comprehension capabilities.",
  },
  {
    id: "aisingapore/Qwen-SEA-LION-v4-32B-IT",
    contextLength: "128K",
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 0.5,
    country: "Singapore",
    details:
      "32B instruction-tuned SEA-LION model built on Qwen3. Optimized for Southeast Asian languages and contexts, with strong performance on regional language tasks.",
  },
  {
    id: "allenai/Olmo-3-7B-Instruct",
    contextLength: "65K",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.2,
    country: "United States",
    details:
      "Compact 7B open model from the Allen Institute for AI. Fully open weights and training data. Strong for English instruction-following and general reasoning at low cost.",
  },
  {
    id: "speakleash/Bielik-11B-v3.0-Instruct",
    contextLength: "32K",
    inputPricePerMillion: 0.4,
    outputPricePerMillion: 0.4,
    country: "Poland",
    details:
      "11B model trained on 32 European languages with emphasis on Polish. Excels at Polish-language tasks, logic, STEM, and tool use. Developed by SpeakLeash and ACK Cyfronet AGH.",
  },
  {
    id: "utter-project/EuroLLM-22B-Instruct-2512",
    contextLength: "32K",
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.2,
    country: "European Union",
    details:
      "22B multilingual model covering all official EU languages plus additional European and global languages. Excels at translation across EU languages and general instruction-following. EU-funded open model.",
  },
];
