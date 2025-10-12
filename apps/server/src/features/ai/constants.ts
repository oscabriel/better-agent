export const MAX_MESSAGE_LENGTH = 32_000;
export const MAX_PROMPT_MESSAGES = 200;

export const TITLE_GENERATION_CONFIG = {
	modelName: "gemini-2.5-flash-lite",
	maxLength: 80,
	maxWords: 6,
	maxOutputTokens: 64,
} as const;

export const TITLE_GENERATION_PROMPT = `You are tasked with generating a concise, descriptive title for a chat conversation based on the initial messages. The title should:

1. Be 2-6 words long
2. Capture the main topic or question being discussed
3. Be clear and specific
4. Use title case (capitalize first letter of each major word)
5. Not include quotation marks or special characters
6. Be professional and appropriate

Examples of good titles:
- "Python Data Analysis Help"
- "React Component Design"
- "Travel Planning Italy"
- "Budget Spreadsheet Formula"
- "Career Change Advice"

Generate a title that accurately represents what this conversation is about based on the messages provided. Respond with the title only.`;
