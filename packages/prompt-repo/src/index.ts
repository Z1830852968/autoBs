export type Prompt = {
  id: string;
  version: string;
  modelType: "text" | "vision";
  template: string;
  variables: string[];
};

export type PromptRepo = {
  get: (id: string) => Prompt | undefined;
};

export function createPromptRepo(): PromptRepo {
  throw new Error("not_implemented");
}

