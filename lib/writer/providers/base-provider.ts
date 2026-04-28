export type WriterMessage = {
  role: "system" | "user";
  content: string;
};

export type WriterCompletionInput = {
  messages: WriterMessage[];
  temperature?: number;
  responseFormat?: "text" | "json";
  maxTokens?: number;
};

export abstract class BaseProvider {
  abstract readonly providerName: string;
  abstract readonly model: string;
  abstract complete(input: WriterCompletionInput): Promise<string>;
}
